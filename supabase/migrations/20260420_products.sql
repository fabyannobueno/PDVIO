-- =========================================
-- TABELA: products
-- =========================================
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sku TEXT,
  barcode TEXT,
  category TEXT,
  cost_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sale_price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock_quantity NUMERIC(10,3) NOT NULL DEFAULT 0,
  stock_unit TEXT NOT NULL DEFAULT 'un',
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_promotion BOOLEAN NOT NULL DEFAULT false,
  promotion_price NUMERIC(10,2),
  promotion_start DATE,
  promotion_end DATE,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_products_company ON public.products(company_id);

CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can view company products"
  ON public.products FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Managers and owners can insert products"
  ON public.products FOR INSERT
  WITH CHECK (
    public.has_company_role(auth.uid(), company_id, 'owner') OR
    public.has_company_role(auth.uid(), company_id, 'manager')
  );

CREATE POLICY "Managers and owners can update products"
  ON public.products FOR UPDATE
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner') OR
    public.has_company_role(auth.uid(), company_id, 'manager')
  );

CREATE POLICY "Owners can delete products"
  ON public.products FOR DELETE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));
