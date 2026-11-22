-- Apply after quality-saves.sql and interactive-combat.sql. Existing sheets are untouched.
-- All campaign mechanics live outside the editable sheet JSON and are scoped to a campaign.
create table if not exists fenix_private.campaign_bonds (
  agent_id uuid not null references public.fenix_shared_agents(id) on delete cascade,
  campaign_id text not null,
  hearts jsonb not null default '{}'::jsonb check (jsonb_typeof(hearts) = 'object'),
  used boolean not null default false,
  active_die integer check (active_die in (8,10,12)),
  active_ally uuid,
  dead boolean not null default false,
  reputation integer not null default 0 check (reputation between -100 and 100),
  reputation_visible boolean not null default false,
  primary key (agent_id, campaign_id)
);
alter table fenix_private.campaign_bonds enable row level security;
revoke all on fenix_private.campaign_bonds from public, anon, authenticated;
create index if not exists campaign_bonds_campaign_idx on fenix_private.campaign_bonds(campaign_id);

-- Reuse the established campaign authority: the campaign key plus each
-- sheet's master key. Register a roster without starting an encounter.
create or replace function public.fenix_register_bond_roster(requested_campaign_id uuid, master_token text, agent_keys jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare entry jsonb; known_hash text; member_id uuid; room public.fenix_combat_rooms%rowtype; token_hash text;
begin
  if length(coalesce(master_token,''))<>64 or requested_campaign_id is null or jsonb_typeof(agent_keys) is distinct from 'array' or jsonb_array_length(agent_keys) not between 1 and 100 then raise exception 'Vínculos inválidos'; end if;
  token_hash := encode(extensions.digest(master_token,'sha256'),'hex');
  for entry in select value from jsonb_array_elements(agent_keys) loop
    member_id := (entry->>'agentId')::uuid;
    select master_token_hash into known_hash from public.fenix_shared_agents where id=member_id and data->>'campaign_id'=requested_campaign_id::text;
    if not found or known_hash is distinct from encode(extensions.digest(coalesce(entry->>'masterToken',''),'sha256'),'hex') then raise exception 'É necessária a chave de mestre de cada ficha da campanha'; end if;
  end loop;
  insert into public.fenix_combat_rooms(campaign_id,master_token_hash) values(requested_campaign_id,token_hash) on conflict do nothing;
  select * into room from public.fenix_combat_rooms where campaign_id=requested_campaign_id for update;
  if room.master_token_hash is distinct from token_hash then raise exception 'Sem acesso de mestre à campanha'; end if;
  for entry in select value from jsonb_array_elements(agent_keys) loop
    insert into public.fenix_combat_members(agent_id,campaign_id) values((entry->>'agentId')::uuid,requested_campaign_id) on conflict(agent_id) do update set campaign_id=excluded.campaign_id;
  end loop;
  return jsonb_array_length(agent_keys);
end; $$;
revoke all on function public.fenix_register_bond_roster(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.fenix_register_bond_roster(uuid,text,jsonb) to anon,authenticated;

create or replace function public.fenix_campaign_bonds(requested_agent_id uuid, share_token text, operation text default 'read', ally_id uuid default null, value integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  sheet public.fenix_shared_agents%rowtype;
  actor fenix_private.campaign_bonds%rowtype;
  other_record record;
  campaign text;
  token_hash text;
  is_master boolean;
  points integer;
  loss integer;
  roster jsonb;
begin
  token_hash := encode(extensions.digest(coalesce(share_token,''),'sha256'),'hex');
  select * into sheet from public.fenix_shared_agents where id = requested_agent_id;
  if not found or token_hash not in (sheet.master_token_hash, sheet.player_token_hash) then raise exception 'Sem acesso à ficha'; end if;
  is_master := token_hash = sheet.master_token_hash;
  campaign := sheet.data->>'campaign_id';
  if campaign is null or campaign = '' or not exists(select 1 from public.fenix_combat_members m where m.agent_id=requested_agent_id and m.campaign_id::text=campaign) then
    if operation='read' then return jsonb_build_object('allies','[]'::jsonb,'used',false,'registered',false); end if;
    raise exception 'O mestre precisa sincronizar o elenco da campanha';
  end if;
  if operation not in ('read','heart','activate','finish','reputation','reveal','hide','death') or operation is null then raise exception 'Operação inválida'; end if;
  if operation in ('reputation','reveal','hide','death') and not is_master then raise exception 'Somente o mestre pode realizar esta operação'; end if;
  if operation <> 'read' then
    -- Serialize changes to the same campaign to make the one-use limit and death penalty atomic.
    perform pg_advisory_xact_lock(hashtextextended(campaign, 73));
    insert into fenix_private.campaign_bonds(agent_id,campaign_id) values(requested_agent_id,campaign) on conflict do nothing;
  end if;
  select * into actor from fenix_private.campaign_bonds where agent_id=requested_agent_id and campaign_id=campaign;
  if operation in ('heart','activate') then
    if ally_id is null or ally_id = requested_agent_id or not exists(select 1 from public.fenix_shared_agents a join public.fenix_combat_members m on a.id=m.agent_id and m.campaign_id::text=campaign where a.id=ally_id and a.data->>'campaign_id'=campaign) then raise exception 'Escolha um aliado da mesma campanha'; end if;
    if coalesce(actor.dead,false) or exists(select 1 from fenix_private.campaign_bonds b where b.agent_id=ally_id and b.campaign_id=campaign and b.dead) then raise exception 'Este vínculo não está disponível'; end if;
    if operation='heart' then
      if value is null or value not between 0 and 3 then raise exception 'Escolha de 0 a 3 corações'; end if;
      update fenix_private.campaign_bonds set hearts=jsonb_set(hearts,array[ally_id::text],to_jsonb(value)) where agent_id=requested_agent_id and campaign_id=campaign;
    else
      if actor.used then raise exception 'A relação já foi utilizada nesta campanha'; end if;
      points := coalesce((actor.hearts->>ally_id::text)::integer,0);
      if points < 1 then raise exception 'É necessário possuir ao menos um coração'; end if;
      update fenix_private.campaign_bonds set used=true, active_die=6+2*points,active_ally=ally_id where agent_id=requested_agent_id and campaign_id=campaign;
    end if;
  elsif operation='finish' then
    update fenix_private.campaign_bonds set active_die=null,active_ally=null where agent_id=requested_agent_id and campaign_id=campaign;
  elsif operation='reputation' then
    if value is null or value not between -100 and 100 then raise exception 'Reputação deve estar entre -100 e 100'; end if;
    update fenix_private.campaign_bonds set reputation=value where agent_id=requested_agent_id and campaign_id=campaign;
  elsif operation in ('reveal','hide') then
    update fenix_private.campaign_bonds set reputation_visible=(operation='reveal') where agent_id=requested_agent_id and campaign_id=campaign;
  elsif operation='death' then
    if actor.dead then raise exception 'Falecimento já registrado'; end if;
    update fenix_private.campaign_bonds set dead=true,active_die=null,active_ally=null where agent_id=requested_agent_id and campaign_id=campaign;
    for other_record in select b.agent_id, (b.hearts->>requested_agent_id::text)::integer as points from fenix_private.campaign_bonds b join public.fenix_shared_agents a on a.id=b.agent_id join public.fenix_combat_members m on m.agent_id=a.id and m.campaign_id::text=campaign where b.campaign_id=campaign and a.data->>'campaign_id'=campaign and not b.dead and coalesce((b.hearts->>requested_agent_id::text)::integer,0)>0 order by b.agent_id loop
      loss := 2 + floor(random() * (6+2*other_record.points))::integer + floor(random() * (6+2*other_record.points))::integer;
      update public.fenix_shared_agents set data=jsonb_set(data,'{resources,san}',to_jsonb(greatest(0,coalesce((data#>>'{resources,san}')::integer,0)-loss))),updated_at=now() where id=other_record.agent_id and data->>'campaign_id'=campaign;
      update fenix_private.campaign_bonds set active_die=null,active_ally=null where agent_id=other_record.agent_id and campaign_id=campaign and active_ally=requested_agent_id;
    end loop;
  end if;
  select * into actor from fenix_private.campaign_bonds where agent_id=requested_agent_id and campaign_id=campaign;
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'name',a.data->>'name','portrait',a.data->>'portrait','hearts',coalesce((actor.hearts->>a.id::text)::integer,0),'dead',coalesce(b.dead,false)) order by a.data->>'name'),'[]'::jsonb)
    into roster from public.fenix_shared_agents a join public.fenix_combat_members m on m.agent_id=a.id and m.campaign_id::text=campaign left join fenix_private.campaign_bonds b on b.agent_id=a.id and b.campaign_id=campaign where a.id<>requested_agent_id and a.data->>'campaign_id'=campaign;
  return jsonb_build_object('allies',roster,'registered',true,'used',coalesce(actor.used,false),'activeDie',actor.active_die,'activeAlly',actor.active_ally,'dead',coalesce(actor.dead,false),'reputation',case when is_master or actor.reputation_visible then jsonb_build_object('value',coalesce(actor.reputation,0),'visible',coalesce(actor.reputation_visible,false)) else null end);
end; $$;
revoke all on function public.fenix_campaign_bonds(uuid,text,text,uuid,integer) from public,anon,authenticated;
grant execute on function public.fenix_campaign_bonds(uuid,text,text,uuid,integer) to anon,authenticated;

-- Keep the original roll authorization and limits; add the relation die to all shared tests, including initiative.
CREATE OR REPLACE FUNCTION public.fenix_roll_shared(requested_agent_id uuid, share_token text, agent_name text, roll_label text, attribute_value integer, bonus integer, damage_expression text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  relation_sides integer;
  relation_extra integer;
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
    if attribute_value is null or attribute_value < 0 or attribute_value > 1000
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

  -- A relação adds to tests, not independent damage/healing dice.
  if coalesce(damage_expression, '') = '' then
    select b.active_die into relation_sides from fenix_private.campaign_bonds b join public.fenix_shared_agents a on a.id=b.agent_id and a.data->>'campaign_id'=b.campaign_id join public.fenix_combat_members m on m.agent_id=a.id and m.campaign_id::text=b.campaign_id join public.fenix_combat_members ally on ally.agent_id=b.active_ally and ally.campaign_id::text=b.campaign_id join public.fenix_shared_agents ally_sheet on ally_sheet.id=ally.agent_id and ally_sheet.data->>'campaign_id'=b.campaign_id where b.agent_id=requested_agent_id and not b.dead;
    if relation_sides is not null then
      relation_extra := 1+floor(random()*relation_sides)::integer;
      total := total + relation_extra;
      dice := array_append(dice, relation_extra);
      expression := expression||' +'||relation_extra||' (Relação: 1d'||relation_sides||')';
    end if;
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
$function$;
revoke all on function public.fenix_roll_shared(uuid,text,text,text,integer,integer,text) from public,anon,authenticated;
grant execute on function public.fenix_roll_shared(uuid,text,text,text,integer,integer,text) to anon,authenticated;

-- Same authenticated combat context; only active die values of authorized participants are appended.
create or replace function public.fenix_combat_context_with_bonds(server_token text, access_token text, requested_agent_id uuid default null, requested_campaign_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare ctx jsonb; dice jsonb;
begin
  ctx := public.fenix_combat_context(server_token,access_token,requested_agent_id,requested_campaign_id);
  select coalesce(jsonb_object_agg(b.agent_id::text,b.active_die),'{}'::jsonb) into dice from fenix_private.campaign_bonds b join public.fenix_combat_members ally on ally.agent_id=b.active_ally and ally.campaign_id::text=b.campaign_id join public.fenix_shared_agents ally_sheet on ally_sheet.id=ally.agent_id and ally_sheet.data->>'campaign_id'=b.campaign_id where b.campaign_id=ctx#>>'{encounter,campaign_id}' and b.active_die is not null and not b.dead and (ctx->'sheets')?b.agent_id::text;
  return ctx||jsonb_build_object('relationDice',dice);
end; $$;
revoke all on function public.fenix_combat_context_with_bonds(text,text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.fenix_combat_context_with_bonds(text,text,uuid,uuid) to anon,authenticated;
