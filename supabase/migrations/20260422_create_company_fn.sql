-- Helper function to create a company bypassing the INSERT RLS policy.
-- Necessary because the WITH CHECK (auth.uid() = created_by) policy may conflict
-- with some Supabase project-level settings.
-- SECURITY DEFINER runs with the privileges of the function owner (postgres/superuser).
CREATE OR REPLACE FUNCTION public.create_company_for_user(
  p_name        TEXT,
  p_business_type TEXT,
  p_document    TEXT DEFAULT NULL
)
RETURNS SETOF public.companies
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
    INSERT INTO public.companies (name, business_type, document, created_by)
    VALUES (
      p_name,
      p_business_type::public.business_type,
      p_document,
      v_uid
    )
    RETURNING *;
END;
$$;

-- Allow any authenticated user to call this function
GRANT EXECUTE ON FUNCTION public.create_company_for_user(TEXT, TEXT, TEXT) TO authenticated;
