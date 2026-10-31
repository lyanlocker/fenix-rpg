-- Fênix 2.4: installed schema, recovered from the verified production definitions.
-- Server capability value stays in Vercel. Only its SHA256 is provisioned privately.
create schema if not exists fenix_private;
revoke all on schema fenix_private from public,anon,authenticated;
create table if not exists fenix_private.combat_service(id boolean primary key default true check(id),token_hash text not null);
alter table fenix_private.combat_service enable row level security;
revoke all on fenix_private.combat_service from public,anon,authenticated;

CREATE OR REPLACE FUNCTION fenix_private.assert_combat_sheet_edit(aid uuid, old_data jsonb, new_data jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare p jsonb; before_face jsonb; after_face jsonb; k text;
begin
  select entry into p from public.fenix_combat_rooms r
    join public.fenix_combat_members m on m.campaign_id=r.campaign_id
    cross join lateral jsonb_array_elements(coalesce(r.encounter->'participants','[]')) entry
    where m.agent_id=aid and entry->>'agentId'=aid::text
      and old_data->>'campaign_id'=r.campaign_id::text
      and coalesce((entry->>'playerAccess')::boolean,true)
      and coalesce((r.encounter->>'started')::boolean,false)
      and coalesce((r.encounter->>'active')::boolean,false);
  if p is null then return; end if;
  before_face := old_data; after_face := new_data;
  if p->>'face'='alternate' then before_face:=old_data#>'{alternate,face}';after_face:=new_data#>'{alternate,face}';end if;
  foreach k in array array['resources','adjustments','inventory','conditions','attributes','skills','skillAdjustments','nex','className','determination','defenseBonus'] loop
    if before_face->k is distinct from after_face->k then raise exception 'Durante o combate, use a sala de combate para agir. Peça ao mestre para pausar antes de editar a ficha'; end if;
  end loop;
end;
$function$
;

revoke all on function fenix_private.assert_combat_sheet_edit(aid uuid, old_data jsonb, new_data jsonb) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION fenix_private.combat_agent_patches(encounter_data jsonb, campaign uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_agg(jsonb_build_object('id',a.id,'face',coalesce(p->>'face','main'),
    'data',jsonb_build_object('resources',face->'resources','adjustments',face->'adjustments','inventory',face->'inventory','conditions',face->'conditions'))),'[]')
  from jsonb_array_elements(coalesce(encounter_data->'participants','[]')) p
  join public.fenix_shared_agents a on a.id::text=p->>'agentId' and a.data->>'campaign_id'=campaign::text
  cross join lateral (select case when p->>'face'='alternate' then a.data#>'{alternate,face}' else a.data end as face) f;
$function$
;

revoke all on function fenix_private.combat_agent_patches(encounter_data jsonb, campaign uuid) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_combat_context(server_token text, access_token text, requested_agent_id uuid DEFAULT NULL::uuid, requested_campaign_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  room public.fenix_combat_rooms%rowtype;
  sheet jsonb; token_hash text; actor jsonb; actor_role text;
  sheets jsonb; versions jsonb;
begin
  if length(coalesce(server_token,'')) < 48 or not exists (
    select 1 from fenix_private.combat_service service where service.token_hash = encode(extensions.digest(server_token,'sha256'),'hex')
  ) then raise exception 'Serviço de combate não autorizado'; end if;
  token_hash := encode(extensions.digest(coalesce(access_token,''),'sha256'),'hex');
  if requested_campaign_id is not null then
    select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id;
    if room.master_token_hash is distinct from token_hash then raise exception 'Sem acesso de mestre ao combate'; end if;
    actor_role := 'master';
  else
    select data into sheet from public.fenix_shared_agents where id = requested_agent_id
      and token_hash in (player_token_hash,master_token_hash);
    if sheet is null then raise exception 'Sem acesso à ficha'; end if;
    select r.* into room from public.fenix_combat_rooms r join public.fenix_combat_members m on m.campaign_id=r.campaign_id
      where m.agent_id=requested_agent_id and sheet->>'campaign_id'=r.campaign_id::text;
    select p into actor from jsonb_array_elements(coalesce(room.encounter->'participants','[]')) p
      where p->>'agentId'=requested_agent_id::text and coalesce((p->>'playerAccess')::boolean,true);
    if actor is null then raise exception 'Esta ficha não foi liberada para o combate'; end if;
    actor_role := 'player';
  end if;
  if room.encounter is null then raise exception 'Combate não encontrado'; end if;
  select coalesce(jsonb_object_agg(a.id::text, (a.data-'portrait')#-'{alternate,face,portrait}'),'{}'),
    coalesce(jsonb_object_agg(a.id::text, md5(a.data::text)),'{}') into sheets,versions
    from public.fenix_shared_agents a join public.fenix_combat_members m on m.agent_id=a.id
    where m.campaign_id=room.campaign_id and a.data->>'campaign_id'=room.campaign_id::text
      and exists(select 1 from jsonb_array_elements(room.encounter->'participants') p where p->>'agentId'=a.id::text);
  return jsonb_build_object('role',actor_role,'actorId',actor->'id','encounter',room.encounter,
    'revision',room.revision,'sheets',sheets,'sheetVersions',versions);
end;
$function$
;

revoke all on function public.fenix_combat_context(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid) from public,anon,authenticated;
grant execute on function public.fenix_combat_context(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_combat_initiative(requested_agent_id uuid, share_token text, requested_encounter_id uuid, initiative_value integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if not coalesce((mine->>'playerAccess')::boolean,true) then raise exception 'Esta ficha não foi liberada para o combate'; end if;
       if coalesce((room.encounter->>'active')::boolean,false) and jsonb_array_length(coalesce(room.encounter#>'{combat,events}','[]'))>0 then raise exception 'Iniciativa bloqueada durante as ações. Peça ao mestre para pausar'; end if;
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
$function$
;

revoke all on function public.fenix_combat_initiative(requested_agent_id uuid, share_token text, requested_encounter_id uuid, initiative_value integer) from public,anon,authenticated;
grant execute on function public.fenix_combat_initiative(requested_agent_id uuid, share_token text, requested_encounter_id uuid, initiative_value integer) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_combat_portrait(requested_agent_id uuid, share_token text, participant_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare view_data jsonb; room public.fenix_combat_rooms%rowtype; p jsonb; sheet jsonb;
begin
  view_data := public.fenix_load_player_combat(requested_agent_id,share_token);
  if view_data is null or not exists(select 1 from jsonb_array_elements(view_data->'participants') x where x->>'id'=participant_id::text) then raise exception 'Token não disponível'; end if;
  select r.* into room from public.fenix_combat_rooms r join public.fenix_combat_members m on m.campaign_id=r.campaign_id where m.agent_id=requested_agent_id;
  select value into p from jsonb_array_elements(room.encounter->'participants') where value->>'id'=participant_id::text;
  select data into sheet from public.fenix_shared_agents where id::text=p->>'agentId' and data->>'campaign_id'=room.campaign_id::text;
  return coalesce(case when p->>'face'='alternate' then sheet#>>'{alternate,face,portrait}' else sheet->>'portrait' end,'');
end;
$function$
;

revoke all on function public.fenix_combat_portrait(requested_agent_id uuid, share_token text, participant_id uuid) from public,anon,authenticated;
grant execute on function public.fenix_combat_portrait(requested_agent_id uuid, share_token text, participant_id uuid) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_commit_combat_action(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid, requested_encounter_id uuid, expected_revision integer, next_encounter jsonb, agent_changes jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  ctx jsonb; room public.fenix_combat_rooms%rowtype; entry jsonb; sheet jsonb;
  prefix text[]; k text; aid uuid; actor jsonb; output jsonb;
begin
  -- Lock room first, then sheets in stable ID order. All writes commit together.
  ctx := public.fenix_combat_context(server_token,access_token,requested_agent_id,requested_campaign_id);
  select * into room from public.fenix_combat_rooms where campaign_id=(ctx#>>'{encounter,campaign_id}')::uuid for update;
  -- Revalidate credentials/membership after acquiring the lock, including revocations.
  ctx := public.fenix_combat_context(server_token,access_token,requested_agent_id,requested_campaign_id);
  if room.revision is distinct from expected_revision or room.encounter->>'id' is distinct from requested_encounter_id::text then
    raise exception 'O combate mudou. Atualize antes de agir novamente';
  end if;
  if ctx->>'role'='player' then
    actor := room.encounter->'participants'->(room.encounter->>'turn')::integer;
    if actor->>'id' is distinct from ctx->>'actorId' or not coalesce((room.encounter->>'active')::boolean,false) then raise exception 'Aguarde seu turno'; end if;
  end if;
  if next_encounter->>'id' is distinct from room.encounter->>'id'
    or next_encounter->>'campaign_id' is distinct from room.campaign_id::text
    or octet_length(next_encounter::text)>350000
    or jsonb_typeof(agent_changes) is distinct from 'array' or jsonb_array_length(agent_changes)>100 then raise exception 'Ação inválida'; end if;
  for entry in select value from jsonb_array_elements(agent_changes) order by value->>'id' loop
    aid := (entry->>'id')::uuid;
    if not exists(select 1 from jsonb_array_elements(room.encounter->'participants') p where p->>'agentId'=aid::text) then raise exception 'Ficha fora deste combate'; end if;
    select a.data into sheet from public.fenix_shared_agents a join public.fenix_combat_members m on m.agent_id=a.id
      where a.id=aid and m.campaign_id=room.campaign_id and a.data->>'campaign_id'=room.campaign_id::text for update of a;
    if sheet is null or md5(sheet::text) is distinct from entry->>'version' then raise exception 'Uma ficha mudou. Atualize antes de agir novamente'; end if;
    prefix := '{}'::text[];
    if entry->>'face'='alternate' then
      if sheet#>>'{alternate,approvedCampaignId}' is distinct from room.campaign_id::text then raise exception 'Face alternativa não autorizada'; end if;
      prefix := array['alternate','face'];
    end if;
    foreach k in array array['resources','adjustments','conditions','inventory'] loop
      sheet := jsonb_set(sheet,prefix||k,entry->k);
    end loop;
    update public.fenix_shared_agents set data=sheet,updated_at=clock_timestamp() where id=aid;
    if entry->>'face'='alternate' then
      insert into public.fenix_alternate_edits(agent_id,actor_role,summary) values(aid,ctx->>'role','Combate: recursos, itens ou condições atualizados por uma ação');
    end if;
  end loop;
  update public.fenix_combat_rooms set encounter=next_encounter-'sharedRevision',revision=revision+1,updated_at=clock_timestamp()
    where campaign_id=room.campaign_id returning * into room;
  if ctx->>'role'='master' then return public.fenix_load_master_combat(room.campaign_id,access_token) || jsonb_build_object('agentPatches',(select coalesce(jsonb_agg(jsonb_build_object('id',x->'id','face',x->'face','data',x-'id'-'face'-'version')),'[]') from jsonb_array_elements(agent_changes) x)); end if;
  select x into entry from jsonb_array_elements(agent_changes) x where x->>'id'=requested_agent_id::text;
  output := jsonb_build_object('combat',public.fenix_load_player_combat(requested_agent_id,access_token));
  if entry is not null then output := output || jsonb_build_object('agentPatch',jsonb_build_object('face',entry->'face','data',entry-'id'-'face'-'version')); end if;
  return output;
end;
$function$
;

revoke all on function public.fenix_commit_combat_action(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid, requested_encounter_id uuid, expected_revision integer, next_encounter jsonb, agent_changes jsonb) from public,anon,authenticated;
grant execute on function public.fenix_commit_combat_action(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid, requested_encounter_id uuid, expected_revision integer, next_encounter jsonb, agent_changes jsonb) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_load_master_combat(requested_campaign_id uuid, master_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  return jsonb_build_object('encounter', room.encounter, 'revision', room.revision, 'agentPatches', fenix_private.combat_agent_patches(room.encounter,requested_campaign_id));
end;
$function$
;

revoke all on function public.fenix_load_master_combat(requested_campaign_id uuid, master_token text) from public,anon,authenticated;
grant execute on function public.fenix_load_master_combat(requested_campaign_id uuid, master_token text) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_load_player_combat(requested_agent_id uuid, share_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  sheet jsonb; room public.fenix_combat_rooms%rowtype; token_hash text;
  mine jsonb; current_entry jsonb; visible jsonb; events jsonb; effects jsonb; public_ids jsonb;
begin
  token_hash := encode(extensions.digest(coalesce(share_token,''),'sha256'),'hex');
  select data into sheet from public.fenix_shared_agents where id=requested_agent_id and token_hash in(player_token_hash,master_token_hash);
  if sheet is null then raise exception 'Sem acesso à ficha'; end if;
  select r.* into room from public.fenix_combat_rooms r join public.fenix_combat_members m on m.campaign_id=r.campaign_id
    where m.agent_id=requested_agent_id and sheet->>'campaign_id'=r.campaign_id::text;
  if room.encounter is null or not coalesce((room.encounter->>'started')::boolean,false) then return null; end if;
  select p into mine from jsonb_array_elements(room.encounter->'participants') p
    where p->>'agentId'=requested_agent_id::text and coalesce((p->>'playerAccess')::boolean,true);
  if mine is null then return null; end if;
  current_entry := room.encounter->'participants'->(room.encounter->>'turn')::integer;
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',p->'id','name',p->'name','initiative',p->'initiative',
    'initiativeRolled',coalesce((p->>'initiativeRolled')::boolean,false),
    'mine',p->>'id'=mine->>'id','face',p->'face','isAgent',p->>'agentId' is not null,
    'threatId',p->'threatId',
    'portraitVersion',md5(coalesce(case when p->>'face'='alternate' then a.data#>>'{alternate,face,portrait}' else a.data->>'portrait' end,'')),
    'pv',case when p->>'id'=mine->>'id' then case when p->>'face'='alternate' then sheet#>'{alternate,face,resources,pv}' else sheet#>'{resources,pv}' end else null end,
    'maxPv',case when p->>'id'=mine->>'id' then p->'maxPv' else null end
  ) order by ord),'[]') into visible
  from jsonb_array_elements(room.encounter->'participants') with ordinality entries(p,ord)
  left join public.fenix_shared_agents a on a.id::text=p->>'agentId' and a.data->>'campaign_id'=room.campaign_id::text
  where not coalesce((p->>'hidden')::boolean,false) or p->>'id'=mine->>'id';
  select jsonb_agg(x->'id') into public_ids from jsonb_array_elements(visible) x;
  select coalesce(jsonb_agg(x order by ord),'[]') into events
    from jsonb_array_elements(coalesce(room.encounter#>'{combat,events}','[]')) with ordinality entries(x,ord)
    where not coalesce((x->>'secret')::boolean,false) and public_ids ? (x->>'actorId')
      and not exists(select 1 from jsonb_array_elements_text(coalesce(x->'targetIds','[]')) t where not public_ids ? t);
  select coalesce(jsonb_agg(x),'[]') into effects
    from jsonb_array_elements(coalesce(room.encounter#>'{combat,effects}','[]')) x
    where public_ids ? (x->>'sourceId') and public_ids ? (x->>'targetId');
  return jsonb_build_object('id',room.encounter->'id','name',room.encounter->'name',
    'revision',room.revision,'round',room.encounter->'round','active',room.encounter->'active',
    'turnSerial',coalesce(room.encounter->'turnSerial','0'),
    'currentParticipantId',case when public_ids ? (current_entry->>'id') then current_entry->'id' else null end,
    'currentName',case when public_ids ? (current_entry->>'id') then current_entry->>'name' else 'Participante oculto' end,
    'participants',visible,'budget',room.encounter#>array['combat','budgets',mine->>'id'],
    'events',events,'effects',effects,
    'rules',coalesce((select jsonb_object_agg(key,value) from jsonb_each(coalesce(room.encounter->'combatRules','{}'))
      where key in(select i->>'id' from jsonb_array_elements(case when mine->>'face'='alternate' then sheet#>'{alternate,face,inventory}' else sheet->'inventory' end) i)),'{}'));
end;
$function$
;

revoke all on function public.fenix_load_player_combat(requested_agent_id uuid, share_token text) from public,anon,authenticated;
grant execute on function public.fenix_load_player_combat(requested_agent_id uuid, share_token text) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_save_shared_agent(requested_agent_id uuid, share_token text, agent_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  if not is_master then perform fenix_private.assert_combat_sheet_edit(requested_agent_id,saved_data,agent_data);
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
        or (item ->> 'kind' = 'Poder' and
          ((item ->> 'subtype' = 'Habilidade de trilha' and item ->> 'nex' is null)
           or (item ->> 'requirements') ~* 'NEX[[:space:]]*(3[6-9]|[4-9][0-9])[[:space:]]*%'))
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
$function$
;

revoke all on function public.fenix_save_shared_agent(requested_agent_id uuid, share_token text, agent_data jsonb) from public,anon,authenticated;
grant execute on function public.fenix_save_shared_agent(requested_agent_id uuid, share_token text, agent_data jsonb) to anon,authenticated;

CREATE OR REPLACE FUNCTION public.fenix_sync_master_combat(requested_campaign_id uuid, master_token text, known_version text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare room public.fenix_combat_rooms%rowtype; version text; hp jsonb;
begin
  select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id;
  if found and room.master_token_hash is distinct from encode(extensions.digest(coalesce(master_token, ''), 'sha256'), 'hex') then
    raise exception 'Sem acesso de mestre ao combate';
  end if;
  -- Include live sheet PV: these can change without the room revision changing.
  select coalesce(jsonb_agg(jsonb_build_array(p -> 'id', a.data -> 'campaign_id',
    case when p ->> 'face' = 'alternate' then a.data #> '{alternate,face,resources,pv}' else a.data #> '{resources,pv}' end)
    order by ord), '[]'::jsonb) into hp
    from jsonb_array_elements(coalesce(room.encounter -> 'participants', '[]'::jsonb)) with ordinality e(p, ord)
    left join public.fenix_shared_agents a on a.id::text = p ->> 'agentId';
  version := coalesce(room.revision, 0)::text || ':' || md5(hp::text) || ':' || coalesce((select md5(string_agg(a.updated_at::text,',' order by a.id)) from public.fenix_shared_agents a join public.fenix_combat_members m on m.agent_id=a.id where m.campaign_id=requested_campaign_id),''); -- combat sheet revision
  if version is not distinct from known_version then return jsonb_build_object('version', version, 'unchanged', true); end if;
  return jsonb_build_object('version', version, 'unchanged', false,
    'payload', public.fenix_load_master_combat(requested_campaign_id, master_token));
end;
$function$
;

revoke all on function public.fenix_sync_master_combat(requested_campaign_id uuid, master_token text, known_version text) from public,anon,authenticated;
grant execute on function public.fenix_sync_master_combat(requested_campaign_id uuid, master_token text, known_version text) to anon,authenticated;
