-- =============================================================================
-- Promoções automáticas + Cupons de desconto
-- =============================================================================
--
-- Duas tabelas:
--   • promotions  — regras automáticas aplicadas no PDV/Comanda sem código
--                   (ex.: 20% OFF em Bebidas; Leve 3 Pague 2 em Coca-Cola)
--   • coupons     — códigos digitados pelo cliente para aplicar desconto
--                   (ex.: BEMVINDO10 dá 10% off, validade até 31/12)
-- =============================================================================

-- ── promotions ───────────────────────────────────────────────────────────────
-- kind:
--   'category_percent'    — desconto % em todos os produtos da categoria
--   'product_buy_x_pay_y' — leve `buy_qty` pague `pay_qty` do product_id
CREATE TABLE IF NOT EXISTS public.promotions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name             text NOT NULL,
  kind             text NOT NULL CHECK (kind IN ('category_percent','product_buy_x_pay_y')),
  category         text,
  product_id       uuid REFERENCES public.products(id) ON DELETE CASCADE,
  discount_percent numeric(5,2) CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent <= 100)),
  buy_qty          integer CHECK (buy_qty IS NULL OR buy_qty > 0),
  pay_qty          integer CHECK (pay_qty IS NULL OR pay_qty >= 0),
  starts_at        timestamptz,
  ends_at          timestamptz,
  is_active        boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- Coerência por kind
  CONSTRAINT promotions_kind_fields_chk CHECK (
    (kind = 'category_percent' AND category IS NOT NULL AND discount_percent IS NOT NULL)
    OR
    (kind = 'product_buy_x_pay_y' AND product_id IS NOT NULL AND buy_qty IS NOT NULL AND pay_qty IS NOT NULL AND pay_qty < buy_qty)
  )
);

CREATE INDEX IF NOT EXISTS promotions_company_active_idx
  ON public.promotions(company_id, is_active);

CREATE OR REPLACE FUNCTION public.promotions_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS promotions_set_updated_at ON public.promotions;
CREATE TRIGGER promotions_set_updated_at
  BEFORE UPDATE ON public.promotions
  FOR EACH ROW EXECUTE FUNCTION public.promotions_set_updated_at();

ALTER TABLE public.promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS promotions_select ON public.promotions;
CREATE POLICY promotions_select ON public.promotions
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS promotions_insert ON public.promotions;
CREATE POLICY promotions_insert ON public.promotions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS promotions_update ON public.promotions;
CREATE POLICY promotions_update ON public.promotions
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS promotions_delete ON public.promotions;
CREATE POLICY promotions_delete ON public.promotions
  FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- ── coupons ──────────────────────────────────────────────────────────────────
-- Códigos digitados manualmente no PDV/Comanda. Aplicam desconto no total
-- da venda (não por item).
CREATE TABLE IF NOT EXISTS public.coupons (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  code          text NOT NULL,
  kind          text NOT NULL CHECK (kind IN ('percent','fixed')),
  value         numeric(12,2) NOT NULL CHECK (value > 0),
  min_purchase  numeric(12,2) NOT NULL DEFAULT 0 CHECK (min_purchase >= 0),
  max_uses      integer CHECK (max_uses IS NULL OR max_uses > 0),
  uses_count    integer NOT NULL DEFAULT 0 CHECK (uses_count >= 0),
  starts_at     timestamptz,
  ends_at       timestamptz,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupons_percent_value_chk CHECK (
    kind <> 'percent' OR (value > 0 AND value <= 100)
  )
);

-- Code é único por empresa (case-insensitive: comparamos sempre em UPPER)
CREATE UNIQUE INDEX IF NOT EXISTS coupons_company_code_uidx
  ON public.coupons(company_id, UPPER(code));

CREATE INDEX IF NOT EXISTS coupons_company_active_idx
  ON public.coupons(company_id, is_active);

CREATE OR REPLACE FUNCTION public.coupons_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS coupons_set_updated_at ON public.coupons;
CREATE TRIGGER coupons_set_updated_at
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.coupons_set_updated_at();

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupons_select ON public.coupons;
CREATE POLICY coupons_select ON public.coupons
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS coupons_insert ON public.coupons;
CREATE POLICY coupons_insert ON public.coupons
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS coupons_update ON public.coupons;
CREATE POLICY coupons_update ON public.coupons
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS coupons_delete ON public.coupons;
CREATE POLICY coupons_delete ON public.coupons
  FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- ── Realtime opcional (para refletir alterações ao vivo no PDV) ──────────────
ALTER TABLE public.promotions REPLICA IDENTITY FULL;
ALTER TABLE public.coupons    REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'promotions'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.promotions';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'coupons'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.coupons';
  END IF;
END $$;

-- ── Colunas opcionais em sales para rastrear o desconto aplicado ─────────────
-- Ajuda relatórios a separar "desconto manual", "promoção automática" e
-- "cupom" sem quebrar nada existente — todos default 0 / NULL.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS coupon_id           uuid REFERENCES public.coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS coupon_code         text,
  ADD COLUMN IF NOT EXISTS coupon_discount     numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS promotion_discount  numeric(12,2) NOT NULL DEFAULT 0;
