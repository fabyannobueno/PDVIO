-- =========================================
-- AUDIT LOGS: persistir o cargo do operador autorizador (staff)
-- separado do cargo do usuário logado (gerente/dono).
-- =========================================

ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS staff_role TEXT;

-- =========================================
-- RPC: log_audit_event (atualizada para preencher staff_role automaticamente
-- quando _staff_id for informado).
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
  _staff_role TEXT;
BEGIN
  IF NOT public.is_company_member(auth.uid(), _company_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT email INTO _user_email FROM auth.users WHERE id = auth.uid();
  SELECT role::TEXT INTO _user_role
    FROM public.company_members
    WHERE user_id = auth.uid() AND company_id = _company_id;

  IF _staff_id IS NOT NULL THEN
    SELECT role::TEXT INTO _staff_role
      FROM public.staff_members
      WHERE id = _staff_id AND company_id = _company_id;
  END IF;

  INSERT INTO public.audit_logs(
    company_id, user_id, user_name, user_role,
    staff_id, staff_name, staff_role,
    action, entity_type, entity_id, description, metadata
  )
  VALUES (
    _company_id, auth.uid(), _user_email, _user_role,
    _staff_id, _staff_name, _staff_role,
    _action, _entity_type, _entity_id, _description, COALESCE(_metadata, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(
  UUID, TEXT, TEXT, TEXT, TEXT, JSONB, UUID, TEXT
) TO authenticated;
