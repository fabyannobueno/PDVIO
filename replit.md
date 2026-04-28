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

## User Flow

1. `/auth` — Sign in or create account
2. `/onboarding` — Create first company (if none exist)
3. `/` — Dashboard (requires auth + company)
