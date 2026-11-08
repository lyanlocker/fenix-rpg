-- Apply after interactive-combat.sql. No existing sheet or credential is rewritten.
CREATE OR REPLACE FUNCTION public.fenix_save_shared_agent(requested_agent_id uuid, share_token text, agent_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  token_hash text;
  saved_data jsonb;
  master_hash text;
  player_hash text;
  is_master boolean;
  old_alternate jsonb;
  incoming_alternate jsonb;
  proposed_face jsonb;
  changed_labels text;
  max_circle integer;
  next_data jsonb;
begin
  if jsonb_typeof(agent_data) is distinct from 'object'
    or agent_data ->> 'id' is distinct from requested_agent_id::text then
    raise exception 'Ficha inválida';
  end if;
  token_hash := encode(extensions.digest(coalesce(share_token, ''), 'sha256'), 'hex');
  select data, master_token_hash, player_token_hash
    into saved_data, master_hash, player_hash
  from public.fenix_shared_agents where id = requested_agent_id for update;
  if saved_data is null or (token_hash <> master_hash and token_hash <> player_hash) then
    raise exception 'Sem acesso para alterar esta ficha';
  end if;
  is_master := token_hash = master_hash;
  old_alternate := saved_data -> 'alternate';
  incoming_alternate := agent_data -> 'alternate';
  next_data := agent_data;

  if not is_master then perform fenix_private.assert_combat_sheet_edit(requested_agent_id,saved_data,agent_data);
    if agent_data ->> 'campaign_id' is distinct from saved_data ->> 'campaign_id' then
      raise exception 'Somente o mestre pode mudar a campanha da ficha compartilhada';
    end if;
    if old_alternate is not null and incoming_alternate is null then
      -- Um cliente antigo pode continuar editando a ficha sem apagar a face.
      next_data := agent_data || jsonb_build_object('alternate', old_alternate);
    elsif incoming_alternate is distinct from old_alternate then
      if old_alternate is null or
        incoming_alternate - 'face' is distinct from old_alternate - 'face' then
        raise exception 'Somente o mestre pode liberar a face alternativa';
      end if;
      -- Na face alternativa, qualquer outro campo enviado pelo cliente é
      -- ignorado: apenas a face autorizada pode ser substituída pelo jogador.
      next_data := jsonb_set(saved_data, '{alternate,face}', incoming_alternate -> 'face');
    end if;
  end if;

  if next_data ? 'alternate' and (next_data -> 'alternate') is distinct from old_alternate then
    if jsonb_typeof(next_data -> 'alternate') <> 'object' or
      (next_data #>> '{alternate,approvedCampaignId}') is distinct from
        (next_data ->> 'campaign_id') then
      raise exception 'A face alternativa exige uma campanha aprovada pelo mestre';
    end if;
    proposed_face := next_data #> '{alternate,face}';
    if jsonb_typeof(proposed_face) <> 'object' or proposed_face ->> 'nex' <> '35'
      or jsonb_typeof(proposed_face -> 'inventory') <> 'array'
      or jsonb_typeof(proposed_face -> 'skills') <> 'object'
      or coalesce(proposed_face ->> 'className', '') not in
        ('Ocultista', 'Combatente', 'Especialista', 'Sobrevivente')
      or length(coalesce(proposed_face ->> 'name', '')) not between 1 and 100 then
      raise exception 'Dados da face NEX 35 inválidos';
    end if;
    if length(coalesce(proposed_face ->> 'portrait', '')) > 2100000 then
      raise exception 'Imagem da face alternativa excede o tamanho permitido';
    end if;
    if exists (
      select 1 from jsonb_each_text(proposed_face -> 'skills') as s(skill, value)
      where value not in ('0','5','10')
    ) then
      raise exception 'No NEX 35 não é possível usar treinamento Expert';
    end if;
    max_circle := case when proposed_face ->> 'className' = 'Ocultista' then 2 else 1 end;
    if exists (
      select 1 from jsonb_array_elements(proposed_face -> 'inventory') as entry(item)
      where jsonb_typeof(item) <> 'object'
        or (item ->> 'kind' = 'Ritual' and
          case when (item ->> 'circle') ~ '^[1-9][0-9]*$' then (item ->> 'circle')::integer
            else 99 end > max_circle)
        or (item ->> 'nex' is not null and
          case when (item ->> 'nex') ~ '^[0-9]+$' then (item ->> 'nex')::integer
            else 99 end > 35)
        or (item ->> 'kind' = 'Poder' and
          ((item ->> 'subtype' = 'Habilidade de trilha' and item ->> 'nex' is null)
           or (item ->> 'requirements') ~* 'NEX[[:space:]]*(3[6-9]|[4-9][0-9])[[:space:]]*%'))
    ) then
      raise exception 'Ritual ou habilidade indisponível no NEX 35';
    end if;
  end if;

  if (old_alternate #> '{face}') is distinct from (next_data #> '{alternate,face}') then
    select string_agg(label, ', ' order by label) into changed_labels from (
      values ('name','nome'), ('portrait','aparência'), ('attributes','atributos'),
             ('skills','perícias'), ('skillAdjustments','bônus'),
             ('resources','recursos'), ('adjustments','ajustes'),
             ('inventory','equipamentos, poderes ou rituais'),
             ('conditions','condições'), ('notes','anotações'),
             ('className','classe'), ('track','trilha'), ('origin','origem')
    ) as field(key, label)
    where (old_alternate #> array['face',field.key])
      is distinct from (next_data #> array['alternate','face',field.key]);
    insert into public.fenix_alternate_edits(agent_id, actor_role, summary)
    values (
      requested_agent_id,
      case when is_master then 'master' else 'player' end,
      case when old_alternate is null then 'Face NEX 35 liberada'
        else left('Face NEX 35: ' || coalesce(changed_labels, 'ficha atualizada'), 300)
      end
    );
  end if;

  update public.fenix_shared_agents
    set data = next_data, updated_at = now() where id = requested_agent_id;
  return jsonb_build_object('updated_at', now());
end;
$function$;

CREATE OR REPLACE FUNCTION public.fenix_publish_agent(agent_data jsonb, supplied_master_token text DEFAULT NULL::text, supplied_player_token text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  agent_id uuid;
  next_master_token text;
  next_player_token text;
  current_master_hash text;
  current_player_hash text;
begin
  if jsonb_typeof(agent_data) is distinct from 'object' then
    raise exception 'Ficha inválida';
  end if;

  begin
    agent_id := (agent_data ->> 'id')::uuid;
  exception when others then
    raise exception 'Identificador de ficha inválido';
  end;

  select master_token_hash, player_token_hash
    into current_master_hash, current_player_hash
  from public.fenix_shared_agents
  where id = agent_id;

  if found then
    if supplied_master_token is null
      or encode(extensions.digest(supplied_master_token, 'sha256'), 'hex') <> current_master_hash then
      raise exception 'Esta ficha já foi publicada por outro navegador';
    end if;

    next_master_token := supplied_master_token;
    if supplied_player_token is not null
      and encode(extensions.digest(supplied_player_token, 'sha256'), 'hex') = current_player_hash then
      next_player_token := supplied_player_token;
    else
      next_player_token := encode(extensions.gen_random_bytes(32), 'hex');
    end if;

    update public.fenix_shared_agents
      set player_token_hash = encode(extensions.digest(next_player_token, 'sha256'), 'hex'),
          updated_at = now()
      where id = agent_id;
  else
    next_master_token := encode(extensions.gen_random_bytes(32), 'hex');
    next_player_token := encode(extensions.gen_random_bytes(32), 'hex');
    insert into public.fenix_shared_agents(id, data, master_token_hash, player_token_hash)
    values (
      agent_id,
      agent_data,
      encode(extensions.digest(next_master_token, 'sha256'), 'hex'),
      encode(extensions.digest(next_player_token, 'sha256'), 'hex')
    );
  end if;

  return jsonb_build_object(
    'agent_id', agent_id,
    'master_token', next_master_token,
    'player_token', next_player_token
  );
end;
$function$;

create or replace function public.fenix_patch_shared_agent(
  requested_agent_id uuid, share_token text, expected_data jsonb, changed_data jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  row_data public.fenix_shared_agents%rowtype;
  token_hash text;
  field_name text;
  next_data jsonb;
begin
  if jsonb_typeof(expected_data) is distinct from 'object'
    or jsonb_typeof(changed_data) is distinct from 'object'
    or octet_length(expected_data::text) + octet_length(changed_data::text) > 10000000 then
    raise exception 'Edição inválida';
  end if;
  token_hash := encode(extensions.digest(coalesce(share_token,''),'sha256'),'hex');
  select * into row_data from public.fenix_shared_agents where id=requested_agent_id for update;
  if not found or token_hash not in (row_data.master_token_hash,row_data.player_token_hash) then
    raise exception 'Sem acesso para alterar esta ficha';
  end if;
  next_data := row_data.data;
  for field_name in select jsonb_object_keys(expected_data) union select jsonb_object_keys(changed_data) loop
    if field_name <> all(array['name','campaign_id','className','origin','originId','track','trackId','nex','stage',
      'determination','attributes','skills','skillAdjustments','resources','adjustments','defenseBonus',
      'inventory','notes','conditions','color','portrait','alternate']) then raise exception 'Campo de edição inválido'; end if;
    if (row_data.data -> field_name) is distinct from (expected_data -> field_name) then
      raise exception 'A ficha mudou em outro aparelho. Feche a edição, aguarde sincronizar e tente novamente.' using errcode='40001';
    end if;
    next_data := next_data - field_name;
  end loop;
  next_data := next_data || changed_data;
  perform public.fenix_save_shared_agent(requested_agent_id,share_token,next_data);
  select data into next_data from public.fenix_shared_agents where id=requested_agent_id;
  return jsonb_build_object('agent',next_data);
end $$;
revoke all on function public.fenix_patch_shared_agent(uuid,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.fenix_patch_shared_agent(uuid,text,jsonb,jsonb) to anon,authenticated;
