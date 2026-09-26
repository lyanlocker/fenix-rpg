-- Face alternativa: permissões por chave da ficha, registro de alterações
-- e histórico visível somente pela chave de mestre.

create table if not exists public.fenix_alternate_edits (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.fenix_shared_agents(id) on delete cascade,
  actor_role text not null check (actor_role in ('master', 'player')),
  summary text not null,
  created_at timestamptz not null default now()
);
create index if not exists fenix_alternate_edits_agent_created_idx
  on public.fenix_alternate_edits(agent_id, created_at desc);
alter table public.fenix_alternate_edits enable row level security;
revoke all on public.fenix_alternate_edits from public, anon, authenticated;

create or replace function public.fenix_save_shared_agent(
  requested_agent_id uuid, share_token text, agent_data jsonb
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  token_hash text;
  saved_data jsonb;
  master_hash text;
  player_hash text;
  is_master boolean;
  old_alternate jsonb;
  incoming_alternate jsonb;
  proposed_face jsonb;
  changed_labels text;
  max_circle integer;
  next_data jsonb;
begin
  if jsonb_typeof(agent_data) <> 'object'
    or agent_data ->> 'id' <> requested_agent_id::text then
    raise exception 'Ficha inválida';
  end if;
  token_hash := encode(extensions.digest(coalesce(share_token, ''), 'sha256'), 'hex');
  select data, master_token_hash, player_token_hash
    into saved_data, master_hash, player_hash
  from public.fenix_shared_agents where id = requested_agent_id for update;
  if saved_data is null or (token_hash <> master_hash and token_hash <> player_hash) then
    raise exception 'Sem acesso para alterar esta ficha';
  end if;
  is_master := token_hash = master_hash;
  old_alternate := saved_data -> 'alternate';
  incoming_alternate := agent_data -> 'alternate';
  next_data := agent_data;

  if not is_master then
    if agent_data ->> 'campaign_id' is distinct from saved_data ->> 'campaign_id' then
      raise exception 'Somente o mestre pode mudar a campanha da ficha compartilhada';
    end if;
    if old_alternate is not null and incoming_alternate is null then
      -- Um cliente antigo pode continuar editando a ficha sem apagar a face.
      next_data := agent_data || jsonb_build_object('alternate', old_alternate);
    elsif incoming_alternate is distinct from old_alternate then
      if old_alternate is null or
        incoming_alternate - 'face' is distinct from old_alternate - 'face' then
        raise exception 'Somente o mestre pode liberar a face alternativa';
      end if;
      -- Na face alternativa, qualquer outro campo enviado pelo cliente é
      -- ignorado: apenas a face autorizada pode ser substituída pelo jogador.
      next_data := jsonb_set(saved_data, '{alternate,face}', incoming_alternate -> 'face');
    end if;
  end if;

  if next_data ? 'alternate' then
    if jsonb_typeof(next_data -> 'alternate') <> 'object' or
      (next_data #>> '{alternate,approvedCampaignId}') is distinct from
        (next_data ->> 'campaign_id') then
      raise exception 'A face alternativa exige uma campanha aprovada pelo mestre';
    end if;
    proposed_face := next_data #> '{alternate,face}';
    if jsonb_typeof(proposed_face) <> 'object' or proposed_face ->> 'nex' <> '35'
      or jsonb_typeof(proposed_face -> 'inventory') <> 'array'
      or jsonb_typeof(proposed_face -> 'skills') <> 'object'
      or coalesce(proposed_face ->> 'className', '') not in
        ('Ocultista', 'Combatente', 'Especialista', 'Sobrevivente')
      or length(coalesce(proposed_face ->> 'name', '')) not between 1 and 100 then
      raise exception 'Dados da face NEX 35 inválidos';
    end if;
    if length(coalesce(proposed_face ->> 'portrait', '')) > 2100000 then
      raise exception 'Imagem da face alternativa excede o tamanho permitido';
    end if;
    if exists (
      select 1 from jsonb_each_text(proposed_face -> 'skills') as s(skill, value)
      where value not in ('0','5','10')
    ) then
      raise exception 'No NEX 35 não é possível usar treinamento Expert';
    end if;
    max_circle := case when proposed_face ->> 'className' = 'Ocultista' then 2 else 1 end;
    if exists (
      select 1 from jsonb_array_elements(proposed_face -> 'inventory') as entry(item)
      where jsonb_typeof(item) <> 'object'
        or (item ->> 'kind' = 'Ritual' and
          case when (item ->> 'circle') ~ '^[1-9][0-9]*$' then (item ->> 'circle')::integer
            else 99 end > max_circle)
        or (item ->> 'nex' is not null and
          case when (item ->> 'nex') ~ '^[0-9]+$' then (item ->> 'nex')::integer
            else 99 end > 35)
    ) then
      raise exception 'Ritual ou habilidade indisponível no NEX 35';
    end if;
  end if;

  if (old_alternate #> '{face}') is distinct from (next_data #> '{alternate,face}') then
    select string_agg(label, ', ' order by label) into changed_labels from (
      values ('name','nome'), ('portrait','aparência'), ('attributes','atributos'),
             ('skills','perícias'), ('skillAdjustments','bônus'),
             ('resources','recursos'), ('adjustments','ajustes'),
             ('inventory','equipamentos, poderes ou rituais'),
             ('conditions','condições'), ('notes','anotações'),
             ('className','classe'), ('track','trilha'), ('origin','origem')
    ) as field(key, label)
    where (old_alternate #> array['face',field.key])
      is distinct from (next_data #> array['alternate','face',field.key]);
    insert into public.fenix_alternate_edits(agent_id, actor_role, summary)
    values (
      requested_agent_id,
      case when is_master then 'master' else 'player' end,
      case when old_alternate is null then 'Face NEX 35 liberada'
        else left('Face NEX 35: ' || coalesce(changed_labels, 'ficha atualizada'), 300)
      end
    );
  end if;

  update public.fenix_shared_agents
    set data = next_data, updated_at = now() where id = requested_agent_id;
  return jsonb_build_object('updated_at', now());
end;
$$;

create or replace function public.fenix_load_shared_agent(
  requested_agent_id uuid, share_token text
) returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  agent_data jsonb;
  agent_updated_at timestamptz;
  access_role text;
  token_hash text;
  roll_history jsonb;
  edit_history jsonb := '[]'::jsonb;
begin
  if share_token is null or length(share_token) <> 64 then
    raise exception 'Link de jogador inválido ou incompleto';
  end if;
  token_hash := encode(extensions.digest(share_token, 'sha256'), 'hex');
  select data, updated_at,
    case when master_token_hash = token_hash then 'master'
         when player_token_hash = token_hash then 'player' else null end
    into agent_data, agent_updated_at, access_role
  from public.fenix_shared_agents where id = requested_agent_id;
  if agent_data is null or access_role is null then
    raise exception 'Link de jogador inválido ou revogado';
  end if;

  select coalesce(jsonb_agg(entry.data order by entry.created_at desc), '[]'::jsonb)
    into roll_history from (
      select data, created_at from public.fenix_shared_rolls
      where agent_id = requested_agent_id order by created_at desc limit 100
    ) entry;

  if access_role = 'master' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', entry.id, 'agent_id', entry.agent_id,
      'actor', entry.actor_role, 'summary', entry.summary,
      'created_at', entry.created_at
    ) order by entry.created_at desc), '[]'::jsonb)
      into edit_history from (
        select id, agent_id, actor_role, summary, created_at
        from public.fenix_alternate_edits where agent_id = requested_agent_id
        order by created_at desc limit 100
      ) entry;
  end if;

  return jsonb_build_object(
    'agent', agent_data, 'rolls', roll_history,
    'role', access_role, 'updated_at', agent_updated_at,
    'alternate_edits', edit_history
  );
end;
$$;

revoke all on function public.fenix_save_shared_agent(uuid, text, jsonb) from public;
revoke all on function public.fenix_load_shared_agent(uuid, text) from public;
grant execute on function public.fenix_save_shared_agent(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.fenix_load_shared_agent(uuid, text) to anon, authenticated;
