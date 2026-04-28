-- =========================================
-- Products: flag para itens preparados na cozinha (Comandas/Delivery + KDS)
-- =========================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_prepared BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_products_is_prepared
  ON public.products(is_prepared);
