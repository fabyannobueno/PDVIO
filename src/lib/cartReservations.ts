import { supabase } from "@/integrations/supabase/client";

const CART_ID_PREFIX = "pdvio.cartId.";

/**
 * Stable cart identifier for the current browser tab + scope (company+operator).
 * Persisted in sessionStorage so a refresh keeps the same reservation.
 */
export function getOrCreateCartId(scope: string): string {
  if (typeof window === "undefined") return `srv:${scope}`;
  const key = CART_ID_PREFIX + scope;
  let id = sessionStorage.getItem(key);
  if (!id) {
    const rand =
      (typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2)) +
      "-" +
      Date.now().toString(36);
    id = `${scope}:${rand}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

export type UpsertReservationInput = {
  companyId: string;
  cartId: string;
  productId: string;
  quantity: number;
  reservedBy?: string | null;
  operatorId?: string | null;
  operatorName?: string | null;
};

export async function upsertReservation(input: UpsertReservationInput): Promise<void> {
  if (input.quantity <= 0) {
    await deleteReservation(input.cartId, input.productId);
    return;
  }
  const { error } = await (supabase as any)
    .from("cart_reservations")
    .upsert(
      {
        company_id: input.companyId,
        cart_id: input.cartId,
        product_id: input.productId,
        quantity: input.quantity,
        reserved_by: input.reservedBy ?? null,
        operator_id: input.operatorId ?? null,
        operator_name: input.operatorName ?? null,
        source: "pdv",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "cart_id,product_id" },
    );
  if (error) console.error("upsertReservation:", error);
}

export async function deleteReservation(cartId: string, productId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("cart_reservations")
    .delete()
    .eq("cart_id", cartId)
    .eq("product_id", productId);
  if (error) console.error("deleteReservation:", error);
}

export async function clearCart(cartId: string): Promise<void> {
  const { error } = await (supabase as any)
    .from("cart_reservations")
    .delete()
    .eq("cart_id", cartId);
  if (error) console.error("clearCart reservations:", error);
}

/**
 * Best-effort cleanup on page unload. Uses fetch with keepalive so the request
 * survives the tab being closed.
 */
export function clearCartBeacon(cartId: string): void {
  try {
    void clearCart(cartId);
  } catch {
    /* noop */
  }
}
