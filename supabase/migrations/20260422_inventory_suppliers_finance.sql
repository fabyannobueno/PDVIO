-- =========================================================================
-- Operacional: Estoque, Fornecedores, Contas a Pagar/Receber
-- =========================================================================

-- ── Products: add minimum stock alert level ─────────────────────────────
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS min_stock NUMERIC(10,3) NOT NULL DEFAULT 0;

-- =========================================================================
-- TABELA: suppliers
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  document TEXT,
  phone TEXT,
  email TEXT,
  contact_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_suppliers_company ON public.suppliers(company_id);

CREATE TRIGGER update_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can view company suppliers"
  ON public.suppliers FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert suppliers"
  ON public.suppliers FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Managers and owners can update suppliers"
  ON public.suppliers FOR UPDATE
  USING (
    public.has_company_role(auth.uid(), company_id, 'owner') OR
    public.has_company_role(auth.uid(), company_id, 'manager')
  );

CREATE POLICY "Owners can delete suppliers"
  ON public.suppliers FOR DELETE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

-- =========================================================================
-- TABELA: stock_movements
-- kind: 'entry' (entrada de mercadoria), 'adjustment' (ajuste manual),
--       'count' (contagem cíclica - quantidade é o delta), 'loss' (perda/quebra)
-- quantity is signed (positive = added to stock, negative = removed)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('entry','adjustment','count','loss')),
  quantity NUMERIC(12,3) NOT NULL,
  unit_cost NUMERIC(12,4),
  reference TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_stock_movements_company ON public.stock_movements(company_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_created ON public.stock_movements(created_at DESC);

CREATE POLICY "Members can view company stock movements"
  ON public.stock_movements FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert stock movements"
  ON public.stock_movements FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Owners can delete stock movements"
  ON public.stock_movements FOR DELETE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));

-- Trigger: apply movement to product.stock_quantity
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.products
     SET stock_quantity = COALESCE(stock_quantity, 0) + NEW.quantity
   WHERE id = NEW.product_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- =========================================================================
-- TABELA: accounts (a pagar / a receber)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('payable','receivable')),
  description TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE NOT NULL,
  paid_date DATE,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid','cancelled')),
  category TEXT,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  installment_number INT,
  installment_total INT,
  installment_group UUID,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_accounts_company ON public.accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_accounts_due ON public.accounts(due_date);
CREATE INDEX IF NOT EXISTS idx_accounts_kind_status ON public.accounts(kind, status);

CREATE TRIGGER update_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members can view company accounts"
  ON public.accounts FOR SELECT
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can insert accounts"
  ON public.accounts FOR INSERT
  WITH CHECK (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Members can update accounts"
  ON public.accounts FOR UPDATE
  USING (public.is_company_member(auth.uid(), company_id));

CREATE POLICY "Owners can delete accounts"
  ON public.accounts FOR DELETE
  USING (public.has_company_role(auth.uid(), company_id, 'owner'));
