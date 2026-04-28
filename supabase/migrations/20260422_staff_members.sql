-- =========================================
-- STAFF MEMBERS: operadores com cartão (barcode) + PIN
-- Separado de company_members (que vincula a auth.users).
-- =========================================
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE TABLE public.staff_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role public.company_role NOT NULL DEFAULT 'cashier',
  badge_code TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, badge_code)
);

ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_staff_members_company ON public.staff_members(company_id);

-- RLS
CREATE POLICY "Members view staff"
  ON public.staff_members FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members insert staff"
  ON public.staff_members FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members update staff"
  ON public.staff_members FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members delete staff"
  ON public.staff_members FOR DELETE
  USING (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- RPC: create_staff_member (faz o hash do PIN no servidor)
-- =========================================
CREATE OR REPLACE FUNCTION public.create_staff_member(
  _company_id UUID,
  _name TEXT,
  _role public.company_role,
  _badge_code TEXT,
  _pin TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  INSERT INTO public.staff_members(company_id, name, role, badge_code, pin_hash)
  VALUES (_company_id, _name, _role, _badge_code, extensions.crypt(_pin, extensions.gen_salt('bf')))
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_staff_member(UUID, TEXT, public.company_role, TEXT, TEXT) TO authenticated;

-- =========================================
-- RPC: update_staff_member
-- =========================================
CREATE OR REPLACE FUNCTION public.update_staff_member(
  _id UUID,
  _name TEXT,
  _role public.company_role,
  _badge_code TEXT,
  _active BOOLEAN,
  _pin TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _company UUID;
BEGIN
  SELECT company_id INTO _company FROM public.staff_members WHERE id = _id;
  IF _company IS NULL THEN RAISE EXCEPTION 'not found'; END IF;
  IF NOT public.is_company_member(auth.uid(), _company) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.staff_members
  SET name = _name,
      role = _role,
      badge_code = _badge_code,
      active = _active,
      pin_hash = COALESCE(NULLIF(_pin, ''), pin_hash) -- só atualiza se vier PIN novo
  WHERE id = _id;

  -- Se veio PIN novo, refaz o hash
  IF _pin IS NOT NULL AND _pin <> '' THEN
    UPDATE public.staff_members SET pin_hash = extensions.crypt(_pin, extensions.gen_salt('bf')) WHERE id = _id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_staff_member(UUID, TEXT, public.company_role, TEXT, BOOLEAN, TEXT) TO authenticated;

-- =========================================
-- RPC: verify_staff_pin -> retorna staff se cartão+PIN baterem
-- =========================================
CREATE OR REPLACE FUNCTION public.verify_staff_pin(
  _company_id UUID,
  _badge_code TEXT,
  _pin TEXT
)
RETURNS TABLE (id UUID, name TEXT, role public.company_role)
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.name, s.role
  FROM public.staff_members s
  WHERE s.company_id = _company_id
    AND s.badge_code = _badge_code
    AND s.active = TRUE
    AND s.pin_hash = extensions.crypt(_pin, s.pin_hash)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_staff_pin(UUID, TEXT, TEXT) TO authenticated;

-- =========================================
-- cash_movements: rastreia quem autorizou
-- =========================================
ALTER TABLE public.cash_movements
  ADD COLUMN IF NOT EXISTS authorized_by_staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS authorized_by_name TEXT;
