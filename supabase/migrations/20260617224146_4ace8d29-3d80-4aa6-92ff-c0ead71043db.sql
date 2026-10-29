
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'buyer', 'aprovador');
CREATE TYPE public.card_kind AS ENUM ('compras', 'contratos', 'frete');
CREATE TYPE public.card_status AS ENUM ('pending', 'in_progress', 'done', 'rejected');
CREATE TYPE public.application_status AS ENUM ('pending', 'approved', 'rejected');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  cpf TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid());
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Buyer applications
CREATE TABLE public.buyer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  checklist_types TEXT[] NOT NULL DEFAULT '{}',
  status public.application_status NOT NULL DEFAULT 'pending',
  decided_by UUID REFERENCES auth.users(id),
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.buyer_applications TO authenticated;
GRANT ALL ON public.buyer_applications TO service_role;
ALTER TABLE public.buyer_applications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own application" ON public.buyer_applications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Users insert own application" ON public.buyer_applications FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admins see all applications" ON public.buyer_applications FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update applications" ON public.buyer_applications FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Kanban cards
CREATE TABLE public.kanban_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.card_kind NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  status public.card_status NOT NULL DEFAULT 'pending',
  requester_name TEXT,
  requester_email TEXT,
  unidade TEXT,
  empresa TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  assigned_to UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_cards TO authenticated;
GRANT INSERT ON public.kanban_cards TO anon;
GRANT ALL ON public.kanban_cards TO service_role;
ALTER TABLE public.kanban_cards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can create a card" ON public.kanban_cards FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can read cards" ON public.kanban_cards FOR SELECT TO authenticated USING (true);
CREATE POLICY "Buyers and admins can update cards" ON public.kanban_cards FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'buyer') OR public.has_role(auth.uid(), 'admin')
);
CREATE POLICY "Admins can delete cards" ON public.kanban_cards FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER kanban_cards_updated_at BEFORE UPDATE ON public.kanban_cards
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile and auto-grant admin role for known emails
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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

  IF NEW.email IN ('herllon.souza@motormac.com.br', 'vanessa@motormac.com.br') THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
