CREATE POLICY "Approvers can decide cards awaiting approval"
ON public.kanban_cards
FOR UPDATE
TO authenticated
USING (app_private.has_role(auth.uid(), 'aprovador'::app_role) AND status = 'aguardando_aprovacao'::card_status)
WITH CHECK (app_private.has_role(auth.uid(), 'aprovador'::app_role));