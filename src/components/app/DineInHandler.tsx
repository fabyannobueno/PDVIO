/**
 * Handler global para pedidos "Comer aqui" (dine_in) do cardápio digital.
 * Montado no AppLayout — ativo independente de qual página o operador estiver.
 *
 * Fluxo ao receber um INSERT de delivery_type='dine_in':
 *  1. Busca comanda aberta da mesa
 *  2. Se não existir → cria automaticamente com o nome do cliente
 *  3. Injeta os itens em comanda_items
 *  4. Vincula delivery_order.comanda_id e seta status='confirmed'
 *  5. Toca sino + mostra toast + envia WhatsApp se configurado
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { playWaiterCallSound } from "@/lib/pdvio-sound";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

interface DineInItem {
  name: string;
  unit?: string;
  price: number;
  quantity: number;
  productId?: string | null;
  totalPrice?: number;
  subtotal?: number;
  notes?: string;
  selectedAddons?: { name: string; price: number }[];
  addons?: { name: string; price: number }[];
}

interface DineInOrder {
  id: string;
  delivery_type: string;
  table_identifier: string | null;
  comanda_id?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  items: DineInItem[];
  total: number;
}

export function DineInHandler() {
  const { activeCompany } = useCompany();
  const qc = useQueryClient();
  const cid = activeCompany?.id;

  useEffect(() => {
    if (!cid) return;

    // Load W-API credentials once
    let wapiCreds: { instanceId: string; token: string } | null = null;
    supabase
      .from("companies")
      .select("wapi_instance_id, wapi_token")
      .eq("id", cid)
      .single()
      .then(({ data }) => {
        if (data?.wapi_instance_id && data?.wapi_token) {
          wapiCreds = { instanceId: data.wapi_instance_id, token: data.wapi_token };
        }
      });

    const channel = supabase
      .channel(`global-dine-in-${cid}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "delivery_orders",
          filter: `company_id=eq.${cid}`,
        },
        async (payload) => {
          const order = payload.new as DineInOrder;
          if (order.delivery_type !== "dine_in") return;
          if (!order.table_identifier) return;

          // 1. Usa comanda_id do payload se o cardápio já enviou (caminho ideal)
          let comanda: { id: string } | null = null;

          if (order.comanda_id) {
            comanda = { id: order.comanda_id };
          } else {
            // Fallback: busca comanda aberta pela mesa
            const { data } = await supabase
              .from("comandas")
              .select("id")
              .eq("company_id", cid)
              .eq("identifier", order.table_identifier)
              .eq("status", "open")
              .maybeSingle();
            comanda = data ?? null;
          }

          // 2. Se não encontrou, cria automaticamente
          if (!comanda) {
            const { data: newComanda, error: createErr } = await supabase
              .from("comandas")
              .insert({
                company_id: cid,
                identifier: order.table_identifier,
                notes: order.customer_name || "Pedido pelo cardápio",
              } as never)
              .select("id")
              .single();

            if (createErr || !newComanda) {
              toast.warning(
                `Mesa ${order.table_identifier}: pedido recebido mas não foi possível abrir a comanda`,
                { duration: 15000 },
              );
              return;
            }
            comanda = newComanda as { id: string };
          }

          // 3. Injeta os itens na comanda
          const itemRows = order.items.map((item) => ({
            comanda_id:   comanda!.id,
            product_id:   item.productId ?? null,
            product_name: item.name,
            quantity:     item.quantity,
            unit_price:   item.price,
            subtotal:     item.totalPrice ?? item.subtotal ?? Math.round(item.price * item.quantity * 100) / 100,
            notes:        item.notes ?? null,
            addons:       item.selectedAddons ?? item.addons ?? [],
          }));

          await supabase.from("comanda_items").insert(itemRows as never);

          // 4. Vincula delivery_order à comanda e confirma
          await (supabase as any)
            .from("delivery_orders")
            .update({ comanda_id: comanda.id, status: "confirmed" })
            .eq("id", order.id);

          // 5. Invalida queries
          qc.invalidateQueries({ queryKey: ["/comanda-items"] });
          qc.invalidateQueries({ queryKey: ["/api/comandas", cid] });
          qc.invalidateQueries({ queryKey: ["/delivery-orders", cid] });
          qc.invalidateQueries({ queryKey: ["/kds-orders", cid] });

          // 6. WhatsApp
          if (wapiCreds && order.customer_phone) {
            const brl = (v: number) =>
              v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
            const itemLines = order.items
              .map((i) => `• ${i.quantity}× ${i.name} — ${brl(i.totalPrice ?? i.price * i.quantity)}`)
              .join("\n");
            const msg = [
              `🍽️ *Pedido recebido — ${order.table_identifier}*`,
              ``,
              itemLines,
              ``,
              `*Total: ${brl(order.total)}*`,
              ``,
              `Seu pedido foi adicionado à comanda. Em breve será confirmado pela loja. 😊`,
            ].join("\n");
            sendWhatsAppMessage(wapiCreds, order.customer_phone, msg).catch(() => {});
          }

          // 7. Sino + toast
          playWaiterCallSound();
          toast.success(
            `🍽️ ${order.table_identifier} — ${order.items.length} item(ns) pelo cardápio`,
            {
              description: `Adicionado à comanda · R$ ${order.total.toFixed(2).replace(".", ",")}`,
              duration: 10000,
            },
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [cid, qc]);

  return null;
}
