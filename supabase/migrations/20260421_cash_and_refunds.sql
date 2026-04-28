-- =========================================
-- CAIXA: cash_sessions
-- =========================================
CREATE TABLE public.cash_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  opened_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  closed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  opening_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  expected_amount NUMERIC(10,2),
  closing_amount NUMERIC(10,2),
  difference NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  notes TEXT
);

ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_cash_sessions_company ON public.cash_sessions(company_id);
CREATE INDEX idx_cash_sessions_status ON public.cash_sessions(company_id, status);

-- Garante apenas 1 caixa aberto por empresa
CREATE UNIQUE INDEX uq_cash_sessions_one_open
  ON public.cash_sessions(company_id) WHERE status = 'open';

CREATE POLICY "Members view cash sessions"
  ON public.cash_sessions FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members insert cash sessions"
  ON public.cash_sessions FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members update cash sessions"
  ON public.cash_sessions FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- CAIXA: cash_movements (sangria/suprimento)
-- =========================================
CREATE TABLE public.cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sangria','suprimento')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_cash_movements_session ON public.cash_movements(cash_session_id);
CREATE INDEX idx_cash_movements_company ON public.cash_movements(company_id);

CREATE POLICY "Members view cash movements"
  ON public.cash_movements FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members insert cash movements"
  ON public.cash_movements FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- SALES: vincula venda ao caixa + cancelamento
-- =========================================
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_cash_session ON public.sales(cash_session_id);

-- Permite UPDATE para cancelar venda
DROP POLICY IF EXISTS "Members can update sales" ON public.sales;
CREATE POLICY "Members can update sales"
  ON public.sales FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- DEVOLUÇÕES: refunds
-- =========================================
CREATE TABLE public.refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cash_session_id UUID REFERENCES public.cash_sessions(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('full','partial')),
  amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  refund_method TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_refunds_sale ON public.refunds(sale_id);
CREATE INDEX idx_refunds_company ON public.refunds(company_id);
CREATE INDEX idx_refunds_session ON public.refunds(cash_session_id);

CREATE POLICY "Members view refunds"
  ON public.refunds FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members insert refunds"
  ON public.refunds FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));
