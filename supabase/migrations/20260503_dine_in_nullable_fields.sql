-- Permite payment_method e customer_phone nulos (necessário para pedidos dine_in
-- onde o cliente paga na mesa e pode não informar telefone)
ALTER TABLE public.delivery_orders
  ALTER COLUMN payment_method DROP NOT NULL,
  ALTER COLUMN customer_phone DROP NOT NULL;

-- Define default vazio para payment_method ao invés de forçar NOT NULL
ALTER TABLE public.delivery_orders
  ALTER COLUMN payment_method SET DEFAULT '';

ALTER TABLE public.delivery_orders
  ALTER COLUMN customer_phone SET DEFAULT '';
