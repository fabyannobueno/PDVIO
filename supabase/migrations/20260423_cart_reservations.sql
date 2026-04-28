-- Real-time stock reservations for PDV carts.
-- Comandas already reserve stock implicitly via comanda_items.
-- This table holds in-flight PDV carts so other operators see reduced
-- available stock immediately and cannot oversell.

CREATE TABLE IF NOT EXISTS public.cart_reservations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cart_id       text NOT NULL,
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity      numeric NOT NULL CHECK (quantity > 0),
  reserved_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operator_id   uuid,
  operator_name text,
  source        text NOT NULL DEFAULT 'pdv',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS cart_reservations_company_product_idx
  ON public.cart_reservations(company_id, product_id);

CREATE INDEX IF NOT EXISTS cart_reservations_cart_idx
  ON public.cart_reservations(cart_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.cart_reservations_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS cart_reservations_set_updated_at ON public.cart_reservations;
CREATE TRIGGER cart_reservations_set_updated_at
  BEFORE UPDATE ON public.cart_reservations
  FOR EACH ROW EXECUTE FUNCTION public.cart_reservations_set_updated_at();

-- RLS
ALTER TABLE public.cart_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cart_reservations_select ON public.cart_reservations;
CREATE POLICY cart_reservations_select ON public.cart_reservations
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS cart_reservations_insert ON public.cart_reservations;
CREATE POLICY cart_reservations_insert ON public.cart_reservations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS cart_reservations_update ON public.cart_reservations;
CREATE POLICY cart_reservations_update ON public.cart_reservations
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS cart_reservations_delete ON public.cart_reservations;
CREATE POLICY cart_reservations_delete ON public.cart_reservations
  FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- Realtime publication
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'cart_reservations'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.cart_reservations';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'comanda_items'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.comanda_items';
  END IF;
END $$;

-- Stale-cart cleanup (call from a scheduled job if available, or on-demand from app).
CREATE OR REPLACE FUNCTION public.cleanup_stale_cart_reservations()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM public.cart_reservations
  WHERE updated_at < now() - INTERVAL '4 hours';
$$;
