-- =============================================================================
-- Suporte a "Comer aqui" (dine_in) no cardápio digital
-- O cardápio externo envia delivery_type='dine_in' + table_identifier com o
-- label da mesa. O PDVIO detecta via realtime e injeta os itens na comanda.
-- =============================================================================

-- 1. Adiciona colunas
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS table_identifier text,
  ADD COLUMN IF NOT EXISTS comanda_id uuid REFERENCES public.comandas(id) ON DELETE SET NULL;

-- 2. Atualiza constraint de delivery_type para aceitar dine_in
ALTER TABLE public.delivery_orders
  DROP CONSTRAINT IF EXISTS delivery_orders_delivery_type_check;

ALTER TABLE public.delivery_orders
  ADD CONSTRAINT delivery_orders_delivery_type_check CHECK (
    delivery_type = ANY (ARRAY['delivery'::text, 'pickup'::text, 'dine_in'::text])
  );
