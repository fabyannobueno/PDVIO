-- =============================================================================
-- Delivery / Cardápio digital + W-API (WhatsApp) por empresa
-- =============================================================================

ALTER TABLE public.companies
  -- Delivery / Cardápio digital
  ADD COLUMN IF NOT EXISTS delivery_enabled          boolean      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_slug             text,
  ADD COLUMN IF NOT EXISTS delivery_description      text,
  ADD COLUMN IF NOT EXISTS delivery_logo_url         text,
  ADD COLUMN IF NOT EXISTS delivery_cover_url        text,
  ADD COLUMN IF NOT EXISTS delivery_fee              numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_min_order        numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_free_threshold   numeric(10,2),
  ADD COLUMN IF NOT EXISTS delivery_time             text,
  ADD COLUMN IF NOT EXISTS delivery_pickup_time      text,
  ADD COLUMN IF NOT EXISTS delivery_primary_color    text         NOT NULL DEFAULT '#6d28d9',
  ADD COLUMN IF NOT EXISTS delivery_whatsapp         text,
  ADD COLUMN IF NOT EXISTS delivery_instagram        text,
  ADD COLUMN IF NOT EXISTS delivery_facebook         text,
  ADD COLUMN IF NOT EXISTS delivery_operating_hours  jsonb,
  -- W-API / WhatsApp automático
  ADD COLUMN IF NOT EXISTS wapi_instance_id          text,
  ADD COLUMN IF NOT EXISTS wapi_token                text;

-- Slug único (ignorando NULLs — cada empresa pode não ter slug ainda)
CREATE UNIQUE INDEX IF NOT EXISTS companies_delivery_slug_uidx
  ON public.companies(delivery_slug)
  WHERE delivery_slug IS NOT NULL AND delivery_slug <> '';

COMMENT ON COLUMN public.companies.delivery_enabled        IS 'Ativa o cardápio digital / delivery público.';
COMMENT ON COLUMN public.companies.delivery_slug           IS 'Slug único da loja no cardápio (ex: minha-pizzaria).';
COMMENT ON COLUMN public.companies.delivery_operating_hours IS 'Array JSON de horários: [{day, isOpen, openTime, closeTime}].';
COMMENT ON COLUMN public.companies.wapi_token              IS 'Token Bearer da instância W-API. Armazenado por empresa.';
COMMENT ON COLUMN public.companies.wapi_instance_id        IS 'Instance ID da instância W-API.';
