-- =========================================
-- TABELA: sales
-- =========================================
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL,
  payment_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  change_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sales_company ON public.sales(company_id);
CREATE INDEX idx_sales_created_at ON public.sales(created_at);

CREATE POLICY "Members can view company sales"
  ON public.sales FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert sales"
  ON public.sales FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- TABELA: sale_items
-- =========================================
CREATE TABLE public.sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL,
  discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(10,2) NOT NULL
);

ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_sale_items_sale ON public.sale_items(sale_id);

CREATE POLICY "Members can view sale items"
  ON public.sale_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
      AND public.is_company_member(auth.uid(), s.company_id)
    )
  );

CREATE POLICY "Members can insert sale items"
  ON public.sale_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE s.id = sale_items.sale_id
      AND public.is_company_member(auth.uid(), s.company_id)
    )
  );
