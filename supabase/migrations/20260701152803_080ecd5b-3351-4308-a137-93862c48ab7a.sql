
DROP POLICY IF EXISTS "Users read own profile or staff reads all" ON public.profiles;

CREATE POLICY "Users read own profile; owner/admin read all"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR public.has_role(auth.uid(), 'owner'::public.app_role)
  OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE VIEW public.profiles_directory
WITH (security_invoker = true) AS
SELECT id, full_name, email, is_active
FROM public.profiles;

GRANT SELECT ON public.profiles_directory TO authenticated;

CREATE POLICY "Staff can read directory rows"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'buyer'::public.app_role)
  OR public.has_role(auth.uid(), 'aprovador'::public.app_role)
  OR public.has_role(auth.uid(), 'auditor'::public.app_role)
);

REVOKE SELECT (cpf, phone) ON public.profiles FROM authenticated;
GRANT SELECT (id, full_name, email, is_active, created_at) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.get_profile_pii(_user_id uuid)
RETURNS TABLE(cpf text, phone text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.cpf, p.phone
  FROM public.profiles p
  WHERE p.id = _user_id
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    );
$$;
REVOKE ALL ON FUNCTION public.get_profile_pii(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_profile_pii(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_kanban_card(
  _card_id uuid,
  _selected_supplier_id text,
  _justificativa text
) RETURNS public.kanban_cards
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  card public.kanban_cards;
  approver_depts text[];
  approver_ceiling numeric;
  is_owner boolean;
  is_approver boolean;
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
  is_approver := public.has_role(auth.uid(), 'aprovador'::public.app_role);
  IF NOT (is_owner OR is_approver) THEN RAISE EXCEPTION 'Sem permissão para aprovar'; END IF;

  suppliers_json := COALESCE(card.suppliers, '[]'::jsonb);
  SELECT elem INTO chosen FROM jsonb_array_elements(suppliers_json) elem
   WHERE elem->>'id' = _selected_supplier_id LIMIT 1;
  IF chosen IS NULL THEN RAISE EXCEPTION 'Fornecedor selecionado inválido'; END IF;

  cleaned_value := regexp_replace(COALESCE(chosen->>'valor',''), '[^0-9,.-]', '', 'g');
  cleaned_value := regexp_replace(cleaned_value, '\.(?=\d{3}([,.]|$))', '', 'g');
  cleaned_value := replace(cleaned_value, ',', '.');
  BEGIN chosen_valor := cleaned_value::numeric; EXCEPTION WHEN OTHERS THEN chosen_valor := 0; END;

  card_dept := NULLIF(trim(COALESCE(card.data->>'departamento','')), '');

  IF NOT is_owner THEN
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

  is_single := jsonb_array_length(suppliers_json) <= 1;
  SELECT elem->>'id',
         COALESCE(NULLIF(regexp_replace(replace(regexp_replace(COALESCE(elem->>'valor',''),'[^0-9,.-]','','g'),',','.'),'^$','0'),'')::numeric, 0)
    INTO cheapest_id, cheapest_val
    FROM jsonb_array_elements(suppliers_json) elem
   ORDER BY 2 ASC LIMIT 1;
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
      'aprovado_em', to_jsonb(now_ts)));

  next_status := CASE WHEN card.kind = 'frete' THEN 'pedidos_gerados'::public.card_status ELSE 'cotacoes_aprovadas'::public.card_status END;

  UPDATE public.kanban_cards
     SET status = next_status, suppliers = new_suppliers, data = new_data,
         observations = new_obs, approver_id = auth.uid(), approver_name = author
   WHERE id = _card_id RETURNING * INTO card;

  RETURN card;
END; $$;
REVOKE ALL ON FUNCTION public.approve_kanban_card(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_kanban_card(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_kanban_card(_card_id uuid, _motivo text)
RETURNS public.kanban_cards
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  card public.kanban_cards;
  is_owner boolean;
  is_approver boolean;
  approver_depts text[];
  card_dept text;
  author text;
  now_ts timestamptz := now();
  new_obs jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Autenticação exigida'; END IF;
  IF COALESCE(trim(_motivo), '') = '' THEN RAISE EXCEPTION 'Motivo obrigatório'; END IF;
  SELECT * INTO card FROM public.kanban_cards WHERE id = _card_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card não encontrado'; END IF;
  IF card.status <> 'aguardando_aprovacao' THEN RAISE EXCEPTION 'Card não está aguardando aprovação'; END IF;

  is_owner := public.has_role(auth.uid(), 'owner'::public.app_role);
  is_approver := public.has_role(auth.uid(), 'aprovador'::public.app_role);
  IF NOT (is_owner OR is_approver) THEN RAISE EXCEPTION 'Sem permissão'; END IF;

  card_dept := NULLIF(trim(COALESCE(card.data->>'departamento','')), '');
  IF NOT is_owner THEN
    SELECT departments INTO approver_depts FROM public.approver_settings WHERE user_id = auth.uid();
    IF approver_depts IS NULL OR card_dept IS NULL OR NOT (card_dept = ANY(approver_depts)) THEN
      RAISE EXCEPTION 'Departamento fora da sua alçada';
    END IF;
  END IF;

  SELECT COALESCE(full_name, email, 'Aprovador') INTO author FROM public.profiles WHERE id = auth.uid();
  IF author IS NULL THEN author := 'Aprovador'; END IF;

  new_obs := COALESCE(card.observations, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('at', now_ts, 'author', author,
      'text', format('❌ Cotação REJEITADA por %s. Motivo: %s', author, _motivo)));

  UPDATE public.kanban_cards
     SET status = 'cotacoes_rejeitadas'::public.card_status,
         observations = new_obs, approver_id = auth.uid(), approver_name = author
   WHERE id = _card_id RETURNING * INTO card;
  RETURN card;
END; $$;
REVOKE ALL ON FUNCTION public.reject_kanban_card(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_kanban_card(uuid, text) TO authenticated;
