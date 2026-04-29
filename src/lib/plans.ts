export type BillingCycle = "monthly" | "yearly";
export type PricingType = "free" | "paid" | "custom";
export type SubscriptionStatus = "pending" | "active" | "past_due" | "cancelled" | "expired";
export type InvoiceStatus = "pending" | "paid" | "expired" | "cancelled";

export interface PlanRow {
  id: string;
  name: string;
  description: string | null;
  pricing_type: PricingType;
  price_monthly: number;
  price_yearly: number;
  max_stores: number | null;
  max_users: number | null;
  max_cashiers: number | null;
  max_products: number | null;
  features: string[];
  feature_flags: Record<string, boolean>;
  highlight: boolean;
  sort_order: number;
  is_active: boolean;
}

export interface SubscriptionRow {
  id: string;
  company_id: string;
  plan_id: string;
  billing_cycle: BillingCycle;
  status: SubscriptionStatus;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  next_due_at: string | null;
  cancelled_at: string | null;
  created_at: string;
}

export interface InvoiceRow {
  id: string;
  subscription_id: string;
  company_id: string;
  plan_id: string;
  billing_cycle: BillingCycle;
  amount: number;
  due_date: string;
  status: InvoiceStatus;
  pix_txid: string | null;
  pix_copia_e_cola: string | null;
  pix_qr_location: string | null;
  pix_expires_at: string | null;
  paid_at: string | null;
  notified_at: string | null;
  created_at: string;
  updated_at: string;
}

export function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function planPriceFor(plan: PlanRow, cycle: BillingCycle): number {
  return cycle === "yearly" ? Number(plan.price_yearly) : Number(plan.price_monthly);
}

export function planMonthlyEquivalent(plan: PlanRow, cycle: BillingCycle): number {
  if (cycle === "yearly") return Number(plan.price_yearly) / 12;
  return Number(plan.price_monthly);
}

export function billingCycleLabel(cycle: BillingCycle): string {
  return cycle === "yearly" ? "Anual" : "Mensal";
}

export function statusLabel(status: SubscriptionStatus | InvoiceStatus): string {
  const map: Record<string, string> = {
    pending: "Aguardando pagamento",
    active: "Ativa",
    past_due: "Vencida",
    cancelled: "Cancelada",
    expired: "Expirada",
    paid: "Paga",
  };
  return map[status] ?? status;
}

export function isUnlimited(value: number | null | undefined): boolean {
  return value === null || value === undefined;
}

export function formatLimit(value: number | null | undefined): string {
  return isUnlimited(value) ? "Ilimitado" : String(value);
}

export function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export function daysUntil(dateIso: string): number {
  const target = new Date(dateIso).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}
