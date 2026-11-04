-- Ajustes
-- Arquivo de registro. Não é aplicado automaticamente no banco.
CREATE TABLE public.approver_settings ( user_id uuid NOT NULL, departments _text DEFAULT '{}'::text[] NOT NULL, teto_alcada numeric(12, 2) DEFAULT 0 NOT NULL, created_at timestamptz DEFAULT now() NOT NULL, updated_at timestamptz DEFAULT now() NOT NULL, CONSTRAINT approver_settings_pkey PRIMARY KEY (user_id));
