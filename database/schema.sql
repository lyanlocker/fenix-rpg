-- Fênix 0.1. Isolated tables: existing application tables are never changed.
begin;
create schema if not exists fenix_private;
revoke all on schema fenix_private from public;
grant usage on schema fenix_private to authenticated;
create table public.fenix_campaigns (id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id), name text not null check(length(name) between 1 and 100), description text not null default '', element text not null default 'Energia', notes text not null default '', rules text not null default 'Livro Básico', invite_code text not null unique default replace(gen_random_uuid()::text,'-',''), created_at timestamptz not null default now());
create table public.fenix_members (id uuid primary key default gen_random_uuid(), campaign_id uuid not null references public.fenix_campaigns(id) on delete cascade, user_id uuid not null references auth.users(id), status text not null default 'pending' check(status in ('pending','accepted')), display_name text not null default 'Jogador', unique(campaign_id,user_id));
create table public.fenix_agents (id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id), campaign_id uuid references public.fenix_campaigns(id) on delete set null, data jsonb not null check(jsonb_typeof(data)='object'), updated_at timestamptz not null default now());
create table public.fenix_rolls (id uuid primary key default gen_random_uuid(), actor_id uuid not null references auth.users(id), campaign_id uuid references public.fenix_campaigns(id) on delete cascade, data jsonb not null, secret boolean not null default false, created_at timestamptz not null default now());
create table public.fenix_encounters (id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id), campaign_id uuid references public.fenix_campaigns(id) on delete cascade, data jsonb not null);
create table public.fenix_homebrew (id uuid primary key, owner_id uuid not null default auth.uid() references auth.users(id), data jsonb not null);
create index on public.fenix_members(user_id,campaign_id,status);
create index on public.fenix_agents(campaign_id);
create index on public.fenix_agents(owner_id);
create index on public.fenix_rolls(campaign_id,created_at desc);
create index on public.fenix_rolls(actor_id,created_at desc);
create index on public.fenix_encounters(owner_id);
create index on public.fenix_homebrew(owner_id);
-- Internal lookups prevent recursive membership policies. No editable JWT metadata is used.
create function fenix_private.is_master(cid uuid) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and exists(select 1 from public.fenix_campaigns where id=cid and owner_id=auth.uid()) $$;
create function fenix_private.is_member(cid uuid) returns boolean language sql stable security definer set search_path='' as $$ select auth.uid() is not null and (fenix_private.is_master(cid) or exists(select 1 from public.fenix_members where campaign_id=cid and user_id=auth.uid() and status='accepted')) $$;
revoke all on function fenix_private.is_master(uuid),fenix_private.is_member(uuid) from public;
grant execute on function fenix_private.is_master(uuid),fenix_private.is_member(uuid) to authenticated;
alter table public.fenix_campaigns enable row level security;
alter table public.fenix_members enable row level security;
alter table public.fenix_agents enable row level security;
alter table public.fenix_rolls enable row level security;
alter table public.fenix_encounters enable row level security;
alter table public.fenix_homebrew enable row level security;
create policy campaigns_read on public.fenix_campaigns for select to authenticated using(fenix_private.is_member(id));
create policy campaigns_insert on public.fenix_campaigns for insert to authenticated with check(owner_id=(select auth.uid()));
create policy campaigns_update on public.fenix_campaigns for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
create policy campaigns_delete on public.fenix_campaigns for delete to authenticated using(owner_id=(select auth.uid()));
create policy members_read on public.fenix_members for select to authenticated using(user_id=(select auth.uid()) or fenix_private.is_master(campaign_id));
create policy members_delete on public.fenix_members for delete to authenticated using(user_id=(select auth.uid()) or fenix_private.is_master(campaign_id));
create policy agents_read on public.fenix_agents for select to authenticated using(owner_id=(select auth.uid()) or fenix_private.is_member(campaign_id));
create policy agents_insert on public.fenix_agents for insert to authenticated with check(owner_id=(select auth.uid()) and (campaign_id is null or fenix_private.is_member(campaign_id)));
create policy agents_update on public.fenix_agents for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (campaign_id is null or fenix_private.is_member(campaign_id)));
create policy agents_delete on public.fenix_agents for delete to authenticated using(owner_id=(select auth.uid()));
create policy rolls_read on public.fenix_rolls for select to authenticated using(actor_id=(select auth.uid()) or (fenix_private.is_member(campaign_id) and (not secret or fenix_private.is_master(campaign_id))));
create policy encounters_read on public.fenix_encounters for select to authenticated using(owner_id=(select auth.uid()));
create policy encounters_insert on public.fenix_encounters for insert to authenticated with check(owner_id=(select auth.uid()) and (campaign_id is null or fenix_private.is_master(campaign_id)));
create policy encounters_update on public.fenix_encounters for update to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()) and (campaign_id is null or fenix_private.is_master(campaign_id)));
create policy encounters_delete on public.fenix_encounters for delete to authenticated using(owner_id=(select auth.uid()));
create policy brew_all on public.fenix_homebrew for all to authenticated using(owner_id=(select auth.uid())) with check(owner_id=(select auth.uid()));
-- Narrow, authenticated operations; privileged code remains outside the exposed schema.
create function fenix_private.join_campaign(code text, player_name text) returns void language plpgsql security definer set search_path='' as $$ declare cid uuid; begin
 if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
 select id into cid from public.fenix_campaigns where invite_code=code;
 if cid is null then raise exception 'Convite inválido'; end if;
 if fenix_private.is_master(cid) then raise exception 'Você já é o mestre desta campanha'; end if;
 insert into public.fenix_members(campaign_id,user_id,display_name) values(cid,auth.uid(),left(player_name,80)) on conflict(campaign_id,user_id) do nothing;
end $$;
create function public.fenix_join_campaign(code text, player_name text) returns void language sql security invoker set search_path='' as $$ select fenix_private.join_campaign(code,player_name) $$;
create function fenix_private.accept_member(member_id uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not exists(select 1 from public.fenix_members m where m.id=member_id and fenix_private.is_master(m.campaign_id)) then raise exception 'Sem permissão'; end if;
 update public.fenix_members set status='accepted' where id=member_id;
end $$;
create function public.fenix_accept_member(member_id uuid) returns void language sql security invoker set search_path='' as $$ select fenix_private.accept_member(member_id) $$;
create function fenix_private.roll_dice(cid uuid, agent_name text, roll_label text, attribute_value integer, bonus integer, damage_expression text, is_secret boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare dice integer[]='{}'; n integer; sides integer; modifier integer=bonus; total integer=0; result jsonb; expr text; rid uuid; ts timestamptz; parts text[];
begin
 if auth.uid() is null then raise exception 'Entre na sua conta'; end if;
 if cid is not null and not fenix_private.is_member(cid) then raise exception 'Sem acesso à campanha'; end if;
 if is_secret and cid is not null and not fenix_private.is_master(cid) then raise exception 'Apenas o mestre pode fazer rolagens secretas'; end if;
 if (select count(*) from public.fenix_rolls where actor_id=auth.uid() and created_at>now()-interval '1 minute')>=60 then raise exception 'Aguarde um momento antes de rolar novamente'; end if;
 if damage_expression is not null and damage_expression<>'' then
  parts=regexp_match(replace(damage_expression,' ',''),'^(\d{1,2})d(4|6|8|10|12|20|100)([+-]\d{1,3})?$');
  if parts is null then raise exception 'Expressão inválida'; end if;
  n=parts[1]::integer;sides=parts[2]::integer;modifier=coalesce(parts[3]::integer,0);expr=damage_expression;
 else
  if attribute_value is null or attribute_value<0 or attribute_value>10 or bonus is null or abs(bonus)>100 then raise exception 'Atributo ou bônus inválido'; end if;
  n=case when attribute_value=0 then 2 else attribute_value end;sides=20;expr=n||'d20 ('||case when attribute_value=0 then 'menor' else 'maior' end||') '||case when bonus>=0 then '+' else '' end||bonus;
 end if;
 if n<1 or n>40 then raise exception 'Quantidade de dados inválida'; end if;
 for i in 1..n loop dice=array_append(dice,1+floor(random()*sides)::integer);end loop;
 if damage_expression is not null and damage_expression<>'' then select sum(x) into total from unnest(dice) x;
 elsif attribute_value=0 then select min(x) into total from unnest(dice) x;
 else select max(x) into total from unnest(dice) x;end if;
 result=jsonb_build_object('agentName',left(agent_name,100),'label',left(roll_label,100),'expression',expr,'dice',dice,'total',total+modifier);
 insert into public.fenix_rolls(actor_id,campaign_id,data,secret) values(auth.uid(),cid,result,is_secret) returning id,created_at into rid,ts;
 return result||jsonb_build_object('id',rid,'created_at',ts,'campaign_id',cid,'secret',is_secret,'actor_id',auth.uid());
end $$;
create function public.fenix_roll_dice(cid uuid, agent_name text, roll_label text, attribute_value integer, bonus integer, damage_expression text, is_secret boolean) returns jsonb language sql security invoker set search_path='' as $$ select fenix_private.roll_dice(cid,agent_name,roll_label,attribute_value,bonus,damage_expression,is_secret) $$;
revoke all on function fenix_private.join_campaign(text,text),fenix_private.accept_member(uuid),fenix_private.roll_dice(uuid,text,text,integer,integer,text,boolean),public.fenix_join_campaign(text,text),public.fenix_accept_member(uuid),public.fenix_roll_dice(uuid,text,text,integer,integer,text,boolean) from public,anon;
grant execute on function fenix_private.join_campaign(text,text),fenix_private.accept_member(uuid),fenix_private.roll_dice(uuid,text,text,integer,integer,text,boolean),public.fenix_join_campaign(text,text),public.fenix_accept_member(uuid),public.fenix_roll_dice(uuid,text,text,integer,integer,text,boolean) to authenticated;
grant select,insert,update,delete on public.fenix_campaigns,public.fenix_agents,public.fenix_encounters,public.fenix_homebrew to authenticated;
grant select,delete on public.fenix_members to authenticated;
grant select on public.fenix_rolls to authenticated;
revoke insert,update,delete on public.fenix_rolls from authenticated,anon;
revoke all on public.fenix_campaigns,public.fenix_agents,public.fenix_encounters,public.fenix_homebrew,public.fenix_members from anon;
alter publication supabase_realtime add table public.fenix_agents,public.fenix_rolls,public.fenix_members,public.fenix_campaigns;
commit;
