-- =========================================
-- AUDIT LOGS: registra ações sensíveis (cancelamentos, descontos, etc.)
-- =========================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_role TEXT,
  staff_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  staff_name TEXT,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  description TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_audit_logs_company_created
  ON public.audit_logs(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action
  ON public.audit_logs(company_id, action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
  ON public.audit_logs(entity_type, entity_id);

-- RLS: members can read; insert via RPC
DROP POLICY IF EXISTS "Members view audit_logs" ON public.audit_logs;
CREATE POLICY "Members view audit_logs"
  ON public.audit_logs FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "Members insert audit_logs" ON public.audit_logs;
CREATE POLICY "Members insert audit_logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- RPC: log_audit_event
-- =========================================
CREATE OR REPLACE FUNCTION public.log_audit_event(
  _company_id UUID,
  _action TEXT,
  _entity_type TEXT DEFAULT NULL,
  _entity_id TEXT DEFAULT NULL,
  _description TEXT DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb,
  _staff_id UUID DEFAULT NULL,
  _staff_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id UUID;
  _user_email TEXT;
  _user_role TEXT;
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = auth.uid();
  SELECT role::TEXT INTO _user_role
    FROM public.company_members
    WHERE user_id = auth.uid() AND company_id = _company_id;

  INSERT INTO public.audit_logs(
    company_id, user_id, user_name, user_role,
    staff_id, staff_name,
    action, entity_type, entity_id, description, metadata
  )
  VALUES (
    _company_id, auth.uid(), _user_email, _user_role,
    _staff_id, _staff_name,
    _action, _entity_type, _entity_id, _description, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT
) TO authenticated;
