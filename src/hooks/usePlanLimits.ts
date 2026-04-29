import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useActiveSubscription } from "./useSubscription";
import { isUnlimited } from "@/lib/plans";

interface Usage {
  products: number;
  users: number;
}

export interface PlanLimitsInfo {
  loading: boolean;
  hasActivePlan: boolean;
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
  productsLeft: number | null;
  usersLeft: number | null;
}

export function usePlanLimits(): PlanLimitsInfo {
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;
  const { data: active, isLoading: loadingSub } = useActiveSubscription();

  const { data: usage = { products: 0, users: 0 }, isLoading: loadingUsage } = useQuery<Usage>({
    queryKey: ["/billing/usage", cid],
    enabled: !!cid,
    queryFn: async () => {
      const [{ count: pCount }, { count: uCount }] = await Promise.all([
        (supabase as any)
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("company_id", cid),
        (supabase as any)
          .from("company_members")
          .select("*", { count: "exact", head: true })
          .eq("company_id", cid),
      ]);
      return { products: pCount ?? 0, users: uCount ?? 0 };
    },
  });

  return useMemo<PlanLimitsInfo>(() => {
    const plan = active?.plan ?? null;
    const sub = active?.subscription ?? null;
    const isActive = sub?.status === "active";

    const limits = {
      products: plan?.max_products ?? null,
      users: plan?.max_users ?? null,
      cashiers: plan?.max_cashiers ?? null,
      stores: plan?.max_stores ?? null,
    };

    const productsLeft = isUnlimited(limits.products)
      ? null
      : Math.max(0, (limits.products as number) - usage.products);
    const usersLeft = isUnlimited(limits.users)
      ? null
      : Math.max(0, (limits.users as number) - usage.users);

    return {
      loading: loadingSub || loadingUsage,
      hasActivePlan: !!isActive,
      planId: plan?.id ?? null,
      planName: plan?.name ?? null,
      limits,
      usage,
      features: plan?.feature_flags ?? {},
      canAddProduct: isUnlimited(limits.products) || usage.products < (limits.products as number),
      canAddUser: isUnlimited(limits.users) || usage.users < (limits.users as number),
      productsLeft,
      usersLeft,
    };
  }, [active, usage, loadingSub, loadingUsage]);
}
