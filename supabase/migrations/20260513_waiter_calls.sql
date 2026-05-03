-- Tabela de chamadas de garçom feitas pelos clientes na página da mesa
create table if not exists public.waiter_calls (
  id         uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  table_label text not null,
  comanda_id  uuid references public.comandas(id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists waiter_calls_company_id_idx on public.waiter_calls(company_id);

alter table public.waiter_calls enable row level security;

-- Usuários autenticados da empresa podem ler (usa função já existente no schema)
create policy "company members can read waiter_calls"
  on public.waiter_calls for select
  using (public.is_company_member(auth.uid(), company_id));

-- Qualquer pessoa pode inserir (chamada pública da mesa do cliente)
create policy "public insert waiter_calls"
  on public.waiter_calls for insert
  with check (true);

-- Habilita realtime para a tabela
alter publication supabase_realtime add table public.waiter_calls;
