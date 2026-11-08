-- Synthetic fixtures only: no persistent data is changed.
begin;
do $$
declare
 aid uuid := gen_random_uuid(); campaign uuid := gen_random_uuid(); keys jsonb; original jsonb; face jsonb;
 changed jsonb; result jsonb; denied boolean; archived jsonb;
begin
 face := jsonb_build_object('name','Arquivo','nex',35,'className','Combatente','skills','{}'::jsonb,'inventory','[]'::jsonb);
 original := jsonb_build_object('id',aid,'name','Teste qualidade','campaign_id',campaign,'notes','',
   'resources',jsonb_build_object('pv',20,'pe',10,'san',10,'pd',10),
   'alternate',jsonb_build_object('approvedCampaignId',campaign,'face',face));
 keys := public.fenix_publish_agent(original,null,null);
 changed := jsonb_set(original,'{resources,pv}','7');
 perform public.fenix_save_shared_agent(aid,keys->>'master_token',changed);
 -- Copying a link with an old snapshot must not undo damage.
 perform public.fenix_publish_agent(original,keys->>'master_token',keys->>'player_token');
 if (select data#>>'{resources,pv}' from public.fenix_shared_agents where id=aid) <> '7' then raise exception 'Publicar link sobrescreveu PV'; end if;
 result := public.fenix_patch_shared_agent(aid,keys->>'master_token','{"notes":""}','{"notes":"Anotação nova"}');
 if result#>>'{agent,resources,pv}' <> '7' or result#>>'{agent,notes}' <> 'Anotação nova' then raise exception 'Campos independentes perdidos'; end if;
 denied:=false;
 begin perform public.fenix_patch_shared_agent(aid,keys->>'master_token',jsonb_build_object('resources',original->'resources'),jsonb_build_object('resources',jsonb_build_object('pv',15,'pe',10,'san',10,'pd',10)));
 exception when serialization_failure then denied:=true; end;
 if not denied then raise exception 'Edição obsoleta aceita'; end if;
 denied:=false;
 begin perform public.fenix_patch_shared_agent(aid,repeat('f',64),'{}','{}'); exception when others then denied:=true; end;
 if not denied then raise exception 'Chave incorreta aceita'; end if;
 denied:=false;
 begin perform public.fenix_patch_shared_agent(aid,keys->>'player_token',jsonb_build_object('campaign_id',campaign),' {"campaign_id":null}'); exception when others then denied:=true; end;
 if not denied then raise exception 'Jogador trocou campanha'; end if;
 archived := original->'alternate';
 result := public.fenix_patch_shared_agent(aid,keys->>'master_token',jsonb_build_object('campaign_id',campaign),'{"campaign_id":null}');
 if result#>'{agent,alternate}' is distinct from archived then raise exception 'Arquivo da face perdido'; end if;
 result := public.fenix_patch_shared_agent(aid,keys->>'player_token','{"notes":"Anotação nova"}','{"notes":"Jogador editou"}');
 if result#>>'{agent,notes}' <> 'Jogador editou' then raise exception 'Arquivo bloqueou edição original'; end if;
 denied:=false;
 begin perform public.fenix_patch_shared_agent(aid,keys->>'master_token',null,'{}'); exception when others then denied:=true; end;
 if not denied then raise exception 'Patch nulo aceito'; end if;
 denied:=false;
 begin perform public.fenix_save_shared_agent(aid,keys->>'master_token',null); exception when others then denied:=true; end;
 if not denied then raise exception 'Ficha nula aceita'; end if;
 denied:=false;
 begin perform public.fenix_patch_shared_agent(aid,keys->>'master_token','{}','{"id":"forjado"}'); exception when others then denied:=true; end;
 if not denied then raise exception 'ID alterado'; end if;
end $$;
select 'PASS: link sem sobrescrita, edição parcial, conflito, autenticação, campanha e arquivo preservados' as result;
rollback;
