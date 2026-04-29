import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";

/**
 * Assina em tempo real as tabelas `subscriptions` e `invoices` da empresa ativa.
 * Quando há qualquer mudança (ex.: pagamento PIX confirmado pelo webhook ou pelo
 * polling de outra aba), invalida as queries de billing — o que reflete imediatamente
 * no Sidebar (cadeados somem) e nas rotas protegidas pelo PlanGuard.
 */
export function useBillingRealtime() {
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!cid) return;

    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ["/billing/active-subscription"] });
      queryClient.invalidateQueries({ queryKey: ["/billing/invoices"] });
    };

    const channel = (supabase as any)
      .channel(`billing:${cid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `company_id=eq.${cid}`,
        },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "invoices",
          filter: `company_id=eq.${cid}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [cid, queryClient]);
}
