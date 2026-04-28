-- =========================================
-- SUPORTE: extensões para chat com PDV.IA + handoff humano
-- =========================================

-- 1) Colunas extras em support_tickets
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS seq_number INTEGER,
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_support_tickets_company_seq
  ON public.support_tickets(company_id, seq_number);

-- 2) Colunas extras em support_messages
ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3) Trigger: gera seq_number por empresa
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
    SELECT COALESCE(MAX(seq_number), 0) + 1
      INTO next_seq
      FROM public.support_tickets
      WHERE company_id = NEW.company_id;
    NEW.seq_number := next_seq;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_assign_seq ON public.support_tickets;
CREATE TRIGGER trg_support_assign_seq
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_assign_seq_number();

-- 4) Backfill de seq_number para tickets antigos (caso existam sem numeração)
DO $$
DECLARE
  r RECORD;
  c UUID;
  i INTEGER;
BEGIN
  FOR c IN SELECT DISTINCT company_id FROM public.support_tickets WHERE seq_number IS NULL
  LOOP
    SELECT COALESCE(MAX(seq_number), 0) INTO i
      FROM public.support_tickets WHERE company_id = c;
    FOR r IN
      SELECT id FROM public.support_tickets
        WHERE company_id = c AND seq_number IS NULL
        ORDER BY created_at ASC
    LOOP
      i := i + 1;
      UPDATE public.support_tickets SET seq_number = i WHERE id = r.id;
    END LOOP;
  END LOOP;
END $$;

-- 5) Permitir UPDATE em support_messages para o autor (necessário para flags do bot)
DROP POLICY IF EXISTS "Members update own support_messages" ON public.support_messages;
CREATE POLICY "Members update own support_messages"
  ON public.support_messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND public.is_company_member(auth.uid(), t.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND public.is_company_member(auth.uid(), t.company_id)
    )
  );
