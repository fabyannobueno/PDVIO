-- Adiciona coluna de verificação do WhatsApp de delivery da loja
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS delivery_whatsapp_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.delivery_whatsapp_verified
  IS 'Indica se o número delivery_whatsapp foi verificado via W-API como número WhatsApp válido.';
