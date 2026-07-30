CREATE TABLE public.card_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id uuid NOT NULL REFERENCES public.kanban_cards(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_name text NOT NULL DEFAULT '',
  sender_email text NOT NULL DEFAULT '',
  sender_phone text NOT NULL DEFAULT '',
  sender_role text NOT NULL DEFAULT 'solicitante',
  buyer_name text,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.card_messages TO authenticated;
GRANT ALL ON public.card_messages TO service_role;

ALTER TABLE public.card_messages ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_access_card_messages(_card_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'owner')
      OR public.has_role(auth.uid(), 'admin')
      OR public.has_role(auth.uid(), 'buyer')
      OR EXISTS (
        SELECT 1 FROM public.kanban_cards c
        WHERE c.id = _card_id
          AND (
            c.requester_id = auth.uid()
            OR lower(coalesce(c.requester_email, '')) = lower(coalesce((SELECT email FROM public.profiles WHERE id = auth.uid()), '@'))
          )
      );
$$;

REVOKE ALL ON FUNCTION public.can_access_card_messages(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_access_card_messages(uuid) TO authenticated, service_role;

CREATE POLICY "Mensagens visíveis aos envolvidos"
ON public.card_messages FOR SELECT TO authenticated
USING (sender_id = auth.uid() OR public.can_access_card_messages(card_id));

CREATE POLICY "Envolvidos podem enviar mensagens"
ON public.card_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND public.can_access_card_messages(card_id));

CREATE POLICY "Envolvidos podem marcar como lida"
ON public.card_messages FOR UPDATE TO authenticated
USING (sender_id = auth.uid() OR public.can_access_card_messages(card_id))
WITH CHECK (sender_id = auth.uid() OR public.can_access_card_messages(card_id));

CREATE INDEX idx_card_messages_card ON public.card_messages(card_id, created_at DESC);
CREATE INDEX idx_card_messages_sender ON public.card_messages(sender_id);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_card_messages_updated_at
BEFORE UPDATE ON public.card_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.card_messages;