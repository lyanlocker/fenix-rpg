-- Combate por campanha; links existentes de ficha autorizam somente a própria iniciativa.
-- Nenhuma chave, ficha completa ou estatística privada de ameaça entra na visão do jogador.
create table if not exists public.fenix_combat_rooms (
  campaign_id uuid primary key,
  master_token_hash text not null,
  encounter jsonb,
  revision integer not null default 0,
  updated_at timestamptz not null default now()
);
create table if not exists public.fenix_combat_members (
  agent_id uuid primary key references public.fenix_shared_agents(id) on delete cascade,
  campaign_id uuid not null references public.fenix_combat_rooms(campaign_id) on delete cascade
);
create index if not exists fenix_combat_members_campaign_idx on public.fenix_combat_members(campaign_id);
alter table public.fenix_combat_rooms enable row level security;
alter table public.fenix_combat_members enable row level security;
revoke all on public.fenix_combat_rooms, public.fenix_combat_members from public, anon, authenticated;

create or replace function public.fenix_save_combat(
  requested_campaign_id uuid, master_token text, encounter_data jsonb,
  expected_revision integer, agent_keys jsonb default '[]'::jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  room public.fenix_combat_rooms%rowtype;
  token_hash text;
  entry jsonb;
  sheet jsonb;
  known_hash text;
  member_id uuid;
begin
  if master_token is null or length(master_token) <> 64 or requested_campaign_id is null then
    raise exception 'Chave de combate inválida';
  end if;
  if jsonb_typeof(encounter_data) is distinct from 'object'
    or encounter_data ->> 'campaign_id' is distinct from requested_campaign_id::text
    or coalesce(encounter_data ->> 'id', '') !~ '^[0-9a-f-]{36}$'
    or length(coalesce(encounter_data ->> 'name', '')) not between 1 and 100
    or jsonb_typeof(encounter_data -> 'participants') is distinct from 'array'
    or jsonb_array_length(encounter_data -> 'participants') > 100
    or jsonb_typeof(encounter_data -> 'active') is distinct from 'boolean'
    or (encounter_data ->> 'round')::integer not between 1 and 1000000
    or (encounter_data ->> 'turn')::integer not between 0 and greatest(0, jsonb_array_length(encounter_data -> 'participants') - 1)
    or octet_length(encounter_data::text) > 200000 then
    raise exception 'Combate inválido';
  end if;
  if jsonb_typeof(agent_keys) is distinct from 'array' or jsonb_array_length(agent_keys) > 100 then
    raise exception 'Vínculos inválidos';
  end if;
  token_hash := encode(extensions.digest(master_token, 'sha256'), 'hex');
  -- Valida todas as fichas antes de criar uma sala; possuir só a chave de jogador não basta.
  for entry in select value from jsonb_array_elements(agent_keys) loop
    member_id := (entry ->> 'agentId')::uuid;
    select data, master_token_hash into sheet, known_hash from public.fenix_shared_agents where id = member_id;
    if sheet is null or sheet ->> 'campaign_id' is distinct from requested_campaign_id::text
      or known_hash is distinct from encode(extensions.digest(coalesce(entry ->> 'masterToken', ''), 'sha256'), 'hex') then
      raise exception 'É necessária a chave de mestre das fichas desta campanha';
    end if;
  end loop;
  select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id for update;
  if not found then
    if jsonb_array_length(agent_keys) = 0 then raise exception 'Adicione ao menos uma ficha vinculada para compartilhar o combate'; end if;
    insert into public.fenix_combat_rooms(campaign_id, master_token_hash)
      values (requested_campaign_id, token_hash) on conflict do nothing;
    select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id for update;
  end if;
  if room.master_token_hash is distinct from token_hash then raise exception 'Sem acesso de mestre ao combate'; end if;
  if expected_revision is distinct from room.revision then
    raise exception 'O combate recebeu uma atualização. Atualize e tente novamente';
  end if;
  for entry in select value from jsonb_array_elements(agent_keys) loop
    insert into public.fenix_combat_members(agent_id, campaign_id)
      values ((entry ->> 'agentId')::uuid, requested_campaign_id)
      on conflict (agent_id) do update set campaign_id = excluded.campaign_id;
  end loop;
  for entry in select value from jsonb_array_elements(encounter_data -> 'participants') loop
    if jsonb_typeof(entry) is distinct from 'object'
      or coalesce(entry ->> 'id', '') !~ '^[0-9a-f-]{36}$'
      or length(coalesce(entry ->> 'name', '')) not between 1 and 100
      or (entry ->> 'pv')::integer not between 0 and 1000000
      or (entry ->> 'maxPv')::integer not between 1 and 1000000
      or (entry ->> 'initiative')::integer not between -1000 and 10000
      or jsonb_typeof(entry -> 'hidden') is distinct from 'boolean' then
      raise exception 'Participante inválido';
    end if;
    if entry ->> 'agentId' is not null then
      member_id := (entry ->> 'agentId')::uuid;
      select a.data into sheet from public.fenix_shared_agents a
        join public.fenix_combat_members m on m.agent_id = a.id
        where a.id = member_id and m.campaign_id = requested_campaign_id;
      if sheet is null or sheet ->> 'campaign_id' is distinct from requested_campaign_id::text then
        raise exception 'Participante sem ficha compartilhada nesta campanha';
      end if;
      if entry ->> 'face' = 'alternate' and sheet #>> '{alternate,approvedCampaignId}' is distinct from requested_campaign_id::text then
        raise exception 'Face NEX 35 não autorizada';
      end if;
    end if;
  end loop;
  if (select count(*) from jsonb_array_elements(encounter_data -> 'participants')) <>
     (select count(distinct value ->> 'id') from jsonb_array_elements(encounter_data -> 'participants'))
    or exists (select 1 from jsonb_array_elements(encounter_data -> 'participants') p
      where p ->> 'agentId' is not null group by p ->> 'agentId' having count(*) > 1) then
    raise exception 'Participante duplicado';
  end if;
  update public.fenix_combat_rooms set encounter = encounter_data - 'sharedRevision',
    revision = revision + 1, updated_at = now() where campaign_id = requested_campaign_id returning * into room;
  return jsonb_build_object('encounter', room.encounter, 'revision', room.revision);
end;
$$;

create or replace function public.fenix_load_master_combat(requested_campaign_id uuid, master_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare room public.fenix_combat_rooms%rowtype; participants jsonb;
begin
  select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id;
  if not found then return jsonb_build_object('encounter', null, 'revision', 0); end if;
  if room.master_token_hash is distinct from encode(extensions.digest(coalesce(master_token, ''), 'sha256'), 'hex') then
    raise exception 'Sem acesso de mestre ao combate';
  end if;
  if room.encounter is not null then
    select jsonb_agg(case when a.data ->> 'campaign_id' = requested_campaign_id::text
      then jsonb_set(p, '{pv}', case when p ->> 'face' = 'alternate'
        then coalesce(a.data #> '{alternate,face,resources,pv}', p -> 'pv')
        else coalesce(a.data #> '{resources,pv}', p -> 'pv') end) else p end order by ord)
      into participants from jsonb_array_elements(room.encounter -> 'participants') with ordinality entries(p, ord)
      left join public.fenix_shared_agents a on a.id::text = p ->> 'agentId';
    room.encounter := jsonb_set(room.encounter, '{participants}', coalesce(participants, '[]'::jsonb));
  end if;
  return jsonb_build_object('encounter', room.encounter, 'revision', room.revision);
end;
$$;

create or replace function public.fenix_load_player_combat(requested_agent_id uuid, share_token text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  sheet jsonb;
  player_hash text;
  master_hash text;
  token_hash text;
  combat jsonb;
  current_entry jsonb;
  visible jsonb;
begin
  token_hash := encode(extensions.digest(coalesce(share_token, ''), 'sha256'), 'hex');
  select data, player_token_hash, master_token_hash into sheet, player_hash, master_hash
    from public.fenix_shared_agents where id = requested_agent_id;
  if sheet is null or (token_hash <> player_hash and token_hash <> master_hash) then raise exception 'Sem acesso à ficha'; end if;
  select r.encounter into combat from public.fenix_combat_rooms r
    join public.fenix_combat_members m on m.campaign_id = r.campaign_id
    where m.agent_id = requested_agent_id and sheet ->> 'campaign_id' = r.campaign_id::text;
  if combat is null or not coalesce((combat ->> 'started')::boolean, false) then return null; end if;
  current_entry := combat -> 'participants' -> (combat ->> 'turn')::integer;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p -> 'id', 'name', p -> 'name', 'initiative', p -> 'initiative',
    'initiativeRolled', coalesce((p ->> 'initiativeRolled')::boolean, false),
    'mine', coalesce(p ->> 'agentId' = requested_agent_id::text, false),
    'face', p -> 'face',
    'pv', case when p ->> 'agentId' = requested_agent_id::text then
      case when p ->> 'face' = 'alternate' then sheet #> '{alternate,face,resources,pv}' else sheet #> '{resources,pv}' end else null end,
    'maxPv', case when p ->> 'agentId' = requested_agent_id::text then p -> 'maxPv' else null end
  ) order by ord), '[]'::jsonb) into visible
  from jsonb_array_elements(combat -> 'participants') with ordinality entries(p, ord)
  where not coalesce((p ->> 'hidden')::boolean, false) or p ->> 'agentId' = requested_agent_id::text;
  return jsonb_build_object('id', combat -> 'id', 'name', combat -> 'name',
    'round', combat -> 'round', 'active', combat -> 'active',
    'currentParticipantId', case when not coalesce((current_entry ->> 'hidden')::boolean, false)
      or current_entry ->> 'agentId' = requested_agent_id::text then current_entry -> 'id' else null end,
    'currentName', case when not coalesce((current_entry ->> 'hidden')::boolean, false)
      or current_entry ->> 'agentId' = requested_agent_id::text then current_entry ->> 'name' else 'Participante oculto' end,
    'participants', visible);
end;
$$;

create or replace function public.fenix_clear_combat(requested_campaign_id uuid, master_token text, requested_encounter_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare room public.fenix_combat_rooms%rowtype;
begin
  select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id for update;
  if room.master_token_hash is null or room.master_token_hash is distinct from encode(extensions.digest(coalesce(master_token, ''), 'sha256'), 'hex') then raise exception 'Sem acesso de mestre ao combate'; end if;
  if room.encounter ->> 'id' is distinct from requested_encounter_id::text then raise exception 'O combate foi substituído'; end if;
  update public.fenix_combat_rooms set encounter = null, revision = revision + 1, updated_at = now()
    where campaign_id = requested_campaign_id returning * into room;
  return jsonb_build_object('encounter', null, 'revision', room.revision);
end;
$$;

create or replace function public.fenix_combat_initiative(
  requested_agent_id uuid, share_token text, requested_encounter_id uuid, initiative_value integer default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  room public.fenix_combat_rooms%rowtype;
  sheet jsonb;
  face jsonb;
  mine jsonb;
  current_id text;
  participants jsonb;
  new_turn integer;
  entry jsonb;
  item_type text;
  worn integer := 0;
  attribute_value integer;
  bonus_value integer;
  result jsonb;
  token_hash text;
  player_hash text;
  master_hash text;
begin
  token_hash := encode(extensions.digest(coalesce(share_token, ''), 'sha256'), 'hex');
  select data, player_token_hash, master_token_hash into sheet, player_hash, master_hash from public.fenix_shared_agents where id = requested_agent_id;
  if sheet is null or (token_hash <> player_hash and token_hash <> master_hash) then raise exception 'Sem acesso à ficha'; end if;
  select r.* into room from public.fenix_combat_rooms r join public.fenix_combat_members m on m.campaign_id = r.campaign_id
    where m.agent_id = requested_agent_id and sheet ->> 'campaign_id' = r.campaign_id::text for update of r;
  if room.encounter is null or room.encounter ->> 'id' is distinct from requested_encounter_id::text
    or not coalesce((room.encounter ->> 'started')::boolean, false) then raise exception 'O combate já foi encerrado'; end if;
  select p into mine from jsonb_array_elements(room.encounter -> 'participants') p where p ->> 'agentId' = requested_agent_id::text;
  if mine is null then raise exception 'O mestre ainda não adicionou sua ficha ao combate'; end if;
  if initiative_value is not null and initiative_value not between -1000 and 10000 then raise exception 'Iniciativa inválida'; end if;
  if initiative_value is null then
    face := sheet;
    if mine ->> 'face' = 'alternate' then
      if sheet #>> '{alternate,approvedCampaignId}' is distinct from room.campaign_id::text then raise exception 'Face NEX 35 não autorizada'; end if;
      face := sheet #> '{alternate,face}';
    end if;
    attribute_value := coalesce((face #>> '{attributes,AGI}')::integer, 0);
    bonus_value := coalesce((face #>> '{skills,Iniciativa}')::integer, 0) + coalesce((face #>> '{skillAdjustments,Iniciativa}')::integer, 0);
    -- Mesmas regras de acessórios ativos da ficha: até duas vestimentas, utensílios equipados.
    for entry in select value from jsonb_array_elements(face -> 'inventory') loop
      if entry ->> 'kind' <> 'Item' or entry ->> 'equipped' = 'false' then continue; end if;
      item_type := coalesce(entry ->> 'accessoryType', case when entry ->> 'name' ~* '^vestimenta$' then 'Vestimenta' when entry ->> 'name' ~* '^utens[ií]lio$' then 'Utensílio' end);
      if item_type is null then continue; end if;
      if item_type = 'Vestimenta' then worn := worn + 1; if worn > 2 then continue; end if; end if;
      if entry ->> 'accessorySkill' = 'Iniciativa' then bonus_value := bonus_value + coalesce(nullif((entry ->> 'accessoryBonus')::integer, 0), 2); end if;
      if entry ->> 'extraSkill' = 'Iniciativa' then bonus_value := bonus_value + coalesce(nullif((entry ->> 'extraBonus')::integer, 0), 2); end if;
      attribute_value := attribute_value + (select count(*) from jsonb_array_elements(coalesce(entry -> 'enhancements', '[]'::jsonb)) e where e ->> 'bookId' = '01' and e ->> 'name' = 'Destreza');
    end loop;
    result := public.fenix_roll_shared(requested_agent_id, share_token, face ->> 'name', 'Iniciativa · combate', attribute_value, bonus_value, '');
    initiative_value := (result ->> 'total')::integer;
    result := result || jsonb_build_object('campaign_id', room.campaign_id);
    update public.fenix_shared_rolls set data = result where id = (result ->> 'id')::uuid;
  end if;
  current_id := room.encounter -> 'participants' -> (room.encounter ->> 'turn')::integer ->> 'id';
  select jsonb_agg(case when p ->> 'id' = mine ->> 'id' then p || jsonb_build_object('initiative', initiative_value, 'initiativeRolled', true) else p end
    order by case when p ->> 'id' = mine ->> 'id' then initiative_value else (p ->> 'initiative')::integer end desc, ord)
    into participants from jsonb_array_elements(room.encounter -> 'participants') with ordinality entries(p, ord);
  select (ord - 1)::integer into new_turn from jsonb_array_elements(participants) with ordinality entries(p, ord) where p ->> 'id' = current_id;
  if room.encounter ->> 'round' = '1' and room.encounter ->> 'turn' = '0' then new_turn := 0; end if;
  update public.fenix_combat_rooms set encounter = encounter || jsonb_build_object('participants', participants, 'turn', coalesce(new_turn, 0)),
    revision = revision + 1, updated_at = now() where campaign_id = room.campaign_id;
  return jsonb_build_object('combat', public.fenix_load_player_combat(requested_agent_id, share_token), 'roll', result);
end;
$$;

create or replace function public.fenix_adjust_combat_hp(
  requested_campaign_id uuid, master_token text, requested_encounter_id uuid, participant_id uuid, change integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  room public.fenix_combat_rooms%rowtype;
  target jsonb;
  sheet jsonb;
  target_agent_id uuid;
  path text[];
  actual integer;
  next_hp integer;
  idx integer;
begin
  if change is null or abs(change::bigint) > 1000000 then raise exception 'Dano ou cura inválido'; end if;
  select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id for update;
  if room.master_token_hash is null or room.master_token_hash is distinct from encode(extensions.digest(coalesce(master_token, ''), 'sha256'), 'hex') then raise exception 'Sem acesso de mestre ao combate'; end if;
  if room.encounter ->> 'id' is distinct from requested_encounter_id::text then raise exception 'O combate foi substituído'; end if;
  select p, (ord - 1)::integer into target, idx from jsonb_array_elements(room.encounter -> 'participants') with ordinality entries(p, ord) where p ->> 'id' = participant_id::text;
  if target is null then raise exception 'Participante não encontrado'; end if;
  actual := (target ->> 'pv')::integer;
  if target ->> 'agentId' is not null then
    target_agent_id := (target ->> 'agentId')::uuid;
    select a.data into sheet from public.fenix_shared_agents a join public.fenix_combat_members m on m.agent_id = a.id
      where a.id = target_agent_id and m.campaign_id = requested_campaign_id for update of a;
    if sheet is null or sheet ->> 'campaign_id' is distinct from requested_campaign_id::text then raise exception 'Ficha não vinculada'; end if;
    path := array['resources', 'pv'];
    if target ->> 'face' = 'alternate' then
      if sheet #>> '{alternate,approvedCampaignId}' is distinct from requested_campaign_id::text then raise exception 'Face NEX 35 não autorizada'; end if;
      path := array['alternate', 'face', 'resources', 'pv'];
    end if;
    actual := (sheet #>> path)::integer;
  end if;
  next_hp := greatest(0, least((target ->> 'maxPv')::integer, actual + change));
  if sheet is not null then
    sheet := jsonb_set(sheet, path, to_jsonb(next_hp));
    update public.fenix_shared_agents set data = sheet, updated_at = now() where id = target_agent_id;
    if target ->> 'face' = 'alternate' and next_hp <> actual then
      insert into public.fenix_alternate_edits(agent_id, actor_role, summary) values (target_agent_id, 'master', format('Combate · PV NEX 35: %s → %s', actual, next_hp));
    end if;
  end if;
  update public.fenix_combat_rooms set encounter = jsonb_set(encounter, array['participants', idx::text, 'pv'], to_jsonb(next_hp)),
    revision = revision + 1, updated_at = now() where campaign_id = requested_campaign_id returning * into room;
  return jsonb_build_object('encounter', room.encounter, 'revision', room.revision, 'agent', sheet);
end;
$$;

revoke all on function public.fenix_save_combat(uuid, text, jsonb, integer, jsonb) from public;
revoke all on function public.fenix_load_master_combat(uuid, text) from public;
revoke all on function public.fenix_load_player_combat(uuid, text) from public;
revoke all on function public.fenix_combat_initiative(uuid, text, uuid, integer) from public;
revoke all on function public.fenix_adjust_combat_hp(uuid, text, uuid, uuid, integer) from public;
revoke all on function public.fenix_clear_combat(uuid, text, uuid) from public;
grant execute on function public.fenix_save_combat(uuid, text, jsonb, integer, jsonb) to anon, authenticated;
grant execute on function public.fenix_load_master_combat(uuid, text) to anon, authenticated;
grant execute on function public.fenix_load_player_combat(uuid, text) to anon, authenticated;
grant execute on function public.fenix_combat_initiative(uuid, text, uuid, integer) to anon, authenticated;
grant execute on function public.fenix_adjust_combat_hp(uuid, text, uuid, uuid, integer) to anon, authenticated;
grant execute on function public.fenix_clear_combat(uuid, text, uuid) to anon, authenticated;
