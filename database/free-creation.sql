-- Fênix 2.6: limite operacional de 1.000 dados; distribuição de atributos livre.
-- Substitui somente as duas funções de rolagem, preservando autenticação, permissões e fichas.
CREATE OR REPLACE FUNCTION fenix_private.roll_dice(cid uuid, agent_name text, roll_label text, attribute_value integer, bonus integer, damage_expression text, is_secret boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  if attribute_value is null or attribute_value<0 or attribute_value>1000 or bonus is null or abs(bonus)>100 then raise exception 'Atributo ou bônus inválido'; end if;
  n=case when attribute_value=0 then 2 else attribute_value end;sides=20;expr=n||'d20 ('||case when attribute_value=0 then 'menor' else 'maior' end||') '||case when bonus>=0 then '+' else '' end||bonus;
 end if;
 if n<1 or n>1000 or (coalesce(damage_expression,'')<>'' and n>40) then raise exception 'Quantidade de dados inválida'; end if;
 for i in 1..n loop dice=array_append(dice,1+floor(random()*sides)::integer);end loop;
 if damage_expression is not null and damage_expression<>'' then select sum(x) into total from unnest(dice) x;
 elsif attribute_value=0 then select min(x) into total from unnest(dice) x;
 else select max(x) into total from unnest(dice) x;end if;
 result=jsonb_build_object('agentName',left(agent_name,100),'label',left(roll_label,100),'expression',expr,'dice',dice,'total',total+modifier);
 insert into public.fenix_rolls(actor_id,campaign_id,data,secret) values(auth.uid(),cid,result,is_secret) returning id,created_at into rid,ts;
 return result||jsonb_build_object('id',rid,'created_at',ts,'campaign_id',cid,'secret',is_secret,'actor_id',auth.uid());
end $function$;

CREATE OR REPLACE FUNCTION public.fenix_roll_shared(requested_agent_id uuid, share_token text, agent_name text, roll_label text, attribute_value integer, bonus integer, damage_expression text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  token_hash text;
  allowed boolean;
  dice integer[] := '{}';
  dice_count integer;
  sides integer;
  modifier integer := coalesce(bonus, 0);
  total integer := 0;
  expression text;
  parts text[];
  result jsonb;
  roll_id uuid := gen_random_uuid();
  rolled_at timestamptz := now();
begin
  token_hash := encode(extensions.digest(coalesce(share_token, ''), 'sha256'), 'hex');
  select master_token_hash = token_hash or player_token_hash = token_hash
    into allowed
  from public.fenix_shared_agents
  where id = requested_agent_id;
  if not coalesce(allowed, false) then
    raise exception 'Sem acesso para rolar nesta ficha';
  end if;

  if (select count(*) from public.fenix_shared_rolls
      where agent_id = requested_agent_id and created_at > now() - interval '1 minute') >= 120 then
    raise exception 'Muitas rolagens em pouco tempo. Aguarde um minuto';
  end if;

  if coalesce(damage_expression, '') <> '' then
    parts := regexp_match(replace(damage_expression, ' ', ''), '^(\d{1,3})d(\d{1,7})([+-]\d{1,6})?$');
    if parts is null then raise exception 'Expressão de dados inválida'; end if;
    dice_count := parts[1]::integer;
    sides := parts[2]::integer;
    modifier := coalesce(parts[3]::integer, 0);
    if dice_count < 1 or dice_count > 100 or sides < 2 or sides > 1000000 then
      raise exception 'Use de 1 a 100 dados com 2 a 1.000.000 lados';
    end if;
    expression := replace(damage_expression, ' ', '');
  else
    if attribute_value is null or attribute_value < 0 or attribute_value > 1000
      or bonus is null or abs(bonus) > 100000 then
      raise exception 'Atributo ou bônus inválido';
    end if;
    dice_count := case when attribute_value = 0 then 2 else attribute_value end;
    sides := 20;
    expression := dice_count || 'd20 (' ||
      case when attribute_value = 0 then 'menor' else 'maior' end || ') ' ||
      case when bonus >= 0 then '+' else '' end || bonus;
  end if;

  for die_index in 1..dice_count loop
    dice := array_append(dice, 1 + floor(random() * sides)::integer);
  end loop;

  if coalesce(damage_expression, '') <> '' then
    select sum(value) into total from unnest(dice) value;
  elsif attribute_value = 0 then
    select min(value) into total from unnest(dice) value;
  else
    select max(value) into total from unnest(dice) value;
  end if;

  result := jsonb_build_object(
    'id', roll_id,
    'campaign_id', null,
    'agentName', left(agent_name, 100),
    'label', left(roll_label, 100),
    'expression', expression,
    'dice', to_jsonb(dice),
    'total', total + modifier,
    'secret', false,
    'created_at', rolled_at
  );
  insert into public.fenix_shared_rolls(id, agent_id, data, created_at)
    values (roll_id, requested_agent_id, result, rolled_at);
  return result;
end;
$function$;
