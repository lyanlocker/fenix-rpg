-- 2.9.5: keep target-specific power references private when their enemy is hidden.
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
    where public_ids ? (x->>'sourceId') and public_ids ? (x->>'targetId')
      and (x#>>'{power,enemyId}' is null or public_ids ? (x#>>'{power,enemyId}'));
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

