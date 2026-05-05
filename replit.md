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
- `src/contexts/OperatorContext.tsx` — Staff operator (PIN/badge) state
- `src/integrations/supabase/client.ts` — Supabase client initialization
- `src/integrations/supabase/types.ts` — Auto-generated Supabase DB types
- `src/components/app/` — AppLayout, AppSidebar, AppHeader
- `src/lib/printer.ts` — Thermal printer integration (ESC/POS via Web Serial / Web USB / Web Bluetooth + window.print fallback). Settings persisted in localStorage under `pdvio:printer:settings`.
- `src/lib/labelPrinter.ts` — Weighing label printing (40x40 / 60x40 / 60x80). Generates EAN-13 barcode SVG sized in millimetres with crisp edges so handheld scanners can decode it.
- `src/components/dashboard/DashboardInsights.tsx` — Month-over-month comparatives on the dashboard: revenue vs. previous month, top-growing/declining product, peak hour.
- `src/components/estoque/PurchaseSuggestions.tsx` — Sales-based purchase suggestions tab inside Estoque (configurable analysis window and desired coverage).
- `src/components/relatorios/MarginReport.tsx` — Margin & profit report (top products by profit, low-margin alerts, missing-cost flag) embedded in `Relatorios`.
- `supabase/migrations/` — Database migration SQL files (already applied to Supabase Cloud)
- `src/services/openrouter.ts` — PDV.IA AI support chat via OpenRouter
- `src/services/pix-api.service.ts` — PIX payment gateway integration

## Environment Variables

Set in `.replit` [userenv.shared] — available at build time as `import.meta.env.*`:
- `VITE_SUPABASE_URL` — Supabase project URL (set)
- `VITE_SUPABASE_PUBLISHABLE_KEY` — Supabase anon/public key (set, safe for frontend — RLS enforces security)
- `VITE_URL_API_PIX` — PIX payment gateway base URL (set)
- `VITE_CHAVE_PIX` — PIX key (chave PIX) for payment generation (set)

Optional (add to Replit Secrets to enable additional features):
- `VITE_OPENROUTER_API_KEY` — OpenRouter AI key for AI support chat (PDV.IA)
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
- `products` / `product_addons` — Product catalog per company
- `suppliers` — Fornecedores vinculados à empresa
- `stock_movements` — Histórico de movimentações de estoque (entrada, ajuste, contagem, perda); trigger atualiza `products.stock_quantity` automaticamente
- `accounts` — Contas a pagar e a receber, com parcelamento, status (open/paid/cancelled) e fluxo de caixa projetado
- `promotions` / `coupons` / `coupon_uses` — Promoções automáticas e cupons de desconto
- `plans` / `subscriptions` / `invoices` — Planos da plataforma, assinaturas por empresa e faturas
- `cash_sessions` / `cash_movements` — Controle de caixa com sessões por operador
- `comandas` / `comanda_items` — Sistema de mesas/comandas com KDS
- `crediario_entries` — Fiado/crediário por cliente
- `delivery_orders` — Pedidos do cardápio digital / delivery público
- `order_reviews` — Avaliações de pedidos do cardápio digital
- `staff_members` — Operadores com cartão + PIN (separados de company_members)
- `cart_reservations` — Reservas de estoque em tempo real para PDV
- `audit_logs` — Logs de auditoria para ações sensíveis
- `support_tickets` / `support_messages` — Sistema de suporte com PDV.IA
- `company_bank_accounts` — Contas bancárias por empresa
- `waiter_calls` — Chamadas de garçom via QR Code de mesa

## User Flow

1. `/auth` — Sign in or create account
2. `/onboarding` — Create first company (if none exist)
3. `/complete-profile` — Complete user profile (CPF, birth date)
4. `/` — Dashboard (requires auth + company)

## Replit Setup Notes

- App runs on port 5000 (Vite dev server) — mapped to external port 80
- Supabase is the sole backend — the provisioned Replit PostgreSQL is not used
- Auth is Supabase Auth (email/password + magic links) — all RLS policies depend on Supabase JWTs
- Realtime subscriptions (KDS, billing updates, cart reservations, delivery orders) use Supabase Realtime WebSocket
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are set in `.replit` [userenv.shared]
- Deployment target is `static` (pure SPA — no server-side rendering)
