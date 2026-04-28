-- =========================================
-- TABELA: comandas
-- =========================================
CREATE TABLE public.comandas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  identifier TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  notes TEXT,
  payment_method TEXT,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

ALTER TABLE public.comandas ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_comandas_company ON public.comandas(company_id);
CREATE INDEX idx_comandas_status ON public.comandas(status);

CREATE POLICY "Members can view company comandas"
  ON public.comandas FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert comandas"
  ON public.comandas FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can update comandas"
  ON public.comandas FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can delete comandas"
  ON public.comandas FOR DELETE
  USING (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- TABELA: comanda_items
-- =========================================
CREATE TABLE public.comanda_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comanda_id UUID NOT NULL REFERENCES public.comandas(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  quantity NUMERIC(10,3) NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2) NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.comanda_items ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_comanda_items_comanda ON public.comanda_items(comanda_id);

CREATE POLICY "Members can view comanda items"
  ON public.comanda_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.comandas c
      WHERE c.id = comanda_items.comanda_id
      AND public.is_company_member(auth.uid(), c.company_id)
    )
  );

CREATE POLICY "Members can insert comanda items"
  ON public.comanda_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.comandas c
      WHERE c.id = comanda_items.comanda_id
      AND public.is_company_member(auth.uid(), c.company_id)
    )
  );

CREATE POLICY "Members can update comanda items"
  ON public.comanda_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.comandas c
      WHERE c.id = comanda_items.comanda_id
      AND public.is_company_member(auth.uid(), c.company_id)
    )
  );

CREATE POLICY "Members can delete comanda items"
  ON public.comanda_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.comandas c
      WHERE c.id = comanda_items.comanda_id
      AND public.is_company_member(auth.uid(), c.company_id)
    )
  );
