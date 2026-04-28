-- Persist printer settings per company
alter table public.companies
  add column if not exists printer_settings jsonb;
