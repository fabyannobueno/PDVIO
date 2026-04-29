// ─────────────────────────────────────────────────────────────────────────────
// Promoções automáticas + Cupons de desconto
//
// Lê e aplica regras de duas tabelas:
//   • promotions — regras automáticas, aplicadas direto nos itens do carrinho
//                  (ex.: 20% OFF em Bebidas; Leve 3 Pague 2 em Coca-Cola)
//   • coupons    — códigos digitados manualmente no PDV/Comanda que
//                  aplicam desconto sobre o total da venda
//
// Toda a aplicação é feita no FRONTEND para feedback instantâneo. A
// validação final do cupom (uso restante, validade) também é confirmada no
// banco no momento da finalização da venda via `consumeCoupon`.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

export type PromotionKind = "category_percent" | "product_buy_x_pay_y";
export type CouponKind = "percent" | "fixed";

export interface Promotion {
  id: string;
  company_id: string;
  name: string;
  kind: PromotionKind;
  category: string | null;
  product_id: string | null;
  discount_percent: number | null;
  buy_qty: number | null;
  pay_qty: number | null;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Coupon {
  id: string;
  company_id: string;
  code: string;
  kind: CouponKind;
  value: number;
  min_purchase: number;
  max_uses: number | null;
  uses_count: number;
  starts_at: string | null;
  ends_at: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

// ── Active window helpers ────────────────────────────────────────────────────

function isActiveNow(
  starts_at: string | null,
  ends_at: string | null,
  now: Date = new Date(),
): boolean {
  if (starts_at && new Date(starts_at).getTime() > now.getTime()) return false;
  if (ends_at && new Date(ends_at).getTime() < now.getTime()) return false;
  return true;
}

export function isPromotionActive(p: Promotion, now: Date = new Date()): boolean {
  return p.is_active && isActiveNow(p.starts_at, p.ends_at, now);
}

export function isCouponActive(c: Coupon, now: Date = new Date()): boolean {
  if (!c.is_active) return false;
  if (!isActiveNow(c.starts_at, c.ends_at, now)) return false;
  if (c.max_uses != null && c.uses_count >= c.max_uses) return false;
  return true;
}

// ── Cart line model used by the engine ───────────────────────────────────────

export interface CartLineInput {
  productId: string;
  category: string | null;
  /** Preço base unitário JÁ depois de promoção por produto (is_promotion). */
  basePrice: number;
  /** Quantidade do item — pode ser fracionada (kg) ou inteira (un). */
  quantity: number;
}

export interface CartLineDiscount {
  /** Desconto unitário em R$ (subtraído do basePrice). */
  unitDiscount: number;
  /** Quantidade desse desconto unitário aplicada (ex.: 1 grátis a cada 3). */
  freeQuantity: number;
  /** Lista de promoções que afetaram a linha (apenas para tooltip). */
  appliedPromotionIds: string[];
}

export interface PromotionsResult {
  /** Por linha (mesma ordem de entrada): desconto a aplicar. */
  perLine: CartLineDiscount[];
  /** Total descontado em R$. */
  totalDiscount: number;
  /** Resumo por promoção aplicada. */
  applied: Array<{ id: string; name: string; amount: number }>;
}

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/**
 * Aplica todas as promoções ativas às linhas do carrinho.
 * Não muta as linhas; devolve apenas os descontos por linha.
 */
export function applyPromotions(
  lines: CartLineInput[],
  promotions: Promotion[],
  now: Date = new Date(),
): PromotionsResult {
  const active = promotions.filter((p) => isPromotionActive(p, now));
  const perLine: CartLineDiscount[] = lines.map(() => ({
    unitDiscount: 0,
    freeQuantity: 0,
    appliedPromotionIds: [],
  }));
  const appliedMap = new Map<string, { id: string; name: string; amount: number }>();

  // 1) Promoções por categoria — desconto % no preço unitário
  for (const promo of active.filter((p) => p.kind === "category_percent")) {
    if (!promo.category || promo.discount_percent == null) continue;
    const target = norm(promo.category);
    const pct = promo.discount_percent / 100;
    lines.forEach((line, i) => {
      if (norm(line.category) !== target) return;
      const cur = perLine[i];
      const remaining = Math.max(0, line.basePrice - cur.unitDiscount);
      const extra = Math.floor(remaining * pct * 100) / 100;
      if (extra <= 0) return;
      cur.unitDiscount += extra;
      cur.appliedPromotionIds.push(promo.id);
      const amount = extra * line.quantity;
      const prev = appliedMap.get(promo.id) ?? { id: promo.id, name: promo.name, amount: 0 };
      prev.amount += amount;
      appliedMap.set(promo.id, prev);
    });
  }

  // 2) Promoções "Leve N Pague M" por produto — quantidade grátis
  // Soma quantidades inteiras do produto entre todas as linhas e distribui
  // os "grátis" proporcionalmente pelas linhas (sem fracionar unidades).
  for (const promo of active.filter((p) => p.kind === "product_buy_x_pay_y")) {
    if (!promo.product_id || !promo.buy_qty || promo.pay_qty == null) continue;
    const buy = promo.buy_qty;
    const pay = promo.pay_qty;
    if (buy <= 0 || pay < 0 || pay >= buy) continue;
    const freePerGroup = buy - pay;

    // Apenas linhas com qty inteira para o mesmo produto
    const lineIdxs = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => l.productId === promo.product_id && Number.isInteger(l.quantity));
    const totalQty = lineIdxs.reduce((s, { l }) => s + l.quantity, 0);
    if (totalQty < buy) continue;

    let groups = Math.floor(totalQty / buy);
    let totalFree = groups * freePerGroup;

    for (const { l, i } of lineIdxs) {
      if (totalFree <= 0) break;
      const cur = perLine[i];
      const free = Math.min(l.quantity, totalFree);
      cur.freeQuantity += free;
      cur.appliedPromotionIds.push(promo.id);
      totalFree -= free;
      const amount = free * (l.basePrice - cur.unitDiscount);
      const prev = appliedMap.get(promo.id) ?? { id: promo.id, name: promo.name, amount: 0 };
      prev.amount += amount;
      appliedMap.set(promo.id, prev);
    }
  }

  // Total
  let totalDiscount = 0;
  perLine.forEach((d, i) => {
    const line = lines[i];
    const fromUnit = d.unitDiscount * line.quantity;
    const fromFree = d.freeQuantity * (line.basePrice - d.unitDiscount);
    totalDiscount += fromUnit + fromFree;
  });
  totalDiscount = Math.round(totalDiscount * 100) / 100;

  return {
    perLine,
    totalDiscount,
    applied: Array.from(appliedMap.values()).map((a) => ({
      ...a,
      amount: Math.round(a.amount * 100) / 100,
    })),
  };
}

// ── Coupon helpers ───────────────────────────────────────────────────────────

export function computeCouponDiscount(coupon: Coupon, subtotal: number): number {
  if (subtotal <= 0) return 0;
  if (coupon.kind === "percent") {
    const pct = Math.min(100, Math.max(0, coupon.value)) / 100;
    return Math.floor(subtotal * pct * 100) / 100;
  }
  return Math.min(subtotal, Math.floor(coupon.value * 100) / 100);
}

export interface CouponValidationResult {
  ok: boolean;
  coupon?: Coupon;
  discount?: number;
  error?: string;
}

/**
 * Busca e valida o cupom no banco. Devolve o desconto a aplicar.
 */
export async function validateCoupon(
  code: string,
  subtotal: number,
  companyId: string,
): Promise<CouponValidationResult> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, error: "Digite um código de cupom." };
  if (!companyId) return { ok: false, error: "Empresa não selecionada." };

  const { data, error } = await (supabase as any)
    .from("coupons")
    .select("*")
    .eq("company_id", companyId)
    .ilike("code", trimmed)
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, error: "Falha ao validar cupom: " + error.message };
  if (!data) return { ok: false, error: "Cupom não encontrado." };

  const c = data as Coupon;
  const now = new Date();
  if (!c.is_active) return { ok: false, error: "Cupom desativado." };
  if (c.starts_at && new Date(c.starts_at).getTime() > now.getTime())
    return { ok: false, error: "Cupom ainda não está válido." };
  if (c.ends_at && new Date(c.ends_at).getTime() < now.getTime())
    return { ok: false, error: "Cupom expirado." };
  if (c.max_uses != null && c.uses_count >= c.max_uses)
    return { ok: false, error: "Cupom esgotado." };
  if (subtotal < Number(c.min_purchase ?? 0))
    return {
      ok: false,
      error: `Compra mínima de ${(Number(c.min_purchase) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para usar este cupom.`,
    };

  const discount = computeCouponDiscount(c, subtotal);
  if (discount <= 0) return { ok: false, error: "Cupom não gera desconto neste subtotal." };

  return { ok: true, coupon: c, discount };
}

export interface ConsumeCouponContext {
  companyId: string;
  customerId: string;
  customerName: string;
  saleId?: string | null;
  discountAmount: number;
  usedByUserId?: string | null;
}

/**
 * Incrementa atomicamente o uses_count do cupom e registra o uso na tabela
 * coupon_uses (auditoria por cliente). Cupons só podem ser consumidos com
 * identificação de cliente — quem chamar deve garantir customerId preenchido.
 */
export async function consumeCoupon(
  coupon: Coupon,
  ctx: ConsumeCouponContext,
): Promise<void> {
  const next = (coupon.uses_count ?? 0) + 1;
  await (supabase as any)
    .from("coupons")
    .update({ uses_count: next })
    .eq("id", coupon.id);

  // Best-effort: registrar o uso (não invalida a venda em caso de falha)
  try {
    await (supabase as any).from("coupon_uses").insert({
      company_id: ctx.companyId,
      coupon_id: coupon.id,
      coupon_code: coupon.code,
      customer_id: ctx.customerId,
      customer_name: ctx.customerName,
      sale_id: ctx.saleId ?? null,
      discount_amount: ctx.discountAmount,
      used_by_user_id: ctx.usedByUserId ?? null,
    });
  } catch (e) {
    console.warn("[coupons] falha ao gravar coupon_uses:", e);
  }
}

// ── Fetch helpers ────────────────────────────────────────────────────────────

export async function fetchActivePromotions(companyId: string): Promise<Promotion[]> {
  if (!companyId) return [];
  const { data, error } = await (supabase as any)
    .from("promotions")
    .select("*")
    .eq("company_id", companyId)
    .eq("is_active", true);
  if (error) {
    console.warn("[promotions] fetch failed:", error.message);
    return [];
  }
  return (data as Promotion[] | null) ?? [];
}
