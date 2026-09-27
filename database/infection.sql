-- Barra de Infecção compartilhada por ficha. Somente o mestre ativa ou desativa;
-- mestre e jogador podem ajustar o valor quando ela estiver ativada.
create table if not exists public.fenix_infections (
  agent_id uuid primary key references public.fenix_shared_agents(id) on delete cascade,
  enabled boolean not null default false,
  value integer not null default 0 check (value between 0 and 100),
  updated_at timestamptz not null default now()
);
alter table public.fenix_infections enable row level security;
revoke all on public.fenix_infections from public, anon, authenticated;

create or replace function public.fenix_update_infection(
  requested_agent_id uuid, share_token text, operation text, change integer
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  sheet jsonb;
  master_hash text;
  player_hash text;
  token_hash text;
  is_master boolean;
  old_enabled boolean;
  old_value integer;
  new_enabled boolean;
  new_value integer;
begin
  if share_token is null or length(share_token) <> 64 then
    raise exception 'Chave da ficha inválida';
  end if;
  token_hash := encode(extensions.digest(share_token, 'sha256'), 'hex');
  select data, master_token_hash, player_token_hash
    into sheet, master_hash, player_hash
    from public.fenix_shared_agents where id = requested_agent_id for update;
  if sheet is null or (token_hash <> master_hash and token_hash <> player_hash) then
    raise exception 'Sem acesso à ficha';
  end if;
  is_master := token_hash = master_hash;
  if not (
    sheet ->> 'nex' = '35' or
    (sheet #>> '{alternate,face,nex}' = '35' and
     sheet #>> '{alternate,approvedCampaignId}' = sheet ->> 'campaign_id')
  ) or sheet ->> 'campaign_id' is null then
    raise exception 'Infecção só pode ser usada em personagens NEX 35 vinculados a uma campanha';
  end if;

  if operation in ('enable', 'disable') and not is_master then
    raise exception 'Somente o mestre pode liberar a Infecção';
  end if;
  if operation = 'adjust' and (change is null or change not in (-1, 1)) then
    raise exception 'Use os controles de mais ou menos um ponto';
  end if;
  if operation not in ('enable', 'disable', 'adjust') or operation is null then
    raise exception 'Operação de Infecção inválida';
  end if;

  insert into public.fenix_infections(agent_id) values (requested_agent_id)
    on conflict (agent_id) do nothing;
  select enabled, value into old_enabled, old_value
    from public.fenix_infections where agent_id = requested_agent_id for update;
  if operation = 'adjust' and not old_enabled then
    raise exception 'O mestre ainda não liberou a Infecção';
  end if;
  new_enabled := case when operation = 'enable' then true
                      when operation = 'disable' then false else old_enabled end;
  new_value := case when operation = 'adjust'
    then greatest(0, least(100, old_value + change)) else old_value end;
  if new_enabled is distinct from old_enabled or new_value <> old_value then
    update public.fenix_infections
      set enabled = new_enabled, value = new_value, updated_at = now()
      where agent_id = requested_agent_id;
    insert into public.fenix_alternate_edits(agent_id, actor_role, summary)
      values (requested_agent_id,
        case when is_master then 'master' else 'player' end,
        case when new_enabled is distinct from old_enabled
          then case when new_enabled then 'Infecção liberada' else 'Infecção desativada' end
          else format('Infecção: %s → %s', old_value, new_value) end);
  end if;
  return jsonb_build_object('enabled', new_enabled, 'value', new_value);
end;
$$;

create or replace function public.fenix_load_shared_agent(
  requested_agent_id uuid, share_token text
) returns jsonb
language plpgsql security definer stable set search_path = ''
as $$
declare
  agent_data jsonb;
  agent_updated_at timestamptz;
  access_role text;
  token_hash text;
  roll_history jsonb;
  edit_history jsonb := '[]'::jsonb;
  infection_status jsonb;
begin
  if share_token is null or length(share_token) <> 64 then
    raise exception 'Link de jogador inválido ou incompleto';
  end if;
  token_hash := encode(extensions.digest(share_token, 'sha256'), 'hex');
  select data, updated_at,
    case when master_token_hash = token_hash then 'master'
         when player_token_hash = token_hash then 'player' else null end
    into agent_data, agent_updated_at, access_role
  from public.fenix_shared_agents where id = requested_agent_id;
  if agent_data is null or access_role is null then
    raise exception 'Link de jogador inválido ou revogado';
  end if;

  select coalesce(jsonb_agg(entry.data order by entry.created_at desc), '[]'::jsonb)
    into roll_history from (
      select data, created_at from public.fenix_shared_rolls
      where agent_id = requested_agent_id order by created_at desc limit 100
    ) entry;

  if access_role = 'master' then
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', entry.id, 'agent_id', entry.agent_id,
      'actor', entry.actor_role, 'summary', entry.summary,
      'created_at', entry.created_at
    ) order by entry.created_at desc), '[]'::jsonb)
      into edit_history from (
        select id, agent_id, actor_role, summary, created_at
        from public.fenix_alternate_edits where agent_id = requested_agent_id
        order by created_at desc limit 100
      ) entry;
  end if;

  select coalesce(
    (select jsonb_build_object('enabled', enabled, 'value', value)
       from public.fenix_infections where agent_id = requested_agent_id),
    jsonb_build_object('enabled', false, 'value', 0)
  ) into infection_status;
  return jsonb_build_object(
    'agent', agent_data, 'rolls', roll_history,
    'role', access_role, 'updated_at', agent_updated_at,
    'alternate_edits', edit_history, 'infection', infection_status
  );
end;
$$;

revoke all on function public.fenix_update_infection(uuid, text, text, integer) from public;
grant execute on function public.fenix_update_infection(uuid, text, text, integer)
  to anon, authenticated;
