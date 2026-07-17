-- Fix: garantir que solicitações via mobile sempre carreguem requester_id
-- e corrigir o card #07202632 da Marlene (enviado sem requester_id e com
-- e-mail digitado sem o sufixo .br, quebrando o filtro do Histórico).

-- 1) Backfill do card específico
UPDATE public.kanban_cards
   SET requester_id = 'af431bc9-9885-4ac1-810e-70080add21ef',
       requester_email = 'marlene.martins@motormac.com.br'
 WHERE codigo_unico = '07202632'
   AND requester_id IS NULL;

-- 2) Backfill genérico: qualquer card sem requester_id cujo e-mail bata com um profile
UPDATE public.kanban_cards k
   SET requester_id = p.id
  FROM public.profiles p
 WHERE k.requester_id IS NULL
   AND k.requester_email IS NOT NULL
   AND lower(p.email) = lower(k.requester_email);

-- 3) Trigger BEFORE INSERT para nunca mais deixar requester_id nulo quando houver sessão
CREATE OR REPLACE FUNCTION public.kanban_cards_set_requester()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS kanban_cards_set_requester_trg ON public.kanban_cards;
CREATE TRIGGER kanban_cards_set_requester_trg
BEFORE INSERT ON public.kanban_cards
FOR EACH ROW EXECUTE FUNCTION public.kanban_cards_set_requester();