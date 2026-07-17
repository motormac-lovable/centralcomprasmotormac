
ALTER TABLE public.kanban_cards
  ADD COLUMN IF NOT EXISTS requester_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_kanban_cards_requester_id ON public.kanban_cards(requester_id);

-- Backfill retroativo: casa cards com profiles pelo email (case-insensitive), incluindo original_email.
UPDATE public.kanban_cards k
   SET requester_id = p.id
  FROM public.profiles p
 WHERE k.requester_id IS NULL
   AND k.requester_email IS NOT NULL
   AND (
        lower(p.email) = lower(k.requester_email)
     OR lower(COALESCE(p.original_email,'')) = lower(k.requester_email)
   );
