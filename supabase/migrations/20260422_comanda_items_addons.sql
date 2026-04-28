-- =========================================
-- comanda_items: armazenar adicionais escolhidos no momento da venda
-- (snapshot do nome + preço de cada adicional)
-- =========================================

ALTER TABLE public.comanda_items
  ADD COLUMN IF NOT EXISTS addons JSONB NOT NULL DEFAULT '[]'::jsonb;
