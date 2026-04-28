-- =========================================
-- Adiciona ID numérico sequencial nos produtos
-- para busca rápida no PDV
-- =========================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS numeric_id BIGSERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_products_numeric_id ON public.products(numeric_id);
