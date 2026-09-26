-- Executar em transação: dados temporários descartados ao final.
begin;
do $$
declare
  sheet_id uuid := gen_random_uuid();
  campaign_id uuid := gen_random_uuid();
  master_token text := repeat('a', 64);
  player_token text := repeat('b', 64);
  base jsonb;
  alternate jsonb;
  edit_data jsonb;
begin
  base := jsonb_build_object('id', sheet_id, 'campaign_id', campaign_id, 'name', 'Ficha de teste');
  alternate := jsonb_build_object('approvedCampaignId', campaign_id,
    'face', jsonb_build_object('name', 'Outra face', 'nex', 35,
      'className', 'Ocultista', 'inventory', '[]'::jsonb,
      'skills', '{"Ocultismo":10}'::jsonb));
  insert into public.fenix_shared_agents(id, data, master_token_hash, player_token_hash)
  values (sheet_id, base,
    encode(extensions.digest(master_token, 'sha256'), 'hex'),
    encode(extensions.digest(player_token, 'sha256'), 'hex'));

  begin
    perform public.fenix_save_shared_agent(sheet_id, player_token,
      base || jsonb_build_object('alternate', alternate));
    raise exception 'O jogador conseguiu liberar uma face';
  exception when others then
    if sqlerrm <> 'Somente o mestre pode liberar a face alternativa' then raise; end if;
  end;

  perform public.fenix_save_shared_agent(sheet_id, master_token,
    base || jsonb_build_object('alternate', alternate));
  edit_data := base || jsonb_build_object('alternate',
    jsonb_set(alternate, '{face,name}', '"Nome editado"'::jsonb));
  perform public.fenix_save_shared_agent(sheet_id, player_token, edit_data);
  if (select count(*) from public.fenix_alternate_edits where agent_id = sheet_id) <> 2 then
    raise exception 'Histórico da face não foi registrado';
  end if;
  if jsonb_array_length(public.fenix_load_shared_agent(sheet_id, player_token)
       -> 'alternate_edits') <> 0 then
    raise exception 'O jogador acessou os avisos reservados ao mestre';
  end if;
  if jsonb_array_length(public.fenix_load_shared_agent(sheet_id, master_token)
       -> 'alternate_edits') <> 2 then
    raise exception 'O mestre não recebeu os avisos da face';
  end if;

  begin
    perform public.fenix_save_shared_agent(sheet_id, player_token,
      jsonb_set(edit_data, '{alternate,approvedCampaignId}',
        to_jsonb(gen_random_uuid()::text)));
    raise exception 'O jogador alterou a campanha aprovada';
  exception when others then
    if sqlerrm <> 'Somente o mestre pode liberar a face alternativa' then raise; end if;
  end;
  begin
    perform public.fenix_save_shared_agent(sheet_id, player_token,
      jsonb_set(edit_data, '{alternate,face,inventory}',
        '[{"kind":"Ritual","circle":3}]'::jsonb));
    raise exception 'O jogador adicionou ritual de 3º círculo';
  exception when others then
    if sqlerrm <> 'Ritual ou habilidade indisponível no NEX 35' then raise; end if;
  end;
  begin
    perform public.fenix_save_shared_agent(sheet_id, player_token,
      jsonb_set(edit_data, '{alternate,face,inventory}',
        '[{"kind":"Ritual","circle":0}]'::jsonb));
    raise exception 'O jogador adicionou ritual de círculo desconhecido';
  exception when others then
    if sqlerrm <> 'Ritual ou habilidade indisponível no NEX 35' then raise; end if;
  end;
  if (select data ->> 'name' from public.fenix_shared_agents where id = sheet_id) <> 'Ficha de teste' then
    raise exception 'Editar a segunda face alterou a ficha original';
  end if;
end;
$$;
rollback;
