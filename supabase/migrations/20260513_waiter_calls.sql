-- Tabela de chamadas de garçom feitas pelos clientes na página da mesa
create table if not exists public.waiter_calls (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_label text not null,
  comanda_id  uuid references public.comandas(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- Índice para busca por empresa
create index if not exists waiter_calls_company_id_idx on public.waiter_calls(company_id);

-- Habilita RLS
alter table public.waiter_calls enable row level security;

-- Membros da empresa podem ler
create policy "company members can read waiter_calls"
  on public.waiter_calls for select
  using (
    company_id in (
      select company_id from public.company_members where user_id = auth.uid()
    )
  );

-- Qualquer pessoa pode inserir (chamada pública da mesa do cliente)
create policy "public insert waiter_calls"
  on public.waiter_calls for insert
  with check (true);

-- Habilita realtime para a tabela
alter publication supabase_realtime add table public.waiter_calls;
