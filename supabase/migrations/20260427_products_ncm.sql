-- Adiciona o código NCM (Nomenclatura Comum do Mercosul) ao cadastro
-- de produtos. Útil para futura emissão fiscal (NF-e/NFC-e).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS ncm text;

CREATE INDEX IF NOT EXISTS products_ncm_idx ON public.products (ncm);
