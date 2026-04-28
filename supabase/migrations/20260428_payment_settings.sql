-- Configurações de formas de pagamento aceitas no PDV e em Comandas.
alter table public.companies
  add column if not exists payment_settings jsonb;
