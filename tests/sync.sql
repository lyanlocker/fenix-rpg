-- Synthetic fixtures only; rollback removes everything, including token changes.
begin;
do $$
declare
  aid uuid := gen_random_uuid(); cid uuid := gen_random_uuid(); eid uuid := gen_random_uuid();
  pid uuid := gen_random_uuid(); secret_id uuid := gen_random_uuid();
  master text := repeat('a',64); player text := repeat('b',64); room_key text := repeat('c',64);
  result jsonb; cursor jsonb; first_result jsonb; sheet jsonb; combat jsonb;
  master_cursor text; player_cursor text; denied boolean;
begin
  sheet := jsonb_build_object('id', aid, 'campaign_id', cid, 'name', 'Teste sintético', 'nex',35,
    'resources', jsonb_build_object('pv',30), 'portrait', 'data:image/png;base64,' || repeat('A',350000),
    'alternate', jsonb_build_object('face', jsonb_build_object('portrait','data:image/png;base64,BBBB')));
  insert into public.fenix_shared_agents(id,data,master_token_hash,player_token_hash)
    values(aid,sheet,encode(extensions.digest(master,'sha256'),'hex'),encode(extensions.digest(player,'sha256'),'hex'));
  first_result := public.fenix_sync_shared_agent(aid,player,null,false);
  cursor := first_result -> 'versions';
  if first_result #>> '{portraits,main}' is distinct from sheet ->> 'portrait'
    or first_result -> 'agent' ? 'portrait' or first_result -> 'agent' #> '{alternate,face}' ? 'portrait'
    or first_result ? 'alternate_edits' then raise exception 'Retrato inicial ou privacidade incorreto'; end if;
  result := public.fenix_sync_shared_agent(aid,player,cursor,false);
  if result ->> 'unchanged' <> 'true' or result ? 'agent' or octet_length(result::text) > 1000 then
    raise exception 'Consulta sem mudanças baixou a ficha'; end if;
  insert into public.fenix_shared_rolls(agent_id,data) values(aid,'{"id":"rolagem-sintetica","total":2}');
  result := public.fenix_sync_shared_agent(aid,player,cursor,false);
  if result ? 'agent' or result ? 'portraits' or jsonb_array_length(result -> 'rolls') <> 1 then
    raise exception 'Rolagem baixou a ficha ou se perdeu'; end if;
  cursor := result -> 'versions';
  update public.fenix_shared_agents set data=jsonb_set(data,'{resources,pv}','29'),updated_at=clock_timestamp() where id=aid;
  result := public.fenix_sync_shared_agent(aid,player,cursor,false);
  if result #>> '{agent,resources,pv}' <> '29' or result -> 'portraits' <> '{}'::jsonb
    or octet_length(result::text) > 2000 then raise exception 'PV repetiu retratos ou se perdeu'; end if;
  cursor := result -> 'versions';
  update public.fenix_shared_agents set data=jsonb_set(data,'{portrait}','""'),updated_at=clock_timestamp() where id=aid;
  result := public.fenix_sync_shared_agent(aid,player,cursor,false);
  if result #>> '{portraits,main}' <> '' then raise exception 'Remoção de retrato não sincronizou'; end if;
  cursor := result -> 'versions';
  perform public.fenix_update_infection(aid,master,'enable',0);
  result := public.fenix_sync_shared_agent(aid,player,cursor,false);
  if result #>> '{infection,enabled}' <> 'true' or result ? 'agent' or result ? 'alternate_edits' then
    raise exception 'Liberação de infecção incorreta'; end if;
  cursor := result -> 'versions';
  perform public.fenix_update_infection(aid,player,'adjust',1);
  result := public.fenix_sync_shared_agent(aid,player,cursor,false);
  if result #>> '{infection,value}' <> '1' or result ? 'agent' then raise exception 'Infecção não sincronizou'; end if;
  result := public.fenix_sync_shared_agent(aid,master,null,true);
  if result ? 'agent' or result ? 'rolls' or result ? 'portraits' or jsonb_array_length(result -> 'alternate_edits') <> 2 then
    raise exception 'Avisos da campanha precisam ser pequenos'; end if;
  if public.fenix_sync_shared_agent(aid,master,result -> 'versions',true) ->> 'unchanged' <> 'true' then
    raise exception 'Avisos repetidos'; end if;
  denied := false;
  begin perform public.fenix_sync_shared_agent(aid,player,null,true); exception when others then denied := true; end;
  if not denied then raise exception 'Jogador acessou avisos'; end if;
  denied := false;
  begin perform public.fenix_sync_shared_agent(aid,repeat('d',64),cursor,false); exception when others then denied := true; end;
  if not denied then raise exception 'Cursor contornou autenticação'; end if;

  combat := jsonb_build_object('id',eid,'name','Encontro','started',true,'active',true,'round',1,'turn',0,
    'participants',jsonb_build_array(
      jsonb_build_object('id',pid,'name','Teste sintético','agentId',aid,'face','main','pv',29,'maxPv',30,'initiative',0,'hidden',false),
      jsonb_build_object('id',secret_id,'name','SEGREDO','hidden',true,'pv',900,'maxPv',900)));
  insert into public.fenix_combat_rooms(campaign_id,master_token_hash,encounter,revision)
    values(cid,encode(extensions.digest(room_key,'sha256'),'hex'),combat,1);
  insert into public.fenix_combat_members(agent_id,campaign_id) values(aid,cid);
  result := public.fenix_sync_player_combat(aid,player,null);
  if result::text like '%SEGREDO%' or result::text like '%900%' or jsonb_array_length(result #> '{payload,participants}') <> 1 then
    raise exception 'Combate oculto exposto'; end if;
  player_cursor := result ->> 'version';
  if public.fenix_sync_player_combat(aid,player,player_cursor) ->> 'unchanged' <> 'true' then raise exception 'Combate do jogador repetido'; end if;
  result := public.fenix_sync_master_combat(cid,room_key,null);
  master_cursor := result ->> 'version';
  if public.fenix_sync_master_combat(cid,room_key,master_cursor) ->> 'unchanged' <> 'true' then raise exception 'Combate do mestre repetido'; end if;
  update public.fenix_shared_agents set data=jsonb_set(data,'{resources,pv}','24') where id=aid;
  result := public.fenix_sync_master_combat(cid,room_key,master_cursor);
  if result #>> '{payload,encounter,participants,0,pv}' <> '24' then raise exception 'PV alterado na ficha não atualizou combate do mestre'; end if;
  result := public.fenix_sync_player_combat(aid,player,player_cursor);
  if result #>> '{payload,participants,0,pv}' <> '24' then raise exception 'PV alterado na ficha não atualizou combate do jogador'; end if;
  player_cursor := result ->> 'version';
  update public.fenix_combat_rooms set encounter=null,revision=revision+1 where campaign_id=cid;
  result := public.fenix_sync_player_combat(aid,player,player_cursor);
  if result ->> 'unchanged' <> 'false' or result -> 'payload' <> 'null'::jsonb then raise exception 'Combate encerrado não desapareceu'; end if;
  update public.fenix_shared_agents set player_token_hash=encode(extensions.digest(repeat('d',64),'sha256'),'hex') where id=aid;
  denied := false;
  begin perform public.fenix_sync_shared_agent(aid,player,cursor,false); exception when others then denied := true; end;
  if not denied then raise exception 'Chave revogada aceita pelo cursor'; end if;
end;
$$;
select 'Sincronização: respostas leves, retratos, rolagens, infecção, avisos, combate e permissões aprovados' as result;
rollback;
