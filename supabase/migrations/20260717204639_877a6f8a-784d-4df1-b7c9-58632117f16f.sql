CREATE OR REPLACE FUNCTION public.append_quotation_attachments(_card_id uuid, _files jsonb)
RETURNS public.kanban_cards
LANGUAGE plpgsql
SECURITY DEFINER
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

GRANT EXECUTE ON FUNCTION public.append_quotation_attachments(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.append_quotation_attachments(uuid, jsonb) TO service_role;