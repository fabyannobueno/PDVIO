-- =========================================
-- MULTI-CAIXA: permite uma sessão por operador (staff_member) por empresa
-- =========================================

-- 1. Adiciona referência ao operador (staff_member) que abriu o caixa
ALTER TABLE public.cash_sessions
  ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES public.staff_members(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS operator_name TEXT;

CREATE INDEX IF NOT EXISTS idx_cash_sessions_operator
  ON public.cash_sessions(operator_id);

-- 2. Remove a restrição antiga de "um caixa aberto por empresa"
DROP INDEX IF EXISTS public.uq_cash_sessions_one_open;

-- 3. Nova restrição: um caixa aberto por (empresa, operador). Sessões
--    sem operador (ex: dono operando direto) usam a conta do usuário
--    como discriminador via opened_by.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_one_open_per_operator
  ON public.cash_sessions(company_id, operator_id)
  WHERE status = 'open' AND operator_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_cash_sessions_one_open_per_user
  ON public.cash_sessions(company_id, opened_by)
  WHERE status = 'open' AND operator_id IS NULL;
