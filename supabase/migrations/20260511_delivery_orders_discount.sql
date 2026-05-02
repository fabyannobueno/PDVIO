-- Adiciona colunas de desconto e cupom na tabela delivery_orders
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code     text;

COMMENT ON COLUMN public.delivery_orders.discount_amount IS 'Valor do desconto aplicado no pedido (cupom ou promoção).';
COMMENT ON COLUMN public.delivery_orders.coupon_code     IS 'Código do cupom utilizado pelo cliente, se houver.';
