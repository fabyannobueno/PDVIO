-- =============================================================================
-- Pedidos do Delivery / Cardápio Digital
-- Registra pedidos feitos pelo cardápio público da empresa.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.delivery_orders (
  id            uuid        NOT NULL DEFAULT gen_random_uuid(),
  numeric_id    bigint      GENERATED ALWAYS AS IDENTITY NOT NULL,
  company_id    uuid        NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_name text        NOT NULL,
  customer_phone text       NOT NULL,
  address       text,
  delivery_type text        NOT NULL,
  items         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  subtotal      numeric(10,2) NOT NULL DEFAULT 0,
  delivery_fee  numeric(10,2) NOT NULL DEFAULT 0,
  total         numeric(10,2) NOT NULL DEFAULT 0,
  payment_method text       NOT NULL,
  notes         text,
  status        text        NOT NULL DEFAULT 'pending',
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT delivery_orders_pkey PRIMARY KEY (id),
  CONSTRAINT delivery_orders_delivery_type_check CHECK (
    delivery_type = ANY (ARRAY['delivery'::text, 'pickup'::text])
  ),
  CONSTRAINT delivery_orders_status_check CHECK (
    status = ANY (ARRAY[
      'pending'::text,
      'confirmed'::text,
      'preparing'::text,
      'cancelled'::text,
      'out_for_delivery'::text,
      'delivered'::text,
      'ready_for_pickup'::text,
      'picked_up'::text
    ])
  )
);

CREATE INDEX IF NOT EXISTS delivery_orders_company_id_idx  ON public.delivery_orders USING btree (company_id);
CREATE INDEX IF NOT EXISTS delivery_orders_status_idx      ON public.delivery_orders USING btree (status);
CREATE INDEX IF NOT EXISTS delivery_orders_created_at_idx  ON public.delivery_orders USING btree (created_at DESC);

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_orders ENABLE ROW LEVEL SECURITY;

-- Membros da empresa veem os pedidos
DROP POLICY IF EXISTS delivery_orders_select ON public.delivery_orders;
CREATE POLICY delivery_orders_select ON public.delivery_orders
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- Membros podem inserir (app interno) e o cardápio público também insere via RLS anon
DROP POLICY IF EXISTS delivery_orders_insert ON public.delivery_orders;
CREATE POLICY delivery_orders_insert ON public.delivery_orders
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- Apenas membros podem atualizar status
DROP POLICY IF EXISTS delivery_orders_update ON public.delivery_orders;
CREATE POLICY delivery_orders_update ON public.delivery_orders
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- Apenas owners podem deletar
DROP POLICY IF EXISTS delivery_orders_delete ON public.delivery_orders;
CREATE POLICY delivery_orders_delete ON public.delivery_orders
  FOR DELETE TO authenticated
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER TABLE public.delivery_orders REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'delivery_orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.delivery_orders';
  END IF;
END $$;
