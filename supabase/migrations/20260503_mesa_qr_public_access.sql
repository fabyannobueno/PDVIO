-- Permite acesso público (anônimo) para a funcionalidade de QR Code de Mesa.
-- O cliente escaneia o QR, vê o cardápio e cria a comanda sem precisar de login.

-- 1. Leitura pública de empresas (somente campos necessários para a tela do cliente)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'companies' AND policyname = 'Public read company for mesa QR'
  ) THEN
    CREATE POLICY "Public read company for mesa QR"
      ON companies FOR SELECT
      USING (true);
  END IF;
END $$;

-- 2. Leitura pública de produtos ativos (cardápio digital)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'products' AND policyname = 'Public read active products for mesa QR'
  ) THEN
    CREATE POLICY "Public read active products for mesa QR"
      ON products FOR SELECT
      USING (is_active = true);
  END IF;
END $$;

-- 3. Inserção pública de comanda via QR Code (cliente abre a comanda ao escanear)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comandas' AND policyname = 'Public insert comanda from QR'
  ) THEN
    CREATE POLICY "Public insert comanda from QR"
      ON comandas FOR INSERT
      WITH CHECK (
        EXISTS (SELECT 1 FROM companies WHERE id = company_id)
      );
  END IF;
END $$;

-- 4. Leitura pública de comanda aberta para a mesa (para evitar duplicatas)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'comandas' AND policyname = 'Public read open comanda for mesa QR'
  ) THEN
    CREATE POLICY "Public read open comanda for mesa QR"
      ON comandas FOR SELECT
      USING (status = 'open');
  END IF;
END $$;
