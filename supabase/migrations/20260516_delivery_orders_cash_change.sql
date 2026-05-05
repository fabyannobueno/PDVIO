-- Adiciona campos para valor recebido em dinheiro e troco nos pedidos de delivery.
-- Quando o cliente escolhe pagamento em dinheiro, pode informar o valor que vai pagar
-- para que o entregador leve o troco certo.

ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS cash_received numeric(10,2),
  ADD COLUMN IF NOT EXISTS change_amount numeric(10,2);

COMMENT ON COLUMN public.delivery_orders.cash_received IS 'Valor em dinheiro informado pelo cliente (troco para X). Preenchido apenas quando payment_method = cash.';
COMMENT ON COLUMN public.delivery_orders.change_amount  IS 'Troco a ser devolvido ao cliente (cash_received - total). Calculado automaticamente pelo cardápio digital.';
