-- Integration test: fixtures and the temporary test capability are all rolled back.
-- The ZX001 subtransaction rolls back even when the tool manages its own transaction.
do $$
declare
 campaign uuid:=gen_random_uuid(); aid uuid:=gen_random_uuid(); bid uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 eid uuid:=gen_random_uuid(); pa uuid:=gen_random_uuid(); pb uuid:=gen_random_uuid(); enemy uuid:=gen_random_uuid(); tmp uuid;
 master text:=repeat('a',64); player text:=repeat('b',64); room_key text:=repeat('c',64); server_key text:=repeat('f',64);
 sheet jsonb; other_sheet jsonb; encounter jsonb; result jsonb; view_data jsonb; ctx jsonb; changes jsonb; stale jsonb; keys jsonb;
 denied boolean; revision integer; service_before text;
begin
 select token_hash into service_before from fenix_private.combat_service where id;
 begin
  if aid>bid then tmp:=aid;aid:=bid;bid:=tmp;end if;
  insert into fenix_private.combat_service(id,token_hash) values(true,encode(extensions.digest(server_key,'sha256'),'hex')) on conflict(id) do update set token_hash=excluded.token_hash;
  sheet:=jsonb_build_object('id',aid,'campaign_id',campaign,'name','Synthetic A','className','Especialista','nex',65,'stage',1,'determination',false,
   'attributes',jsonb_build_object('AGI',1,'FOR',1,'INT',3,'PRE',2,'VIG',2),'skills',jsonb_build_object('Medicina',5),'skillAdjustments','{}'::jsonb,
   'resources',jsonb_build_object('pv',20,'pe',10,'san',20,'pd',10),'adjustments',jsonb_build_object('pv',0,'pe',0,'san',0,'pd',0),
   'inventory','[]'::jsonb,'conditions','[]'::jsonb,'notes','fixture','portrait','data:image/png;base64,TEST_A');
  perform public.fenix_publish_agent(sheet,null,null);
  update public.fenix_shared_agents set master_token_hash=encode(extensions.digest(master,'sha256'),'hex'),player_token_hash=encode(extensions.digest(player,'sha256'),'hex') where id=aid;
  other_sheet:=sheet||jsonb_build_object('id',bid,'name','Synthetic B','portrait','data:image/png;base64,TEST_B');
  perform public.fenix_publish_agent(other_sheet,null,null);
  update public.fenix_shared_agents set master_token_hash=encode(extensions.digest(master,'sha256'),'hex'),player_token_hash=encode(extensions.digest(player,'sha256'),'hex') where id=bid;
  perform public.fenix_publish_agent(sheet||jsonb_build_object('id',outsider),null,null);
  update public.fenix_shared_agents set player_token_hash=encode(extensions.digest(player,'sha256'),'hex') where id=outsider;
  encounter:=jsonb_build_object('id',eid,'campaign_id',campaign,'name','Synthetic combat','active',true,'started',true,'round',1,'turn',0,'turnSerial',0,
   'participants',jsonb_build_array(
    jsonb_build_object('id',pa,'name','Synthetic A','agentId',aid,'face','main','playerAccess',true,'pv',20,'maxPv',80,'initiative',20,'hidden',false,'conditions',''),
    jsonb_build_object('id',pb,'name','Synthetic B','agentId',bid,'face','main','playerAccess',true,'pv',20,'maxPv',80,'initiative',10,'hidden',false,'conditions',''),
    jsonb_build_object('id',enemy,'name','HIDDEN_ENEMY','threatId','HIDDEN_ART','pv',40,'maxPv',40,'initiative',5,'hidden',true,'conditions','')),
   'combat',jsonb_build_object('budgets','{}'::jsonb,'uses','{}'::jsonb,'effects','[]'::jsonb,'stabilized','{}'::jsonb,'events',jsonb_build_array(
    jsonb_build_object('id','secret-event','actorId',enemy,'actor','HIDDEN_ENEMY','targetIds','[]'::jsonb,'secret',true,'text','HIDDEN_EVENT'))));
  keys:=jsonb_build_array(jsonb_build_object('agentId',aid,'masterToken',master),jsonb_build_object('agentId',bid,'masterToken',master));
  result:=public.fenix_save_combat(campaign,room_key,encounter,0,keys); revision:=(result->>'revision')::integer;
  view_data:=public.fenix_load_player_combat(aid,player);
  if jsonb_array_length(view_data->'participants')<>2 or view_data::text like '%HIDDEN_%' or view_data::text like '%TEST_B%' or view_data::text like '%attributes%' then raise exception 'Private data leaked to player';end if;
  if view_data#>>'{participants,1,pv}' is not null then raise exception 'Other sheet resources leaked';end if;
  if public.fenix_load_player_combat(outsider,player) is not null then raise exception 'Non-member gained room access';end if;
  if public.fenix_combat_portrait(aid,player,pb)<>'data:image/png;base64,TEST_B' then raise exception 'Visible portrait unavailable';end if;
  denied:=false;begin perform public.fenix_combat_portrait(aid,player,enemy);exception when others then denied:=true;end;
  if not denied then raise exception 'Hidden portrait accessible';end if;
  denied:=false;begin perform public.fenix_combat_context('invalid',player,aid,null);exception when others then denied:=true;end;
  if not denied then raise exception 'Missing server capability accepted';end if;
  denied:=false;begin perform public.fenix_combat_context(server_key,player,null,campaign);exception when others then denied:=true;end;
  if not denied then raise exception 'Player impersonated master';end if;
  denied:=false;begin perform public.fenix_save_shared_agent(aid,player,jsonb_set(sheet,'{resources,pe}','999'));exception when others then denied:=true;end;
  if not denied then raise exception 'Active player edited combat resources through sheet';end if;
  -- Reading full context is server-only and strips the bulky portraits.
  ctx:=public.fenix_combat_context(server_key,player,aid,null);
  if ctx->>'role'<>'player' or ctx->>'actorId'<>pa::text or ctx::text like '%TEST_A%' or ctx::text like '%TEST_B%' then raise exception 'Invalid server context';end if;
  changes:=jsonb_build_array(
   jsonb_build_object('id',aid,'face','main','version',ctx#>array['sheetVersions',aid::text],'resources',jsonb_build_object('pv',20,'pe',7,'san',20,'pd',10),'adjustments',sheet->'adjustments','inventory','[]'::jsonb,'conditions','[]'::jsonb),
   jsonb_build_object('id',bid,'face','main','version',ctx#>array['sheetVersions',bid::text],'resources',jsonb_build_object('pv',25,'pe',10,'san',20,'pd',10),'adjustments',sheet->'adjustments','inventory','[]'::jsonb,'conditions','[]'::jsonb));
  stale:=jsonb_set(changes,'{1,version}','"stale"');
  denied:=false;begin perform public.fenix_commit_combat_action(server_key,player,aid,null,eid,revision,encounter,stale);exception when others then denied:=true;end;
  if not denied or (select data#>>'{resources,pe}' from public.fenix_shared_agents where id=aid)<>'10' or (select data#>>'{resources,pv}' from public.fenix_shared_agents where id=bid)<>'20' then raise exception 'Stale write was not entirely rolled back';end if;
  result:=public.fenix_commit_combat_action(server_key,player,aid,null,eid,revision,encounter,changes);
  if result#>>'{agentPatch,data,resources,pe}'<>'7' or result ? 'agentPatches' or (select data#>>'{resources,pv}' from public.fenix_shared_agents where id=bid)<>'25' then raise exception 'Atomic action failed or exposed other patches';end if;
  denied:=false;begin perform public.fenix_commit_combat_action(server_key,player,aid,null,eid,revision,encounter,changes);exception when others then denied:=true;end;
  if not denied then raise exception 'Repeated revision accepted';end if;
  result:=public.fenix_load_master_combat(campaign,room_key);revision:=(result->>'revision')::integer;
  if jsonb_array_length(result->'agentPatches')<>2 then raise exception 'GM resource synchronization missing';end if;
  encounter:=jsonb_set(result->'encounter','{turn}','1');
  result:=public.fenix_commit_combat_action(server_key,player,aid,null,eid,revision,encounter,'[]'::jsonb);
  revision:=(result#>>'{combat,revision}')::integer;
  denied:=false;begin perform public.fenix_commit_combat_action(server_key,player,aid,null,eid,revision,encounter,'[]'::jsonb);exception when others then denied:=true;end;
  if not denied then raise exception 'Off-turn player committed action';end if;
  encounter:=jsonb_set(encounter,'{participants,0,playerAccess}','false');
  perform public.fenix_save_combat(campaign,room_key,encounter,revision,keys);
  if public.fenix_load_player_combat(aid,player) is not null then raise exception 'Revoked player retained room';end if;
  denied:=false;begin perform public.fenix_combat_initiative(aid,player,eid,20);exception when others then denied:=true;end;
  if not denied then raise exception 'Revoked player rolled initiative';end if;
  if has_table_privilege('anon','fenix_private.combat_service','SELECT') or has_table_privilege('anon','public.fenix_combat_rooms','UPDATE') or has_table_privilege('anon','public.fenix_shared_agents','UPDATE') then raise exception 'Direct table permissions leaked';end if;
  raise exception using errcode='ZX001',message='Rollback successful fixtures';
 exception when sqlstate 'ZX001' then null;
 end;
 if (select token_hash from fenix_private.combat_service where id) is distinct from service_before then raise exception 'Test capability was not rolled back';end if;
 if exists(select 1 from public.fenix_shared_agents where id in(aid,bid,outsider)) or exists(select 1 from public.fenix_combat_rooms where campaign_id=campaign) then raise exception 'Test fixtures were not rolled back';end if;
end;
$$;
select 'PASS: server capability, player scope, privacy, portrait authorization, sheet guard, atomic CAS, duplicate rejection, turn checks, revocation, table grants and complete fixture rollback' as result;
