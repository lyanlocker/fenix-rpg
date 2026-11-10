-- Fênix 2.9: only a sheet master may delete its shared record.
-- No existing sheet is deleted by applying this migration.
create or replace function public.fenix_delete_shared_agent(requested_agent_id uuid, master_token text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  stored_hash text;
  campaign uuid;
begin
  select master_token_hash into stored_hash from public.fenix_shared_agents where id=requested_agent_id;
  if not found or stored_hash is distinct from encode(extensions.digest(coalesce(master_token,''),'sha256'),'hex') then
    raise exception 'É necessária a chave de mestre desta ficha para excluir';
  end if;
  -- Serialize this rare destructive operation with room writers, including a
  -- new membership created concurrently. Plain read-only polling remains allowed.
  begin
    lock table public.fenix_combat_rooms in exclusive mode nowait;
  exception when lock_not_available then
    raise exception 'O combate está sendo atualizado. Aguarde um instante e tente excluir novamente';
  end;
  -- Lock rooms before the sheet, matching the combat transaction lock order.
  for campaign in select r.campaign_id from public.fenix_combat_rooms r
    where exists (select 1 from public.fenix_combat_members m where m.agent_id=requested_agent_id and m.campaign_id=r.campaign_id)
      or r.encounter -> 'participants' @> jsonb_build_array(jsonb_build_object('agentId',requested_agent_id::text))
    order by r.campaign_id for update loop
    if exists(select 1 from public.fenix_combat_rooms r where r.campaign_id=campaign
      and r.encounter -> 'participants' @> jsonb_build_array(jsonb_build_object('agentId',requested_agent_id::text))) then
      raise exception 'Retire esta ficha do combate compartilhado ou encerre o combate antes de excluir';
    end if;
  end loop;
  select master_token_hash into stored_hash from public.fenix_shared_agents where id=requested_agent_id for update;
  if not found or stored_hash is distinct from encode(extensions.digest(coalesce(master_token,''),'sha256'),'hex') then
    raise exception 'É necessária a chave de mestre desta ficha para excluir';
  end if;
  delete from fenix_private.resource_requests where actor_id=requested_agent_id;
  delete from public.fenix_shared_agents where id=requested_agent_id;
  return jsonb_build_object('deleted',requested_agent_id);
end $$;
revoke all on function public.fenix_delete_shared_agent(uuid,text) from public,anon,authenticated;
grant execute on function public.fenix_delete_shared_agent(uuid,text) to anon,authenticated;
