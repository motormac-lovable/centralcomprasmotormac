DO $migration$
DECLARE definition text;
old_destination text := 'next_status := CASE WHEN card.kind = ''frete'' THEN ''pedidos_gerados''::public.card_status ELSE ''cotacoes_aprovadas''::public.card_status END;';
BEGIN
  SELECT pg_get_functiondef('public.approve_kanban_card(uuid,text,text)'::regprocedure) INTO definition;
  IF position(old_destination IN definition) = 0 THEN
    RAISE EXCEPTION 'Destino da aprovação não corresponde à versão validada; nenhuma regra foi alterada';
  END IF;
  EXECUTE replace(definition, old_destination, 'next_status := ''pedidos_gerados''::public.card_status;');
END;
$migration$;

CREATE OR REPLACE FUNCTION public.redirect_retired_approved_quotations()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $function$
BEGIN
  IF NEW.status = 'cotacoes_aprovadas'::public.card_status THEN
    NEW.status := 'pedidos_gerados'::public.card_status;
  END IF;
  IF NEW.kind = 'contratos' AND NEW.status = 'pedidos_gerados'::public.card_status
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    NEW.ready_for_apollo_integration := true;
  END IF;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.redirect_retired_approved_quotations() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER a_redirect_retired_approved_quotations
BEFORE INSERT OR UPDATE OF status ON public.kanban_cards
FOR EACH ROW EXECUTE FUNCTION public.redirect_retired_approved_quotations();
COMMENT ON FUNCTION public.redirect_retired_approved_quotations() IS 'Compatibility for retired cotacoes_aprovadas status; preserves existing approval RPC authority and contract integration.';