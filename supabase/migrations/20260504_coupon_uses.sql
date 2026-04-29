-- =============================================================================
-- Auditoria de uso de cupons
-- =============================================================================
-- Cada vez que um cupom é consumido (no PDV ou Comanda) gravamos uma linha
-- em coupon_uses contendo o cliente identificado, valor de desconto aplicado,
-- venda associada e usuário operador. Cupons só podem ser aplicados com
-- identificação de cliente (customer_id NOT NULL).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.coupon_uses (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  coupon_id        uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  customer_id      uuid NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  customer_name    text NOT NULL,
  coupon_code      text NOT NULL,
  sale_id          uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  discount_amount  numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  used_by_user_id  uuid,
  used_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_uses_company_idx
  ON public.coupon_uses(company_id, used_at DESC);

CREATE INDEX IF NOT EXISTS coupon_uses_coupon_idx
  ON public.coupon_uses(coupon_id, used_at DESC);

CREATE INDEX IF NOT EXISTS coupon_uses_customer_idx
  ON public.coupon_uses(customer_id, used_at DESC);

ALTER TABLE public.coupon_uses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS coupon_uses_select ON public.coupon_uses;
CREATE POLICY coupon_uses_select ON public.coupon_uses
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS coupon_uses_insert ON public.coupon_uses;
CREATE POLICY coupon_uses_insert ON public.coupon_uses
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- Só admins podem deletar (limpeza). Update não faz sentido — é um log.
DROP POLICY IF EXISTS coupon_uses_delete ON public.coupon_uses;
CREATE POLICY coupon_uses_delete ON public.coupon_uses
  FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
