-- Synthetic integration test: every fixture and roll is rolled back.
begin;
do $$
declare
  aid uuid := gen_random_uuid(); uid uuid := gen_random_uuid();
  player text := repeat('b',64); master text := repeat('a',64);
  result jsonb; denied boolean;
begin
  insert into public.fenix_shared_agents(id,data,master_token_hash,player_token_hash)
    values(aid,jsonb_build_object('id',aid,'name','Teste 2.6','attributes',jsonb_build_object('AGI',12)),
      encode(extensions.digest(master,'sha256'),'hex'),encode(extensions.digest(player,'sha256'),'hex'));
  result := public.fenix_roll_shared(aid,player,'Teste 2.6','Atributo livre',12,10,'');
  if jsonb_array_length(result->'dice') <> 12 or result->>'expression' <> '12d20 (maior) +10' then raise exception 'Pool compartilhado truncado'; end if;
  result := public.fenix_roll_shared(aid,master,'Teste 2.6','Atributo zero',0,0,'');
  if jsonb_array_length(result->'dice') <> 2 or result->>'expression' <> '2d20 (menor) +0' then raise exception 'Atributo zero incorreto'; end if;
  result := public.fenix_roll_shared(aid,player,'Teste 2.6','Limite técnico',1000,0,'');
  if jsonb_array_length(result->'dice') <> 1000 then raise exception 'Pool técnico truncado'; end if;
  denied := false;
  begin perform public.fenix_roll_shared(aid,player,'Teste','Excesso',1001,0,''); exception when others then denied:=true; end;
  if not denied then raise exception 'Pool excessivo aceito'; end if;
  denied := false;
  begin perform public.fenix_roll_shared(aid,repeat('z',64),'Teste','Sem chave',12,0,''); exception when others then denied:=true; end;
  if not denied then raise exception 'Chave inválida aceita'; end if;
  insert into auth.users(id,email) values(uid,uid::text||'@example.invalid');
  perform set_config('request.jwt.claim.sub',uid::text,true);
  result := public.fenix_roll_dice(null,'Teste 2.6','Atributo livre',12,10,'',false);
  if jsonb_array_length(result->'dice') <> 12 then raise exception 'Pool autenticado truncado'; end if;
  result := public.fenix_roll_dice(null,'Teste 2.6','Limite técnico',1000,0,'',false);
  if jsonb_array_length(result->'dice') <> 1000 then raise exception 'Pool autenticado truncado'; end if;
  denied := false;
  begin perform public.fenix_roll_dice(null,'Teste','Dano excessivo',1,0,'41d6',false); exception when others then denied:=true; end;
  if not denied then raise exception 'Limite de dano legado removido'; end if;
  perform set_config('request.jwt.claim.sub','',true);
  denied := false;
  begin perform public.fenix_roll_dice(null,'Teste','Sem sessão',12,0,'',false); exception when others then denied:=true; end;
  if not denied then raise exception 'Rolagem autenticada sem sessão'; end if;
end $$;
select 'PASS: pools 12/1000, atributo zero, +10, limites operacionais e autenticação preservados' as result;
rollback;
