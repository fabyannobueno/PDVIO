-- =========================================
-- ENUM: Funções dentro de uma empresa
-- =========================================
CREATE TYPE public.company_role AS ENUM ('owner', 'manager', 'cashier', 'waiter', 'kitchen');

CREATE TYPE public.business_type AS ENUM ('restaurant', 'snack_bar', 'market', 'distributor', 'delivery', 'retail', 'other');

-- =========================================
-- Função utilitária: update updated_at
-- =========================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- =========================================
-- TABELA: profiles
-- =========================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TABELA: companies
-- =========================================
CREATE TABLE public.companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_type public.business_type NOT NULL DEFAULT 'other',
  document TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  logo_url TEXT,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TABELA: company_members
-- =========================================
CREATE TABLE public.company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.company_role NOT NULL DEFAULT 'cashier',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

CREATE INDEX idx_company_members_user ON public.company_members(user_id);
CREATE INDEX idx_company_members_company ON public.company_members(company_id);

ALTER TABLE public.company_members ENABLE ROW LEVEL SECURITY;

-- =========================================
-- SECURITY DEFINER: check membership / role
-- =========================================
CREATE OR REPLACE FUNCTION public.is_company_member(_user_id UUID, _company_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id
  );
$$;

CREATE OR REPLACE FUNCTION public.has_company_role(_user_id UUID, _company_id UUID, _role public.company_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members
    WHERE user_id = _user_id AND company_id = _company_id AND role = _role
  );
$$;

-- =========================================
-- RLS: companies
-- =========================================
CREATE POLICY "Members can view their companies"
  ON public.companies FOR SELECT
  USING (public.is_company_member(auth.uid(), id));

CREATE POLICY "Authenticated users can create companies"
  ON public.companies FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update their companies"
  ON public.companies FOR UPDATE
  USING (public.has_company_role(auth.uid(), id, 'owner'));

CREATE POLICY "Owners can delete their companies"
  ON public.companies FOR DELETE
  USING (public.has_company_role(auth.uid(), id, 'owner'));

-- =========================================
-- RLS: company_members
-- =========================================
CREATE POLICY "Members can view members of their companies"
  ON public.company_members FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Owners can add members"
  ON public.company_members FOR INSERT
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'owner'));

CREATE POLICY "Owners can update members"
  ON public.company_members FOR UPDATE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

CREATE POLICY "Owners can remove members"
  ON public.company_members FOR DELETE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

-- =========================================
-- TRIGGER: auto-create profile on signup
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================
-- TRIGGER: auto-add creator as owner
-- =========================================
CREATE OR REPLACE FUNCTION public.handle_new_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.company_members (company_id, user_id, role)
  VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_company_created
  AFTER INSERT ON public.companies
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_company();