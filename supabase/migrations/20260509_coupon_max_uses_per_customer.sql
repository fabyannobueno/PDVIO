-- =============================================================================
-- Adiciona limite de uso por cliente em cupons
-- =============================================================================
ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS max_uses_per_customer integer
    CHECK (max_uses_per_customer IS NULL OR max_uses_per_customer > 0);

COMMENT ON COLUMN public.coupons.max_uses_per_customer IS
  'Quantidade máxima de vezes que o mesmo cliente pode usar este cupom. NULL = sem limite por cliente.';
