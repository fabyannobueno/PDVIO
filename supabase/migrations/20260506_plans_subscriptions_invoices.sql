-- =========================================
-- TABELA: plans (catálogo)
-- =========================================
CREATE TABLE public.plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  pricing_type TEXT NOT NULL DEFAULT 'paid' CHECK (pricing_type IN ('free', 'paid', 'custom')),
  price_monthly NUMERIC(10,2) NOT NULL DEFAULT 0,
  price_yearly NUMERIC(10,2) NOT NULL DEFAULT 0,
  max_stores INTEGER,
  max_users INTEGER,
  max_cashiers INTEGER,
  max_products INTEGER,
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  feature_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  highlight BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active plans"
  ON public.plans FOR SELECT
  USING (is_active = true);

-- Seed: planos
INSERT INTO public.plans (id, name, description, pricing_type, price_monthly, price_yearly, max_stores, max_users, max_cashiers, max_products, features, feature_flags, highlight, sort_order)
VALUES
  ('iniciante', 'Iniciante', 'Para quem está começando e precisa do básico bem feito.', 'free', 0, 0, 1, 1, 1, 50,
    '["1 Caixa / Usuário","Até 50 produtos","Relatórios básicos","Sem gestão de mesas","Sem KDS (Cozinha)"]'::jsonb,
    '{"comandas": false, "kds": false, "multi_loja": false}'::jsonb,
    false, 1),
  ('essencial', 'Essencial', 'Para quem já tem clientes e precisa crescer com organização.', 'paid', 69, 588, 2, 6, 6, 1000,
    '["Até 2 lojas","Até 1.000 produtos","3 usuários por loja","Comandas e mesas","Suporte por chat"]'::jsonb,
    '{"comandas": true, "kds": false, "multi_loja": true}'::jsonb,
    true, 2),
  ('pro', 'Pro', 'O sistema completo para operar em alta performance, com várias lojas.', 'paid', 159, 1548, 10, NULL, NULL, NULL,
    '["Multi-loja até 10 lojas","Usuários e caixas ilimitados","Produtos ilimitados","KDS (Tela da cozinha)","Estoque, fichas e BI completo","Suporte prioritário via WhatsApp"]'::jsonb,
    '{"comandas": true, "kds": true, "multi_loja": true}'::jsonb,
    false, 3),
  ('empresarial', 'Empresarial', 'Para redes, franquias e operações complexas com várias lojas.', 'custom', 0, 0, NULL, NULL, NULL, NULL,
    '["Tudo do plano Pro","Lojas ilimitadas","API de integração aberta","Gerente de conta dedicado","Onboarding personalizado"]'::jsonb,
    '{"comandas": true, "kds": true, "multi_loja": true, "api": true}'::jsonb,
    false, 4);

-- =========================================
-- TABELA: subscriptions (planos vendidos)
-- =========================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'past_due', 'cancelled', 'expired')),
  started_at TIMESTAMPTZ,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_subscriptions_company ON public.subscriptions(company_id);
CREATE INDEX idx_subscriptions_status ON public.subscriptions(status);
CREATE UNIQUE INDEX idx_subscriptions_active_per_company
  ON public.subscriptions(company_id)
  WHERE status IN ('active', 'past_due', 'pending');

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their company subscriptions"
  ON public.subscriptions FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Owners can insert subscriptions"
  ON public.subscriptions FOR INSERT
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'owner'));

CREATE POLICY "Owners can update subscriptions"
  ON public.subscriptions FOR UPDATE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- TABELA: invoices (faturas)
-- =========================================
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL REFERENCES public.plans(id),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  amount NUMERIC(10,2) NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  pix_txid TEXT,
  pix_copia_e_cola TEXT,
  pix_qr_location TEXT,
  pix_expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_invoices_company ON public.invoices(company_id);
CREATE INDEX idx_invoices_subscription ON public.invoices(subscription_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_due_date ON public.invoices(due_date);
CREATE INDEX idx_invoices_pix_txid ON public.invoices(pix_txid) WHERE pix_txid IS NOT NULL;

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their company invoices"
  ON public.invoices FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Owners can insert invoices"
  ON public.invoices FOR INSERT
  WITH CHECK (public.has_company_role(auth.uid(), company_id, 'owner'));

CREATE POLICY "Owners can update invoices"
  ON public.invoices FOR UPDATE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

CREATE TRIGGER update_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- RPC: assina o plano grátis (sem PIX)
-- =========================================
CREATE OR REPLACE FUNCTION public.activate_free_subscription(_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub_id UUID;
  _is_owner BOOLEAN;
BEGIN
  SELECT public.has_company_role(auth.uid(), _company_id, 'owner') INTO _is_owner;
  IF NOT _is_owner THEN
    RAISE EXCEPTION 'Apenas o proprietário pode assinar planos';
  END IF;

  UPDATE public.subscriptions
    SET status = 'cancelled', cancelled_at = now()
    WHERE company_id = _company_id AND status IN ('active', 'pending', 'past_due');

  INSERT INTO public.subscriptions (
    company_id, plan_id, billing_cycle, status,
    started_at, current_period_start, current_period_end, next_due_at, created_by
  ) VALUES (
    _company_id, 'iniciante', 'monthly', 'active',
    now(), now(), NULL, NULL, auth.uid()
  )
  RETURNING id INTO _sub_id;

  RETURN _sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_free_subscription(UUID) TO authenticated;
