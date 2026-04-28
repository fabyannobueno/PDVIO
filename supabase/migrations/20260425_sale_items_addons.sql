-- =========================================
-- sale_items: armazenar adicionais e observações da venda no PDV
-- (snapshot do nome + preço de cada adicional)
-- =========================================

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS notes TEXT;
