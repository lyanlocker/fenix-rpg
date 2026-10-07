-- Additive RPCs: old links/clients remain valid. Tables remain inaccessible.
-- Cursors are hints only: authorization is checked on EVERY call.
create or replace function public.fenix_sync_shared_agent(
  requested_agent_id uuid, share_token text, known_versions jsonb default null,
  status_only boolean default false
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  access_role text; token_hash text; agent_version text;
  versions jsonb; result jsonb; roll_version text; edit_version text;
  infection_status jsonb;
  sheet jsonb; portrait_versions jsonb; portraits jsonb := '{}'::jsonb;
begin
  if share_token is null or length(share_token) <> 64 then
    raise exception 'Link de jogador inválido ou incompleto';
  end if;
  token_hash := encode(extensions.digest(share_token, 'sha256'), 'hex');
  select updated_at::text,
    case when master_token_hash = token_hash then 'master'
         when player_token_hash = token_hash then 'player' else null end
    into agent_version, access_role from public.fenix_shared_agents
    where id = requested_agent_id;
  if access_role is null then raise exception 'Link de jogador inválido ou revogado'; end if;
  if status_only and access_role <> 'master' then raise exception 'Avisos reservados ao mestre'; end if;
  select coalesce((select jsonb_build_object('enabled', enabled, 'value', value)
    from public.fenix_infections where agent_id = requested_agent_id),
    '{"enabled":false,"value":0}'::jsonb) into infection_status;
  if not status_only then
    select coalesce(max(created_at)::text, '') || ':' || count(*)::text into roll_version
      from public.fenix_shared_rolls where agent_id = requested_agent_id;
  end if;
  if access_role = 'master' then
    select coalesce(max(created_at)::text, '') || ':' || count(*)::text into edit_version
      from public.fenix_alternate_edits where agent_id = requested_agent_id;
  end if;
  if not status_only and (known_versions is null or known_versions ->> 'agent' is distinct from agent_version) then
    select data into sheet from public.fenix_shared_agents where id = requested_agent_id;
    portrait_versions := jsonb_build_object('main', md5(coalesce(sheet ->> 'portrait', '')),
      'alternate', md5(coalesce(sheet #>> '{alternate,face,portrait}', '')));
    if known_versions is null or known_versions #> '{portraits,main}' is distinct from portrait_versions -> 'main' then
      portraits := portraits || jsonb_build_object('main', coalesce(sheet ->> 'portrait', ''));
    end if;
    if known_versions is null or known_versions #> '{portraits,alternate}' is distinct from portrait_versions -> 'alternate' then
      portraits := portraits || jsonb_build_object('alternate', coalesce(sheet #>> '{alternate,face,portrait}', ''));
    end if;
  else
    portrait_versions := known_versions -> 'portraits';
  end if;
  versions := jsonb_build_object('agent', case when status_only then null else agent_version end,
    'rolls', roll_version, 'edits', edit_version, 'infection', infection_status, 'portraits', portrait_versions);
  result := jsonb_build_object('versions', versions, 'role', access_role,
    'unchanged', versions is not distinct from known_versions);
  if versions is not distinct from known_versions then return result; end if;
  if not status_only and (known_versions is null or known_versions ->> 'agent' is distinct from agent_version) then
    result := result || jsonb_build_object('agent', (sheet - 'portrait') #- '{alternate,face,portrait}', 'portraits', portraits);
  end if;
  if not status_only and (known_versions is null or known_versions ->> 'rolls' is distinct from roll_version) then
    result := result || jsonb_build_object('rolls', (select coalesce(jsonb_agg(e.data order by e.created_at desc, e.id desc), '[]'::jsonb)
      from (select id, data, created_at from public.fenix_shared_rolls where agent_id = requested_agent_id order by created_at desc, id desc limit 100) e));
  end if;
  if access_role = 'master' and (known_versions is null or known_versions ->> 'edits' is distinct from edit_version) then
    result := result || jsonb_build_object('alternate_edits', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'agent_id', e.agent_id, 'actor', e.actor_role, 'summary', e.summary, 'created_at', e.created_at)
      order by e.created_at desc, e.id desc), '[]'::jsonb)
      from (select * from public.fenix_alternate_edits where agent_id = requested_agent_id order by created_at desc, id desc limit 100) e));
  end if;
  if known_versions is null or known_versions -> 'infection' is distinct from infection_status then
    result := result || jsonb_build_object('infection', infection_status);
  end if;
  return result;
end;
$$;

create or replace function public.fenix_sync_master_combat(
  requested_campaign_id uuid, master_token text, known_version text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare room public.fenix_combat_rooms%rowtype; version text; hp jsonb;
begin
  select * into room from public.fenix_combat_rooms where campaign_id = requested_campaign_id;
  if found and room.master_token_hash is distinct from encode(extensions.digest(coalesce(master_token, ''), 'sha256'), 'hex') then
    raise exception 'Sem acesso de mestre ao combate';
  end if;
  -- Include live sheet PV: these can change without the room revision changing.
  select coalesce(jsonb_agg(jsonb_build_array(p -> 'id', a.data -> 'campaign_id',
    case when p ->> 'face' = 'alternate' then a.data #> '{alternate,face,resources,pv}' else a.data #> '{resources,pv}' end)
    order by ord), '[]'::jsonb) into hp
    from jsonb_array_elements(coalesce(room.encounter -> 'participants', '[]'::jsonb)) with ordinality e(p, ord)
    left join public.fenix_shared_agents a on a.id::text = p ->> 'agentId';
  version := coalesce(room.revision, 0)::text || ':' || md5(hp::text);
  if version is not distinct from known_version then return jsonb_build_object('version', version, 'unchanged', true); end if;
  return jsonb_build_object('version', version, 'unchanged', false,
    'payload', public.fenix_load_master_combat(requested_campaign_id, master_token));
end;
$$;

create or replace function public.fenix_sync_player_combat(
  requested_agent_id uuid, share_token text, known_version text default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare payload jsonb; version text;
begin
  -- Hash only the authorized, sanitized player view, never the secret encounter.
  payload := public.fenix_load_player_combat(requested_agent_id, share_token);
  version := md5(coalesce(payload::text, 'null'));
  if version is not distinct from known_version then return jsonb_build_object('version', version, 'unchanged', true); end if;
  return jsonb_build_object('version', version, 'unchanged', false, 'payload', payload);
end;
$$;

revoke all on function public.fenix_sync_shared_agent(uuid, text, jsonb, boolean) from public;
revoke all on function public.fenix_sync_master_combat(uuid, text, text) from public;
revoke all on function public.fenix_sync_player_combat(uuid, text, text) from public;
grant execute on function public.fenix_sync_shared_agent(uuid, text, jsonb, boolean) to anon, authenticated;
grant execute on function public.fenix_sync_master_combat(uuid, text, text) to anon, authenticated;
grant execute on function public.fenix_sync_player_combat(uuid, text, text) to anon, authenticated;
