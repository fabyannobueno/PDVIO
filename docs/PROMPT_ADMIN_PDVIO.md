# Prompt — Gerar o app de Admin do PDVIO

Cole o conteúdo abaixo num novo projeto Replit (em branco) para gerar o **PDVIO Admin**, o painel interno usado pelo dono do PDVIO e pela equipe de suporte para gerenciar todas as contas, planos, faturas e tickets dos clientes.

> O app de admin **conecta no MESMO Supabase** do PDVIO (mesma URL e mesma anon key). O isolamento é feito por uma nova tabela `platform_admins` + função `is_platform_admin()` usada nas políticas RLS.

---

## ✂️ Copie a partir daqui

Crie um novo SaaS em **Vite + React + TypeScript** chamado **PDVIO Admin** — o painel interno do dono do PDVIO (uma plataforma brasileira de PDV/Point of Sale multi-tenant). Esse app **não** é usado pelos clientes; é usado pela equipe interna (dono e suporte) pra gerenciar todas as empresas cadastradas, planos, faturas, tickets de suporte e métricas do negócio.

### Stack obrigatória
- **Vite + React 18 + TypeScript**
- **Tailwind CSS + shadcn/ui** (tema escuro por padrão, paleta roxa/violeta como o PDVIO)
- **React Router v6**
- **TanStack Query (React Query)** para data fetching/caching
- **Supabase JS v2** como backend (auth + Postgres + RLS + Realtime)
- **Recharts** para gráficos
- **date-fns** com locale `pt-BR`
- **lucide-react** para ícones
- **react-hook-form + zod** para formulários
- **sonner** para toasts
- Idioma da UI: **Português do Brasil** em todo lugar (labels, mensagens, datas, moeda)

### Conexão com o Supabase
O app usa o **MESMO projeto Supabase** do PDVIO (cliente). Configure como variáveis de ambiente:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
Crie `src/integrations/supabase/client.ts` exportando o `supabase` client.

### Autenticação e autorização
- Login por email + senha via Supabase Auth.
- Só usuários cuja linha exista em `public.platform_admins` (tabela nova, definida abaixo) podem entrar. Qualquer outro deve receber "Acesso negado" e ser deslogado.
- Papéis (`role`): `superadmin` (faz tudo, inclusive gerenciar outros admins) e `support` (só suporte e leitura de empresas).
- Componente `<PermissionGuard role="superadmin">` esconde itens só do superadmin.

---

## 📦 Migração SQL nova (rode no Supabase do PDVIO)

```sql
-- =========================================================================
-- PDVIO Admin — Tabelas e funções de plataforma
-- =========================================================================

-- 1) Admins da plataforma (equipe interna do PDVIO)
create type public.platform_admin_role as enum ('superadmin', 'support');

create table public.platform_admins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null,
  role public.platform_admin_role not null default 'support',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  last_login_at timestamptz
);

create index idx_platform_admins_user_id on public.platform_admins(user_id);

-- 2) Função util pra checar se o usuário logado é admin de plataforma
create or replace function public.is_platform_admin(_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins
    where user_id = _user_id and active = true
  );
$$;

create or replace function public.platform_admin_role(_user_id uuid default auth.uid())
returns public.platform_admin_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.platform_admins
  where user_id = _user_id and active = true
  limit 1;
$$;

-- 3) Anúncios / banners broadcast pra todos os clientes (aparecem no PDVIO cliente)
create table public.platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','warning','critical','success')),
  audience text not null default 'all' check (audience in ('all','paid','free','specific')),
  target_company_ids uuid[] default null,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index idx_announcements_active on public.platform_announcements(active, starts_at, ends_at);

-- 4) Notas internas em empresas (visíveis só pro admin)
create table public.company_internal_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  body text not null,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_company_internal_notes_company on public.company_internal_notes(company_id, created_at desc);

-- 5) Lançamentos manuais de fatura/ajuste por admin (concessões, reembolsos)
create table public.platform_billing_adjustments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid references public.invoices(id) on delete set null,
  kind text not null check (kind in ('discount','refund','manual_payment','credit','chargeback')),
  amount numeric(12,2) not null,
  reason text not null,
  applied_by uuid not null references auth.users(id),
  applied_at timestamptz not null default now()
);

create index idx_billing_adjustments_company on public.platform_billing_adjustments(company_id, applied_at desc);

-- 6) Log de ações administrativas (quem fez o quê dentro do admin)
create table public.platform_admin_audit (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index idx_platform_admin_audit_created on public.platform_admin_audit(created_at desc);

-- =========================================================================
-- RLS: admins de plataforma têm acesso total (read/write) em quase tudo
-- =========================================================================
alter table public.platform_admins enable row level security;
alter table public.platform_announcements enable row level security;
alter table public.company_internal_notes enable row level security;
alter table public.platform_billing_adjustments enable row level security;
alter table public.platform_admin_audit enable row level security;

-- platform_admins: só superadmin gerencia
create policy "platform_admins_read_self_or_super" on public.platform_admins
  for select using (
    user_id = auth.uid() or platform_admin_role() = 'superadmin'
  );
create policy "platform_admins_write_super" on public.platform_admins
  for all using (platform_admin_role() = 'superadmin')
  with check (platform_admin_role() = 'superadmin');

-- announcements: admin gerencia, qualquer usuário autenticado lê os ativos
create policy "announcements_admin_all" on public.platform_announcements
  for all using (is_platform_admin()) with check (is_platform_admin());
create policy "announcements_public_read_active" on public.platform_announcements
  for select using (active = true and (ends_at is null or ends_at > now()));

-- internal notes: só admin
create policy "internal_notes_admin_all" on public.company_internal_notes
  for all using (is_platform_admin()) with check (is_platform_admin());

-- billing adjustments: só admin
create policy "billing_adj_admin_all" on public.platform_billing_adjustments
  for all using (is_platform_admin()) with check (is_platform_admin());

-- audit: só admin lê (escrita via função abaixo)
create policy "admin_audit_read" on public.platform_admin_audit
  for select using (is_platform_admin());

-- =========================================================================
-- ESTENDER POLÍTICAS DAS TABELAS DO PDVIO PARA DAR ACESSO AO ADMIN
-- (aplicar a TODAS as tabelas multi-tenant existentes)
-- =========================================================================
-- Padrão: criar uma policy adicional "platform_admin_all" em cada tabela
-- abaixo. Repita o bloco trocando o nome da tabela.
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies','profiles','staff_members',
    'plans','subscriptions','invoices',
    'support_tickets','support_messages',
    'audit_logs',
    'sales','sale_items','products','product_addons',
    'customers','suppliers',
    'cash_sessions','cash_movements',
    'comandas','comanda_items',
    'kds_orders','kds_items',
    'inventory_movements','accounts','financial_entries',
    'promotions','coupons','coupon_uses',
    'company_bank_accounts','payment_settings',
    'cart_reservations'
  ]
  loop
    execute format(
      'create policy "platform_admin_full_access" on public.%I
         for all to authenticated
         using (public.is_platform_admin())
         with check (public.is_platform_admin());',
      t
    );
  end loop;
exception when undefined_table then
  -- ignora se alguma tabela ainda não existir
  null;
end $$;

-- =========================================================================
-- RPCs / FUNÇÕES PARA O ADMIN
-- =========================================================================

-- Lista todas empresas com KPIs agregados (uma chamada só)
create or replace function public.admin_list_companies(
  _search text default null,
  _plan_id text default null,
  _status text default null,
  _limit int default 50,
  _offset int default 0
)
returns table(
  id uuid, name text, document text, email text, phone text,
  business_type public.business_type, created_at timestamptz,
  owner_email text, owner_name text,
  plan_id text, plan_name text, subscription_status text,
  current_period_end timestamptz, cancelled_at timestamptz,
  total_users int, total_products int, total_sales_30d int,
  revenue_30d numeric, last_activity_at timestamptz,
  open_tickets int, overdue_invoices int
)
language sql stable security definer set search_path = public as $$
  with sub as (
    select distinct on (s.company_id) s.*
    from subscriptions s
    where s.status in ('active','past_due','pending')
    order by s.company_id, s.created_at desc
  )
  select
    c.id, c.name, c.document, c.email, c.phone, c.business_type, c.created_at,
    p.email as owner_email, p.full_name as owner_name,
    sub.plan_id, pl.name as plan_name, sub.status::text, sub.current_period_end, sub.cancelled_at,
    (select count(*)::int from company_members where company_id = c.id),
    (select count(*)::int from products where company_id = c.id and coalesce(is_active,true)),
    (select count(*)::int from sales where company_id = c.id and created_at > now() - interval '30 days'),
    (select coalesce(sum(total),0) from sales where company_id = c.id and created_at > now() - interval '30 days' and status = 'completed'),
    (select max(created_at) from sales where company_id = c.id),
    (select count(*)::int from support_tickets where company_id = c.id and status not in ('closed','resolved')),
    (select count(*)::int from invoices where company_id = c.id and status = 'pending' and due_date < now())
  from companies c
  left join sub on sub.company_id = c.id
  left join plans pl on pl.id = sub.plan_id
  left join company_members cm on cm.company_id = c.id and cm.role = 'owner'
  left join profiles p on p.id = cm.user_id
  where is_platform_admin()
    and (_search is null or c.name ilike '%'||_search||'%' or c.document ilike '%'||_search||'%' or p.email ilike '%'||_search||'%')
    and (_plan_id is null or sub.plan_id = _plan_id)
    and (_status is null or sub.status::text = _status)
  order by c.created_at desc
  limit _limit offset _offset;
$$;

-- KPIs do dashboard (MRR, ARR, churn, etc.)
create or replace function public.admin_dashboard_kpis()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not is_platform_admin() then
    raise exception 'unauthorized';
  end if;

  select jsonb_build_object(
    'total_companies', (select count(*) from companies),
    'companies_30d',  (select count(*) from companies where created_at > now() - interval '30 days'),
    'active_subscriptions', (select count(*) from subscriptions where status = 'active'),
    'paid_subscriptions',   (select count(*) from subscriptions s join plans p on p.id = s.plan_id where s.status = 'active' and p.pricing_type = 'paid'),
    'mrr', (
      select coalesce(sum(case when s.billing_cycle = 'yearly' then p.price_yearly/12 else p.price_monthly end),0)
      from subscriptions s join plans p on p.id = s.plan_id
      where s.status = 'active' and p.pricing_type = 'paid'
    ),
    'arr', (
      select coalesce(sum(case when s.billing_cycle = 'yearly' then p.price_yearly else p.price_monthly*12 end),0)
      from subscriptions s join plans p on p.id = s.plan_id
      where s.status = 'active' and p.pricing_type = 'paid'
    ),
    'pending_invoices_value', (select coalesce(sum(amount),0) from invoices where status = 'pending'),
    'paid_invoices_30d', (select coalesce(sum(amount),0) from invoices where status = 'paid' and paid_at > now() - interval '30 days'),
    'overdue_invoices_count', (select count(*) from invoices where status = 'pending' and due_date < now()),
    'open_tickets', (select count(*) from support_tickets where status not in ('closed','resolved')),
    'urgent_tickets', (select count(*) from support_tickets where status not in ('closed','resolved') and priority = 'urgent'),
    'churn_30d', (select count(*) from subscriptions where status = 'expired' and updated_at > now() - interval '30 days'),
    'cancellations_30d', (select count(*) from subscriptions where cancelled_at is not null and cancelled_at > now() - interval '30 days')
  ) into result;
  return result;
end $$;

-- Série temporal (últimos N dias) de novos clientes, MRR, vendas
create or replace function public.admin_time_series(_days int default 30)
returns table(day date, new_companies int, new_paid_subs int, sales_total numeric, sales_count int)
language sql stable security definer set search_path = public as $$
  with days as (
    select generate_series(current_date - (_days-1), current_date, '1 day')::date as day
  )
  select
    d.day,
    (select count(*)::int from companies where created_at::date = d.day),
    (select count(*)::int from subscriptions s join plans p on p.id = s.plan_id
       where s.created_at::date = d.day and p.pricing_type = 'paid'),
    (select coalesce(sum(total),0) from sales where created_at::date = d.day and status = 'completed'),
    (select count(*)::int from sales where created_at::date = d.day and status = 'completed')
  from days d
  where is_platform_admin()
  order by d.day;
$$;

-- Marcar fatura como paga manualmente (pagamento fora do PIX, ex: TED)
create or replace function public.admin_mark_invoice_paid(_invoice_id uuid, _note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'unauthorized'; end if;
  update invoices set status = 'paid', paid_at = now(), updated_at = now() where id = _invoice_id;
  insert into platform_admin_audit(admin_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'invoice.mark_paid', 'invoice', _invoice_id::text, jsonb_build_object('note', _note));
end $$;

-- Cancelar fatura
create or replace function public.admin_cancel_invoice(_invoice_id uuid, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'unauthorized'; end if;
  update invoices set status = 'cancelled', updated_at = now() where id = _invoice_id;
  insert into platform_admin_audit(admin_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'invoice.cancel', 'invoice', _invoice_id::text, jsonb_build_object('reason', _reason));
end $$;

-- Trocar plano de uma empresa manualmente (cortesia, downgrade forçado, etc)
create or replace function public.admin_change_plan(_company_id uuid, _new_plan_id text, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'unauthorized'; end if;
  update subscriptions set status = 'expired', updated_at = now()
    where company_id = _company_id and status in ('active','past_due','pending');
  insert into subscriptions(company_id, plan_id, status, billing_cycle, current_period_start, current_period_end)
  values (_company_id, _new_plan_id, 'active', 'monthly', now(), now() + interval '30 days');
  insert into platform_admin_audit(admin_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'subscription.change_plan', 'company', _company_id::text,
    jsonb_build_object('new_plan_id', _new_plan_id, 'reason', _reason));
end $$;

-- Suspender / reativar empresa
create or replace function public.admin_set_company_suspended(_company_id uuid, _suspended boolean, _reason text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'unauthorized'; end if;
  update companies set suspended = _suspended, suspended_reason = _reason, updated_at = now()
    where id = _company_id;
  insert into platform_admin_audit(admin_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), case when _suspended then 'company.suspend' else 'company.unsuspend' end,
          'company', _company_id::text, jsonb_build_object('reason', _reason));
end $$;

-- Adicionar coluna suspended em companies se não existir
alter table public.companies
  add column if not exists suspended boolean not null default false,
  add column if not exists suspended_reason text;

-- Resposta de admin em ticket de suporte (já temos support_messages,
-- só garanta que author_type='admin' é aceito)
-- Nada novo aqui — usa insert direto em support_messages.
```

---

## 🧭 Estrutura de páginas (rotas)

```
/login                       → email + senha
/                            → Dashboard (KPIs + gráficos)
/empresas                    → lista de empresas (search, filtros, paginação)
/empresas/:id                → detalhe (overview, assinatura, faturas, uso, notas, ações)
/assinaturas                 → todas as assinaturas (com filtros)
/faturas                     → todas as faturas (filtrar por status, atrasadas, etc)
/faturas/:id                 → detalhe da fatura + ações (marcar paga, cancelar, gerar nova)
/planos                      → CRUD de planos (preço, limites, features, flags)
/suporte                     → fila de tickets (kanban: open/answered/resolved/closed)
/suporte/:ticketId           → conversa do ticket + responder
/anuncios                    → broadcast/anúncios (CRUD)
/relatorios                  → relatórios (receita, churn, conversão, top empresas)
/auditoria                   → log de ações administrativas
/admins                      → (só superadmin) gerenciar equipe interna
/configuracoes               → preferências do admin logado
```

### Componentes globais
- `<AppLayout>` — sidebar fixa à esquerda com seções: **Visão geral**, **Clientes** (Empresas, Assinaturas, Faturas, Planos), **Suporte** (Tickets, Anúncios), **Análise** (Relatórios, Auditoria), **Sistema** (Admins, Configurações).
- `<TopBar>` — busca global por empresa (CNPJ/nome/email), badge de tickets abertos, badge de faturas atrasadas, avatar do admin logado.
- `<ImpersonateButton>` — em cada empresa, botão "Abrir como cliente" que (opcionalmente) gera um magic link via Supabase Admin API e abre o app PDVIO em nova aba (só pra superadmin, com confirmação e auditoria).

---

## 📊 Tela: Dashboard

Cards no topo (chame `admin_dashboard_kpis()`):
- **MRR** (Receita Mensal Recorrente) e **ARR**
- **Empresas ativas** + novas nos últimos 30 dias
- **Assinaturas pagas** vs total
- **Faturas pendentes** (valor) e **atrasadas** (quantidade)
- **Tickets abertos** + urgentes
- **Cancelamentos 30d** + churn

Gráficos (Recharts, série de `admin_time_series(30)`):
- Linha: novos clientes por dia
- Barras: vendas totais (R$) por dia
- Linha: novas assinaturas pagas por dia

Listas:
- Últimas 10 empresas cadastradas
- Últimos 10 tickets abertos por prioridade
- Últimas 10 faturas pagas

---

## 🏢 Tela: Empresas

**Lista** — tabela paginada, chama `admin_list_companies(...)`. Colunas:
| Empresa | CNPJ | Dono (email) | Plano | Status | Próx. vencimento | Lojas | Produtos | Vendas 30d | Receita 30d | Tickets | Faturas atrasadas |

Filtros: busca livre, plano, status (ativo/cancelado/expirado/suspenso), tipo de negócio.

**Detalhe** — tabs:
1. **Visão geral**: dados cadastrais (nome, CNPJ, telefone, email, endereço), dono, data de cadastro, último login, métricas de uso (lojas, produtos, usuários, vendas 30d, receita 30d).
2. **Assinatura**: plano atual, ciclo, datas, histórico de planos, botões: **Trocar plano** (dialog), **Reativar**, **Forçar cancelamento**, **Suspender conta** (com razão).
3. **Faturas**: lista de faturas da empresa, ações por linha (ver, marcar paga, cancelar).
4. **Suporte**: tickets dessa empresa (link pra `/suporte/:id`).
5. **Atividade**: últimas vendas, últimos logins, últimas alterações importantes (do `audit_logs`).
6. **Notas internas**: CRUD em `company_internal_notes` (chat estilo timeline, com pin).
7. **Ajustes financeiros**: créditos, descontos, reembolsos manuais (`platform_billing_adjustments`).
8. **Acessar como cliente**: botão de impersonate (só superadmin).

---

## 💳 Tela: Faturas

Tabela: número, empresa, plano, valor, status, vencimento, pago em, método.
Filtros: status, atrasadas, por empresa, por período.
Ações por linha: ver detalhe, marcar paga (`admin_mark_invoice_paid`), cancelar (`admin_cancel_invoice`), copiar link de pagamento.
Export CSV.

---

## 📦 Tela: Planos

CRUD na tabela `plans`:
- Nome, slug, descrição, badge "Mais popular"
- Preço mensal, preço anual, tipo (free/paid/custom)
- Limites: max_stores, max_products, max_users, max_cashiers, max_orders_month
- Feature flags (jsonb): `kds`, `comandas`, `multi_caixa`, `crediario`, `promocoes`, `relatorios_avancados`, `api`, etc — cada uma com toggle.
- Ordem de exibição
- Ativo / inativo

Aviso: ao mudar limites pra menor, mostrar quantas empresas hoje estão acima do novo limite.

---

## 🎫 Tela: Suporte (tickets)

Visão **Kanban** com colunas: **Aberto**, **Em andamento**, **Aguardando cliente**, **Resolvido**, **Fechado**.
Card com: número (#1234), assunto, empresa, prioridade (badge colorido), última atividade.
Filtros: prioridade, categoria, empresa, atribuído a.

**Detalhe do ticket** (`/suporte/:id`):
- Cabeçalho: número, assunto, empresa (link), categoria, prioridade, status, atribuído.
- Timeline de mensagens (`support_messages`), distinguindo `author_type` (cliente vs admin) com cores diferentes.
- Caixa de resposta (textarea + anexar arquivo + botão "Responder").
- Ao enviar, insere em `support_messages` com `author_type='admin'`, `author_id=auth.uid()`, e marca o ticket como `in_progress`.
- Ações: alterar prioridade, alterar categoria, atribuir a um admin, marcar como **Resolvido** ou **Fechar**.
- Realtime: subscription do Supabase em `support_messages` filtrado pelo ticket — quando o cliente responde, aparece na hora.

---

## 📣 Tela: Anúncios

CRUD em `platform_announcements`. Editor (markdown simples), severidade, audiência (todos / pagos / free / lista de empresas), data início/fim, ativo. Preview.

> No PDVIO cliente, criar componente `<PlatformAnnouncementBanner />` que lê `platform_announcements` ativos no topo do app.

---

## 📈 Tela: Relatórios

- Receita por mês (12 meses): MRR realizado.
- Funil: cadastros → free → paid (taxa de conversão).
- Churn: cancelamentos por mês, motivo (se houver).
- Top 20 empresas por receita gerada (vendas).
- Distribuição por tipo de negócio.
- Distribuição por plano.

Filtros de período. Botão exportar CSV.

---

## 🔍 Tela: Auditoria

Tabela cronológica de `platform_admin_audit` + `audit_logs` (operações de cliente sensíveis): admin, ação, entidade, data, metadata expandível em JSON.
Filtros: admin, ação, entidade, período.

---

## 👥 Tela: Admins (só superadmin)

CRUD em `platform_admins`:
- Lista admins ativos/inativos.
- Convidar: email, nome, papel — chama `supabase.auth.admin.inviteUserByEmail` (precisa Edge Function com service role) e ao criar o user, insere em `platform_admins`.
- Editar papel.
- Desativar (toggle `active`).

---

## ⚙️ Tela: Configurações

- Perfil do admin logado (nome, foto, senha).
- Preferências: tema, fuso, notificações por email.
- Webhooks (futuro): URL pra notificar quando ticket urgente abre, fatura atrasada, etc.

---

## 🔐 Edge Functions (Supabase) recomendadas

Crie em `supabase/functions/`:
1. **`admin-invite`** — usa SERVICE_ROLE_KEY para `auth.admin.inviteUserByEmail` + insert em `platform_admins`. Verifica que quem chama é superadmin.
2. **`admin-impersonate`** — gera magic link de uma conta de cliente (só superadmin, registra no audit).
3. **`admin-broadcast-email`** — envia email pra audiência (integrar com Resend/SES).

---

## 📡 Realtime

Habilite Supabase Realtime em:
- `support_tickets` e `support_messages` — atualizar a fila e a conversa em tempo real.
- `invoices` — quando uma fatura muda pra `paid`, atualiza o dashboard.
- `subscriptions` — novas assinaturas aparecem na hora.

---

## 🎨 Design

- Tema escuro padrão, paleta primária roxa (`#8b5cf6` / violeta), cantos arredondados (`rounded-2xl`), sombras suaves.
- Logo: "PDVIO Admin" com o mesmo P estilizado roxo.
- Fontes: Inter.
- Espaçamento generoso, tabelas densas mas legíveis, badges coloridos por status.
- Skeletons em todo carregamento (use `isFetching` do React Query, não `isFetched`, pra evitar flicker em refetch).
- Datas sempre em pt-BR (`dd/MM/yyyy HH:mm`), valores em `R$ 1.234,56`.
- Toast de sucesso/erro em toda mutação.
- Confirmação (AlertDialog) em ações destrutivas: cancelar fatura, suspender empresa, trocar plano, deletar admin.

---

## ✅ Checklist de pronto

- [ ] Login só permite usuários em `platform_admins.active = true`.
- [ ] RLS de `platform_admins` testada (cliente comum NÃO vê).
- [ ] Policies "platform_admin_full_access" criadas em todas tabelas listadas.
- [ ] Dashboard carrega com `admin_dashboard_kpis()` em uma chamada.
- [ ] Lista de empresas com filtros e paginação.
- [ ] Marcar fatura paga gera registro em `platform_admin_audit`.
- [ ] Resposta em ticket aparece no PDVIO do cliente em tempo real.
- [ ] Anúncios aparecem no topo do PDVIO cliente quando ativos.
- [ ] Suspender empresa bloqueia login do cliente (PDVIO precisa checar `companies.suspended`).
- [ ] Toda ação destrutiva tem confirmação.
- [ ] Tudo em pt-BR.

---

## 📝 Observações finais pro agente que for construir

1. **Não duplique a lógica de billing** que já existe no PDVIO cliente — reaproveite as funções `cancel_subscription`, `create_renewal_invoice`, `downgrade_expired_to_free`. O admin chama as mesmas RPCs.
2. **Sempre registre auditoria** em qualquer mutação relevante via `platform_admin_audit`.
3. **Nunca exponha o SERVICE_ROLE_KEY no front** — só use em Edge Functions.
4. Antes de subir, peça pra rodar a migração SQL no Supabase do PDVIO (o app de admin compartilha o mesmo banco).
5. O primeiro superadmin precisa ser inserido manualmente:
   ```sql
   insert into platform_admins(user_id, email, full_name, role)
   values ('<uuid do dono>', 'dono@pdvio.com.br', 'Dono PDVIO', 'superadmin');
   ```
