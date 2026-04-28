-- =========================================
-- CREDIARIO: forma de pagamento em pagamentos recebidos
-- =========================================

ALTER TABLE public.crediario_entries
  ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Apenas registros de pagamento devem ter forma de pagamento.
-- Débitos (compras a fiado) ignoram o campo.
ALTER TABLE public.crediario_entries
  DROP CONSTRAINT IF EXISTS crediario_entries_payment_method_check;

ALTER TABLE public.crediario_entries
  ADD CONSTRAINT crediario_entries_payment_method_check
  CHECK (
    payment_method IS NULL
    OR payment_method IN ('cash', 'credit_card', 'debit_card', 'pix', 'ticket', 'other')
  );
