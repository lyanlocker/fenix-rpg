-- Run on the validation branch. Fixtures and service credentials roll back together.
do $$
declare
 c uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid();
 room_id uuid:=gen_random_uuid(); event_id uuid:=gen_random_uuid(); cmd_id uuid:=gen_random_uuid();
 master_key text:=encode(extensions.digest(gen_random_uuid()::text,'sha256'),'hex');
 player_a text:=repeat('a',64); player_b text:=repeat('b',64); service_key text:=repeat('e',64);
 sheet jsonb; state jsonb; enc jsonb; patch jsonb; delivery uuid; rev integer; denied boolean;
begin
 begin
  insert into public.fenix_combat_rooms(campaign_id,master_token_hash) values(c,encode(extensions.digest(master_key,'sha256'),'hex'));
  insert into public.fenix_shared_agents(id,data,master_token_hash,player_token_hash)
   select agent,jsonb_build_object('id',agent,'name',label,'campaign_id',c,'resources',jsonb_build_object('pe',effort,'pv',20),
    'inventory',jsonb_build_array(jsonb_build_object('id','gift','catalogId','jianghu-dado-destino','usesRemaining',3)),'notes','private-test'),
    encode(extensions.digest(master_key,'sha256'),'hex'),encode(extensions.digest(token,'sha256'),'hex')
   from (values(a,'A',player_a,10),(b,'B',player_b,0),(outsider,'C',player_b,10)) v(agent,label,token,effort);
  insert into fenix_private.act_two(campaign_id,title,enabled) values(c,'Ensaio',true);
  insert into fenix_private.act_cast(campaign_id,agent_id,position) values(c,a,1),(c,b,2);
  if public.fenix_act_member(outsider,player_b) is not null then raise exception 'Acesso sem vínculo'; end if;
  denied:=false;begin perform public.fenix_act_master(c,player_a);exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Leitura indevida da central';end if;
  state:=public.fenix_act_member(a,player_a);
  if state ?| array['pressure','targets','history','trigger','dossier'] or state::text like '%private-test%' then raise exception 'Projeção excessiva';end if;
  state:=public.fenix_act_master(c,master_key,'reputação',jsonb_build_object('id',cmd_id,'revision',0,'agents',jsonb_build_array(a,b),'delta',-150));
  if (state->>'average')::numeric <> -100 or (state->>'pressure')::int<>60 then raise exception 'Lote incorreto'; end if;
  state:=public.fenix_act_master(c,master_key,'desfazer',jsonb_build_object('original',cmd_id,'id',gen_random_uuid(),'revision',1));
  if (state->>'average')::numeric<>0 then raise exception 'Compensação incorreta';end if;
  state:=public.fenix_act_master(c,master_key,'npc',jsonb_build_object('id',gen_random_uuid(),'revision',2,'npc','Teste','scene','Ensaio','support',true,'score',22));
  if (state->>'pressure')::int<>57 then raise exception 'Diplomacia incorreta';end if;
  perform public.fenix_act_master(c,master_key,'armar',jsonb_build_object('id',gen_random_uuid(),'revision',3));
  denied:=false;begin perform public.fenix_act_use_gift(b,player_b,'gift',gen_random_uuid());exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Uso sem PE';end if;
  update public.fenix_shared_agents set data=jsonb_set(data,'{inventory,0,usesRemaining}','2') where id=a;
  if public.fenix_act_master(c,master_key)->>'trigger'<>'armado' then raise exception 'Edição disparou gatilho';end if;
  perform public.fenix_act_use_gift(a,player_a,'gift',event_id);
  perform public.fenix_act_use_gift(a,player_a,'gift',event_id);
  select data into sheet from public.fenix_shared_agents where id=a;
  if (sheet#>>'{resources,pe}')::int<>7 or (sheet#>>'{inventory,0,usesRemaining}')::int<>1 then raise exception 'Consumo duplicado';end if;
  state:=public.fenix_act_member(a,player_a);
  if state#>>'{effect,settings,preset}' is distinct from 'indicio' or public.fenix_act_member(b,player_b)->'effect'<>'null'::jsonb then raise exception 'Entrega incorreta';end if;
  delivery:=(state#>>'{effect,id}')::uuid;
  state:=public.fenix_act_member(a,player_a,state->>'version',delivery);
  if state#>>'{effect,settings,preset}' is distinct from 'indicio' or (public.fenix_act_member(a,player_a)#>>'{effect,id}')::uuid is distinct from delivery then raise exception 'A cena sumiu após a confirmação';end if;
  update fenix_private.act_effect set expires=clock_timestamp()-interval '1 second' where id=delivery;
  if public.fenix_act_member(a,player_a)->'effect'<>'null'::jsonb then raise exception 'Evento expirado';end if;

  state:=public.fenix_act_master(c,master_key);
  delivery:=gen_random_uuid();
  perform public.fenix_act_master(c,master_key,'enviar',jsonb_build_object('id',delivery,'revision',state->'revision','target',a,'duration',0,'preset','pergunta','position','cantos','intensity',3,'text','Ensaio'));
  state:=public.fenix_act_member(a,player_a);
  delivery:=(state#>>'{effect,id}')::uuid;
  state:=public.fenix_act_member(a,player_a,null,delivery);
  if state#>>'{effect,settings,text}' is distinct from 'Ensaio' or state#>'{effect,remaining}' is distinct from 'null'::jsonb then raise exception 'Pergunta sem prazo não persistiu'; end if;
  if public.fenix_act_member(b,player_b)->'effect' is distinct from 'null'::jsonb then raise exception 'Pergunta entregue a outro agente'; end if;
  state:=public.fenix_act_master(c,master_key);
  perform public.fenix_act_master(c,master_key,'encerrar',jsonb_build_object('id',gen_random_uuid(),'revision',state->'revision','target',a));
  if public.fenix_act_member(a,player_a,null,delivery)->'effect' is distinct from 'null'::jsonb then raise exception 'Pergunta encerrada reapareceu'; end if;

  -- Start a scene on B's turn. A reacts using the validated engine patch.
  insert into fenix_private.combat_service(id,token_hash) values(true,encode(extensions.digest(service_key,'sha256'),'hex')) on conflict(id) do update set token_hash=excluded.token_hash;
  insert into public.fenix_combat_members(agent_id,campaign_id) values(a,c),(b,c);
  enc:=jsonb_build_object('id',room_id,'campaign_id',c,'active',true,'started',true,'round',1,'turn',1,
    'participants',jsonb_build_array(jsonb_build_object('id',a,'agentId',a,'name','A','pv',20),jsonb_build_object('id',b,'agentId',b,'name','B','pv',20)));
  update public.fenix_combat_rooms set encounter=enc where campaign_id=c returning revision into rev;
  state:=public.fenix_act_master(c,master_key);
  perform public.fenix_act_master(c,master_key,'armar',jsonb_build_object('id',gen_random_uuid(),'revision',state->'revision'));
  denied:=false;begin perform public.fenix_act_use_gift(a,player_a,'gift',gen_random_uuid());exception when raise_exception then denied:=true;end;
  if not denied then raise exception 'Gasto fora da sala durante combate';end if;
  patch:=jsonb_build_array(jsonb_build_object('id',a,'face','main','version',md5(sheet::text),'resources',jsonb_set(sheet->'resources','{pe}','4'),'inventory',jsonb_set(sheet->'inventory','{0,usesRemaining}','0'),'adjustments','{}'::jsonb,'conditions','[]'::jsonb));
  denied:=false;begin perform public.fenix_act_commit_gift(service_key,player_a,a,null,room_id,rev+1,enc,patch,a,'jianghu-dado-destino',gen_random_uuid());exception when raise_exception then denied:=true;end;
  if not denied or public.fenix_act_master(c,master_key)->>'trigger'<>'armado' then raise exception 'Reação obsoleta';end if;
  perform public.fenix_act_commit_gift(service_key,player_a,a,null,room_id,rev,enc,patch,a,'jianghu-dado-destino',gen_random_uuid());
  if public.fenix_act_master(c,master_key)->>'first' is distinct from a::text then raise exception 'Reação fora de turno não registrada';end if;
  update fenix_private.act_cast set active=false where campaign_id=c;
  if public.fenix_act_master(c,master_key)->'average'<>'null'::jsonb then raise exception 'Elenco vazio';end if;
  raise exception using errcode='ZX001',message='Desfazer ensaio';
 exception when sqlstate 'ZX001' then null;
 end;
 if exists(select 1 from fenix_private.act_two where campaign_id=c) then raise exception 'Fixture persistiu';end if;
end $$;
