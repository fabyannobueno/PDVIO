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
  ChevronLeft,
  ChevronRight,
  Tag,
  Calendar,
} from "lucide-react";
import { printReceipt, getSettings as getPrinterSettings, formatSaleNumber } from "@/lib/printer";
import type { Receipt } from "@/lib/printer";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
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
  unit?: string;
  weight?: number;
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
  discount_amount: number;
  coupon_code: string | null;
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

type DateFilter = "today" | "yesterday" | "last_week" | "custom" | "all";

const DATE_FILTER_OPTIONS: { value: DateFilter; label: string }[] = [
  { value: "today",     label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_week", label: "Última semana" },
  { value: "custom",    label: "Data personalizada" },
  { value: "all",       label: "Todos os dias" },
];

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getDateRange(filter: DateFilter, customDate: string): { gte: string; lte: string } | null {
  if (filter === "all") return null;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (filter === "today") {
    const end = new Date(todayStart); end.setDate(end.getDate() + 1);
    return { gte: todayStart.toISOString(), lte: end.toISOString() };
  }
  if (filter === "yesterday") {
    const start = new Date(todayStart); start.setDate(start.getDate() - 1);
    return { gte: start.toISOString(), lte: todayStart.toISOString() };
  }
  if (filter === "last_week") {
    const start = new Date(todayStart); start.setDate(start.getDate() - 6);
    const end = new Date(todayStart); end.setDate(end.getDate() + 1);
    return { gte: start.toISOString(), lte: end.toISOString() };
  }
  if (filter === "custom" && customDate) {
    const [y, m, d] = customDate.split("-").map(Number);
    const start = new Date(y, m - 1, d);
    const end   = new Date(y, m - 1, d + 1);
    return { gte: start.toISOString(), lte: end.toISOString() };
  }
  return null;
}

// ── WhatsApp message builder ──────────────────────────────────────────────────

function buildWhatsAppMessage(
  order: DeliveryOrder,
  newStatus: DeliveryStatus,
  companyName?: string,
  companyAddress?: string,
): string | null {
  const store = companyName ?? "Nossa loja";
  const orderId = `#${order.numeric_id}`;
  const isDelivery = order.delivery_type === "delivery";

  const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const itemLine = (item: OrderItem): string => {
    let qtyLabel: string;
    if (item.unit === "kg" || (item.weight && item.weight > 0)) {
      const kg = item.weight ?? item.quantity;
      qtyLabel = `${kg.toFixed(3).replace(".", ",")}kg`;
    } else {
      qtyLabel = `${item.quantity}x`;
    }
    const subtotal = item.subtotal ?? item.price * item.quantity;
    return `• ${qtyLabel} ${item.name} — ${brl(subtotal)}`;
  };

  const confirmedLines: string[] = [
    `✅ *${store}*`,
    `Olá, ${order.customer_name}! Seu pedido ${orderId} foi *confirmado*. 😊`,
    ``,
    `📋 *Dados do pedido:*`,
    `👤 ${order.customer_name}`,
    `📱 ${order.customer_phone}`,
    isDelivery
      ? `🚚 *Delivery*${order.address ? ` — ${order.address}` : ""}`
      : `🏪 *Retirada no local*${companyAddress ? ` — ${companyAddress}` : ""}`,
    ``,
    `🛒 *Itens:*`,
    ...order.items.map(itemLine),
    ``,
    `Subtotal: ${brl(order.subtotal)}`,
    ...(isDelivery && order.delivery_fee > 0 ? [`Taxa de entrega: ${brl(order.delivery_fee)}`] : []),
    ...(order.discount_amount > 0
      ? [`🎟️ Desconto${order.coupon_code ? ` (${order.coupon_code})` : ""}: -${brl(order.discount_amount)}`]
      : []),
    `*Total: ${brl(order.total)}*`,
  ];

  const messages: Partial<Record<DeliveryStatus, string>> = {
    confirmed: confirmedLines.join("\n"),
    preparing: `👨‍🍳 *${store}*\nSeu pedido ${orderId} está *sendo preparado* agora! Em breve estará pronto.`,
    out_for_delivery: `🛵 *${store}*\nSeu pedido ${orderId} *saiu para entrega*! Fique atento, o motoboy está a caminho. 📦`,
    ready_for_pickup: [
      `📦 *${store}*`,
      `Seu pedido ${orderId} está *pronto para retirada*! Pode vir buscar quando quiser. 😊`,
      ...(companyAddress ? [``, `📍 *Endereço da loja:* ${companyAddress}`] : []),
    ].join("\n"),
    delivered: `🎉 *${store}*\nSeu pedido ${orderId} foi *entregue*! Obrigado pela preferência. Bom apetite! 🍽️`,
    picked_up: `🎉 *${store}*\nSeu pedido ${orderId} foi *retirado*! Obrigado pela preferência. Bom apetite! 🍽️`,
    cancelled: `❌ *${store}*\nInfelizmente seu pedido ${orderId} foi *cancelado*. Entre em contato conosco para mais informações.`,
  };

  return messages[newStatus] ?? null;
}

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
        <div className="flex items-center gap-2">
          <span className="font-bold text-sm">{fmtMoney(order.total)}</span>
          {order.discount_amount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-700 dark:text-green-400 border border-green-500/30 text-[10px] font-medium">
              <Tag className="h-2.5 w-2.5" />
              {order.coupon_code ? order.coupon_code : `-${fmtMoney(order.discount_amount)}`}
            </span>
          )}
        </div>
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
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span className="flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5" />
                    Desconto{order.coupon_code ? ` (${order.coupon_code})` : ""}
                  </span>
                  <span>-{fmtMoney(order.discount_amount)}</span>
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

  const PAGE_SIZE = 9;

  const [statusFilter, setStatusFilter] = useState("active");
  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [customDate, setCustomDate] = useState(todayStr);
  const [page, setPage] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);
  const [advancingId, setAdvancingId] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const [realtimeLive, setRealtimeLive] = useState(false);

  // ── W-API credentials ──────────────────────────────────────────────────────

  const { data: wapiCredentials } = useQuery<{ instanceId: string; token: string } | null>({
    queryKey: ["/company-wapi", cid],
    enabled: !!cid,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("wapi_instance_id, wapi_token")
        .eq("id", cid!)
        .single();
      if (error || !data?.wapi_instance_id || !data?.wapi_token) return null;
      return { instanceId: data.wapi_instance_id, token: data.wapi_token };
    },
  });

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownIds = useRef<Set<string>>(new Set());
  const firstLoad = useRef(true);

  // ── Query ──────────────────────────────────────────────────────────────────

  const dateRange = getDateRange(dateFilter, customDate);

  const { data: queryResult, isLoading } = useQuery<{ orders: DeliveryOrder[]; total: number }>({
    queryKey: ["/delivery-orders", cid, statusFilter, dateFilter, dateFilter === "custom" ? customDate : null, page],
    enabled: !!cid,
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      let q = supabase
        .from("delivery_orders")
        .select("*", { count: "exact" })
        .eq("company_id", cid!)
        .order("created_at", { ascending: false })
        .range(from, to);

      if (statusFilter === "active") {
        q = q.in("status", ACTIVE_STATUSES);
      } else if (statusFilter !== "all") {
        q = q.eq("status", statusFilter as DeliveryStatus);
      }

      if (dateRange) {
        q = q.gte("created_at", dateRange.gte).lt("created_at", dateRange.lte);
      }

      const { data, error, count } = await q;
      if (error) throw error;
      return {
        orders: (data ?? []).map((r) => ({ ...r, items: parseItems(r.items) })) as DeliveryOrder[],
        total: count ?? 0,
      };
    },
  });

  const orders = queryResult?.orders ?? [];
  const totalOrders = queryResult?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalOrders / PAGE_SIZE));

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
      .subscribe((status) => {
        setRealtimeLive(status === "SUBSCRIBED");
      });

    return () => {
      setRealtimeLive(false);
      supabase.removeChannel(channel);
    };
  }, [cid, qc]);

  // Reset to page 1 when any filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter, dateFilter, customDate]);

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
      const { data, error } = await supabase
        .from("delivery_orders")
        .update({ status })
        .eq("id", id)
        .select("id, status");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("sem_permissao");
      return data[0] as { id: string; status: DeliveryStatus };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/delivery-orders", cid] });
    },
    onError: (err: unknown) => {
      const pgErr = err as Record<string, unknown>;
      const msg =
        err instanceof Error
          ? err.message
          : typeof pgErr?.message === "string"
          ? pgErr.message
          : "";
      if (msg === "sem_permissao") {
        toast.error("Sem permissão para atualizar este pedido");
      } else {
        toast.error("Erro ao atualizar status do pedido");
      }
    },
    onSettled: () => setAdvancingId(null),
  });

  const sendStatusNotification = useCallback(async (order: DeliveryOrder, newStatus: DeliveryStatus) => {
    if (!wapiCredentials || !order.customer_phone) return;
    const message = buildWhatsAppMessage(order, newStatus, activeCompany?.name, activeCompany?.address ?? undefined);
    if (!message) return;
    const result = await sendWhatsAppMessage(wapiCredentials, order.customer_phone, message);
    if (!result.ok) {
      toast.warning(`Notificação WhatsApp não enviada: ${result.error}`, { duration: 4000 });
    }
  }, [wapiCredentials, activeCompany?.name, activeCompany?.address]);

  const handleAdvance = useCallback((order: DeliveryOrder) => {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    const newStatus = order.delivery_type === "delivery" ? next.delivery : next.pickup;
    setAdvancingId(order.id);
    updateStatus.mutate(
      { id: order.id, status: newStatus },
      {
        onSuccess: () => {
          setSelectedOrder((prev) =>
            prev?.id === order.id ? { ...prev, status: newStatus } : prev
          );
          toast.success(`Pedido #${order.numeric_id} → ${STATUS_CONFIG[newStatus].label}`);
          sendStatusNotification(order, newStatus);
        },
      }
    );
  }, [updateStatus, sendStatusNotification]);

  const handleCancel = useCallback((order: DeliveryOrder) => {
    setAdvancingId(order.id);
    updateStatus.mutate(
      { id: order.id, status: "cancelled" },
      {
        onSuccess: () => {
          setSelectedOrder((prev) =>
            prev?.id === order.id ? { ...prev, status: "cancelled" } : prev
          );
          toast.success(`Pedido #${order.numeric_id} cancelado`);
          sendStatusNotification(order, "cancelled");
        },
      }
    );
  }, [updateStatus, sendStatusNotification]);

  // ── Print ──────────────────────────────────────────────────────────────────

  const handlePrintReceipt = useCallback(async (order: DeliveryOrder) => {
    setPrinting(true);
    try {
      const settings = getPrinterSettings();
      const receipt: Receipt = {
        title: order.delivery_type === "delivery" ? "PEDIDO DELIVERY" : "PEDIDO RETIRADA",
        saleNumber: String(order.numeric_id).padStart(6, "0"),
        saleLabel: "ID DO PEDIDO",
        companyName: activeCompany?.name,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryType: order.delivery_type as "delivery" | "pickup",
        customerAddress: order.address ?? undefined,
        items: order.items.map((it) => ({
          name: it.name,
          qty: it.quantity,
          price: it.price,
          unit: "un",
        })),
        subtotal: order.subtotal,
        deliveryFee: order.delivery_type === "delivery" && order.delivery_fee > 0 ? order.delivery_fee : undefined,
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
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryType: order.delivery_type as "delivery" | "pickup",
        customerAddress: order.address ?? undefined,
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

  // ── Counts for header (separate query so it reflects ALL pages) ────────────

  const { data: pendingCount = 0 } = useQuery<number>({
    queryKey: ["/delivery-orders-pending-count", cid],
    enabled: !!cid,
    refetchInterval: 15000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("delivery_orders")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid!)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">
      <audio ref={audioRef} src={notificationSoundUrl} preload="auto" />

      {/* Header */}
      <div className="flex flex-col gap-2 px-4 sm:px-6 py-3 border-b shrink-0">
        {/* Row 1: title + live dot */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Bike className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <h1 className="text-base sm:text-xl font-bold truncate">Pedidos de Delivery</h1>
            {pendingCount > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow-500 text-white text-xs font-bold animate-pulse shrink-0">
                <Bell className="h-3 w-3" />
                {pendingCount}
              </span>
            )}
          </div>

          <span
            title={realtimeLive ? "Tempo real ativo" : "Atualizando a cada 15s"}
            className="flex items-center gap-1.5 text-xs text-muted-foreground shrink-0"
          >
            <span className={`h-2 w-2 rounded-full ${realtimeLive ? "bg-green-500 animate-pulse" : "bg-muted-foreground/40"}`} />
            <span className="hidden sm:inline">{realtimeLive ? "Ao vivo" : "Polling"}</span>
          </span>
        </div>

        {/* Row 2: filters + refresh */}
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-8 flex-1 sm:flex-none sm:w-40 text-xs">
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

          <Select value={dateFilter} onValueChange={(v) => setDateFilter(v as DateFilter)}>
            <SelectTrigger className="h-8 flex-1 sm:flex-none sm:w-40 text-xs gap-1">
              <Calendar className="h-3 w-3 shrink-0 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_FILTER_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value} className="text-xs">
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {dateFilter === "custom" && (
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs focus:outline-none focus:ring-1 focus:ring-ring w-36 shrink-0"
            />
          )}

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-6">
              <span className="text-xs text-muted-foreground">
                {totalOrders} pedido{totalOrders !== 1 ? "s" : ""} · página {page} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>

                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                  .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                    if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((p, i) =>
                    p === "…" ? (
                      <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">…</span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="icon"
                        className="h-8 w-8 text-xs"
                        onClick={() => setPage(p as number)}
                      >
                        {p}
                      </Button>
                    )
                  )}

                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
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
