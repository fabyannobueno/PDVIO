-- Allow 'sale' as a stock movement kind so PDV/Comandas can decrement stock
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_kind_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind IN ('entry','adjustment','count','loss','sale'));
