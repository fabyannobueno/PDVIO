-- =========================================
-- KDS (Kitchen Display System) — adiciona estado de preparo aos itens da comanda
-- =========================================

ALTER TABLE public.comanda_items
  ADD COLUMN IF NOT EXISTS kds_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS kds_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kds_ready_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kds_done_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_comanda_items_kds_status
  ON public.comanda_items(kds_status);
