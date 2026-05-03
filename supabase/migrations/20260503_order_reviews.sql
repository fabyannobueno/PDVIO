-- ─────────────────────────────────────────────────────────────────────────────
-- Tabela: order_reviews
-- Avaliações de pedidos enviadas pelo cliente no cardápio digital (pdvio.shop)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_reviews (
  id                uuid         DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id        uuid         NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  order_id          uuid         REFERENCES delivery_orders(id) ON DELETE SET NULL,
  order_numeric_id  bigint,
  customer_name     text,
  delivery_type     text         CHECK (delivery_type IN ('delivery', 'pickup', 'dine_in')),
  table_identifier  text,
  rating            int          NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment           text,
  created_at        timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_reviews_company_id_idx ON order_reviews (company_id);
CREATE INDEX IF NOT EXISTS order_reviews_order_id_idx   ON order_reviews (order_id);

-- ── Row Level Security ────────────────────────────────────────────────────────
ALTER TABLE order_reviews ENABLE ROW LEVEL SECURITY;

-- Anônimo pode inserir (cardápio digital envia a avaliação sem autenticação)
CREATE POLICY "anon_insert_order_reviews"
  ON order_reviews FOR INSERT
  TO anon
  WITH CHECK (true);

-- Anônimo pode verificar se já existe avaliação para o pedido (evitar duplicata)
CREATE POLICY "anon_select_order_reviews"
  ON order_reviews FOR SELECT
  TO anon
  USING (true);

-- Autenticado pode selecionar, inserir e deletar (painel PDVIO)
CREATE POLICY "auth_select_order_reviews"
  ON order_reviews FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "auth_insert_order_reviews"
  ON order_reviews FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "auth_delete_order_reviews"
  ON order_reviews FOR DELETE
  TO authenticated
  USING (true);
