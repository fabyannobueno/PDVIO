import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useActiveSubscription } from "./useSubscription";
import { isUnlimited } from "@/lib/plans";
import type { PlanRow } from "@/lib/plans";

/** Plano padrão usado quando a empresa não tem assinatura ativa. */
export const FALLBACK_PLAN_ID = "iniciante";

interface Usage {
  products: number;
  users: number;
  cashiers: number;
  companies: number;
}

export interface PlanLimitsInfo {
  loading: boolean;
  /** Verdadeiro se a assinatura ativa é paga e está em status `active`. */
  hasActivePlan: boolean;
  /** Verdadeiro se estamos usando os limites do plano padrão (Iniciante) por falta de assinatura ativa. */
  isFallback: boolean;
  planId: string | null;
  planName: string | null;
  limits: {
    products: number | null;
    users: number | null;
    cashiers: number | null;
    stores: number | null;
  };
  usage: Usage;
  features: Record<string, boolean>;
  canAddProduct: boolean;
  canAddUser: boolean;
  canAddCashier: boolean;
  canAddCompany: boolean;
  productsLeft: number | null;
  usersLeft: number | null;
  cashiersLeft: number | null;
  companiesLeft: number | null;
}

/** Carrega o plano padrão (Iniciante) usado como fallback. */
function useFallbackPlan() {
  return useQuery<PlanRow | null>({
    queryKey: ["/billing/fallback-plan", FALLBACK_PLAN_ID],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plans")
        .select("*")
        .eq("id", FALLBACK_PLAN_ID)
        .maybeSingle();
      if (error) throw error;
      return (data as PlanRow) ?? null;
    },
  });
}

export function usePlanLimits(): PlanLimitsInfo {
  const { user } = useAuth();
  const { activeCompany, companies } = useCompany();
  const cid = activeCompany?.id;
  const uid = user?.id;
  const { data: active, isLoading: loadingSub } = useActiveSubscription();
  const { data: fallbackPlan, isLoading: loadingFallback } = useFallbackPlan();

  // Conta produtos, usuários (com login) e operadores (cartão+PIN) da empresa ativa.
  const { data: companyUsage = { products: 0, users: 0, cashiers: 0 }, isLoading: loadingUsage } =
    useQuery<{ products: number; users: number; cashiers: number }>({
      queryKey: ["/billing/usage", cid],
      enabled: !!cid,
      queryFn: async () => {
        const [{ count: pCount }, { count: uCount }, { count: sCount }] = await Promise.all([
          (supabase as any)
            .from("products")
            .select("*", { count: "exact", head: true })
            .eq("company_id", cid),
          (supabase as any)
            .from("company_members")
            .select("*", { count: "exact", head: true })
            .eq("company_id", cid),
          (supabase as any)
            .from("staff_members")
            .select("*", { count: "exact", head: true })
            .eq("company_id", cid),
        ]);
        return {
          products: pCount ?? 0,
          users: uCount ?? 0,
          cashiers: sCount ?? 0,
        };
      },
    });

  // Conta empresas (lojas) em que o usuário logado é dono.
  // Usado para limitar a criação de novas empresas.
  const ownedCompaniesCount = useMemo(
    () => companies.filter((c) => c.role === "owner").length,
    [companies]
  );

  return useMemo<PlanLimitsInfo>(() => {
    const sub = active?.subscription ?? null;
    const subPlan = active?.plan ?? null;
    const isActive = sub?.status === "active";

    // Quando não há plano ativo (sem assinatura, expirada, cancelada ou pendente),
    // usa os limites do plano Iniciante como fallback.
    const usingFallback = !isActive;
    const plan: PlanRow | null = usingFallback ? fallbackPlan ?? null : subPlan;

    const limits = {
      products: plan?.max_products ?? null,
      users: plan?.max_users ?? null,
      cashiers: plan?.max_cashiers ?? null,
      stores: plan?.max_stores ?? null,
    };

    const usage: Usage = {
      products: companyUsage.products,
      users: companyUsage.users,
      cashiers: companyUsage.cashiers,
      companies: ownedCompaniesCount,
    };

    const productsLeft = isUnlimited(limits.products)
      ? null
      : Math.max(0, (limits.products as number) - usage.products);
    const usersLeft = isUnlimited(limits.users)
      ? null
      : Math.max(0, (limits.users as number) - usage.users);
    const cashiersLeft = isUnlimited(limits.cashiers)
      ? null
      : Math.max(0, (limits.cashiers as number) - usage.cashiers);
    const companiesLeft = isUnlimited(limits.stores)
      ? null
      : Math.max(0, (limits.stores as number) - usage.companies);

    return {
      loading: loadingSub || loadingUsage || loadingFallback,
      hasActivePlan: !!isActive,
      isFallback: usingFallback,
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      limits,
      usage,
      features: plan?.feature_flags ?? {},
      canAddProduct:
        isUnlimited(limits.products) || usage.products < (limits.products as number),
      canAddUser:
        isUnlimited(limits.users) || usage.users < (limits.users as number),
      canAddCashier:
        isUnlimited(limits.cashiers) || usage.cashiers < (limits.cashiers as number),
      canAddCompany:
        isUnlimited(limits.stores) || usage.companies < (limits.stores as number),
      productsLeft,
      usersLeft,
      cashiersLeft,
      companiesLeft,
    };
  }, [active, fallbackPlan, companyUsage, ownedCompaniesCount, loadingSub, loadingUsage, loadingFallback, uid]);
}
