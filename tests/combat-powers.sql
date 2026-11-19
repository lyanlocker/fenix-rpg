-- All synthetic fixtures roll back in a subtransaction, including successful runs.
do $$
declare
 campaign uuid:=gen_random_uuid(); aid uuid:=gen_random_uuid(); bid uuid:=gen_random_uuid();
 eid uuid:=gen_random_uuid(); pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid(); enemy uuid:=gen_random_uuid();
 master text:=repeat('a',64); player text:=repeat('b',64); room_key text:=repeat('c',64);
 sheet jsonb; other_sheet jsonb; encounter jsonb; result jsonb; view_data jsonb; keys jsonb; revision integer;
begin
 begin
  sheet:=jsonb_build_object('id',aid,'campaign_id',campaign,'name','Synthetic A','className','Especialista','nex',65,'stage',1,'determination',false,
   'attributes',jsonb_build_object('AGI',1,'FOR',1,'INT',3,'PRE',2,'VIG',2),'skills',jsonb_build_object('Medicina',5),'skillAdjustments','{}'::jsonb,
   'resources',jsonb_build_object('pv',20,'pe',10,'san',20,'pd',10),'adjustments',jsonb_build_object('pv',0,'pe',0,'san',0,'pd',0),
   'inventory','[]'::jsonb,'conditions','[]'::jsonb,'notes','fixture','portrait','data:image/png;base64,TEST_A');
  perform public.fenix_publish_agent(sheet,null,null);
  update public.fenix_shared_agents set master_token_hash=encode(extensions.digest(master,'sha256'),'hex'),player_token_hash=encode(extensions.digest(player,'sha256'),'hex') where id=aid;
  other_sheet:=sheet||jsonb_build_object('id',bid,'name','Synthetic B','portrait','data:image/png;base64,TEST_B');
  perform public.fenix_publish_agent(other_sheet,null,null);
  update public.fenix_shared_agents set master_token_hash=encode(extensions.digest(master,'sha256'),'hex'),player_token_hash=encode(extensions.digest(player,'sha256'),'hex') where id=bid;
  encounter:=jsonb_build_object('id',eid,'campaign_id',campaign,'name','Synthetic combat','active',true,'started',true,'round',1,'turn',0,'turnSerial',0,
   'participants',jsonb_build_array(
    jsonb_build_object('id',pa,'name','Synthetic A','agentId',aid,'face','main','playerAccess',true,'pv',20,'maxPv',80,'initiative',20,'hidden',false,'conditions',''),
    jsonb_build_object('id',pb,'name','Synthetic B','agentId',bid,'face','main','playerAccess',true,'pv',20,'maxPv',80,'initiative',10,'hidden',false,'conditions',''),
    jsonb_build_object('id',enemy,'name','HIDDEN_ENEMY','threatId','HIDDEN_ART','pv',40,'maxPv',40,'initiative',5,'hidden',true,'conditions','')),
   'combat',jsonb_build_object('budgets','{}'::jsonb,'uses','{}'::jsonb,'effects','[]'::jsonb,'stabilized','{}'::jsonb,'events',jsonb_build_array(
    jsonb_build_object('id','secret-event','actorId',enemy,'actor','HIDDEN_ENEMY','targetIds','[]'::jsonb,'secret',true,'text','HIDDEN_EVENT'))));
  keys:=jsonb_build_array(jsonb_build_object('agentId',aid,'masterToken',master),jsonb_build_object('agentId',bid,'masterToken',master));
  encounter := jsonb_set(encounter,'{combat,effects}',jsonb_build_array(
    jsonb_build_object('id','VISIBLE_EFFECT','sourceId',pa,'targetId',pb,'name','Visible power','power',jsonb_build_object('enemyId',pa,'modifiers',jsonb_build_array(jsonb_build_object('stat','damage','scope','weapon','amount','2d6')))),
    jsonb_build_object('id','HIDDEN_EFFECT','sourceId',pa,'targetId',pb,'name','Hidden-linked power','power',jsonb_build_object('enemyId',enemy,'modifiers','[]'::jsonb)),
    jsonb_build_object('id','LEGACY_EFFECT','sourceId',pa,'targetId',pb,'name','Velocidade Mortal','grant','standard','timing','sustained')
  ));
  result:=public.fenix_save_combat(campaign,room_key,encounter,0,keys); revision:=(result->>'revision')::integer;
  view_data:=public.fenix_load_player_combat(aid,player);
  if jsonb_array_length(view_data->'participants')<>2 or view_data::text like '%HIDDEN_%' or view_data::text like '%TEST_B%' or view_data::text like '%attributes%' then raise exception 'Private data leaked to player';end if;
  if view_data#>>'{participants,1,pv}' is not null then raise exception 'Other sheet resources leaked';end if;

  if jsonb_array_length(view_data->'effects') <> 2 then raise exception 'Target-specific effects were not filtered'; end if;
  if view_data::text like '%'||enemy::text||'%' then raise exception 'Hidden target reference leaked'; end if;
  if view_data#>>'{effects,0,power,modifiers,0,amount}' <> '2d6' then raise exception 'Numerical power metadata was dropped'; end if;
  raise exception using errcode='ZX001', message='rollback synthetic power fixtures';
 exception when sqlstate 'ZX001' then null;
 end;
 if exists(select 1 from public.fenix_shared_agents where id in(aid,bid)) or exists(select 1 from public.fenix_combat_rooms where campaign_id=campaign) then raise exception 'Synthetic fixtures were not rolled back'; end if;
end $$;
