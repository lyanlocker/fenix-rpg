-- Synthetic fixture; all changes are rolled back. Run after campaign-bonds.sql.
begin;
do $$
declare
  c uuid:=gen_random_uuid(); other_c uuid:=gen_random_uuid(); a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); outsider uuid:=gen_random_uuid(); unregistered uuid:=gen_random_uuid();
  ma text:=repeat('a',64); pa text:=repeat('b',64); mb text:=repeat('c',64); pb text:=repeat('d',64); mc text:=repeat('e',64); room_key text:=repeat('f',64); service_key text:=repeat('7',64);
  state jsonb; result jsonb; denied boolean; after_loss integer; eid uuid:=gen_random_uuid(); actor uuid:=gen_random_uuid();
begin
  insert into public.fenix_shared_agents(id,data,master_token_hash,player_token_hash)
  select v.id,jsonb_build_object('id',v.id,'name',v.name,'campaign_id',v.cid,'resources',jsonb_build_object('san',100)),encode(extensions.digest(v.mk,'sha256'),'hex'),encode(extensions.digest(v.pk,'sha256'),'hex')
  from (values(a,'A',c,ma,pa),(b,'B',c,mb,pb),(outsider,'C',other_c,mc,repeat('8',64)),(unregistered,'D',c,repeat('9',64),repeat('1',64))) v(id,name,cid,mk,pk);
  state := public.fenix_campaign_bonds(a,pa);
  if (state->>'registered')::boolean or jsonb_array_length(state->'allies') <> 0 then raise exception 'Elenco não autorizado visível'; end if;
  perform public.fenix_register_bond_roster(c,room_key,jsonb_build_array(jsonb_build_object('agentId',a,'masterToken',ma),jsonb_build_object('agentId',b,'masterToken',mb)));
  state := public.fenix_campaign_bonds(a,pa);
  if jsonb_array_length(state->'allies') <> 1 or state#>>'{allies,0,id}' <> b::text or state->'reputation' <> 'null'::jsonb then raise exception 'Elenco/reputação incorretos'; end if;
  denied:=false;begin perform public.fenix_campaign_bonds(a,pa,'heart',unregistered,3);exception when others then denied:=true;end;if not denied then raise exception 'Vínculo não autorizado';end if;
  denied:=false;begin perform public.fenix_campaign_bonds(a,pa,'heart',outsider,3);exception when others then denied:=true;end;if not denied then raise exception 'Vínculo de outra campanha';end if;
  denied:=false;begin perform public.fenix_campaign_bonds(a,pa,'reveal');exception when others then denied:=true;end;if not denied then raise exception 'Reputação liberada por jogador';end if;
  denied:=false;begin perform public.fenix_register_bond_roster(c,repeat('9',64),jsonb_build_array(jsonb_build_object('agentId',unregistered,'masterToken',repeat('9',64))));exception when others then denied:=true;end;if not denied then raise exception 'Elenco alterado sem chave de campanha';end if;
  perform public.fenix_campaign_bonds(a,ma,'reputation',null,-35);
  state:=public.fenix_campaign_bonds(a,pa);if state->'reputation' <> 'null'::jsonb then raise exception 'Reputação oculta vazou';end if;
  perform public.fenix_campaign_bonds(a,ma,'reveal');state:=public.fenix_campaign_bonds(a,pa);if (state#>>'{reputation,value}')::integer<>-35 then raise exception 'Reputação negativa incorreta';end if;
  perform public.fenix_campaign_bonds(a,ma,'hide');
  perform public.fenix_campaign_bonds(a,pa,'heart',b,3);
  state:=public.fenix_campaign_bonds(a,pa,'activate',b);if (state->>'activeDie')::integer<>12 or not (state->>'used')::boolean then raise exception 'Ativação inválida';end if;
  insert into fenix_private.combat_service(id,token_hash) values(true,encode(extensions.digest(service_key,'sha256'),'hex')) on conflict(id) do update set token_hash=excluded.token_hash;
  update public.fenix_combat_rooms set encounter=jsonb_build_object('id',eid,'campaign_id',c,'participants',jsonb_build_array(jsonb_build_object('id',actor,'agentId',a))) where campaign_id=c;
  result:=public.fenix_combat_context_with_bonds(service_key,pa,a,null);
  if (result#>>array['relationDice',a::text])::integer<>12 then raise exception 'Atributo de relação não chegou ao combate';end if;
  result:=public.fenix_roll_shared(a,pa,'A','Teste',2,0,'');if jsonb_array_length(result->'dice')<>3 or result->>'expression' not like '%Relação: 1d12%' then raise exception 'Dado de vínculo ausente';end if;
  result:=public.fenix_roll_shared(a,pa,'A','Dano',1,0,'1d6');if jsonb_array_length(result->'dice')<>1 then raise exception 'Relação aplicada a dano';end if;
  perform public.fenix_campaign_bonds(a,ma,'finish');
  denied:=false;begin perform public.fenix_campaign_bonds(a,pa,'activate',b);exception when others then denied:=true;end;if not denied then raise exception 'Segundo uso aceito';end if;
  result:=public.fenix_roll_shared(a,pa,'A','Teste',2,0,'');if jsonb_array_length(result->'dice')<>2 then raise exception 'Fim da cena não respeitado';end if;
  denied:=false;begin perform public.fenix_campaign_bonds(b,pb,'death');exception when others then denied:=true;end;if not denied then raise exception 'Jogador registrou morte';end if;
  perform public.fenix_campaign_bonds(b,mb,'death');
  select (data#>>'{resources,san}')::integer into after_loss from public.fenix_shared_agents where id=a;
  if after_loss not between 76 and 98 then raise exception 'Perda de SAN incorreta: %',after_loss;end if;
  denied:=false;begin perform public.fenix_campaign_bonds(b,mb,'death');exception when others then denied:=true;end;if not denied then raise exception 'Falecimento repetido';end if;
  if has_table_privilege('anon','fenix_private.campaign_bonds','SELECT') then raise exception 'Tabela privada exposta';end if;
end $$;
rollback;
