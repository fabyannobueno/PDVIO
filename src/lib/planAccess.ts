/**
 * Controle de acesso a páginas com base no plano da empresa.
 *
 * Regras:
 * - Quem não tem plano ativo é tratado como `iniciante` (mesmos limites).
 * - As páginas listadas em `INICIANTE_ROUTES` ficam liberadas para todos.
 * - Demais páginas exigem um plano de nível superior conforme `ROUTE_MIN_PLAN`.
 */

import { FALLBACK_PLAN_ID } from "@/hooks/usePlanLimits";

export type PlanId = "iniciante" | "essencial" | "pro" | "empresarial";

/** Hierarquia dos planos. Maior número = mais recursos. */
const PLAN_TIER: Record<string, number> = {
  iniciante: 0,
  essencial: 1,
  pro: 2,
  empresarial: 3,
};

/**
 * Plano mínimo necessário para acessar cada rota. Rotas não listadas aqui
 * são liberadas para qualquer plano (inclusive Iniciante / sem plano).
 */
const ROUTE_MIN_PLAN: Record<string, PlanId> = {
  "/comandas": "essencial",
  "/kds": "pro",
  "/clientes": "essencial",
  "/crediario": "essencial",
  "/financeiro": "essencial",
  "/auditoria": "essencial",
  "/estoque": "essencial",
  "/balanca": "essencial",
  "/fornecedores": "essencial",
  "/contas": "essencial",
  "/promocoes": "essencial",
  "/delivery": "essencial",
};

/** Nomes amigáveis dos planos para mostrar na UI. */
export const PLAN_LABEL: Record<string, string> = {
  iniciante: "Iniciante",
  essencial: "Essencial",
  pro: "Pro",
  empresarial: "Empresarial",
};

function getTier(planId: string | null | undefined): number {
  if (!planId) return PLAN_TIER[FALLBACK_PLAN_ID] ?? 0;
  return PLAN_TIER[planId] ?? 0;
}

/** Retorna o plano mínimo necessário para a rota (ou null se livre para todos). */
export function minPlanForRoute(route: string): PlanId | null {
  // Casa exatamente ou pelo prefixo (`/clientes/123` cai em `/clientes`).
  for (const [base, plan] of Object.entries(ROUTE_MIN_PLAN)) {
    if (route === base || route.startsWith(base + "/")) return plan;
  }
  return null;
}

/** Verifica se o plano atual libera acesso à rota. */
export function isRoutePlanAllowed(
  planId: string | null | undefined,
  route: string
): boolean {
  const required = minPlanForRoute(route);
  if (!required) return true;
  return getTier(planId) >= getTier(required);
}
