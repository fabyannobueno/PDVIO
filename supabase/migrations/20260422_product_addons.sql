-- =========================================
-- TABELA: product_addons
-- Adicionais (extras) que podem ser vinculados a um produto.
-- =========================================
CREATE TABLE IF NOT EXISTS public.product_addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.product_addons ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_product_addons_product
  ON public.product_addons(product_id);

CREATE POLICY "Members can view product addons"
  ON public.product_addons FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_addons.product_id
      AND public.is_company_member(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Members can insert product addons"
  ON public.product_addons FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_addons.product_id
      AND public.is_company_member(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Members can update product addons"
  ON public.product_addons FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_addons.product_id
      AND public.is_company_member(auth.uid(), p.company_id)
    )
  );

CREATE POLICY "Members can delete product addons"
  ON public.product_addons FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.id = product_addons.product_id
      AND public.is_company_member(auth.uid(), p.company_id)
    )
  );
