-- Fênix 0.8: fichas compartilhadas por links com chaves de alta entropia.
-- As tabelas não são acessíveis diretamente pela Data API. Toda operação
-- passa por RPCs que validam a chave do mestre ou do jogador.
begin;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.fenix_shared_agents (
  id uuid primary key,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  master_token_hash text not null,
  player_token_hash text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.fenix_shared_rolls (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.fenix_shared_agents(id) on delete cascade,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  created_at timestamptz not null default now()
);

create index if not exists fenix_shared_rolls_agent_created_idx
  on public.fenix_shared_rolls(agent_id, created_at desc);

alter table public.fenix_shared_agents enable row level security;
alter table public.fenix_shared_rolls enable row level security;
revoke all on public.fenix_shared_agents, public.fenix_shared_rolls from public, anon, authenticated;

create or replace function public.fenix_publish_agent(
  agent_data jsonb,
  supplied_master_token text default null,
  supplied_player_token text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  agent_id uuid;
  next_master_token text;
  next_player_token text;
  current_master_hash text;
  current_player_hash text;
begin
  if jsonb_typeof(agent_data) <> 'object' then
    raise exception 'Ficha inválida';
  end if;

  begin
    agent_id := (agent_data ->> 'id')::uuid;
  exception when others then
    raise exception 'Identificador de ficha inválido';
  end;

  select master_token_hash, player_token_hash
    into current_master_hash, current_player_hash
  from public.fenix_shared_agents
  where id = agent_id;

  if found then
    if supplied_master_token is null
      or encode(extensions.digest(supplied_master_token, 'sha256'), 'hex') <> current_master_hash then
      raise exception 'Esta ficha já foi publicada por outro navegador';
    end if;

    next_master_token := supplied_master_token;
    if supplied_player_token is not null
      and encode(extensions.digest(supplied_player_token, 'sha256'), 'hex') = current_player_hash then
      next_player_token := supplied_player_token;
    else
      next_player_token := encode(extensions.gen_random_bytes(32), 'hex');
    end if;

    update public.fenix_shared_agents
      set data = agent_data,
          player_token_hash = encode(extensions.digest(next_player_token, 'sha256'), 'hex'),
          updated_at = now()
      where id = agent_id;
  else
    next_master_token := encode(extensions.gen_random_bytes(32), 'hex');
    next_player_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.fenix_shared_agents(id, data, master_token_hash, player_token_hash)
    values (
      agent_id,
      agent_data,
      encode(extensions.digest(next_master_token, 'sha256'), 'hex'),
      encode(extensions.digest(next_player_token, 'sha256'), 'hex')
    );
  end if;

  return jsonb_build_object(
    'agent_id', agent_id,
    'master_token', next_master_token,
    'player_token', next_player_token
  );
end;
$$;

create or replace function public.fenix_load_shared_agent(
  requested_agent_id uuid,
  share_token text
) returns jsonb
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  agent_data jsonb;
  agent_updated_at timestamptz;
  access_role text;
  token_hash text;
  roll_history jsonb;
begin
  if share_token is null or length(share_token) <> 64 then
    raise exception 'Link de jogador inválido ou incompleto';
  end if;
  token_hash := encode(extensions.digest(share_token, 'sha256'), 'hex');

  select data, updated_at,
    case
      when master_token_hash = token_hash then 'master'
      when player_token_hash = token_hash then 'player'
      else null
    end
    into agent_data, agent_updated_at, access_role
  from public.fenix_shared_agents
  where id = requested_agent_id;

  if agent_data is null or access_role is null then
    raise exception 'Link de jogador inválido ou revogado';
  end if;

  select coalesce(jsonb_agg(entry.data order by entry.created_at desc), '[]'::jsonb)
    into roll_history
  from (
    select data, created_at
    from public.fenix_shared_rolls
    where agent_id = requested_agent_id
    order by created_at desc
    limit 100
  ) entry;

  return jsonb_build_object(
    'agent', agent_data,
    'rolls', roll_history,
    'role', access_role,
    'updated_at', agent_updated_at
  );
end;
$$;

create or replace function public.fenix_save_shared_agent(
  requested_agent_id uuid,
  share_token text,
  agent_data jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_hash text;
  allowed boolean;
begin
  if jsonb_typeof(agent_data) <> 'object'
    or agent_data ->> 'id' <> requested_agent_id::text then
    raise exception 'Ficha inválida';
  end if;
  token_hash := encode(extensions.digest(coalesce(share_token, ''), 'sha256'), 'hex');
  select master_token_hash = token_hash or player_token_hash = token_hash
    into allowed
  from public.fenix_shared_agents
  where id = requested_agent_id;
  if not coalesce(allowed, false) then
    raise exception 'Sem acesso para alterar esta ficha';
  end if;

  update public.fenix_shared_agents
    set data = agent_data, updated_at = now()
    where id = requested_agent_id;
  return jsonb_build_object('updated_at', now());
end;
$$;

create or replace function public.fenix_roll_shared(
  requested_agent_id uuid,
  share_token text,
  agent_name text,
  roll_label text,
  attribute_value integer,
  bonus integer,
  damage_expression text default ''
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_hash text;
  allowed boolean;
  dice integer[] := '{}';
  dice_count integer;
  sides integer;
  modifier integer := coalesce(bonus, 0);
  total integer := 0;
  expression text;
  parts text[];
  result jsonb;
  roll_id uuid := gen_random_uuid();
  rolled_at timestamptz := now();
begin
  token_hash := encode(extensions.digest(coalesce(share_token, ''), 'sha256'), 'hex');
  select master_token_hash = token_hash or player_token_hash = token_hash
    into allowed
  from public.fenix_shared_agents
  where id = requested_agent_id;
  if not coalesce(allowed, false) then
    raise exception 'Sem acesso para rolar nesta ficha';
  end if;

  if (select count(*) from public.fenix_shared_rolls
      where agent_id = requested_agent_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'Muitas rolagens em pouco tempo. Aguarde um minuto';
  end if;

  if coalesce(damage_expression, '') <> '' then
    parts := regexp_match(replace(damage_expression, ' ', ''), '^(\d{1,3})d(\d{1,7})([+-]\d{1,6})?$');
    if parts is null then raise exception 'Expressão de dados inválida'; end if;
    dice_count := parts[1]::integer;
    sides := parts[2]::integer;
    modifier := coalesce(parts[3]::integer, 0);
    if dice_count < 1 or dice_count > 100 or sides < 2 or sides > 1000000 then
      raise exception 'Use de 1 a 100 dados com 2 a 1.000.000 lados';
    end if;
    expression := replace(damage_expression, ' ', '');
  else
    if attribute_value is null or attribute_value < 0 or attribute_value > 10
      or bonus is null or abs(bonus) > 100000 then
      raise exception 'Atributo ou bônus inválido';
    end if;
    dice_count := case when attribute_value = 0 then 2 else attribute_value end;
    sides := 20;
    expression := dice_count || 'd20 (' ||
      case when attribute_value = 0 then 'menor' else 'maior' end || ') ' ||
      case when bonus >= 0 then '+' else '' end || bonus;
  end if;

  for die_index in 1..dice_count loop
    dice := array_append(dice, 1 + floor(random() * sides)::integer);
  end loop;

  if coalesce(damage_expression, '') <> '' then
    select sum(value) into total from unnest(dice) value;
  elsif attribute_value = 0 then
    select min(value) into total from unnest(dice) value;
  else
    select max(value) into total from unnest(dice) value;
  end if;

  result := jsonb_build_object(
    'id', roll_id,
    'campaign_id', null,
    'agentName', left(agent_name, 100),
    'label', left(roll_label, 100),
    'expression', expression,
    'dice', to_jsonb(dice),
    'total', total + modifier,
    'secret', false,
    'created_at', rolled_at
  );
  insert into public.fenix_shared_rolls(id, agent_id, data, created_at)
    values (roll_id, requested_agent_id, result, rolled_at);
  return result;
end;
$$;

revoke all on function public.fenix_publish_agent(jsonb, text, text) from public;
revoke all on function public.fenix_load_shared_agent(uuid, text) from public;
revoke all on function public.fenix_save_shared_agent(uuid, text, jsonb) from public;
revoke all on function public.fenix_roll_shared(uuid, text, text, text, integer, integer, text) from public;
grant execute on function public.fenix_publish_agent(jsonb, text, text) to anon, authenticated;
grant execute on function public.fenix_load_shared_agent(uuid, text) to anon, authenticated;
grant execute on function public.fenix_save_shared_agent(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.fenix_roll_shared(uuid, text, text, text, integer, integer, text) to anon, authenticated;

commit;
