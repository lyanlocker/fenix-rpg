-- Teste isolado das RPCs: todas as fichas/salas são sintéticas e revertidas no fim.
begin;
do $$
declare
  campaign uuid := gen_random_uuid(); aid uuid := gen_random_uuid(); outsider uuid := gen_random_uuid();
  encounter_id uuid := gen_random_uuid(); pid uuid := gen_random_uuid(); enemy uuid := gen_random_uuid();
  master text := repeat('a',64); player text := repeat('b',64); room_key text := repeat('c',64);
  face jsonb; sheet jsonb; encounter jsonb; result jsonb; view_data jsonb; keys jsonb;
  revision integer; rolled_total text; denied boolean;
begin
  face := jsonb_build_object('name','Parente de teste','className','Combatente','nex',35,
    'attributes',jsonb_build_object('AGI',2,'FOR',1,'INT',1,'PRE',1,'VIG',1),
    'skills',jsonb_build_object('Iniciativa',5),'skillAdjustments',jsonb_build_object('Iniciativa',2),
    'resources',jsonb_build_object('pv',30,'pe',10,'san',10,'pd',10),
    'inventory',jsonb_build_array(jsonb_build_object('kind','Item','name','Vestimenta','accessorySkill','Iniciativa','accessoryBonus',5,
      'enhancements',jsonb_build_array(jsonb_build_object('name','Destreza','bookId','01')))));
  sheet := jsonb_build_object('id',aid,'campaign_id',campaign,'name','Principal de teste','nex',65,
    'attributes',jsonb_build_object('AGI',0),'skills',jsonb_build_object('Iniciativa',15),
    'resources',jsonb_build_object('pv',50),'inventory','[]'::jsonb,
    'alternate',jsonb_build_object('approvedCampaignId',campaign,'face',face));
  perform public.fenix_publish_agent(sheet, null, null);
  update public.fenix_shared_agents set master_token_hash=encode(extensions.digest(master,'sha256'),'hex'), player_token_hash=encode(extensions.digest(player,'sha256'),'hex') where id=aid;
  perform public.fenix_publish_agent(sheet || jsonb_build_object('id',outsider), null, null);
  update public.fenix_shared_agents set player_token_hash=encode(extensions.digest(player,'sha256'),'hex') where id=outsider;
  encounter := jsonb_build_object('id',encounter_id,'campaign_id',campaign,'name','Combate de teste','active',false,'started',false,'round',1,'turn',0,
    'participants',jsonb_build_array(
      jsonb_build_object('id',pid,'name','Parente de teste','agentId',aid,'face','alternate','pv',30,'maxPv',60,'initiative',0,'hidden',false,'conditions',''),
      jsonb_build_object('id',enemy,'name','Ameaça secreta','threatId','segredo','pv',35,'maxPv',35,'initiative',0,'hidden',true,'conditions','')));
  keys := jsonb_build_array(jsonb_build_object('agentId',aid,'masterToken',master));
  denied := false;
  begin perform public.fenix_save_combat(campaign,room_key,encounter,0,jsonb_build_array(jsonb_build_object('agentId',aid,'masterToken',player)));
  exception when others then denied := true; end;
  if not denied then raise exception 'Jogador criou sala como mestre'; end if;
  result := public.fenix_save_combat(campaign,room_key,encounter,0,keys);
  if public.fenix_load_player_combat(aid,player) is not null then raise exception 'Preparação exposta'; end if;
  encounter := encounter || jsonb_build_object('active',true,'started',true);
  result := public.fenix_save_combat(campaign,room_key,encounter,1,keys);
  view_data := public.fenix_load_player_combat(aid,player);
  if jsonb_array_length(view_data -> 'participants') <> 1 or view_data::text like '%segredo%' or view_data::text like '%Ameaça secreta%' then raise exception 'Ameaça oculta exposta'; end if;
  if public.fenix_load_player_combat(outsider,player) is not null then raise exception 'Ficha não vinculada entrou na sala'; end if;
  result := public.fenix_combat_initiative(aid,player,encounter_id,null);
  if result #>> '{roll,expression}' <> '3d20 (maior) +12' or jsonb_array_length(result #> '{roll,dice}') <> 3 then raise exception 'Bônus da face/equipamentos incorreto: %', result; end if;
  rolled_total := result #>> '{roll,total}';
  result := public.fenix_load_master_combat(campaign,room_key);
  if result #>> '{encounter,participants,0,initiative}' is distinct from rolled_total then raise exception 'Iniciativa não sincronizada'; end if;
  denied := false;
  begin perform public.fenix_save_combat(campaign,room_key,encounter,2,keys);
  exception when others then denied := true; end;
  if not denied then raise exception 'Revisão antiga sobrescreveu iniciativa'; end if;
  result := public.fenix_combat_initiative(aid,player,encounter_id,77);
  if result #>> '{combat,participants,0,initiative}' <> '77' then raise exception 'Iniciativa manual não gravada'; end if;
  denied := false;
  begin perform public.fenix_adjust_combat_hp(campaign,player,encounter_id,pid,-7);
  exception when others then denied := true; end;
  if not denied then raise exception 'Jogador aplicou dano'; end if;
  result := public.fenix_adjust_combat_hp(campaign,room_key,encounter_id,pid,-7);
  if result #>> '{agent,resources,pv}' <> '50' or result #>> '{agent,alternate,face,resources,pv}' <> '23' then raise exception 'Dano atingiu a face errada'; end if;
  result := public.fenix_adjust_combat_hp(campaign,room_key,encounter_id,enemy,-9);
  if not exists(select 1 from jsonb_array_elements(result #> '{encounter,participants}') p where p ->> 'id'=enemy::text and p ->> 'pv'='26') then raise exception 'Dano em ameaça não gravado'; end if;
  result := public.fenix_adjust_combat_hp(campaign,room_key,encounter_id,pid,7);
  if result #>> '{agent,alternate,face,resources,pv}' <> '30' then raise exception 'Cura não aplicada'; end if;
  update public.fenix_shared_agents set data=jsonb_set(data,'{alternate,face,resources,pv}','27') where id=aid;
  result := public.fenix_load_master_combat(campaign,room_key);
  if result #>> '{encounter,participants,0,pv}' <> '27' or public.fenix_load_player_combat(aid,player) #>> '{participants,0,pv}' <> '27' then raise exception 'PV alterados na ficha não aparecem no combate'; end if;
  -- A face principal usa 0 AGI: dois dados, menor resultado, Expert +15.
  encounter := result -> 'encounter'; revision := (result ->> 'revision')::integer;
  encounter := jsonb_set(encounter, '{participants,0,face}', '"main"');
  result := public.fenix_save_combat(campaign,room_key,encounter,revision,keys);
  result := public.fenix_combat_initiative(aid,player,encounter_id,null);
  if result #>> '{roll,expression}' <> '2d20 (menor) +15' then raise exception 'AGI zero ou Expert incorreto'; end if;
  result := public.fenix_adjust_combat_hp(campaign,room_key,encounter_id,pid,-10);
  if result #>> '{agent,resources,pv}' <> '40' or result #>> '{agent,alternate,face,resources,pv}' <> '27' then raise exception 'Dano na principal alterou a face alternativa'; end if;
  result := public.fenix_load_master_combat(campaign,room_key);
  encounter := (result -> 'encounter') || jsonb_build_object('active',false,'started',false);
  perform public.fenix_save_combat(campaign,room_key,encounter,(result ->> 'revision')::integer,keys);
  if public.fenix_load_player_combat(aid,player) is not null then raise exception 'Combate encerrado continua visível'; end if;
  denied := false;
  begin perform public.fenix_combat_initiative(aid,player,encounter_id,5);
  exception when others then denied := true; end;
  if not denied then raise exception 'Iniciativa aceita após encerrar'; end if;
  perform public.fenix_clear_combat(campaign,room_key,encounter_id);
  if public.fenix_load_master_combat(campaign,room_key) -> 'encounter' <> 'null'::jsonb then raise exception 'Exclusão não removeu combate'; end if;
end;
$$;
select 'Combate compartilhado: permissões, privacidade, iniciativa, PV, revisão e encerramento aprovados' as result;
rollback;
