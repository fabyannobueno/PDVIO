-- =============================================================================
-- Gestão de planos: cancelar, gerar fatura de renovação, rebaixar para Iniciante
-- =============================================================================

-- ── cancel_subscription ─────────────────────────────────────────────────────
-- Marca cancelled_at na assinatura paga ativa, MAS mantém status 'active' até
-- current_period_end. Após o término do período, downgrade_expired_to_free é
-- responsável por trocar para o plano Iniciante.
CREATE OR REPLACE FUNCTION public.cancel_subscription(_company_id UUID)
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
    RAISE EXCEPTION 'Apenas o proprietário pode cancelar planos';
  END IF;

  SELECT id INTO _sub_id
    FROM public.subscriptions
    WHERE company_id = _company_id
      AND status IN ('active', 'past_due')
      AND plan_id <> 'iniciante'
    ORDER BY created_at DESC
    LIMIT 1;

  IF _sub_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum plano pago ativo para cancelar';
  END IF;

  UPDATE public.subscriptions
    SET cancelled_at = now()
    WHERE id = _sub_id
      AND cancelled_at IS NULL;

  -- Cancela quaisquer faturas pendentes futuras dessa assinatura
  UPDATE public.invoices
    SET status = 'cancelled'
    WHERE subscription_id = _sub_id
      AND status = 'pending';

  RETURN _sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancel_subscription(UUID) TO authenticated;

-- ── create_renewal_invoice ──────────────────────────────────────────────────
-- Gera (ou retorna a existente) fatura pendente para a renovação do próximo
-- período da assinatura ativa atual. Usado pelo modal de aviso 5 dias antes.
CREATE OR REPLACE FUNCTION public.create_renewal_invoice(_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub RECORD;
  _plan RECORD;
  _existing UUID;
  _amount NUMERIC(10,2);
  _due DATE;
  _new_id UUID;
  _is_owner BOOLEAN;
BEGIN
  SELECT public.has_company_role(auth.uid(), _company_id, 'owner') INTO _is_owner;
  IF NOT _is_owner THEN
    RAISE EXCEPTION 'Apenas o proprietário pode gerar faturas';
  END IF;

  SELECT * INTO _sub
    FROM public.subscriptions
    WHERE company_id = _company_id
      AND status IN ('active', 'past_due')
      AND plan_id <> 'iniciante'
    ORDER BY created_at DESC
    LIMIT 1;

  IF _sub IS NULL THEN
    RAISE EXCEPTION 'Nenhum plano pago ativo';
  END IF;

  SELECT * INTO _plan FROM public.plans WHERE id = _sub.plan_id;
  IF _plan IS NULL THEN
    RAISE EXCEPTION 'Plano não encontrado';
  END IF;

  -- Reaproveita fatura pendente recente, se houver
  SELECT id INTO _existing
    FROM public.invoices
    WHERE subscription_id = _sub.id
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

  IF _existing IS NOT NULL THEN
    RETURN _existing;
  END IF;

  _amount := CASE WHEN _sub.billing_cycle = 'yearly'
                  THEN _plan.price_yearly ELSE _plan.price_monthly END;

  _due := COALESCE(_sub.next_due_at::date, current_date);

  INSERT INTO public.invoices (
    subscription_id, company_id, plan_id, billing_cycle,
    amount, due_date, status
  ) VALUES (
    _sub.id, _company_id, _sub.plan_id, _sub.billing_cycle,
    _amount, _due, 'pending'
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_renewal_invoice(UUID) TO authenticated;

-- ── downgrade_expired_to_free ───────────────────────────────────────────────
-- Se a assinatura paga atual já passou do current_period_end (cancelada ou
-- vencida sem pagamento), marca como expired e ativa o plano Iniciante.
-- Idempotente: chamável a cada login sem efeito quando ainda dentro do período.
CREATE OR REPLACE FUNCTION public.downgrade_expired_to_free(_company_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _sub RECORD;
  _new_id UUID;
  _is_owner BOOLEAN;
BEGIN
  SELECT public.has_company_role(auth.uid(), _company_id, 'owner') INTO _is_owner;
  IF NOT _is_owner THEN
    RETURN NULL;
  END IF;

  SELECT * INTO _sub
    FROM public.subscriptions
    WHERE company_id = _company_id
      AND status IN ('active', 'past_due')
      AND plan_id <> 'iniciante'
    ORDER BY created_at DESC
    LIMIT 1;

  -- Nada para rebaixar
  IF _sub IS NULL THEN
    RETURN NULL;
  END IF;

  -- Período ainda não terminou → mantém
  IF _sub.current_period_end IS NULL OR _sub.current_period_end > now() THEN
    RETURN NULL;
  END IF;

  UPDATE public.subscriptions
    SET status = 'expired'
    WHERE id = _sub.id;

  INSERT INTO public.subscriptions (
    company_id, plan_id, billing_cycle, status,
    started_at, current_period_start, current_period_end, next_due_at, created_by
  ) VALUES (
    _company_id, 'iniciante', 'monthly', 'active',
    now(), now(), NULL, NULL, COALESCE(_sub.created_by, auth.uid())
  )
  RETURNING id INTO _new_id;

  RETURN _new_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.downgrade_expired_to_free(UUID) TO authenticated;
