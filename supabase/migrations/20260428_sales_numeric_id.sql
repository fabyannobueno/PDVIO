-- =========================================
-- Adiciona ID numérico sequencial e único nas vendas
-- para exibir no cupom como "ID DA VENDA: 000001".
-- =========================================

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS numeric_id BIGSERIAL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_numeric_id
  ON public.sales(numeric_id);
