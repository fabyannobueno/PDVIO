import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Bike,
  Package,
  Clock,
  CheckCircle2,
  XCircle,
  ChefHat,
  Printer,
  Phone,
  MapPin,
  CreditCard,
  Banknote,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Loader2,
  User,
  StickyNote,
  Truck,
  Star,
  Bell,
} from "lucide-react";
import { printReceipt, getSettings as getPrinterSettings, formatSaleNumber } from "@/lib/printer";
import type { Receipt } from "@/lib/printer";
import notificationSoundUrl from "@assets/notification-pdvio_1776868318337.mp3";

// ── Types ─────────────────────────────────────────────────────────────────────

type DeliveryStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "cancelled"
  | "out_for_delivery"
  | "delivered"
  | "ready_for_pickup"
  | "picked_up";

type DeliveryType = "delivery" | "pickup";

interface OrderItem {
  name: string;
  quantity: number;
  price: number;
  subtotal?: number;
  is_prepared?: boolean;
  addons?: { name: string; price: number }[];
  notes?: string;
}

interface DeliveryOrder {
  id: string;
  numeric_id: number;
  company_id: string;
  customer_name: string;
  customer_phone: string;
  address: string | null;
  delivery_type: DeliveryType;
  items: OrderItem[];
  subtotal: number;
  delivery_fee: number;
  total: number;
  payment_method: string;
  notes: string | null;
  status: DeliveryStatus;
  created_at: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<DeliveryStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending:           { label: "Pendente",          color: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",    icon: Clock },
  confirmed:         { label: "Confirmado",         color: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30",           icon: CheckCircle2 },
  preparing:         { label: "Preparando",         color: "bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30",   icon: ChefHat },
  out_for_delivery:  { label: "Saiu p/ entrega",    color: "bg-purple-500/15 text-purple-700 dark:text-purple-400 border-purple-500/30",   icon: Truck },
  delivered:         { label: "Entregue",           color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",       icon: CheckCircle2 },
  ready_for_pickup:  { label: "Pronto p/ retirada", color: "bg-teal-500/15 text-teal-700 dark:text-teal-400 border-teal-500/30",           icon: Package },
  picked_up:         { label: "Retirado",           color: "bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30",       icon: CheckCircle2 },
  cancelled:         { label: "Cancelado",          color: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-500/30",               icon: XCircle },
};

const NEXT_STATUS: Partial<Record<DeliveryStatus, { delivery: DeliveryStatus; pickup: DeliveryStatus; label: string }>> = {
  pending:          { delivery: "confirmed",        pickup: "confirmed",        label: "Confirmar" },
  confirmed:        { delivery: "preparing",        pickup: "preparing",        label: "Iniciar preparo" },
  preparing:        { delivery: "out_for_delivery", pickup: "ready_for_pickup", label: "Pronto" },
  out_for_delivery: { delivery: "delivered",        pickup: "delivered",        label: "Entregue" },
  ready_for_pickup: { delivery: "picked_up",        pickup: "picked_up",        label: "Retirado" },
};

const PAYMENT_ICONS: Record<string, React.ElementType> = {
  pix: QrCode,
  cash: Banknote,
  credit_card: CreditCard,
  debit_card: CreditCard,
};

const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "active",            label: "Ativos" },
  { value: "all",               label: "Todos" },
  { value: "pending",           label: "Pendentes" },
  { value: "confirmed",         label: "Confirmados" },
  { value: "preparing",         label: "Preparando" },
  { value: "out_for_delivery",  label: "Em entrega" },
  { value: "ready_for_pickup",  label: "Pronto p/ retirada" },
  { value: "delivered",         label: "Entregues" },
  { value: "picked_up",         label: "Retirados" },
  { value: "cancelled",         label: "Cancelados" },
];

const ACTIVE_STATUSES: DeliveryStatus[] = ["pending", "confirmed", "preparing", "out_for_delivery", "ready_for_pickup"];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return `Hoje, ${fmtTime(iso)}`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) + " " + fmtTime(iso);
}

function paymentLabel(method: string) {
  const map: Record<string, string> = {
    pix: "PIX",
    cash: "Dinheiro",
    credit_card: "Cartão de crédito",
    debit_card: "Cartão de débito",
    ticket: "Ticket",
    other: "Outro",
  };
  return map[method] ?? method;
}

function hasKitchenItems(items: OrderItem[]) {
  return items.some((i) => i.is_prepared === true);
}

function parseItems(raw: unknown): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as OrderItem[];
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: DeliveryStatus }) {
  const cfg = STATUS_CONFIG[status];
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${cfg.color}`}>
      <Icon className="h-3 w-3" />
      {cfg.label}
    </span>
  );
}

function PaymentBadge({ method }: { method: string }) {
  const Icon = PAYMENT_ICONS[method] ?? CreditCard;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Icon className="h-3 w-3" />
      {paymentLabel(method)}
    </span>
  );
}

// ── Order Card ────────────────────────────────────────────────────────────────

interface OrderCardProps {
  order: DeliveryOrder;
  onOpen: (order: DeliveryOrder) => void;
  onAdvance: (order: DeliveryOrder) => void;
  onCancel: (order: DeliveryOrder) => void;
  advancing: boolean;
}

function OrderCard({ order, onOpen, onAdvance, onCancel, advancing }: OrderCardProps) {
  const next = NEXT_STATUS[order.status];
  const isFinished = order.status === "delivered" || order.status === "picked_up" || order.status === "cancelled";
  const kitchen = hasKitchenItems(order.items);
  const Icon = order.delivery_type === "delivery" ? Bike : ShoppingBag;

  return (
    <div
      className={`relative rounded-xl border bg-card p-4 flex flex-col gap-3 cursor-pointer hover:border-primary/50 transition-colors ${order.status === "pending" ? "border-yellow-500/60 shadow-sm shadow-yellow-500/10" : ""}`}
      onClick={() => onOpen(order)}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="font-semibold text-sm truncate">{order.customer_name}</span>
          {kitchen && (
            <span title="Tem itens de cozinha" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-orange-500/15 text-orange-600 dark:text-orange-400 border border-orange-500/30 text-[10px] font-medium">
              <ChefHat className="h-2.5 w-2.5" /> Cozinha
            </span>
          )}
        </div>
        <StatusBadge status={order.status} />
      </div>

      {/* Info row */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="font-mono font-medium text-foreground">#{order.numeric_id}</span>
        <PaymentBadge method={order.payment_method} />
        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtDate(order.created_at)}</span>
        {order.address && (
          <span className="flex items-center gap-1 truncate max-w-[200px]"><MapPin className="h-3 w-3 shrink-0" />{order.address}</span>
        )}
      </div>

      {/* Items preview */}
      <div className="text-xs text-muted-foreground line-clamp-2">
        {order.items.map((it, i) => `${it.quantity}x ${it.name}`).join(" · ")}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="font-bold text-sm">{fmtMoney(order.total)}</span>
        {!isFinished && (
          <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
            {next && (
              <Button
                size="sm"
                className="h-7 text-xs px-3"
                disabled={advancing}
                onClick={() => onAdvance(order)}
              >
                {advancing ? <Loader2 className="h-3 w-3 animate-spin" /> : next.label}
              </Button>
            )}
            {order.status !== "cancelled" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs px-2 text-destructive hover:text-destructive"
                disabled={advancing}
                onClick={() => onCancel(order)}
              >
                Cancelar
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Order Detail Dialog ───────────────────────────────────────────────────────

interface OrderDetailProps {
  order: DeliveryOrder | null;
  onClose: () => void;
  onAdvance: (order: DeliveryOrder) => void;
  onCancel: (order: DeliveryOrder) => void;
  onPrintReceipt: (order: DeliveryOrder) => void;
  onPrintKitchen: (order: DeliveryOrder) => void;
  advancing: boolean;
  printing: boolean;
  companyName?: string;
  companyPhone?: string;
  companyAddress?: string;
}

function OrderDetailDialog({
  order,
  onClose,
  onAdvance,
  onCancel,
  onPrintReceipt,
  onPrintKitchen,
  advancing,
  printing,
  companyName,
}: OrderDetailProps) {
  if (!order) return null;

  const next = NEXT_STATUS[order.status];
  const isFinished = order.status === "delivered" || order.status === "picked_up" || order.status === "cancelled";
  const kitchen = hasKitchenItems(order.items);
  const kitchenItems = order.items.filter((i) => i.is_prepared === true);
  const TypeIcon = order.delivery_type === "delivery" ? Bike : ShoppingBag;

  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TypeIcon className="h-4 w-4" />
            Pedido #{order.numeric_id}
            <StatusBadge status={order.status} />
          </DialogTitle>
          <DialogDescription>{fmtDate(order.created_at)}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-4 pr-2">
            {/* Customer */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
              <div className="flex items-center gap-2 font-medium">
                <User className="h-4 w-4 text-muted-foreground" />
                {order.customer_name}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Phone className="h-4 w-4" />
                {order.customer_phone}
              </div>
              {order.address && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5 shrink-0" />
                  {order.address}
                </div>
              )}
              <div className="flex items-center gap-2 text-muted-foreground">
                <PaymentBadge method={order.payment_method} />
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Itens</p>
              {order.items.map((item, i) => (
                <div key={i} className={`rounded-lg border p-3 space-y-1 text-sm ${item.is_prepared ? "border-orange-500/40 bg-orange-500/5" : ""}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {item.is_prepared && <ChefHat className="h-3.5 w-3.5 text-orange-500 shrink-0" />}
                      <span className="font-medium">{item.quantity}x {item.name}</span>
                    </div>
                    <span className="text-muted-foreground shrink-0">{fmtMoney((item.subtotal ?? item.price * item.quantity))}</span>
                  </div>
                  {item.addons && item.addons.length > 0 && (
                    <div className="pl-5 space-y-0.5 text-xs text-muted-foreground">
                      {item.addons.map((a, j) => (
                        <div key={j} className="flex justify-between">
                          <span>+ {a.name}</span>
                          <span>{fmtMoney(a.price)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.notes && (
                    <div className="pl-5 text-xs text-muted-foreground italic">"{item.notes}"</div>
                  )}
                </div>
              ))}
            </div>

            {/* Notes */}
            {order.notes && (
              <div className="rounded-lg border p-3 text-sm flex items-start gap-2 text-muted-foreground">
                <StickyNote className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="italic">"{order.notes}"</span>
              </div>
            )}

            {/* Totals */}
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{fmtMoney(order.subtotal)}</span>
              </div>
              {order.delivery_fee > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Taxa de entrega</span>
                  <span>{fmtMoney(order.delivery_fee)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{fmtMoney(order.total)}</span>
              </div>
            </div>
          </div>
        </ScrollArea>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={printing}
            onClick={() => onPrintReceipt(order)}
          >
            {printing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
            Cupom
          </Button>

          {kitchen && kitchenItems.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 border-orange-500/40 text-orange-600 dark:text-orange-400 hover:bg-orange-500/10"
              disabled={printing}
              onClick={() => onPrintKitchen(order)}
            >
              <ChefHat className="h-3.5 w-3.5" />
              Cozinha
            </Button>
          )}

          {!isFinished && (
            <>
              {next && (
                <Button
                  size="sm"
                  className="gap-1.5 ml-auto"
                  disabled={advancing}
                  onClick={() => onAdvance(order)}
                >
                  {advancing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  {next.label}
                </Button>
              )}
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                disabled={advancing}
                onClick={() => onCancel(order)}
              >
                <XCircle className="h-3.5 w-3.5" />
                Cancelar
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Delivery() {
  const { activeCompany } = useCompany();
  const qc = useQueryClient();
  const cid = activeCompany?.id;

  const [statusFilter, setStatusFilter] = useState("active");
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: orders = [], isLoading } = useQuery<DeliveryOrder[]>({
    queryKey: ["/delivery-orders", cid, statusFilter],
    enabled: !!cid,
    queryFn: async () => {
      let q = supabase
        .from("delivery_orders")
        .select("*")
        .eq("company_id", cid!)
        .order("created_at", { ascending: false });

      if (statusFilter === "active") {
        q = q.in("status", ACTIVE_STATUSES);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter as DeliveryStatus);
      }

      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        ...r,
        items: parseItems(r.items),
      })) as DeliveryOrder[];
    },
  });

  // ── Realtime ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!cid) return;

    const channel = supabase
      .channel(`delivery-orders-${cid}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "delivery_orders", filter: `company_id=eq.${cid}` },
        (payload) => {
          qc.invalidateQueries({ queryKey: ["/delivery-orders", cid] });

          if (payload.eventType === "INSERT") {
            const newOrder = payload.new as DeliveryOrder;
            if (!firstLoad.current && !knownIds.current.has(newOrder.id)) {
              knownIds.current.add(newOrder.id);
              audioRef.current?.play().catch(() => {});
              toast.info(`Novo pedido #${newOrder.numeric_id} — ${newOrder.customer_name}`, {
                description: `${newOrder.delivery_type === "delivery" ? "Delivery" : "Retirada"} · ${fmtMoney(newOrder.total)}`,
                duration: 6000,
              });
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [cid, qc]);

  // Mark known IDs on first load
  useEffect(() => {
    if (orders.length > 0 && firstLoad.current) {
      orders.forEach((o) => knownIds.current.add(o.id));
      firstLoad.current = false;
    }
  }, [orders]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: DeliveryStatus }) => {
      const { error } = await supabase
        .from("delivery_orders")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/delivery-orders", cid] });
      if (selectedOrder) {
        setSelectedOrder((prev) => prev ? { ...prev, status: advancingId ? prev.status : prev.status } : null);
      }
    },
    onError: () => toast.error("Erro ao atualizar status do pedido"),
    onSettled: () => setAdvancingId(null),
  });

  const handleAdvance = useCallback((order: DeliveryOrder) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    const newStatus = order.delivery_type === "delivery" ? next.delivery : next.pickup;
    setAdvancingId(order.id);
    updateStatus.mutate({ id: order.id, status: newStatus }, {
      onSuccess: () => {
        setSelectedOrder((prev) => prev?.id === order.id ? { ...prev, status: newStatus } : prev);
        toast.success(`Pedido #${order.numeric_id} → ${STATUS_CONFIG[newStatus].label}`);
      },
    });
  }, [updateStatus]);

  const handleCancel = useCallback((order: DeliveryOrder) => {
    setAdvancingId(order.id);
    updateStatus.mutate({ id: order.id, status: "cancelled" }, {
      onSuccess: () => {
        setSelectedOrder((prev) => prev?.id === order.id ? { ...prev, status: "cancelled" } : prev);
        toast.success(`Pedido #${order.numeric_id} cancelado`);
      },
    });
  }, [updateStatus]);

  // ── Print ──────────────────────────────────────────────────────────────────

  const handlePrintReceipt = useCallback(async (order: DeliveryOrder) => {
    setPrinting(true);
    try {
      const settings = getPrinterSettings();
      const receipt: Receipt = {
        title: order.delivery_type === "delivery" ? "PEDIDO DELIVERY" : "PEDIDO RETIRADA",
        saleNumber: String(order.numeric_id).padStart(6, "0"),
        companyName: activeCompany?.name,
        items: order.items.map((it) => ({
          name: it.name,
          qty: it.quantity,
          price: it.price,
          unit: "un",
        })),
        subtotal: order.subtotal,
        total: order.total,
        payment: paymentLabel(order.payment_method),
        date: new Date(order.created_at),
      };
      await printReceipt(receipt, settings);
    } catch {
      toast.error("Erro ao imprimir cupom");
    } finally {
      setPrinting(false);
    }
  }, [activeCompany]);

  const handlePrintKitchen = useCallback(async (order: DeliveryOrder) => {
    setPrinting(true);
    try {
      const settings = getPrinterSettings();
      const kitchenItems = order.items.filter((i) => i.is_prepared === true);
      const receipt: Receipt = {
        title: `COZINHA — ${order.delivery_type === "delivery" ? "DELIVERY" : "RETIRADA"}`,
        saleNumber: String(order.numeric_id).padStart(6, "0"),
        items: kitchenItems.map((it) => ({
          name: it.notes ? `${it.name} (${it.notes})` : it.name,
          qty: it.quantity,
          price: it.price,
          unit: "un",
        })),
        total: kitchenItems.reduce((s, i) => s + (i.subtotal ?? i.price * i.quantity), 0),
        date: new Date(order.created_at),
      };
      await printReceipt(receipt, settings);
    } catch {
      toast.error("Erro ao imprimir comanda de cozinha");
    } finally {
      setPrinting(false);
    }
  }, []);

  // ── Counts for header ──────────────────────────────────────────────────────

  const pendingCount = useMemo(
    () => orders.filter((o) => o.status === "pending").length,
    [orders]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <audio ref={audioRef} src={notificationSoundUrl} preload="auto" />

      {/* Header */}
      <div className="flex items-center justify-between gap-4 px-6 py-4 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Bike className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold">Pedidos de Delivery</h1>
          {pendingCount > 0 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500 text-white text-xs font-bold animate-pulse">
              <Bell className="h-3 w-3" />
              {pendingCount} novo{pendingCount > 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => qc.invalidateQueries({ queryKey: ["/delivery-orders", cid] })}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 sm:p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 rounded-xl" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
              <div className="rounded-full bg-muted p-6">
                <Bike className="h-10 w-10 text-muted-foreground" />
              </div>
              <div>
                <p className="text-lg font-semibold">Nenhum pedido encontrado</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {statusFilter === "active"
                    ? "Não há pedidos ativos no momento. Os novos pedidos aparecerão aqui automaticamente."
                    : "Nenhum pedido encontrado para o filtro selecionado."}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onOpen={setSelectedOrder}
                  onAdvance={handleAdvance}
                  onCancel={handleCancel}
                  advancing={advancingId === order.id}
                />
              ))}
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Detail Dialog */}
      <OrderDetailDialog
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onAdvance={handleAdvance}
        onCancel={handleCancel}
        onPrintReceipt={handlePrintReceipt}
        onPrintKitchen={handlePrintKitchen}
        advancing={advancingId === selectedOrder?.id}
        printing={printing}
        companyName={activeCompany?.name}
      />
    </div>
  );
}
