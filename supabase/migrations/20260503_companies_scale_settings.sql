-- =========================================
-- Configurações de balança comercial por empresa.
-- Persistidas como JSONB para flexibilidade (modo, protocolo, baud rate,
-- data bits, stop bits, paridade) — campos específicos do dispositivo
-- conectado (deviceLabel) ficam apenas no localStorage.
-- =========================================
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS scale_settings JSONB;
