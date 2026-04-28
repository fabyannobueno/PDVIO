-- =========================================
-- TABELA: customers
-- =========================================
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  document TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_customers_company ON public.customers(company_id);

CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can view company customers"
  ON public.customers FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert customers"
  ON public.customers FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Managers and owners can update customers"
  ON public.customers FOR UPDATE
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner') OR
    public.has_company_role(auth.uid(), company_id, 'manager')
  );

CREATE POLICY "Owners can delete customers"
  ON public.customers FOR DELETE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

-- =========================================
-- ALTER: sales + customer_id
-- =========================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;
