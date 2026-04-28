-- Crediário (store credit / fiado) per customer.
-- Each "entry" is either a charge (debit) or a payment (credit).
-- The customer balance is the running sum of charges minus payments.
-- Overdue amount uses FIFO: payments first cover the oldest charges.

-- ── Late fee config on companies ─────────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS crediario_late_fee_percent numeric NOT NULL DEFAULT 0
    CHECK (crediario_late_fee_percent >= 0 AND crediario_late_fee_percent <= 100);

-- ── Credit limit per customer ────────────────────────────────────────────────
-- NULL = no limit. Otherwise, customer's open balance cannot exceed this value.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS credit_limit numeric
    CHECK (credit_limit IS NULL OR credit_limit >= 0);

-- ── crediario_entries ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.crediario_entries (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  customer_id    uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id        uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  kind           text NOT NULL CHECK (kind IN ('charge','payment')),
  description    text NOT NULL DEFAULT '',
  amount         numeric NOT NULL CHECK (amount > 0),
  reference_date date NOT NULL DEFAULT (now()::date),
  due_date       date,
  notes          text,
  created_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crediario_entries_company_customer_idx
  ON public.crediario_entries(company_id, customer_id, reference_date);

CREATE INDEX IF NOT EXISTS crediario_entries_company_due_idx
  ON public.crediario_entries(company_id, due_date)
  WHERE kind = 'charge';

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.crediario_entries_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crediario_entries_set_updated_at ON public.crediario_entries;
CREATE TRIGGER crediario_entries_set_updated_at
  BEFORE UPDATE ON public.crediario_entries
  FOR EACH ROW EXECUTE FUNCTION public.crediario_entries_set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.crediario_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crediario_entries_select ON public.crediario_entries;
CREATE POLICY crediario_entries_select ON public.crediario_entries
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS crediario_entries_insert ON public.crediario_entries;
CREATE POLICY crediario_entries_insert ON public.crediario_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS crediario_entries_update ON public.crediario_entries;
CREATE POLICY crediario_entries_update ON public.crediario_entries
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS crediario_entries_delete ON public.crediario_entries;
CREATE POLICY crediario_entries_delete ON public.crediario_entries
  FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

-- ── Realtime ─────────────────────────────────────────────────────────────────
ALTER TABLE public.crediario_entries REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'crediario_entries'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.crediario_entries';
  END IF;
END $$;
