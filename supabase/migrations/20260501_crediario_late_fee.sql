-- Crediário late fee: period (day/month) and link late-fee entries to their
-- parent charge so the system can keep them in sync automatically.

-- ── Late fee period on companies ───────────────────────────────────────────
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS crediario_late_fee_period text NOT NULL DEFAULT 'month'
    CHECK (crediario_late_fee_period IN ('day','month'));

-- ── Late fee link on entries ───────────────────────────────────────────────
ALTER TABLE public.crediario_entries
  ADD COLUMN IF NOT EXISTS is_late_fee boolean NOT NULL DEFAULT false;

ALTER TABLE public.crediario_entries
  ADD COLUMN IF NOT EXISTS parent_entry_id uuid
    REFERENCES public.crediario_entries(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS crediario_entries_parent_idx
  ON public.crediario_entries(parent_entry_id)
  WHERE parent_entry_id IS NOT NULL;
