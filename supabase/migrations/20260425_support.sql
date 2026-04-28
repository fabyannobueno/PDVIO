-- =========================================
-- SUPORTE: chamados (tickets) e mensagens
-- =========================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  user_email TEXT,
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'duvida',
  priority TEXT NOT NULL DEFAULT 'normal',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_company_created
  ON public.support_tickets(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status
  ON public.support_tickets(company_id, status);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view support_tickets" ON public.support_tickets;
CREATE POLICY "Members view support_tickets"
  ON public.support_tickets FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "Members insert support_tickets" ON public.support_tickets;
CREATE POLICY "Members insert support_tickets"
  ON public.support_tickets FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS "Members update support_tickets" ON public.support_tickets;
CREATE POLICY "Members update support_tickets"
  ON public.support_tickets FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

-- =========================================
-- Messages
-- =========================================

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT,
  author_type TEXT NOT NULL DEFAULT 'user',
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
  ON public.support_messages(ticket_id, created_at);

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members view support_messages" ON public.support_messages;
CREATE POLICY "Members view support_messages"
  ON public.support_messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND public.is_company_member(auth.uid(), t.company_id)
    )
  );

DROP POLICY IF EXISTS "Members insert support_messages" ON public.support_messages;
CREATE POLICY "Members insert support_messages"
  ON public.support_messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND public.is_company_member(auth.uid(), t.company_id)
    )
  );

-- Trigger: bump updated_at on ticket when a new message is added
CREATE OR REPLACE FUNCTION public.support_touch_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.support_tickets
    SET updated_at = now()
    WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_touch_ticket ON public.support_messages;
CREATE TRIGGER trg_support_touch_ticket
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_touch_ticket();
