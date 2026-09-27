-- Testes transacionais de permissões e persistência; não alteram fichas reais.
begin;
do $$
declare
  sheet_id uuid := gen_random_uuid();
  campaign_id uuid := gen_random_uuid();
  master_token text := repeat('a', 64);
  player_token text := repeat('b', 64);
  outsider_token text := repeat('c', 64);
  result jsonb;
begin
  insert into public.fenix_shared_agents(id, data, master_token_hash, player_token_hash)
  values (sheet_id,
    jsonb_build_object('id', sheet_id, 'campaign_id', campaign_id, 'nex', 65,
      'alternate', jsonb_build_object('approvedCampaignId', campaign_id,
        'face', jsonb_build_object('nex', 35))),
    encode(extensions.digest(master_token, 'sha256'), 'hex'),
    encode(extensions.digest(player_token, 'sha256'), 'hex'));

  begin
    perform public.fenix_update_infection(sheet_id, outsider_token, 'enable', 0);
    raise exception 'Terceiro sem chave liberou a barra';
  exception when others then
    if sqlerrm <> 'Sem acesso à ficha' then raise; end if;
  end;
  begin
    perform public.fenix_update_infection(sheet_id, player_token, 'enable', 0);
    raise exception 'Jogador liberou a barra';
  exception when others then
    if sqlerrm <> 'Somente o mestre pode liberar a Infecção' then raise; end if;
  end;
  begin
    perform public.fenix_update_infection(sheet_id, player_token, 'adjust', 1);
    raise exception 'Jogador alterou a Infecção antes de ser liberada';
  exception when others then
    if sqlerrm <> 'O mestre ainda não liberou a Infecção' then raise; end if;
  end;
  result := public.fenix_update_infection(sheet_id, master_token, 'enable', 0);
  if result <> '{"enabled":true,"value":0}'::jsonb then
    raise exception 'Mestre não liberou a barra zerada'; end if;
  result := public.fenix_update_infection(sheet_id, player_token, 'adjust', 1);
  if result ->> 'value' <> '1' then raise exception 'Jogador não aumentou Infecção'; end if;
  result := public.fenix_update_infection(sheet_id, master_token, 'adjust', 1);
  if result ->> 'value' <> '2' then raise exception 'Ajuste do mestre perdeu valor do jogador'; end if;
  result := public.fenix_update_infection(sheet_id, player_token, 'adjust', -1);
  if result ->> 'value' <> '1' then raise exception 'Jogador não diminuiu Infecção'; end if;
  if (public.fenix_load_shared_agent(sheet_id, player_token) #>> '{infection,value}') <> '1' then
    raise exception 'O jogador não vê o valor compartilhado'; end if;
  if jsonb_array_length(public.fenix_load_shared_agent(sheet_id, player_token)
       -> 'alternate_edits') <> 0 then
    raise exception 'Jogador acessou histórico privado'; end if;
  if jsonb_array_length(public.fenix_load_shared_agent(sheet_id, master_token)
       -> 'alternate_edits') <> 4 then
    raise exception 'O mestre não vê as mudanças de Infecção'; end if;
  result := public.fenix_update_infection(sheet_id, master_token, 'disable', 0);
  if result ->> 'enabled' <> 'false' then raise exception 'Mestre não desativou barra'; end if;
  result := public.fenix_update_infection(sheet_id, master_token, 'enable', 0);
  if result ->> 'value' <> '1' then
    raise exception 'Reativar a Infecção apagou o valor salvo'; end if;
  result := public.fenix_update_infection(sheet_id, master_token, 'disable', 0);
  begin
    perform public.fenix_update_infection(sheet_id, player_token, 'adjust', 1);
    raise exception 'Jogador alterou a barra desativada';
  exception when others then
    if sqlerrm <> 'O mestre ainda não liberou a Infecção' then raise; end if;
  end;
  if has_table_privilege('anon', 'public.fenix_infections', 'SELECT') then
    raise exception 'Tabela privada acessível diretamente'; end if;
end;
$$;
rollback;
