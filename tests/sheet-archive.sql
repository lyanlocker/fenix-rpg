-- Synthetic fixtures only; every write is rolled back.
begin;
do $$
declare
 a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); campaign uuid:=gen_random_uuid(); keys jsonb; other_keys jsonb; rejected boolean;
begin
 keys:=public.fenix_publish_agent(jsonb_build_object('id',a,'name','Fixture archive','campaign_id',campaign),null,null);
 other_keys:=public.fenix_publish_agent(jsonb_build_object('id',b,'name','Keep fixture','campaign_id',null),null,null);
 insert into public.fenix_shared_rolls(agent_id,data) values(a,'{"label":"fixture"}');
 insert into public.fenix_combat_rooms(campaign_id,master_token_hash,encounter)
  values(campaign,'fixture',jsonb_build_object('participants',jsonb_build_array(jsonb_build_object('agentId',a::text))));
 insert into public.fenix_combat_members(agent_id,campaign_id) values(a,campaign);
 rejected:=false;begin perform public.fenix_delete_shared_agent(a,keys->>'player_token');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Player deleted shared sheet';end if;
 rejected:=false;begin perform public.fenix_delete_shared_agent(a,other_keys->>'master_token');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Another master deleted shared sheet';end if;
 rejected:=false;begin perform public.fenix_delete_shared_agent(a,null);exception when others then rejected:=true;end;
 if not rejected then raise exception 'Missing key deleted shared sheet';end if;
 rejected:=false;begin perform public.fenix_delete_shared_agent(a,keys->>'master_token');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Deleted participant from open combat';end if;
 if not exists(select 1 from public.fenix_shared_agents where id=a) then raise exception 'Rejected deletion changed sheet';end if;
 update public.fenix_combat_rooms set encounter=null where campaign_id=campaign;
 if public.fenix_delete_shared_agent(a,keys->>'master_token')->>'deleted' is distinct from a::text then raise exception 'Master deletion failed';end if;
 if exists(select 1 from public.fenix_shared_agents where id=a) or exists(select 1 from public.fenix_shared_rolls where agent_id=a) or exists(select 1 from public.fenix_combat_members where agent_id=a) then raise exception 'Shared data not cleaned';end if;
 if not exists(select 1 from public.fenix_shared_agents where id=b) then raise exception 'Unrelated sheet removed';end if;
 rejected:=false;begin perform public.fenix_load_shared_agent(a,keys->>'player_token');exception when others then rejected:=true;end;
 if not rejected then raise exception 'Deleted player link still works';end if;
 if has_table_privilege('anon','public.fenix_shared_agents','DELETE') then raise exception 'Direct table deletion exposed';end if;
end $$;
select 'PASS: exclusive master deletion, combat protection, cascade cleanup, link revocation and unrelated sheet preserved' as result;
rollback;
