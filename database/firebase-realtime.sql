-- Authorize notification channels without returning a sheet, a token, or combat data.
-- Apply first to the independently provisioned validation branch.
create or replace function public.fenix_realtime_scope(p_agent uuid, p_campaign uuid, p_token text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare h text; result_campaign uuid;
begin
  if p_token is null or p_token !~ '^[a-f0-9]{64}$' or (p_agent is null) = (p_campaign is null) then
    raise exception 'Acesso inválido';
  end if;
  h := encode(extensions.digest(p_token,'sha256'),'hex');
  if p_agent is not null then
    perform 1 from public.fenix_shared_agents a where a.id=p_agent and (a.master_token_hash=h or a.player_token_hash=h);
    if not found then raise exception 'Acesso inválido'; end if;
    select m.campaign_id into result_campaign from public.fenix_combat_members m
      join public.fenix_shared_agents a on a.id=m.agent_id
      where a.id=p_agent and a.data->>'campaign_id'=m.campaign_id::text;
    return jsonb_build_object('agent',p_agent,'campaign',result_campaign);
  end if;
  perform 1 from public.fenix_combat_rooms r where r.campaign_id=p_campaign and r.master_token_hash=h;
  if not found then raise exception 'Acesso inválido'; end if;
  return jsonb_build_object('agent',null,'campaign',p_campaign);
end $$;
revoke all on function public.fenix_realtime_scope(uuid,uuid,text) from public;
-- Grant EXECUTE to the selected branch's dedicated runtime role only.
