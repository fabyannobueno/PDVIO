-- =========================================
-- ALTER TABLE products: campos de promoção
-- =========================================
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_promotion BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promotion_price NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS promotion_start DATE,
  ADD COLUMN IF NOT EXISTS promotion_end DATE;
