-- Link delivery orders to sales
-- When a delivery order is confirmed it gets a corresponding sale record.
ALTER TABLE public.delivery_orders
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS delivery_orders_sale_id_idx ON public.delivery_orders(sale_id);
