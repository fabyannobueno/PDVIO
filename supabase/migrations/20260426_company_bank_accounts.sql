-- Bank accounts associated with each company. Used for future integration
-- with accounts payable/receivable, payouts and PIX configuration.

CREATE TABLE IF NOT EXISTS public.company_bank_accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  bank_code       text NOT NULL,
  bank_name       text NOT NULL,
  bank_ispb       text,
  holder_type     text NOT NULL CHECK (holder_type IN ('pj','pf')),
  holder_name     text,
  holder_document text,
  account_type    text NOT NULL CHECK (account_type IN ('corrente','poupanca','pagamento','salario')),
  agency          text NOT NULL,
  agency_digit    text,
  account         text NOT NULL,
  account_digit   text,
  pix_key         text,
  pix_key_type    text CHECK (pix_key_type IN ('cpf','cnpj','email','telefone','aleatoria')),
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Para instalações que já tinham a tabela criada antes, garante a coluna.
ALTER TABLE public.company_bank_accounts
  ADD COLUMN IF NOT EXISTS pix_key_type text
  CHECK (pix_key_type IN ('cpf','cnpj','email','telefone','aleatoria'));

-- Apenas uma conta bancária por empresa.
CREATE UNIQUE INDEX IF NOT EXISTS company_bank_accounts_company_unique
  ON public.company_bank_accounts(company_id);

CREATE OR REPLACE FUNCTION public.company_bank_accounts_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS company_bank_accounts_set_updated_at ON public.company_bank_accounts;
CREATE TRIGGER company_bank_accounts_set_updated_at
  BEFORE UPDATE ON public.company_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.company_bank_accounts_set_updated_at();

-- RLS
ALTER TABLE public.company_bank_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_bank_accounts_select ON public.company_bank_accounts;
CREATE POLICY company_bank_accounts_select ON public.company_bank_accounts
  FOR SELECT TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS company_bank_accounts_insert ON public.company_bank_accounts;
CREATE POLICY company_bank_accounts_insert ON public.company_bank_accounts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS company_bank_accounts_update ON public.company_bank_accounts;
CREATE POLICY company_bank_accounts_update ON public.company_bank_accounts
  FOR UPDATE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id))
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

DROP POLICY IF EXISTS company_bank_accounts_delete ON public.company_bank_accounts;
CREATE POLICY company_bank_accounts_delete ON public.company_bank_accounts
  FOR DELETE TO authenticated
  USING (public.is_company_member(auth.uid(), company_id));
