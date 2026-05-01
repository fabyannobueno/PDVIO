# PDVIO

A modern Point-of-Sale (PDV) web application for Brazilian businesses, built with React + Vite + TypeScript + Shadcn UI, using Supabase for authentication and database.

## Architecture

- **Frontend**: React 18 + Vite + TypeScript, served on port 5000
- **UI**: Shadcn UI components + Tailwind CSS
- **Auth & Database**: Supabase Cloud (external managed service — project: luznrsvdmlwcajoxaekn.supabase.co)
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
- `supabase/migrations/` — Database migration SQL files (already applied to Supabase Cloud)

## Environment Variables

Required (set in Replit Secrets/Env Vars):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key (safe for frontend — RLS enforces security)

Optional (set in Replit Secrets to enable additional features):
- `VITE_OPENROUTER_API_KEY` — OpenRouter AI key for AI support chat
- `VITE_URL_API_PIX` — PIX payment gateway base URL
- `VITE_CHAVE_PIX` — PIX key (chave PIX) for payment generation
- `VITE_COSMOS_API_KEY` — Cosmos API key for NCM product code lookup

## Development

```bash
npm run dev    # Start dev server on port 5000
npm run build  # Build for production
```

## Database

Uses Supabase Cloud (PostgreSQL) with Row Level Security (RLS). Tables:
- `profiles` — User profiles (auto-created on signup)
- `companies` — Business entities
- `company_members` — Users linked to companies with roles
- `products` — Product catalog per company
- `suppliers` — Fornecedores vinculados à empresa
- `stock_movements` — Histórico de movimentações de estoque (entrada, ajuste, contagem, perda); trigger atualiza `products.stock_quantity` automaticamente
- `accounts` — Contas a pagar e a receber, com parcelamento, status (open/paid/cancelled) e fluxo de caixa projetado
- `promotions` — Regras automáticas de desconto (categoria %, leve N pague M) com vigência opcional
- `coupons` — Códigos digitados no PDV (% ou R$), com compra mínima, limite de usos e validade
- `plans` / `subscriptions` / `invoices` — Planos da plataforma, assinaturas por empresa e faturas
- `cash_sessions` / `cash_movements` — Controle de caixa com sessões por operador
- `comandas` / `comanda_items` — Sistema de mesas/comandas com KDS
- `crediario_entries` — Fiado/crediário por cliente
- `staff_members` — Operadores com cartão + PIN (separados de company_members)
- `cart_reservations` — Reservas de estoque em tempo real para PDV
- `audit_logs` — Logs de auditoria para ações sensíveis

## User Flow

1. `/auth` — Sign in or create account
2. `/onboarding` — Create first company (if none exist)
3. `/` — Dashboard (requires auth + company)

## Replit Setup Notes

- App runs on port 5000 (Vite dev server) — mapped to external port 80
- Supabase is the sole backend — no Replit PostgreSQL is used by this app
- Auth is Supabase Auth (email/password + magic links) — all RLS policies depend on Supabase JWTs
- Realtime subscriptions (KDS, billing updates, cart reservations) go through Supabase Realtime WebSocket
