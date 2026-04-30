import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useActiveSubscription } from "./useSubscription";

/**
 * Quando a assinatura paga já passou do `current_period_end` (cancelada que
 * chegou no fim, ou vencida sem pagamento), chama a RPC que rebaixa para o
 * plano Iniciante. Idempotente — se ainda está dentro do período, a RPC
 * simplesmente não faz nada.
 */
export function useAutoDowngrade() {
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;
  const isOwner = activeCompany?.role === "owner";
  const { data: active } = useActiveSubscription();
  const queryClient = useQueryClient();
  const ranForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!cid || !isOwner) return;
    const sub = active?.subscription;
    if (!sub || sub.plan_id === "iniciante") return;
    if (!sub.current_period_end) return;
    if (new Date(sub.current_period_end).getTime() > Date.now()) return;

    // Evita rodar várias vezes seguidas para o mesmo registro
    if (ranForRef.current === sub.id) return;
    ranForRef.current = sub.id;

    (async () => {
      try {
        await (supabase as any).rpc("downgrade_expired_to_free", {
          _company_id: cid,
        });
        await queryClient.invalidateQueries({
          queryKey: ["/billing/active-subscription"],
        });
      } catch (e) {
        console.warn("[useAutoDowngrade] erro:", e);
      }
    })();
  }, [cid, isOwner, active?.subscription?.id, active?.subscription?.current_period_end, queryClient]);
}
