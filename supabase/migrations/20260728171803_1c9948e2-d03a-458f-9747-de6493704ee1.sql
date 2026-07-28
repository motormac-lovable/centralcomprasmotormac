CREATE OR REPLACE FUNCTION public.approve_kanban_card(_card_id uuid, _selected_supplier_id text, _justificativa text)
 RETURNS public.kanban_cards
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  card public.kanban_cards;
  approver_depts text[];
  approver_ceiling numeric;
  is_owner boolean;
  is_admin boolean;
  is_approver boolean;
  is_fallback boolean;
  chosen jsonb;
  chosen_valor numeric;
  card_dept text;
  cleaned_value text;
  suppliers_json jsonb;
  new_suppliers jsonb;
  cheapest_id text;
  cheapest_val numeric;
  is_cheapest boolean;
  is_single boolean;
  now_ts timestamptz := now();
  author text;
  log_text text;
  new_obs jsonb;
  new_data jsonb;
  next_status public.card_status;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação exigida'; END IF;
  SELECT * INTO card FROM public.kanban_cards WHERE id = _card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card não encontrado'; END IF;
  IF card.status <> 'aguardando_aprovacao' THEN RAISE EXCEPTION 'Card não está aguardando aprovação'; END IF;

  is_owner := public.has_role(auth.uid(), 'owner'::public.app_role);
  is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  is_approver := public.has_role(auth.uid(), 'aprovador'::public.app_role);
  is_fallback := COALESCE((card.data->'aprovacao_fallback_global')::boolean, false);

  IF NOT (is_owner OR is_approver OR (is_admin AND is_fallback)) THEN
    RAISE EXCEPTION 'Sem permissão para aprovar';
  END IF;

  suppliers_json := COALESCE(card.suppliers, '[]'::jsonb);
  SELECT elem INTO chosen FROM jsonb_array_elements(suppliers_json) elem
   WHERE elem->>'id' = _selected_supplier_id LIMIT 1;
  IF chosen IS NULL THEN RAISE EXCEPTION 'Fornecedor selecionado inválido'; END IF;

  cleaned_value := regexp_replace(COALESCE(chosen->>'valor',''), '[^0-9,.-]', '', 'g');
  IF position(',' in cleaned_value) > 0 THEN
    cleaned_value := replace(replace(cleaned_value, '.', ''), ',', '.');
  END IF;
  BEGIN chosen_valor := NULLIF(cleaned_value, '')::numeric; EXCEPTION WHEN OTHERS THEN chosen_valor := 0; END;

  card_dept := NULLIF(trim(COALESCE(card.data->>'departamento','')), '');

  -- Aprovadores locais seguem validação estrita de dept + teto.
  -- Administradores em modo fallback e Proprietários têm alçada global.
  IF NOT is_owner AND NOT (is_admin AND is_fallback) THEN
    SELECT departments, teto_alcada INTO approver_depts, approver_ceiling
      FROM public.approver_settings WHERE user_id = auth.uid();
    IF approver_depts IS NULL THEN RAISE EXCEPTION 'Aprovador sem configuração de alçada'; END IF;
    IF card_dept IS NULL OR NOT (card_dept = ANY(approver_depts)) THEN
      RAISE EXCEPTION 'Departamento do card fora da sua alçada';
    END IF;
    IF chosen_valor > COALESCE(approver_ceiling, 0) THEN
      RAISE EXCEPTION 'Valor acima do seu teto de alçada';
    END IF;
    IF chosen_valor > 200000 THEN
      RAISE EXCEPTION 'Valores acima de R$ 200.000 são exclusivos do proprietário';
    END IF;
  END IF;

  -- Admin em fallback não pode ultrapassar o teto exclusivo do Proprietário.
  IF is_admin AND is_fallback AND NOT is_owner AND chosen_valor > 200000 THEN
    RAISE EXCEPTION 'Valores acima de R$ 200.000 são exclusivos do proprietário';
  END IF;

  is_single := jsonb_array_length(suppliers_json) <= 1;
  SELECT supplier_id, supplier_value
    INTO cheapest_id, cheapest_val
    FROM (
      SELECT elem->>'id' AS supplier_id,
             COALESCE(
               NULLIF(
                 CASE
                   WHEN position(',' in regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g')) > 0 THEN
                     replace(replace(regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.')
                   ELSE
                     regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g')
                 END,
                 ''
               )::numeric,
               0
             ) AS supplier_value
        FROM jsonb_array_elements(suppliers_json) elem
    ) parsed_suppliers
   ORDER BY supplier_value ASC LIMIT 1;
  is_cheapest := cheapest_id = _selected_supplier_id;

  IF NOT is_single AND NOT is_cheapest AND (COALESCE(trim(_justificativa),'') = '') THEN
    RAISE EXCEPTION 'Justificativa obrigatória para fornecedor não-menor-custo';
  END IF;
  IF is_single AND (COALESCE(trim(_justificativa),'') = '') THEN
    RAISE EXCEPTION 'Justificativa obrigatória para cotação única';
  END IF;

  SELECT jsonb_agg(
    CASE WHEN elem->>'id' = _selected_supplier_id
         THEN jsonb_set(elem, '{chosen}', 'true'::jsonb)
         ELSE jsonb_set(elem, '{chosen}', 'false'::jsonb) END
  ) INTO new_suppliers FROM jsonb_array_elements(suppliers_json) elem;

  SELECT COALESCE(full_name, email, 'Aprovador') INTO author FROM public.profiles WHERE id = auth.uid();
  IF author IS NULL THEN author := 'Aprovador'; END IF;

  IF is_single THEN
    log_text := format('✅ Cotação APROVADA pelo aprovador %s. Fornecedor escolhido: %s (%s). Justificativa (cotação única): %s',
                       author, chosen->>'fornecedor', chosen->>'valor', _justificativa);
  ELSIF is_cheapest THEN
    log_text := format('✅ Cotação APROVADA pelo aprovador %s. Fornecedor escolhido: %s (%s) — menor custo.',
                       author, chosen->>'fornecedor', chosen->>'valor');
  ELSE
    log_text := format('✅ Cotação APROVADA pelo aprovador %s. Fornecedor escolhido: %s (%s). Justificativa (custo maior): %s',
                       author, chosen->>'fornecedor', chosen->>'valor', _justificativa);
  END IF;

  IF is_admin AND is_fallback AND NOT is_owner THEN
    log_text := log_text || ' (aprovação via alçada global — fallback)';
  END IF;

  new_obs := COALESCE(card.observations, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('at', now_ts, 'author', author, 'text', log_text));

  new_data := COALESCE(card.data, '{}'::jsonb) || jsonb_build_object(
    'aprovacao', jsonb_build_object(
      'fornecedor_escolhido_id', _selected_supplier_id,
      'fornecedor_escolhido', chosen->>'fornecedor',
      'valor_escolhido', chosen->>'valor',
      'is_menor_custo', CASE WHEN is_single THEN NULL ELSE to_jsonb(is_cheapest) END,
      'justificativa_custo_maior', CASE WHEN NOT is_single AND NOT is_cheapest THEN _justificativa ELSE NULL END,
      'justificativa_custo_maior_em', CASE WHEN NOT is_single AND NOT is_cheapest THEN to_jsonb(now_ts) ELSE NULL END,
      'justificativa_fornecedor_unico', CASE WHEN is_single THEN _justificativa ELSE NULL END,
      'justificativa_fornecedor_unico_em', CASE WHEN is_single THEN to_jsonb(now_ts) ELSE NULL END,
      'aprovador', author,
      'aprovado_em', to_jsonb(now_ts),
      'via_fallback_global', to_jsonb(is_admin AND is_fallback AND NOT is_owner)));

  next_status := CASE WHEN card.kind = 'frete' THEN 'pedidos_gerados'::public.card_status ELSE 'cotacoes_aprovadas'::public.card_status END;

  UPDATE public.kanban_cards
     SET status = next_status, suppliers = new_suppliers, data = new_data,
         observations = new_obs, approver_id = auth.uid(), approver_name = author
   WHERE id = _card_id RETURNING * INTO card;

  RETURN card;
END; $function$;

REVOKE ALL ON FUNCTION public.approve_kanban_card(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_kanban_card(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_kanban_card(uuid, text, text) TO service_role;