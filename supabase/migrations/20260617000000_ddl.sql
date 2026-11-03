--
-- PostgreSQL database dump
--

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.app_role AS ENUM (
    'admin',
    'buyer',
    'owner',
    'solicitante',
    'aprovador',
    'auditor'
);


--
-- Name: application_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.application_status AS ENUM (
    'pending',
    'approved',
    'rejected'
);


--
-- Name: card_kind; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.card_kind AS ENUM (
    'compras',
    'contratos',
    'frete',
    'materiais'
);


--
-- Name: card_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.card_status AS ENUM (
    'solicitacoes_abertas',
    'em_cotacao',
    'aguardando_aprovacao',
    'cotacoes_rejeitadas',
    'cotacoes_aprovadas',
    'pedidos_gerados'
);


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: kanban_cards; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kanban_cards (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    kind public.card_kind NOT NULL,
    title text NOT NULL,
    summary text,
    status public.card_status DEFAULT 'solicitacoes_abertas'::public.card_status NOT NULL,
    requester_name text,
    requester_email text,
    unidade text,
    empresa text,
    data jsonb DEFAULT '{}'::jsonb NOT NULL,
    assigned_to uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    status_changed_at timestamp with time zone DEFAULT now() NOT NULL,
    approver_id uuid,
    approver_name text,
    order_number text,
    observations jsonb DEFAULT '[]'::jsonb NOT NULL,
    suppliers jsonb DEFAULT '[]'::jsonb NOT NULL,
    attachments jsonb DEFAULT '[]'::jsonb NOT NULL,
    codigo_unico text,
    numero_pedido_linx text,
    ready_for_apollo_integration boolean DEFAULT false NOT NULL,
    buyer_name text,
    buyer_assigned_at timestamp with time zone,
    requester_id uuid
);


--
-- Name: append_quotation_attachments(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_quotation_attachments(_card_id uuid, _files jsonb) RETURNS public.kanban_cards
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  card public.kanban_cards;
  current_attachments jsonb;
  current_observations jsonb;
  normalized_files jsonb;
  audit_entries jsonb;
  author text;
  is_only_auditor boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação exigida';
  END IF;

  is_only_auditor := public.has_role(auth.uid(), 'auditor'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'owner'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'admin'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'buyer'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'aprovador'::public.app_role)
    AND NOT public.has_role(auth.uid(), 'solicitante'::public.app_role);

  IF is_only_auditor THEN
    RAISE EXCEPTION 'Auditor possui acesso somente leitura';
  END IF;

  IF _files IS NULL OR jsonb_typeof(_files) <> 'array' OR jsonb_array_length(_files) = 0 THEN
    RAISE EXCEPTION 'Arquivo inválido';
  END IF;

  SELECT * INTO card
  FROM public.kanban_cards
  WHERE id = _card_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card não encontrado';
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name), ''), email, 'Usuário')
    INTO author
  FROM public.profiles
  WHERE id = auth.uid();

  IF author IS NULL THEN
    SELECT COALESCE(email, 'Usuário') INTO author FROM auth.users WHERE id = auth.uid();
  END IF;

  current_attachments := COALESCE(card.attachments, '[]'::jsonb);
  IF jsonb_typeof(current_attachments) <> 'array' THEN
    current_attachments := '[]'::jsonb;
  END IF;

  current_observations := COALESCE(card.observations, '[]'::jsonb);
  IF jsonb_typeof(current_observations) <> 'array' THEN
    current_observations := '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'name', COALESCE(NULLIF(f.value->>'name', ''), 'arquivo'),
      'path', f.value->>'path',
      'size', COALESCE(NULLIF(f.value->>'size', ''), '0')::bigint,
      'uploaded_at', COALESCE(NULLIF(f.value->>'uploaded_at', ''), now()::text)
    )
  ) INTO normalized_files
  FROM jsonb_array_elements(_files) AS f(value)
  WHERE COALESCE(NULLIF(f.value->>'path', ''), '') <> '';

  IF normalized_files IS NULL OR jsonb_array_length(normalized_files) = 0 THEN
    RAISE EXCEPTION 'Arquivo inválido';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'at', now(),
      'author', author,
      'text', format('📎 %s anexou o arquivo "%s" (%s KB) ao card.', author, file_item.value->>'name', ROUND((COALESCE((file_item.value->>'size')::numeric, 0) / 1024.0)))
    )
  ) INTO audit_entries
  FROM jsonb_array_elements(normalized_files) AS file_item(value);

  UPDATE public.kanban_cards
     SET attachments = current_attachments || normalized_files,
         observations = current_observations || COALESCE(audit_entries, '[]'::jsonb)
   WHERE id = _card_id
   RETURNING * INTO card;

  RETURN card;
END;
$$;


--
-- Name: append_requester_file(uuid, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.append_requester_file(_card_id uuid, _file jsonb) RETURNS public.kanban_cards
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  card public.kanban_cards;
  current_files jsonb;
  new_files jsonb;
  is_owner boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação exigida';
  END IF;

  SELECT * INTO card FROM public.kanban_cards WHERE id = _card_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card não encontrado';
  END IF;

  is_owner := public.has_role(auth.uid(), 'owner'::public.app_role);

  IF NOT (
    is_owner
    OR card.requester_id = auth.uid()
    OR (
      card.requester_email IS NOT NULL
      AND lower(card.requester_email) = lower(COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para anexar neste card';
  END IF;

  IF card.status NOT IN ('solicitacoes_abertas'::public.card_status, 'em_cotacao'::public.card_status) THEN
    RAISE EXCEPTION 'Período de upload expirado';
  END IF;

  IF _file IS NULL OR jsonb_typeof(_file) <> 'object' THEN
    RAISE EXCEPTION 'Arquivo inválido';
  END IF;

  current_files := COALESCE(card.data->'files', '[]'::jsonb);
  IF jsonb_typeof(current_files) <> 'array' THEN
    current_files := '[]'::jsonb;
  END IF;
  new_files := current_files || jsonb_build_array(_file);

  UPDATE public.kanban_cards
     SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{files}', new_files, true)
   WHERE id = _card_id
   RETURNING * INTO card;

  RETURN card;
END;
$$;


--
-- Name: approve_kanban_card(uuid, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.approve_kanban_card(_card_id uuid, _selected_supplier_id text, _justificativa text) RETURNS public.kanban_cards
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  card public.kanban_cards;
  approver_depts text[];
  approver_ceiling numeric;
  is_owner boolean;
  is_admin boolean;
  is_approver boolean;
  is_fallback boolean;
  admin_native boolean := false;
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

  IF NOT (is_owner OR is_approver OR is_admin) THEN
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

  -- Alçada nativa do Administrador: até R$ 5.000,00 em todos os departamentos (regra cumulativa).
  admin_native := is_admin AND NOT is_owner AND NOT is_fallback AND COALESCE(chosen_valor, 0) <= 5000;
  -- Administrador (não Proprietário): teto absoluto de R$ 5.000,00 para TODOS os fins
  -- (inclusive fallback global e acúmulo com papel de Aprovador).
  IF is_admin AND NOT is_owner AND COALESCE(chosen_valor, 0) > 5000 THEN
    RAISE EXCEPTION 'Administrador só pode aprovar até R$ 5.000,00';
  END IF;

  -- Aprovadores locais seguem validação estrita de dept + teto.
  -- Administradores em modo fallback e Proprietários têm alçada global.
  IF NOT is_owner AND NOT (is_admin AND is_fallback) AND NOT admin_native THEN
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
  ELSIF admin_native THEN
    log_text := log_text || ' (aprovação via alçada nativa do Administrador — até R$ 5.000,00)';
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
      'via_fallback_global', to_jsonb(is_admin AND is_fallback AND NOT is_owner),
      'via_alcada_admin', to_jsonb(admin_native)));

  next_status := CASE WHEN card.kind = 'frete' THEN 'pedidos_gerados'::public.card_status ELSE 'cotacoes_aprovadas'::public.card_status END;

  UPDATE public.kanban_cards
     SET status = next_status, suppliers = new_suppliers, data = new_data,
         observations = new_obs, approver_id = auth.uid(), approver_name = author
   WHERE id = _card_id RETURNING * INTO card;

  RETURN card;
END; $_$;


--
-- Name: assign_contract_buyer(text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.assign_contract_buyer(_buyers text[]) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  next_idx bigint;
  n int;
BEGIN
  n := COALESCE(array_length(_buyers, 1), 0);
  IF n = 0 THEN RETURN NULL; END IF;

  INSERT INTO public.contract_buyer_rotation (id, counter) VALUES (1, 0)
    ON CONFLICT (id) DO NOTHING;

  UPDATE public.contract_buyer_rotation
    SET counter = counter + 1, updated_at = now()
    WHERE id = 1
    RETURNING counter INTO next_idx;

  RETURN _buyers[((next_idx - 1) % n) + 1];
END;
$$;


--
-- Name: can_access_card_messages(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.can_access_card_messages(_card_id uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'buyer')
      OR public.has_role(auth.uid(), 'aprovador')
      OR EXISTS (
        SELECT 1 FROM public.kanban_cards c
        WHERE c.id = _card_id
          AND (
            c.requester_id = auth.uid()
            OR lower(coalesce(c.requester_email, '')) = lower(coalesce((SELECT email FROM public.profiles WHERE id = auth.uid()), '@'))
          )
      );
$$;


--
-- Name: gerar_codigo_unico(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.gerar_codigo_unico() RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  RETURN to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'MMYYYY') || nextval('public.solicitacao_seq')::text;
END $$;


--
-- Name: get_profile_pii(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_profile_pii(_user_id uuid) RETURNS TABLE(cpf text, phone text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.cpf, p.phone
  FROM public.profiles p
  WHERE p.id = _user_id
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
    );
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, cpf, phone)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'cpf', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;

  IF lower(NEW.email) = 'herllon.souza@motormac.com.br' THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'owner')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $$;


--
-- Name: has_approver_for_department(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_approver_for_department(_dept text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approver_settings s
    JOIN public.user_roles r ON r.user_id = s.user_id AND r.role = 'aprovador'::public.app_role
    WHERE _dept IS NOT NULL
      AND btrim(_dept) <> ''
      AND btrim(_dept) = ANY (s.departments)
  );
$$;


--
-- Name: has_role(uuid, public.app_role); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.has_role(_user_id uuid, _role public.app_role) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
    OR (
      _role = 'owner'::public.app_role
      AND EXISTS (
        SELECT 1
        FROM auth.users u
        WHERE u.id = _user_id
          AND lower(u.email) = 'herllon.souza@motormac.com.br'
      )
    )
$$;


--
-- Name: kanban_cards_set_requester(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.kanban_cards_set_requester() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  auth_email text;
BEGIN
  IF NEW.requester_id IS NULL AND auth.uid() IS NOT NULL THEN
    NEW.requester_id := auth.uid();
  END IF;

  IF NEW.requester_id IS NOT NULL THEN
    SELECT email INTO auth_email FROM auth.users WHERE id = NEW.requester_id;
    -- Se o e-mail digitado no formulário difere do e-mail autenticado, preserva o
    -- digitado em data->form_email e grava o e-mail de auth como fonte de verdade
    -- (para garantir que o Histórico filtre corretamente).
    IF auth_email IS NOT NULL
       AND (NEW.requester_email IS NULL
            OR lower(NEW.requester_email) <> lower(auth_email)) THEN
      IF NEW.requester_email IS NOT NULL
         AND lower(NEW.requester_email) <> lower(auth_email) THEN
        NEW.data := COALESCE(NEW.data, '{}'::jsonb)
                    || jsonb_build_object('form_email', NEW.requester_email);
      END IF;
      NEW.requester_email := auth_email;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: list_profiles_with_pii(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.list_profiles_with_pii() RETURNS TABLE(id uuid, full_name text, email text, cpf text, phone text, is_active boolean, is_deleted boolean, created_at timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  SELECT p.id, p.full_name, p.email, p.cpf, p.phone, p.is_active, p.is_deleted, p.created_at
  FROM public.profiles p
  WHERE p.is_deleted = false
    AND (
      public.has_role(auth.uid(), 'owner'::public.app_role)
      OR public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'buyer'::public.app_role)
      OR public.has_role(auth.uid(), 'auditor'::public.app_role)
    )
  ORDER BY p.created_at DESC;
$$;


--
-- Name: mark_profile_deleted(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mark_profile_deleted(_target uuid, _actor uuid, _actor_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  original_name text;
  original_email text;
BEGIN
  SELECT COALESCE(full_name, email, 'Usuário'), email
    INTO original_name, original_email
  FROM public.profiles
  WHERE id = _target;

  IF original_name IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles SET
    original_full_name = COALESCE(original_full_name, full_name),
    original_email     = COALESCE(original_email, email),
    full_name          = original_name || ' (Excluído)',
    email              = NULL,
    cpf                = NULL,
    phone              = NULL,
    is_active          = false,
    is_deleted         = true,
    deleted_at         = now(),
    deleted_by         = _actor,
    deleted_by_name    = _actor_name
  WHERE id = _target;

  INSERT INTO public.user_audit_log(
    target_user_id, target_user_name, target_user_email,
    actor_user_id, actor_user_name, action, details
  ) VALUES (
    _target, original_name, original_email,
    _actor, _actor_name, 'excluido',
    jsonb_build_object('anonimizado', true)
  );
END;
$$;


--
-- Name: reject_kanban_card(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reject_kanban_card(_card_id uuid, _motivo text) RETURNS public.kanban_cards
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
DECLARE
  card public.kanban_cards;
  is_owner boolean;
  is_admin boolean;
  is_approver boolean;
  is_fallback boolean;
  admin_native boolean := false;
  ref_valor numeric := 0;
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
  is_admin := public.has_role(auth.uid(), 'admin'::public.app_role);
  is_approver := public.has_role(auth.uid(), 'aprovador'::public.app_role);
  is_fallback := COALESCE((card.data->'aprovacao_fallback_global')::boolean, false);

  IF NOT (is_owner OR is_approver OR is_admin) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  SELECT COALESCE(
    (SELECT v FROM (
       SELECT (elem->>'chosen')::boolean AS ch,
              NULLIF(CASE WHEN position(',' in regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g')) > 0
                     THEN replace(replace(regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.')
                     ELSE regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g') END, '')::numeric AS v
         FROM jsonb_array_elements(COALESCE(card.suppliers,'[]'::jsonb)) elem) s
      WHERE ch IS TRUE LIMIT 1),
    (SELECT min(v) FROM (
       SELECT NULLIF(CASE WHEN position(',' in regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g')) > 0
                     THEN replace(replace(regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g'), '.', ''), ',', '.')
                     ELSE regexp_replace(COALESCE(elem->>'valor',''), '[^0-9,.-]', '', 'g') END, '')::numeric AS v
         FROM jsonb_array_elements(COALESCE(card.suppliers,'[]'::jsonb)) elem) s WHERE v > 0),
    0) INTO ref_valor;

  -- Alçada nativa do Administrador: até R$ 5.000,00 em todos os departamentos (regra cumulativa).
  admin_native := is_admin AND NOT is_owner AND NOT is_fallback AND ref_valor <= 5000;
  -- Administrador (não Proprietário): teto absoluto de R$ 5.000,00 para TODOS os fins.
  IF is_admin AND NOT is_owner AND ref_valor > 5000 THEN
    RAISE EXCEPTION 'Administrador só pode atuar em solicitações de até R$ 5.000,00';
  END IF;

  card_dept := NULLIF(trim(COALESCE(card.data->>'departamento','')), '');
  IF NOT is_owner AND NOT (is_admin AND is_fallback) AND NOT admin_native THEN
    SELECT departments INTO approver_depts FROM public.approver_settings WHERE user_id = auth.uid();
    IF approver_depts IS NULL OR card_dept IS NULL OR NOT (card_dept = ANY(approver_depts)) THEN
      RAISE EXCEPTION 'Departamento fora da sua alçada';
    END IF;
  END IF;

  SELECT COALESCE(full_name, email, 'Aprovador') INTO author FROM public.profiles WHERE id = auth.uid();
  IF author IS NULL THEN author := 'Aprovador'; END IF;

  new_obs := COALESCE(card.observations, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object('at', now_ts, 'author', author,
      'text', format('❌ Cotação REJEITADA por %s. Motivo: %s%s',
        author, _motivo,
        CASE WHEN is_admin AND is_fallback AND NOT is_owner THEN ' (rejeição via alçada global — fallback)'
             WHEN admin_native THEN ' (rejeição via alçada nativa do Administrador — até R$ 5.000,00)'
             ELSE '' END)));

  UPDATE public.kanban_cards
     SET status = 'cotacoes_rejeitadas'::public.card_status,
         observations = new_obs, approver_id = auth.uid(), approver_name = author
   WHERE id = _card_id RETURNING * INTO card;
  RETURN card;
END; $_$;


--
-- Name: set_codigo_unico(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_codigo_unico() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.codigo_unico IS NULL OR NEW.codigo_unico = '' THEN
    NEW.codigo_unico := public.gerar_codigo_unico();
  END IF;
  RETURN NEW;
END $$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


--
-- Name: set_user_active(uuid, boolean, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_user_active(_target uuid, _active boolean, _actor uuid, _actor_name text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  target_name text;
  target_email text;
BEGIN
  SELECT COALESCE(full_name, email, 'Usuário'), email
    INTO target_name, target_email
  FROM public.profiles WHERE id = _target;

  IF target_name IS NULL THEN
    RAISE EXCEPTION 'Perfil não encontrado';
  END IF;

  UPDATE public.profiles SET
    is_active = _active,
    deactivated_at = CASE WHEN _active THEN NULL ELSE now() END,
    deactivated_by = CASE WHEN _active THEN NULL ELSE _actor END,
    deactivated_by_name = CASE WHEN _active THEN NULL ELSE _actor_name END
  WHERE id = _target;

  INSERT INTO public.user_audit_log(
    target_user_id, target_user_name, target_user_email,
    actor_user_id, actor_user_name, action, details
  ) VALUES (
    _target, target_name, target_email,
    _actor, _actor_name,
    CASE WHEN _active THEN 'reativado' ELSE 'inativado' END,
    '{}'::jsonb
  );
END;
$$;


--
-- Name: update_status_changed_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_status_changed_at() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at = now();
  END IF;
  RETURN NEW;
END $$;


--
-- Name: update_updated_at_column(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.update_updated_at_column() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;


--
-- Name: approver_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.approver_settings (
    user_id uuid NOT NULL,
    departments text[] DEFAULT '{}'::text[] NOT NULL,
    teto_alcada numeric(12,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: buyer_applications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.buyer_applications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    full_name text NOT NULL,
    cpf text NOT NULL,
    phone text NOT NULL,
    email text NOT NULL,
    checklist_types text[] DEFAULT '{}'::text[] NOT NULL,
    status public.application_status DEFAULT 'pending'::public.application_status NOT NULL,
    decided_by uuid,
    decided_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    requested_departments text[] DEFAULT '{}'::text[] NOT NULL,
    requested_ceiling numeric(12,2)
);


--
-- Name: card_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.card_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    card_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    sender_name text DEFAULT ''::text NOT NULL,
    sender_email text DEFAULT ''::text NOT NULL,
    sender_phone text DEFAULT ''::text NOT NULL,
    sender_role text DEFAULT 'solicitante'::text NOT NULL,
    buyer_name text,
    body text NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: contract_buyer_rotation; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_buyer_rotation (
    id integer DEFAULT 1 NOT NULL,
    counter bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_buyer_rotation_id_check CHECK ((id = 1))
);


--
-- Name: departments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.departments (
    code integer NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: market_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.market_cache (
    key text NOT NULL,
    payload jsonb NOT NULL,
    fetched_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: origins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.origins (
    code integer NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text,
    cpf text,
    phone text,
    email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    is_deleted boolean DEFAULT false NOT NULL,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    deleted_by_name text,
    deactivated_at timestamp with time zone,
    deactivated_by uuid,
    deactivated_by_name text,
    original_full_name text,
    original_email text,
    force_logout_at timestamp with time zone
);


--
-- Name: profiles_directory; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.profiles_directory WITH (security_invoker='true') AS
 SELECT id,
    full_name,
    email,
    is_active
   FROM public.profiles;


--
-- Name: solicitacao_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.solicitacao_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    target_user_id uuid,
    target_user_name text,
    target_user_email text,
    actor_user_id uuid,
    actor_user_name text,
    action text NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_roles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    role public.app_role NOT NULL
);


--
-- Name: approver_settings approver_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approver_settings
    ADD CONSTRAINT approver_settings_pkey PRIMARY KEY (user_id);


--
-- Name: buyer_applications buyer_applications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_applications
    ADD CONSTRAINT buyer_applications_pkey PRIMARY KEY (id);


--
-- Name: card_messages card_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_messages
    ADD CONSTRAINT card_messages_pkey PRIMARY KEY (id);


--
-- Name: contract_buyer_rotation contract_buyer_rotation_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_buyer_rotation
    ADD CONSTRAINT contract_buyer_rotation_pkey PRIMARY KEY (id);


--
-- Name: departments departments_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_name_key UNIQUE (name);


--
-- Name: departments departments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.departments
    ADD CONSTRAINT departments_pkey PRIMARY KEY (code);


--
-- Name: kanban_cards kanban_cards_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_pkey PRIMARY KEY (id);


--
-- Name: market_cache market_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.market_cache
    ADD CONSTRAINT market_cache_pkey PRIMARY KEY (key);


--
-- Name: origins origins_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.origins
    ADD CONSTRAINT origins_name_key UNIQUE (name);


--
-- Name: origins origins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.origins
    ADD CONSTRAINT origins_pkey PRIMARY KEY (code);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: user_audit_log user_audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_audit_log
    ADD CONSTRAINT user_audit_log_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_pkey PRIMARY KEY (id);


--
-- Name: user_roles user_roles_user_id_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_role_key UNIQUE (user_id, role);


--
-- Name: idx_card_messages_card; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_messages_card ON public.card_messages USING btree (card_id, created_at DESC);


--
-- Name: idx_card_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_card_messages_sender ON public.card_messages USING btree (sender_id);


--
-- Name: idx_kanban_cards_buyer_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_cards_buyer_name ON public.kanban_cards USING btree (buyer_name);


--
-- Name: idx_kanban_cards_ready_for_apollo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_cards_ready_for_apollo ON public.kanban_cards USING btree (ready_for_apollo_integration) WHERE (ready_for_apollo_integration = true);


--
-- Name: idx_kanban_cards_requester_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kanban_cards_requester_id ON public.kanban_cards USING btree (requester_id);


--
-- Name: kanban_cards_codigo_unico_uidx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX kanban_cards_codigo_unico_uidx ON public.kanban_cards USING btree (codigo_unico);


--
-- Name: user_audit_log_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_audit_log_created_idx ON public.user_audit_log USING btree (created_at DESC);


--
-- Name: user_audit_log_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_audit_log_target_idx ON public.user_audit_log USING btree (target_user_id);


--
-- Name: approver_settings approver_settings_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER approver_settings_updated_at BEFORE UPDATE ON public.approver_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: kanban_cards kanban_cards_set_requester_trg; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kanban_cards_set_requester_trg BEFORE INSERT ON public.kanban_cards FOR EACH ROW EXECUTE FUNCTION public.kanban_cards_set_requester();


--
-- Name: kanban_cards kanban_cards_status_changed; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kanban_cards_status_changed BEFORE UPDATE ON public.kanban_cards FOR EACH ROW EXECUTE FUNCTION public.update_status_changed_at();


--
-- Name: kanban_cards kanban_cards_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER kanban_cards_updated_at BEFORE UPDATE ON public.kanban_cards FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: departments trg_departments_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: origins trg_origins_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_origins_updated_at BEFORE UPDATE ON public.origins FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: profiles trg_revoke_admin_on_inactivation; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_revoke_admin_on_inactivation AFTER UPDATE OF is_active, is_deleted ON public.profiles FOR EACH ROW EXECUTE FUNCTION app_private.revoke_admin_on_inactivation();


--
-- Name: kanban_cards trg_set_codigo_unico; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_codigo_unico BEFORE INSERT ON public.kanban_cards FOR EACH ROW EXECUTE FUNCTION public.set_codigo_unico();


--
-- Name: card_messages update_card_messages_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER update_card_messages_updated_at BEFORE UPDATE ON public.card_messages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


--
-- Name: approver_settings approver_settings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.approver_settings
    ADD CONSTRAINT approver_settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: buyer_applications buyer_applications_decided_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_applications
    ADD CONSTRAINT buyer_applications_decided_by_fkey FOREIGN KEY (decided_by) REFERENCES auth.users(id);


--
-- Name: buyer_applications buyer_applications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.buyer_applications
    ADD CONSTRAINT buyer_applications_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: card_messages card_messages_card_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_messages
    ADD CONSTRAINT card_messages_card_id_fkey FOREIGN KEY (card_id) REFERENCES public.kanban_cards(id) ON DELETE CASCADE;


--
-- Name: card_messages card_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.card_messages
    ADD CONSTRAINT card_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kanban_cards kanban_cards_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: kanban_cards kanban_cards_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kanban_cards
    ADD CONSTRAINT kanban_cards_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: user_roles user_roles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_roles
    ADD CONSTRAINT user_roles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: kanban_cards Admins can delete cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Admins can delete cards" ON public.kanban_cards FOR DELETE TO authenticated USING ((app_private.has_role(auth.uid(), 'admin'::public.app_role) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: approver_settings Approvers read own settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Approvers read own settings" ON public.approver_settings FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles Auditors read all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auditors read all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'auditor'::public.app_role));


--
-- Name: contract_buyer_rotation Autenticados podem ler rotacao; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Autenticados podem ler rotacao" ON public.contract_buyer_rotation FOR SELECT TO authenticated USING (true);


--
-- Name: kanban_cards Authenticated can create a card; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can create a card" ON public.kanban_cards FOR INSERT TO authenticated WITH CHECK (((kind IS NOT NULL) AND (title IS NOT NULL) AND (length(title) > 0)));


--
-- Name: kanban_cards Authenticated can read cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read cards" ON public.kanban_cards FOR SELECT TO authenticated USING (true);


--
-- Name: departments Authenticated can read departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read departments" ON public.departments FOR SELECT TO authenticated USING (true);


--
-- Name: origins Authenticated can read origins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Authenticated can read origins" ON public.origins FOR SELECT TO authenticated USING (true);


--
-- Name: kanban_cards Buyers and admins can update cards; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers and admins can update cards" ON public.kanban_cards FOR UPDATE TO authenticated USING ((app_private.has_role(auth.uid(), 'buyer'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role) OR app_private.has_role(auth.uid(), 'owner'::public.app_role))) WITH CHECK ((app_private.has_role(auth.uid(), 'buyer'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: profiles Buyers can toggle solicitantes active state; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers can toggle solicitantes active state" ON public.profiles FOR UPDATE TO authenticated USING ((public.has_role(auth.uid(), 'buyer'::public.app_role) AND public.has_role(id, 'solicitante'::public.app_role))) WITH CHECK ((public.has_role(auth.uid(), 'buyer'::public.app_role) AND public.has_role(id, 'solicitante'::public.app_role)));


--
-- Name: user_roles Buyers read all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Buyers read all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'buyer'::public.app_role));


--
-- Name: card_messages Envolvidos podem enviar mensagens; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Envolvidos podem enviar mensagens" ON public.card_messages FOR INSERT TO authenticated WITH CHECK (((sender_id = auth.uid()) AND public.can_access_card_messages(card_id)));


--
-- Name: card_messages Envolvidos podem marcar como lida; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Envolvidos podem marcar como lida" ON public.card_messages FOR UPDATE TO authenticated USING (((sender_id = auth.uid()) OR public.can_access_card_messages(card_id))) WITH CHECK (((sender_id = auth.uid()) OR public.can_access_card_messages(card_id)));


--
-- Name: user_roles Inactive users cannot become admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Inactive users cannot become admin" ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((role <> 'admin'::public.app_role) OR app_private.is_admin_eligible(user_id)));


--
-- Name: card_messages Mensagens visíveis aos envolvidos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Mensagens visíveis aos envolvidos" ON public.card_messages FOR SELECT TO authenticated USING (((sender_id = auth.uid()) OR public.can_access_card_messages(card_id)));


--
-- Name: user_roles Owners and admins delete roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (((((role)::text = ANY (ARRAY['buyer'::text, 'solicitante'::text, 'aprovador'::text])) AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role))) OR (((role)::text = 'admin'::text) AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role))) OR (((role)::text = 'owner'::text) AND app_private.has_role(auth.uid(), 'owner'::public.app_role))));


--
-- Name: user_roles Owners and admins insert roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (((((role)::text = ANY (ARRAY['buyer'::text, 'solicitante'::text, 'aprovador'::text])) AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role))) OR (((role)::text = 'admin'::text) AND (app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role))) OR (((role)::text = 'owner'::text) AND app_private.has_role(auth.uid(), 'owner'::public.app_role))));


--
-- Name: approver_settings Owners and admins manage approver settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins manage approver settings" ON public.approver_settings TO authenticated USING ((app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK ((app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_roles Owners and admins read all roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING ((app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: user_audit_log Owners and admins read audit log; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins read audit log" ON public.user_audit_log FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'owner'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'auditor'::public.app_role)));


--
-- Name: buyer_applications Owners and admins see all applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins see all applications" ON public.buyer_applications FOR SELECT TO authenticated USING ((app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: buyer_applications Owners and admins update applications; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins update applications" ON public.buyer_applications FOR UPDATE TO authenticated USING ((app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: profiles Owners and admins update profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners and admins update profiles" ON public.profiles FOR UPDATE TO authenticated USING ((app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role))) WITH CHECK ((app_private.has_role(auth.uid(), 'owner'::public.app_role) OR app_private.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: departments Owners can manage departments; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage departments" ON public.departments TO authenticated USING (public.has_role(auth.uid(), 'owner'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));


--
-- Name: origins Owners can manage origins; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Owners can manage origins" ON public.origins TO authenticated USING (public.has_role(auth.uid(), 'owner'::public.app_role)) WITH CHECK (public.has_role(auth.uid(), 'owner'::public.app_role));


--
-- Name: user_roles Protected users: only owner adds roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Protected users: only owner adds roles" ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((NOT app_private.is_protected_user(user_id)) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: approver_settings Protected users: only owner deletes approver settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Protected users: only owner deletes approver settings" ON public.approver_settings AS RESTRICTIVE FOR DELETE TO authenticated USING (((NOT app_private.is_protected_user(user_id)) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: approver_settings Protected users: only owner inserts approver settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Protected users: only owner inserts approver settings" ON public.approver_settings AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (((NOT app_private.is_protected_user(user_id)) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: user_roles Protected users: only owner removes roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Protected users: only owner removes roles" ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING (((NOT app_private.is_protected_user(user_id)) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: approver_settings Protected users: only owner updates approver settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Protected users: only owner updates approver settings" ON public.approver_settings AS RESTRICTIVE FOR UPDATE TO authenticated USING (((NOT app_private.is_protected_user(user_id)) OR app_private.has_role(auth.uid(), 'owner'::public.app_role))) WITH CHECK (((NOT app_private.is_protected_user(user_id)) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: profiles Protected users: only owner updates profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Protected users: only owner updates profile" ON public.profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING (((NOT app_private.is_protected_user(id)) OR (id = auth.uid()) OR app_private.has_role(auth.uid(), 'owner'::public.app_role))) WITH CHECK (((NOT app_private.is_protected_user(id)) OR (id = auth.uid()) OR app_private.has_role(auth.uid(), 'owner'::public.app_role)));


--
-- Name: profiles Staff can read directory rows; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Staff can read directory rows" ON public.profiles FOR SELECT TO authenticated USING ((public.has_role(auth.uid(), 'buyer'::public.app_role) OR public.has_role(auth.uid(), 'aprovador'::public.app_role) OR public.has_role(auth.uid(), 'auditor'::public.app_role)));


--
-- Name: profiles Users can insert own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK ((id = auth.uid()));


--
-- Name: user_roles Users can read own roles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: profiles Users can update own profile; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING ((id = auth.uid()));


--
-- Name: buyer_applications Users insert own application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users insert own application" ON public.buyer_applications FOR INSERT TO authenticated WITH CHECK ((user_id = auth.uid()));


--
-- Name: profiles Users read own profile; owner/admin read all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users read own profile; owner/admin read all" ON public.profiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.has_role(auth.uid(), 'owner'::public.app_role) OR public.has_role(auth.uid(), 'admin'::public.app_role)));


--
-- Name: buyer_applications Users see own application; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users see own application" ON public.buyer_applications FOR SELECT TO authenticated USING ((user_id = auth.uid()));


--
-- Name: approver_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.approver_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: buyer_applications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.buyer_applications ENABLE ROW LEVEL SECURITY;

--
-- Name: card_messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.card_messages ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_buyer_rotation; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contract_buyer_rotation ENABLE ROW LEVEL SECURITY;

--
-- Name: departments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

--
-- Name: kanban_cards; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;

--
-- Name: market_cache; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.market_cache ENABLE ROW LEVEL SECURITY;

--
-- Name: market_cache market_cache readable by everyone; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "market_cache readable by everyone" ON public.market_cache FOR SELECT USING (true);


--
-- Name: origins; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.origins ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: user_audit_log; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_audit_log ENABLE ROW LEVEL SECURITY;

--
-- Name: user_roles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

