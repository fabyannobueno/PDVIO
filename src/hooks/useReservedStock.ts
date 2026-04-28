import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Options = {
  companyId: string | null | undefined;
  /** Don't count reservations from this PDV cart_id (the current operator). */
  excludeCartId?: string | null;
  /** Don't count items from this open comanda (the one being edited). */
  excludeComandaId?: string | null;
};

type CartRow = { product_id: string; quantity: number; cart_id: string };
type ComandaItemRow = {
  product_id: string | null;
  quantity: number;
  comanda: { id: string; status: string; company_id: string } | null;
};

/**
 * Returns a Map<productId, totalReservedByOthers> combining:
 *  - PDV cart_reservations from carts other than `excludeCartId`
 *  - Open-comanda items from comandas other than `excludeComandaId`
 *
 * Refreshes in real time via Postgres Changes subscriptions on both tables.
 */
export function useReservedStock(opts: Options): {
  reserved: Map<string, number>;
  isLoading: boolean;
} {
  const { companyId, excludeCartId = null, excludeComandaId = null } = opts;
  const qc = useQueryClient();

  const cartsQ = useQuery<CartRow[]>({
    queryKey: ["/api/cart_reservations", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cart_reservations")
        .select("product_id, quantity, cart_id")
        .eq("company_id", companyId);
      if (error) throw error;
      return (data ?? []) as CartRow[];
    },
  });

  const comandasQ = useQuery<ComandaItemRow[]>({
    queryKey: ["/api/comanda_items_open", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("comanda_items")
        .select("product_id, quantity, comanda:comandas!inner(id, status, company_id)")
        .eq("comanda.status", "open")
        .eq("comanda.company_id", companyId);
      if (error) throw error;
      return (data ?? []) as ComandaItemRow[];
    },
  });

  // Realtime
  useEffect(() => {
    if (!companyId) return;
    // Note: no `filter` on cart_reservations — UPDATE/DELETE events without
    // REPLICA IDENTITY FULL would otherwise be silently dropped. RLS already
    // scopes which rows the client receives.
    const channel = supabase
      .channel(`reserved-stock-${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart_reservations" },
        () => {
          qc.invalidateQueries({ queryKey: ["/api/cart_reservations", companyId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comanda_items" },
        () => {
          qc.invalidateQueries({ queryKey: ["/api/comanda_items_open", companyId] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "comandas" },
        () => {
          qc.invalidateQueries({ queryKey: ["/api/comanda_items_open", companyId] });
        },
      )
      .subscribe();

    // Lightweight polling fallback in case the websocket misses an event
    // (some networks/proxies break long-lived ws connections).
    const interval = window.setInterval(() => {
      qc.invalidateQueries({ queryKey: ["/api/cart_reservations", companyId] });
      qc.invalidateQueries({ queryKey: ["/api/comanda_items_open", companyId] });
    }, 8000);

    // Periodically purge reservations older than 30 minutes that were never
    // converted to a sale. Runs once on mount and then every minute while the
    // hook is active. Safe to call concurrently from multiple clients.
    const runCleanup = () => {
      void (supabase as any).rpc("cleanup_stale_cart_reservations").then(() => {
        qc.invalidateQueries({ queryKey: ["/api/cart_reservations", companyId] });
      });
    };
    runCleanup();
    const cleanupInterval = window.setInterval(runCleanup, 60_000);

    return () => {
      window.clearInterval(interval);
      window.clearInterval(cleanupInterval);
      supabase.removeChannel(channel);
    };
  }, [companyId, qc]);

  const reserved = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of cartsQ.data ?? []) {
      if (!r.product_id) continue;
      if (excludeCartId && r.cart_id === excludeCartId) continue;
      map.set(r.product_id, (map.get(r.product_id) ?? 0) + Number(r.quantity || 0));
    }
    for (const r of comandasQ.data ?? []) {
      const c = r.comanda;
      if (!r.product_id || !c) continue;
      if (c.status !== "open") continue;
      if (excludeComandaId && c.id === excludeComandaId) continue;
      map.set(r.product_id, (map.get(r.product_id) ?? 0) + Number(r.quantity || 0));
    }
    return map;
  }, [cartsQ.data, comandasQ.data, excludeCartId, excludeComandaId]);

  return { reserved, isLoading: cartsQ.isLoading || comandasQ.isLoading };
}
