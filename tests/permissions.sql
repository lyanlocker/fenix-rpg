-- Transactional integration test. All fixtures are rolled back.
begin;
insert into auth.users(id,email) values ('f0000000-0000-4000-8000-000000000001','fenix-test-master@example.invalid'),('f0000000-0000-4000-8000-000000000002','fenix-test-player@example.invalid'),('f0000000-0000-4000-8000-000000000003','fenix-test-outsider@example.invalid');
insert into public.fenix_campaigns(id,owner_id,name,invite_code) values('f0000000-0000-4000-8000-000000000004','f0000000-0000-4000-8000-000000000001','Fenix permission test','fenix-transaction-test');
insert into public.fenix_agents(id,owner_id,campaign_id,data) values('f0000000-0000-4000-8000-000000000005','f0000000-0000-4000-8000-000000000001','f0000000-0000-4000-8000-000000000004','{}');
set local role authenticated;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.fenix_campaigns where id='f0000000-0000-4000-8000-000000000004') then raise exception 'FAIL outsider campaign';end if;
 if exists(select 1 from public.fenix_agents where id='f0000000-0000-4000-8000-000000000005') then raise exception 'FAIL outsider agent';end if;
end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
select public.fenix_join_campaign('fenix-transaction-test','Test player');
do $$ begin if exists(select 1 from public.fenix_campaigns where id='f0000000-0000-4000-8000-000000000004') then raise exception 'FAIL pending member';end if;end $$;
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000001',true);
select public.fenix_accept_member(id) from public.fenix_members where campaign_id='f0000000-0000-4000-8000-000000000004';
select public.fenix_roll_dice('f0000000-0000-4000-8000-000000000004','Mestre','Secret test',2,5,'',true);
select public.fenix_roll_dice('f0000000-0000-4000-8000-000000000004','Mestre','Public test',0,5,'',false);
select set_config('request.jwt.claim.sub','f0000000-0000-4000-8000-000000000002',true);
do $$ declare affected integer; begin
 if not exists(select 1 from public.fenix_agents where id='f0000000-0000-4000-8000-000000000005') then raise exception 'FAIL accepted member read';end if;
 if (select count(*) from public.fenix_rolls where campaign_id='f0000000-0000-4000-8000-000000000004')<>1 then raise exception 'FAIL secret isolation';end if;
 update public.fenix_agents set data='{"tampered":true}' where id='f0000000-0000-4000-8000-000000000005';get diagnostics affected=row_count;
 if affected<>0 then raise exception 'FAIL another owner write';end if;
 begin perform public.fenix_roll_dice('f0000000-0000-4000-8000-000000000004','Player','Illegal secret',2,0,'',true);raise exception 'FAIL secret generation';exception when raise_exception then if sqlerrm='FAIL secret generation' then raise;end if;end;
 if has_table_privilege('authenticated','public.fenix_rolls','INSERT') then raise exception 'FAIL forged dice insert allowed';end if;
end $$;
select 'PASS: outsider isolation, pending approval, accepted membership, ownership, secret rolls, server dice' as result;
rollback;
