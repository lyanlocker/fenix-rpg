-- Apply in one transaction as fenix_owner. Campaign configuration is private.

create table if not exists fenix_private.act_two (
  campaign_id uuid not null ,
  title text not null ,
  enabled bool not null default false,
  pressure int4 not null default 60,
  trigger_state text not null default 'desarmado'::text,
  automatic bool not null default true,
  individual bool not null default false,
  armed_at timestamptz  ,
  first_agent uuid  ,
  first_event uuid  ,
  revision int8 not null default 0,
  constraint act_two_pressure_check CHECK (((pressure >= 0) AND (pressure <= 100))),
  constraint act_two_trigger_state_check CHECK ((trigger_state = ANY (ARRAY['desarmado'::text, 'armado'::text, 'disparado'::text]))),
  constraint act_two_pkey PRIMARY KEY (campaign_id),
  constraint act_two_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES fenix_combat_rooms(campaign_id)
);

create table if not exists fenix_private.act_cast (
  campaign_id uuid not null ,
  agent_id uuid not null ,
  "position" int4 not null ,
  active bool not null default true,
  dossier jsonb not null default '[]'::jsonb,
  marked bool not null default false,
  theme bool not null default false,
  intensity int4 not null default 1,
  current_event uuid  ,
  constraint act_cast_intensity_check CHECK (((intensity >= 1) AND (intensity <= 3))),
  constraint act_cast_pkey PRIMARY KEY (campaign_id, agent_id),
  constraint act_cast_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES fenix_private.act_two(campaign_id),
  constraint act_cast_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES fenix_shared_agents(id)
);

create table if not exists fenix_private.act_log (
  campaign_id uuid not null ,
  id uuid not null ,
  kind text not null ,
  actor text not null ,
  detail jsonb not null ,
  at timestamptz not null default clock_timestamp(),
  constraint act_log_pkey PRIMARY KEY (campaign_id, id),
  constraint act_log_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES fenix_private.act_two(campaign_id)
);

create table if not exists fenix_private.act_effect (
  campaign_id uuid not null ,
  agent_id uuid not null ,
  id uuid not null ,
  settings jsonb not null ,
  sent timestamptz not null default clock_timestamp(),
  expires timestamptz  ,
  received timestamptz  ,
  ended timestamptz  ,
  constraint act_effect_pkey PRIMARY KEY (id),
  constraint act_effect_campaign_id_agent_id_fkey FOREIGN KEY (campaign_id, agent_id) REFERENCES fenix_private.act_cast(campaign_id, agent_id)
);

CREATE INDEX IF NOT EXISTS act_log_recent ON fenix_private.act_log USING btree (campaign_id, at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS act_npc_scene ON fenix_private.act_log USING btree (campaign_id, lower(TRIM(BOTH FROM (detail ->> 'npc'::text))), lower(TRIM(BOTH FROM (detail ->> 'scene'::text)))) WHERE (kind = 'npc'::text);

CREATE UNIQUE INDEX IF NOT EXISTS act_one_undo ON fenix_private.act_log USING btree (campaign_id, ((detail ->> 'original'::text))) WHERE (kind = 'desfazer'::text);

create or replace view fenix_private.act_members as  SELECT c.campaign_id,
    c.agent_id,
    c."position",
    c.active,
    c.dossier,
    c.marked,
    c.theme,
    c.intensity,
    c.current_event,
    a.data ->> 'name'::text AS name,
    a.data ->> 'portrait'::text AS portrait,
    a.updated_at,
    COALESCE(b.reputation, 0) AS reputation
   FROM fenix_private.act_cast c
     JOIN fenix_private.act_two t USING (campaign_id)
     JOIN fenix_shared_agents a ON a.id = c.agent_id AND (a.data ->> 'campaign_id'::text) = c.campaign_id::text
     LEFT JOIN fenix_private.campaign_bonds b ON b.agent_id = c.agent_id AND b.campaign_id = c.campaign_id::text
  WHERE c.active AND t.enabled;

CREATE OR REPLACE FUNCTION fenix_private.act_board(cid uuid, known text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare ver text; members jsonb; average numeric;
begin
  select md5(coalesce(string_agg(concat_ws('/',agent_id,updated_at,reputation,position),',' order by position,agent_id),'empty')),avg(reputation)
  into ver,average from fenix_private.act_members where campaign_id=cid;
  if ver is distinct from known then
    select coalesce(jsonb_agg(jsonb_build_object('id',agent_id,'name',name,'portrait',portrait,'value',reputation) order by position,agent_id),'[]')
    into members from fenix_private.act_members where campaign_id=cid;
  end if;
  return jsonb_build_object('version',ver,'average',average,'members',members,
    'title',(select title from fenix_private.act_two where campaign_id=cid));
end $function$;

CREATE OR REPLACE FUNCTION fenix_private.act_send(cid uuid, aid uuid, eid uuid, settings jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare seconds int := (settings->>'duration')::int; strength int := (settings->>'intensity')::int;
begin
  if coalesce(settings->>'preset','') not in ('indicio','olhos','maos','ruido','pergunta')
    or coalesce(settings->>'position','') not in ('topo','lateral','cantos')
    or strength is null or strength not between 1 and 3 or seconds is null
    or not(seconds between 2 and 12 or (seconds=0 and settings->>'preset'='pergunta'))
    or length(coalesce(settings->>'text',''))>400 then raise exception 'Efeito inválido'; end if;
  update fenix_private.act_effect set ended=clock_timestamp() where campaign_id=cid and agent_id=aid and ended is null;
  insert into fenix_private.act_effect(campaign_id,agent_id,id,settings,expires)
  values(cid,aid,eid,jsonb_build_object('motif',case when settings->>'motif' in ('rio','trilhos','saldo','registro','grade','porta') then settings->>'motif' end,'preset',settings->>'preset','position',settings->>'position','intensity',strength,'text',btrim(settings->>'text')),
    case when seconds>0 then clock_timestamp()+make_interval(secs=>seconds) end);
  update fenix_private.act_cast set current_event=eid,intensity=strength where campaign_id=cid and agent_id=aid;
end $function$;

CREATE OR REPLACE FUNCTION fenix_private.act_confirm_gift(aid uuid, eid uuid, gift text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare cid uuid; t fenix_private.act_two%rowtype; already_marked boolean;
begin
  select campaign_id into cid from fenix_private.act_members where agent_id=aid;
  if cid is null then return; end if;
  select * into t from fenix_private.act_two where campaign_id=cid for update;
  insert into fenix_private.act_log(campaign_id,id,kind,actor,detail) values(cid,eid,'presente',aid::text,jsonb_build_object('gift',gift)) on conflict do nothing;
  if not found then return; end if;
  select marked into already_marked from fenix_private.act_members where campaign_id=cid and agent_id=aid;
  if not found or not t.enabled or not (t.trigger_state='armado' or (t.individual and t.trigger_state='disparado' and not already_marked)) then return; end if;
  update fenix_private.act_two set trigger_state='disparado',first_agent=coalesce(first_agent,aid),first_event=coalesce(first_event,eid),revision=revision+1 where campaign_id=cid;
  update fenix_private.act_cast set marked=true where campaign_id=cid and agent_id=aid;
  if t.automatic then perform fenix_private.act_send(cid,aid,gen_random_uuid(),'{"preset":"indicio","duration":4,"position":"cantos","intensity":1}'); end if;
end $function$;

CREATE OR REPLACE FUNCTION fenix_private.act_commit(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid, requested_encounter_id uuid, expected_revision integer, next_encounter jsonb, agent_changes jsonb, reaction_agent uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  ctx jsonb; room public.fenix_combat_rooms%rowtype; entry jsonb; sheet jsonb;
  prefix text[]; k text; aid uuid; actor jsonb; output jsonb;
begin
  -- Lock room first, then sheets in stable ID order. All writes commit together.
  ctx := public.fenix_combat_context(server_token,access_token,requested_agent_id,requested_campaign_id);
  select * into room from public.fenix_combat_rooms where campaign_id=(ctx#>>'{encounter,campaign_id}')::uuid for update;
  -- Revalidate credentials/membership after acquiring the lock, including revocations.
  ctx := public.fenix_combat_context(server_token,access_token,requested_agent_id,requested_campaign_id);
  if room.revision is distinct from expected_revision or room.encounter->>'id' is distinct from requested_encounter_id::text then
    raise exception 'O combate mudou. Atualize antes de agir novamente';
  end if;
  if ctx->>'role'='player' then
    actor := room.encounter->'participants'->(room.encounter->>'turn')::integer;
    if (actor->>'id' is distinct from ctx->>'actorId' and (reaction_agent is null or reaction_agent is distinct from requested_agent_id)) or not coalesce((room.encounter->>'active')::boolean,false) then raise exception 'Aguarde seu turno'; end if;
  end if;
  if next_encounter->>'id' is distinct from room.encounter->>'id'
    or next_encounter->>'campaign_id' is distinct from room.campaign_id::text
    or octet_length(next_encounter::text)>350000
    or jsonb_typeof(agent_changes) is distinct from 'array' or jsonb_array_length(agent_changes)>100 then raise exception 'Ação inválida'; end if;
  for entry in select value from jsonb_array_elements(agent_changes) order by value->>'id' loop
    aid := (entry->>'id')::uuid;
    if not exists(select 1 from jsonb_array_elements(room.encounter->'participants') p where p->>'agentId'=aid::text) then raise exception 'Ficha fora deste combate'; end if;
    select a.data into sheet from public.fenix_shared_agents a join public.fenix_combat_members m on m.agent_id=a.id
      where a.id=aid and m.campaign_id=room.campaign_id and a.data->>'campaign_id'=room.campaign_id::text for update of a;
    if sheet is null or md5(sheet::text) is distinct from entry->>'version' then raise exception 'Uma ficha mudou. Atualize antes de agir novamente'; end if;
    prefix := '{}'::text[];
    if entry->>'face'='alternate' then
      if sheet#>>'{alternate,approvedCampaignId}' is distinct from room.campaign_id::text then raise exception 'Face alternativa não autorizada'; end if;
      prefix := array['alternate','face'];
    end if;
    foreach k in array array['resources','adjustments','conditions','inventory'] loop
      sheet := jsonb_set(sheet,prefix||k,entry->k);
    end loop;
    update public.fenix_shared_agents set data=sheet,updated_at=clock_timestamp() where id=aid;
    if entry->>'face'='alternate' then
      insert into public.fenix_alternate_edits(agent_id,actor_role,summary) values(aid,ctx->>'role','Combate: recursos, itens ou condições atualizados por uma ação');
    end if;
  end loop;
  update public.fenix_combat_rooms set encounter=next_encounter-'sharedRevision',revision=revision+1,updated_at=clock_timestamp()
    where campaign_id=room.campaign_id returning * into room;
  if ctx->>'role'='master' then return public.fenix_load_master_combat(room.campaign_id,access_token) || jsonb_build_object('agentPatches',(select coalesce(jsonb_agg(jsonb_build_object('id',x->'id','face',x->'face','data',x-'id'-'face'-'version')),'[]') from jsonb_array_elements(agent_changes) x)); end if;
  select x into entry from jsonb_array_elements(agent_changes) x where x->>'id'=requested_agent_id::text;
  output := jsonb_build_object('combat',public.fenix_load_player_combat(requested_agent_id,access_token));
  if entry is not null then output := output || jsonb_build_object('agentPatch',jsonb_build_object('face',entry->'face','data',entry-'id'-'face'-'version')); end if;
  return output;
end;
$function$;

CREATE OR REPLACE FUNCTION public.fenix_commit_combat_action(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid, requested_encounter_id uuid, expected_revision integer, next_encounter jsonb, agent_changes jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select fenix_private.act_commit(server_token, access_token, requested_agent_id, requested_campaign_id, requested_encounter_id, expected_revision, next_encounter, agent_changes,null);
$function$;

CREATE OR REPLACE FUNCTION public.fenix_act_commit_gift(server_token text, access_token text, requested_agent_id uuid, requested_campaign_id uuid, requested_encounter_id uuid, expected_revision integer, next_encounter jsonb, agent_changes jsonb, gift_agent uuid, gift_id text, event_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  result:=fenix_private.act_commit(server_token, access_token, requested_agent_id, requested_campaign_id, requested_encounter_id, expected_revision, next_encounter, agent_changes,case when gift_id in ('jianghu-luva-divida-carmesim','jianghu-ultima-palavra','jianghu-dado-destino') then gift_agent end);
  perform fenix_private.act_confirm_gift(gift_agent,event_id,gift_id);
  return result;
end $function$;

CREATE OR REPLACE FUNCTION public.fenix_act_use_gift(requested_agent_id uuid, share_token text, item_id text, event_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare sheet public.fenix_shared_agents%rowtype; entry jsonb; idx int; gid text; cost int; remaining int; resource text; balance int; cid uuid; next_sheet jsonb;
begin
  select * into sheet from public.fenix_shared_agents where id=requested_agent_id and encode(extensions.digest(share_token,'sha256'),'hex') in (master_token_hash,player_token_hash) for update;
  if not found then raise exception 'Sem acesso'; end if;
  select campaign_id into cid from fenix_private.act_members where agent_id=sheet.id;
  if not found then return false; end if;
  if exists(select 1 from fenix_private.act_log where campaign_id=cid and id=event_id and kind='presente' and actor=sheet.id::text) then return true; end if;
  select value,(ordinality-1)::int into strict entry,idx from jsonb_array_elements(sheet.data->'inventory') with ordinality where value->>'id'=item_id;
  gid:=coalesce(nullif(entry->>'catalogId',''),entry->>'id');
  cost:=case gid when 'jianghu-carimbo-esquecimento' then 4 when 'jianghu-contador-eternidade' then 5 when 'jianghu-luva-divida-carmesim' then 4 when 'jianghu-chave-entreposto' then 5 when 'jianghu-ultima-palavra' then 4 when 'jianghu-dado-destino' then 3 end;
  resource:=case when coalesce((sheet.data->>'determination')::boolean,false) then 'pd' else 'pe' end;
  balance:=(sheet.data#>>array['resources',resource])::int;
  remaining:=least(3,coalesce((entry->>'usesRemaining')::int,3));
  if cost is null or remaining<=0 or balance is null or balance<cost then raise exception 'Uso indisponível'; end if;
  next_sheet:=jsonb_set(jsonb_set(sheet.data,array['resources',resource],to_jsonb(balance-cost)),array['inventory',idx::text,'usesRemaining'],to_jsonb(remaining-1));
  perform fenix_private.assert_combat_sheet_edit(sheet.id,sheet.data,next_sheet);
  update public.fenix_shared_agents set updated_at=clock_timestamp(),data=next_sheet where id=sheet.id;
  perform fenix_private.act_confirm_gift(sheet.id,event_id,gid);
  return true;
end $function$;

CREATE OR REPLACE FUNCTION public.fenix_act_member(requested_agent_id uuid, share_token text, known text DEFAULT NULL::text, ack uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare m fenix_private.act_members%rowtype; delivery jsonb;
begin
  if not exists(select 1 from public.fenix_shared_agents where id=requested_agent_id
    and encode(extensions.digest(share_token,'sha256'),'hex') in (master_token_hash,player_token_hash)) then raise exception 'Sem acesso'; end if;
  select * into m from fenix_private.act_members where agent_id=requested_agent_id;
  if not found then return null; end if;
  if ack=m.current_event then
    update fenix_private.act_effect set received=clock_timestamp() where id=ack and campaign_id=m.campaign_id and agent_id=m.agent_id and received is null and ended is null and (expires is null or expires>clock_timestamp());
  end if;
  select jsonb_build_object('id',id,'remaining',case when expires is not null then greatest(0,extract(epoch from(expires-clock_timestamp()))*1000) end,
    'settings',case when received is null then settings end)
  into delivery from fenix_private.act_effect where id=m.current_event and agent_id=m.agent_id and campaign_id=m.campaign_id and ended is null and (expires is null or expires>clock_timestamp());
  return fenix_private.act_board(m.campaign_id,known)||jsonb_build_object('theme',m.theme,'intensity',m.intensity,'effect',delivery);
end $function$;

CREATE OR REPLACE FUNCTION public.fenix_act_master(requested_campaign_id uuid, master_token text, operation text DEFAULT 'read'::text, command jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cid uuid:=requested_campaign_id; t fenix_private.act_two%rowtype; rid uuid; aid uuid;
  ids uuid[]; delta int; absolute_value int; previous int; next_value int; score int;
  reason text:=left(trim(command->>'reason'),300); details jsonb:='{}'; edits jsonb:='[]';
  original uuid; old_edit jsonb; history jsonb; targets jsonb; row_data record;
begin
  if not exists(select 1 from public.fenix_combat_rooms where campaign_id=cid and master_token_hash=encode(extensions.digest(master_token,'sha256'),'hex')) then raise exception 'Sem acesso'; end if;
  if operation='read' then select * into t from fenix_private.act_two where campaign_id=cid and enabled;
  else select * into t from fenix_private.act_two where campaign_id=cid and enabled for update; end if;
  if not found then return null; end if;
  if operation <> 'read' then
    rid:=(command->>'id')::uuid;
    if rid is null then raise exception 'Comando sem identificação'; end if;
    if exists(select 1 from fenix_private.act_log where campaign_id=cid and id=rid and actor='mestre') then operation:='read'; end if;
  end if;
  if operation <> 'read' then
    if (command->>'revision')::bigint is distinct from t.revision then raise exception 'O ato mudou' using errcode='40001'; end if;
    delta:=(command->>'delta')::int; absolute_value:=(command->>'value')::int;
    aid:=(command->>'target')::uuid;
    if operation in ('enviar','encerrar','restaurar','tema') and not exists(select 1 from fenix_private.act_members where campaign_id=cid and agent_id=aid) then raise exception 'Alvo inválido'; end if;
    if operation in ('reputação','desfazer') then
      perform set_config('fenix.act_reputation',cid::text,true);
      if operation='desfazer' then
        original:=(command->>'original')::uuid;
        select detail->'changes' into strict edits from fenix_private.act_log where campaign_id=cid and id=original and kind='reputação';
        select array_agg((e->>'id')::uuid) into ids from jsonb_array_elements(edits) e;
      else
        select array_agg(distinct v::uuid) into ids from jsonb_array_elements_text(command->'agents') v;
        if (delta is null)=(absolute_value is null) or abs(coalesce(delta,absolute_value)::bigint)>200 then raise exception 'Ajuste inválido'; end if;
      end if;
      if coalesce(cardinality(ids),0)=0 or cardinality(ids)<>(select count(*) from fenix_private.act_members where campaign_id=cid and agent_id=any(ids)) then raise exception 'Elenco inválido'; end if;
      for row_data in select agent_id,reputation from fenix_private.act_members where campaign_id=cid and agent_id=any(ids) order by agent_id loop
        if operation='desfazer' then
          select e into old_edit from jsonb_array_elements(edits) e where e->>'id'=row_data.agent_id::text;
          delta:=(old_edit->>'before')::int-(old_edit->>'after')::int;
        end if;
        next_value:=greatest(-100,least(100,coalesce(absolute_value,row_data.reputation+delta)));
        insert into fenix_private.campaign_bonds(agent_id,campaign_id,reputation,reputation_visible)
          values(row_data.agent_id,cid::text,next_value,true) on conflict(agent_id,campaign_id) do update set reputation=excluded.reputation,reputation_visible=true;
        details:=jsonb_set(details,'{changes}',coalesce(details->'changes','[]')||jsonb_build_array(jsonb_build_object('id',row_data.agent_id,'before',row_data.reputation,'after',next_value)));
      end loop;
      details:=details||jsonb_strip_nulls(jsonb_build_object('original',original,'reason',reason));
    elsif operation in ('melancolia','npc') then
      if operation='npc' then
        if coalesce(length(trim(command->>'npc')),0) not between 1 and 120 or coalesce(length(trim(command->>'scene')),0) not between 1 and 120 then raise exception 'Informe NPC e cena'; end if;
        score:=(command->>'score')::int;
        delta:=case when command->>'support'='true' then case when score>=25 then -5 when score>=20 then -3 when score>=15 then -1 else 0 end else 0 end;
        absolute_value:=null;
        details:=jsonb_build_object('npc',trim(command->>'npc'),'scene',trim(command->>'scene'),'score',score,'practical',left(command->>'practical',300),'support',command->>'support'='true');
      elsif (delta is null)=(absolute_value is null) or abs(coalesce(delta,absolute_value)::bigint)>100 then raise exception 'Ajuste inválido'; end if;
      next_value:=greatest(0,least(100,coalesce(absolute_value,t.pressure+delta)));
      details:=details||jsonb_build_object('before',t.pressure,'after',next_value,'reason',reason);
      update fenix_private.act_two set pressure=next_value where campaign_id=cid;
    elsif operation in ('armar','desarmar') then
      update fenix_private.act_two set trigger_state=case when operation='armar' then 'armado' else 'desarmado' end,
        armed_at=case when operation='armar' then clock_timestamp() else armed_at end, first_agent=null,first_event=null,
        automatic=coalesce((command->>'automatic')::boolean,true),individual=coalesce((command->>'individual')::boolean,false) where campaign_id=cid;
      if operation='armar' then update fenix_private.act_cast set marked=false where campaign_id=cid; end if;
    elsif operation='enviar' then
      perform fenix_private.act_send(cid,aid,rid,command); details:=jsonb_build_object('target',aid,'preset',command->>'preset');
    elsif operation='tema' then
      update fenix_private.act_cast set theme=true,intensity=coalesce((command->>'intensity')::int,1) where campaign_id=cid and agent_id=aid;
      details:=jsonb_build_object('target',aid);
    elsif operation in ('encerrar','restaurar') then
      update fenix_private.act_effect set ended=clock_timestamp() where campaign_id=cid and agent_id=aid and ended is null;
      update fenix_private.act_cast set current_event=null, theme=case when operation='restaurar' then false else theme end where campaign_id=cid and agent_id=aid;
      details:=jsonb_build_object('target',aid);
    else raise exception 'Operação inválida'; end if;
    insert into fenix_private.act_log(campaign_id,id,kind,actor,detail) values(cid,rid,operation,'mestre',details);
    update fenix_private.act_two set revision=revision+1 where campaign_id=cid returning * into t;
  end if;
  select jsonb_object_agg(m.agent_id,jsonb_build_object('dossier',m.dossier,'marked',m.marked,'theme',m.theme,'status',case
    when e.id is null then 'inativo' when e.ended is not null then 'encerrado' when e.expires<=clock_timestamp() then 'expirado' when e.received is not null then 'recebido' else 'enviado' end,'received',e.received))
  into targets from fenix_private.act_members m left join fenix_private.act_effect e on e.id=m.current_event where m.campaign_id=cid;
  select coalesce(jsonb_agg(to_jsonb(h) order by h.at desc),'[]') into history from
    (select id,kind,actor,detail,at from fenix_private.act_log where campaign_id=cid order by at desc limit 100) h;
  return fenix_private.act_board(cid,command->>'known')||jsonb_build_object('revision',t.revision,'pressure',t.pressure,'trigger',t.trigger_state,'automatic',t.automatic,'individual',t.individual,'first',t.first_agent,'targets',coalesce(targets,'{}'),'history',history);
end $function$;

CREATE OR REPLACE FUNCTION fenix_private.act_reputation_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if exists(select 1 from fenix_private.act_members where campaign_id::text=new.campaign_id and agent_id=new.agent_id) then
    new.reputation_visible:=true;
    if new.reputation is distinct from old.reputation and current_setting('fenix.act_reputation',true) is distinct from new.campaign_id then
      raise exception 'Ajuste a reputação pela central da campanha';
    end if;
  end if;
  return new;
end $function$;

CREATE OR REPLACE TRIGGER act_collective_reputation BEFORE UPDATE OF reputation, reputation_visible ON fenix_private.campaign_bonds FOR EACH ROW EXECUTE FUNCTION fenix_private.act_reputation_guard();

revoke all on function fenix_private.act_send(uuid,uuid,uuid,jsonb) from public;

revoke all on function fenix_private.act_commit(text,text,uuid,uuid,uuid,integer,jsonb,jsonb,uuid) from public;

revoke all on function fenix_private.act_board(uuid,text) from public;

revoke all on function public.fenix_act_commit_gift(text,text,uuid,uuid,uuid,integer,jsonb,jsonb,uuid,text,uuid) from public;

grant execute on function public.fenix_act_commit_gift(text,text,uuid,uuid,uuid,integer,jsonb,jsonb,uuid,text,uuid) to fenix_production_runtime;

revoke all on function fenix_private.act_reputation_guard() from public;

revoke all on function fenix_private.act_confirm_gift(uuid,uuid,text) from public;

revoke all on function public.fenix_act_member(uuid,text,text,uuid) from public;

grant execute on function public.fenix_act_member(uuid,text,text,uuid) to fenix_production_runtime;

revoke all on function public.fenix_act_master(uuid,text,text,jsonb) from public;

grant execute on function public.fenix_act_master(uuid,text,text,jsonb) to fenix_production_runtime;

revoke all on function public.fenix_act_use_gift(uuid,text,text,uuid) from public;

grant execute on function public.fenix_act_use_gift(uuid,text,text,uuid) to fenix_production_runtime;
