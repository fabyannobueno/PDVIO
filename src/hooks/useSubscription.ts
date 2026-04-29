import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import type { PlanRow, SubscriptionRow, InvoiceRow } from "@/lib/plans";

export interface ActiveSubscription {
  subscription: SubscriptionRow | null;
  plan: PlanRow | null;
}

/** Carrega assinatura ativa (ou pendente) da empresa atual + dados do plano. */
export function useActiveSubscription() {
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;

  return useQuery<ActiveSubscription>({
    queryKey: ["/billing/active-subscription", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data: sub, error } = await (supabase as any)
        .from("subscriptions")
        .select("*")
        .eq("company_id", cid)
        .in("status", ["active", "pending", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!sub) return { subscription: null, plan: null };

      const { data: plan } = await (supabase as any)
        .from("plans")
        .select("*")
        .eq("id", sub.plan_id)
        .maybeSingle();

      return { subscription: sub as SubscriptionRow, plan: (plan as PlanRow) ?? null };
    },
  });
}

/** Faturas da empresa atual ordenadas por mais recente. */
export function useInvoices() {
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;

  return useQuery<InvoiceRow[]>({
    queryKey: ["/billing/invoices", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("invoices")
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });
}

/** Lista todos os planos ativos do catálogo. */
export function usePlans() {
  return useQuery<PlanRow[]>({
    queryKey: ["/billing/plans"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("plans")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlanRow[];
    },
  });
}

/** Próxima fatura pendente (mais próxima do vencimento). */
export function useUpcomingInvoice() {
  const { data: invoices = [] } = useInvoices();
  const pending = invoices.filter((i) => i.status === "pending");
  if (pending.length === 0) return null;
  return pending.sort(
    (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
  )[0];
}
