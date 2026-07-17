
CREATE OR REPLACE FUNCTION public.append_requester_file(
  _card_id uuid,
  _file jsonb
) RETURNS public.kanban_cards
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  card public.kanban_cards;
  current_files jsonb;
  new_files jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Autenticação exigida';
  END IF;

  SELECT * INTO card FROM public.kanban_cards WHERE id = _card_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Card não encontrado';
  END IF;

  -- Somente o solicitante (identificado por requester_id ou e-mail) pode anexar.
  IF NOT (
    card.requester_id = auth.uid()
    OR (
      card.requester_email IS NOT NULL
      AND lower(card.requester_email) = lower(COALESCE((SELECT email FROM auth.users WHERE id = auth.uid()), ''))
    )
  ) THEN
    RAISE EXCEPTION 'Sem permissão para anexar neste card';
  END IF;

  -- Trava por status: só nas colunas iniciais.
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

GRANT EXECUTE ON FUNCTION public.append_requester_file(uuid, jsonb) TO authenticated;
