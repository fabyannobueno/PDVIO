# PDVIO

A modern Point-of-Sale (PDV) web application for Brazilian businesses, built with React + Vite + TypeScript + Shadcn UI, using Supabase for authentication and database.

## Architecture

- **Frontend**: React 18 + Vite + TypeScript, served on port 5000
- **UI**: Shadcn UI components + Tailwind CSS
- **Auth & Database**: Supabase (external managed service)
- **State Management**: TanStack React Query
- **Routing**: React Router v6

## Key Files

- `src/App.tsx` — Root component and routing
- `src/pages/` — Auth, Dashboard, Onboarding, Produtos, PDV, Clientes, Estoque, Fornecedores, Contas, Financeiro, ComingSoon, NotFound
- `src/contexts/AuthContext.tsx` — Supabase auth state management
- `src/contexts/CompanyContext.tsx` — Active company management
- `src/integrations/supabase/client.ts` — Supabase client initialization
- `src/integrations/supabase/types.ts` — Auto-generated Supabase DB types
- `src/components/app/` — AppLayout, AppSidebar, AppHeader
- `src/lib/printer.ts` — Thermal printer integration (ESC/POS via Web Serial / Web USB / Web Bluetooth + window.print fallback). Settings persisted in localStorage under `pdvio:printer:settings`.
- `src/lib/labelPrinter.ts` — Weighing label printing (40x40 / 60x40 / 60x80). Generates EAN-13 barcode SVG sized in millimetres with crisp edges so handheld scanners can decode it.
- `src/components/dashboard/DashboardInsights.tsx` — Month-over-month comparatives on the dashboard: revenue vs. previous month, top-growing/declining product, peak hour.
- `src/components/estoque/PurchaseSuggestions.tsx` — Sales-based purchase suggestions tab inside Estoque (configurable analysis window and desired coverage).
- `src/components/relatorios/MarginReport.tsx` — Margin & profit report (top products by profit, low-margin alerts, missing-cost flag) embedded in `Relatorios`.
- `supabase/migrations/` — Database migration SQL files

## Environment Variables

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key (safe for frontend)

## Development

```bash
npm run dev    # Start dev server on port 5000
npm run build  # Build for production
```

## Database

Uses Supabase (PostgreSQL) with Row Level Security (RLS). Tables:
- `profiles` — User profiles (auto-created on signup)
- `companies` — Business entities
- `company_members` — Users linked to companies with roles
- `products` — Product catalog per company (migration: `supabase/migrations/20260420_products.sql`)
- `suppliers` — Fornecedores vinculados à empresa
- `stock_movements` — Histórico de movimentações de estoque (entrada, ajuste, contagem, perda); trigger atualiza `products.stock_quantity` automaticamente
- `accounts` — Contas a pagar e a receber, com parcelamento, status (open/paid/cancelled) e fluxo de caixa projetado
  Migração: `supabase/migrations/20260422_inventory_suppliers_finance.sql`
- `promotions` — Regras automáticas de desconto (categoria %, leve N pague M) com vigência opcional. Aplicadas no PDV via `src/lib/promotions.ts`
- `coupons` — Códigos digitados no PDV (% ou R$), com compra mínima, limite de usos e validade. Único por empresa via UNIQUE(company_id, UPPER(code))
- Colunas extras em `sales`: `coupon_id`, `coupon_code`, `coupon_discount`, `promotion_discount` para rastrear origem de desconto em relatórios
  Migração: `supabase/migrations/20260428_promotions_coupons.sql` (precisa ser aplicada manualmente via SQL editor do Supabase)
- `plans` / `subscriptions` / `invoices` — Planos da plataforma (Iniciante, Essencial, Pro, Empresarial), assinaturas por empresa e faturas (`supabase/migrations/20260506_plans_subscriptions_invoices.sql`)

## Limites por plano

Hook central: `src/hooks/usePlanLimits.ts`. Quando a empresa não tem assinatura ativa, usa o plano `iniciante` (1 loja, 1 usuário, 1 caixa, 50 produtos) como fallback. Bloqueios aplicados em:
- Produtos (`src/pages/Produtos.tsx`) — `canAddProduct` no botão "Novo Produto" + badge de uso no cabeçalho
- Onboarding (`src/pages/Onboarding.tsx`) — `canAddCompany` ao criar nova loja (apenas no fluxo `?new=1`); banner com link para `/planos`
- Operadores do caixa (`src/pages/Configuracoes.tsx`, aba Equipe) — `canAddCashier` no botão "Novo operador" + badge de uso. A aba também mostra badge de membros (`canAddUser`) só leitura.

## Acesso a páginas por plano

`src/lib/planAccess.ts` define o plano mínimo necessário por rota e `src/components/PlanGuard.tsx` protege as rotas em `App.tsx`. Quem está no Iniciante (ou sem plano) só acessa: dashboard, pdv, caixa, produtos, vendas, relatórios, suporte, roadmap, planos, faturas e configurações. Páginas restritas (clientes, crediário, comandas, kds, financeiro, contas, estoque, balança, fornecedores, promoções, auditoria) mostram cadeado no sidebar e tela de upgrade ao tentar acessar.

## User Flow

1. `/auth` — Sign in or create account
2. `/onboarding` — Create first company (if none exist)
3. `/` — Dashboard (requires auth + company)
