-- =========================================
-- SUPORTE: garantir unicidade do seq_number por empresa em concorrência
--
-- O trigger anterior calculava MAX(seq_number)+1 sem lock, o que
-- permitia que duas inserções simultâneas obtivessem o mesmo número
-- e violassem o índice único uq_support_tickets_company_seq.
--
-- Esta versão usa pg_advisory_xact_lock(company_id) para serializar
-- a atribuição por empresa apenas durante a transação corrente, sem
-- bloquear empresas diferentes nem outras operações na mesma tabela.
-- =========================================

CREATE OR REPLACE FUNCTION public.support_assign_seq_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_seq INTEGER;
BEGIN
  IF NEW.seq_number IS NULL THEN
    -- Lock por empresa, liberado automaticamente no fim da transação.
    -- hashtextextended retorna BIGINT estável a partir do UUID.
    PERFORM pg_advisory_xact_lock(hashtextextended(NEW.company_id::text, 0));

    SELECT COALESCE(MAX(seq_number), 0) + 1
      INTO next_seq
      FROM public.support_tickets
      WHERE company_id = NEW.company_id;

    NEW.seq_number := next_seq;
  END IF;
  RETURN NEW;
END;
$$;

-- Garante o índice único (idempotente; já existia em migração anterior)
CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_company_seq
  ON public.support_tickets(company_id, seq_number);
