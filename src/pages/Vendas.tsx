import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOperator } from "@/contexts/OperatorContext";
import { logAudit } from "@/lib/auditLog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CreditCard,
  Banknote,
  BookOpen,
  QrCode,
  Ticket,
  Receipt,
  Wallet,
  ShoppingBag,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Search,
  User,
  Tag,
  XCircle,
  Undo2,
  Ban,
  Printer,
} from "lucide-react";
import {
  printReceipt,
  getSettings as getPrinterSettings,
  formatSaleNumber,
  type Receipt as PrinterReceipt,
} from "@/lib/printer";

// ── Helpers ────────────────────────────────────────────────────────────────────

function maskMoneyFromDigits(digits: string): string {
  const cents = parseInt(digits.replace(/\D/g, "") || "0", 10);
  const str = String(Math.abs(cents)).padStart(3, "0");
  const intPart = str.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decPart = str.slice(-2);
  return `${intPart || "0"},${decPart}`;
}

function parseMaskedMoney(str: string): number {
  const cents = parseInt(str.replace(/\D/g, "") || "0", 10);
  return cents / 100;
}

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

const INTEGER_UNITS = ["un", "cx", "pç"];

function fmtQty(qty: number, unit: string | null | undefined): string {
  if (!unit || INTEGER_UNITS.includes(unit)) {
    return `${Math.round(qty)}`;
  }
  return `${qty.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${unit}`;
}

type Period = "today" | "week" | "month" | "year" | "all";

function periodRange(period: Period): { start: string | null; end: string | null } {
  if (period === "all") return { start: null, end: null };
  const now = new Date();
  let start: Date;
  if (period === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

const PAYMENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  cash: { label: "Dinheiro", icon: Banknote, color: "text-emerald-500" },
  credit_card: { label: "Crédito", icon: CreditCard, color: "text-blue-500" },
  debit_card: { label: "Débito", icon: CreditCard, color: "text-violet-500" },
  pix: { label: "PIX", icon: QrCode, color: "text-primary" },
  ticket: { label: "Ticket", icon: Ticket, color: "text-orange-500" },
  crediario: { label: "Crediário", icon: BookOpen, color: "text-rose-500" },
  mixed: { label: "Misto", icon: Wallet, color: "text-amber-500" },
};

const PAGE_SIZE = 15;

// ── Types ──────────────────────────────────────────────────────────────────────

type Sale = {
  id: string;
  numeric_id?: number | string | null;
  total: number;
  subtotal: number;
  discount_amount: number;
  payment_method: string;
  payment_amount?: number | null;
  change_amount?: number | null;
  notes?: string | null;
  status: string;
  created_at: string;
  customer_id: string | null;
  customers: { name: string } | null;
  cancelled_at?: string | null;
  cancellation_reason?: string | null;
};

type SaleItem = {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  discount_amount: number;
  subtotal: number;
  addons?: { name: string; price: number }[] | null;
  notes?: string | null;
  products: { stock_unit: string } | null;
};

// ── Sale row ───────────────────────────────────────────────────────────────────

function SaleRow({ sale, refundedAmount = 0 }: { sale: Sale; refundedAmount?: number }) {
  const [open, setOpen] = useState(false);
  const [cancelDialog, setCancelDialog] = useState(false);
  const [refundDialog, setRefundDialog] = useState(false);
  const [reason, setReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundMethod, setRefundMethod] = useState(sale.payment_method);
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { activeCompany } = useCompany();
  const { activeOperator } = useOperator();
  const qc = useQueryClient();

  // ── Manager auth for cancel ─────────────────────────────────────────────────
  const [authDialog, setAuthDialog] = useState(false);
  const [authBadge, setAuthBadge] = useState("");
  const [authPin, setAuthPin] = useState("");
  const [authVerifying, setAuthVerifying] = useState(false);
  const authBadgeRef = useRef<HTMLInputElement>(null);
  const authPinRef = useRef<HTMLInputElement>(null);

  function requestCancelAuth() {
    setAuthBadge("");
    setAuthPin("");
    setAuthDialog(true);
  }

  async function verifyManagerForCancel() {
    if (!authBadge.trim() || !authPin.trim()) {
      toast.error("Bipe o cartão e digite a senha");
      return;
    }
    setAuthVerifying(true);
    try {
      const { data, error } = await (supabase as any).rpc("verify_staff_pin", {
        _company_id: activeCompany!.id,
        _badge_code: authBadge.trim(),
        _pin: authPin.trim(),
      });
      if (error) throw error;
      const staff = Array.isArray(data) ? data[0] : data;
      if (!staff) {
        toast.error("Cartão ou senha inválidos");
        setAuthPin("");
        authPinRef.current?.focus();
        return;
      }
      if (staff.role !== "manager" && staff.role !== "owner") {
        toast.error("Operador não tem permissão de gerente");
        return;
      }
      setAuthDialog(false);
      setReason("");
      setCancelDialog(true);
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao verificar");
    } finally {
      setAuthVerifying(false);
    }
  }

  const cfg = PAYMENT_CONFIG[sale.payment_method] ?? {
    label: sale.payment_method,
    icon: Receipt,
    color: "text-muted-foreground",
  };
  const Icon = cfg.icon;
  const hasDiscount = Number(sale.discount_amount) > 0;
  const customerName = sale.customers?.name ?? null;
  const isCancelled = sale.status === "cancelled";

  const { data: refunds = [] } = useQuery({
    queryKey: ["/vendas/refunds", sale.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("id, type, amount, reason, refund_method, created_at")
        .eq("sale_id", sale.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        type: "full" | "partial";
        amount: number;
        reason: string;
        refund_method: string;
        created_at: string;
      }>;
    },
  });

  const totalRefunded = refunds.reduce((s, r) => s + Number(r.amount), 0);
  const maxRefundable = Math.max(0, Number(sale.total) - totalRefunded);

  async function handleCancel() {
    if (!reason.trim()) {
      toast.error("Informe o motivo do cancelamento");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("sales")
        .update({
          status: "cancelled",
          cancelled_at: new Date().toISOString(),
          cancelled_by: user?.id,
          cancellation_reason: reason,
        } as any)
        .eq("id", sale.id);
      if (error) throw error;

      // If the cancelled sale was on Crediário, offset the customer's open
      // debt with a matching "payment" entry for the full sale total minus
      // any amount already refunded, so the customer no longer owes it.
      if (sale.payment_method === "crediario" && sale.customer_id) {
        const offset = Math.max(0, Number(sale.total) - totalRefunded);
        if (offset > 0) {
          const { error: credErr } = await (supabase as any)
            .from("crediario_entries")
            .insert({
              company_id: activeCompany!.id,
              customer_id: sale.customer_id,
              sale_id: sale.id,
              kind: "payment",
              description: `Cancelamento venda #${sale.id.slice(0, 8)}`,
              amount: offset,
              reference_date: new Date().toISOString().slice(0, 10),
              due_date: null,
              notes: reason || null,
              created_by: user?.id ?? null,
            });
          if (credErr) {
            console.error("Falha ao baixar crediário no cancelamento:", credErr);
            toast.error("Venda cancelada, mas falhou ao baixar no Crediário");
          } else {
            qc.invalidateQueries({ queryKey: ["/crediario/entries", activeCompany!.id] });
          }
        }
      }

      logAudit({
        companyId: activeCompany!.id,
        action: "sale.cancelled",
        entityType: "sale",
        entityId: sale.id,
        description: `Cancelou venda de ${fmtBRL(Number(sale.total))} — ${reason}`,
        metadata: { reason, total: Number(sale.total), payment_method: sale.payment_method },
      });
      toast.success("Venda cancelada");
      setCancelDialog(false);
      setReason("");
      qc.invalidateQueries({ queryKey: ["/vendas/sales"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao cancelar");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRefund() {
    if (!reason.trim()) {
      toast.error("Informe o motivo");
      return;
    }
    const amount =
      refundType === "full" ? maxRefundable : parseMaskedMoney(refundAmount);
    if (amount <= 0 || amount > maxRefundable) {
      toast.error("Valor inválido");
      return;
    }
    setSubmitting(true);
    try {
      let sessionQ = (supabase as any)
        .from("cash_sessions")
        .select("id")
        .eq("company_id", activeCompany!.id)
        .eq("status", "open");
      if (activeOperator?.id) {
        sessionQ = sessionQ.eq("operator_id", activeOperator.id);
      } else if (user?.id) {
        sessionQ = sessionQ.is("operator_id", null).eq("opened_by", user.id);
      }
      const { data: openSession } = await sessionQ.maybeSingle();

      const { error } = await (supabase as any).from("refunds").insert({
        sale_id: sale.id,
        company_id: activeCompany!.id,
        cash_session_id: openSession?.id ?? null,
        type: refundType,
        amount,
        reason,
        refund_method: refundMethod,
        created_by: user?.id,
      });
      if (error) throw error;
      logAudit({
        companyId: activeCompany!.id,
        action: "sale.refunded",
        entityType: "sale",
        entityId: sale.id,
        description: `Devolução ${refundType === "full" ? "total" : "parcial"} de ${fmtBRL(amount)} — ${reason}`,
        metadata: {
          reason,
          amount,
          refund_method: refundMethod,
          type: refundType,
          sale_total: Number(sale.total),
        },
      });
      toast.success("Devolução registrada");
      setRefundDialog(false);
      setReason("");
      setRefundAmount("");
      qc.invalidateQueries({ queryKey: ["/vendas/refunds"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao registrar devolução");
    } finally {
      setSubmitting(false);
    }
  }

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["/vendas/items", sale.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select("id, product_name, quantity, unit_price, discount_amount, subtotal, addons, notes, products(stock_unit)")
        .eq("sale_id", sale.id);
      if (error) throw error;
      return (data ?? []) as SaleItem[];
    },
  });

  const [reprinting, setReprinting] = useState(false);

  async function handleReprint() {
    setReprinting(true);
    try {
      // Garante que temos os itens carregados (caso o usuário clique sem abrir).
      let saleItems = items as SaleItem[];
      if (!saleItems || saleItems.length === 0) {
        const { data, error } = await supabase
          .from("sale_items")
          .select(
            "id, product_name, quantity, unit_price, discount_amount, subtotal, addons, notes, products(stock_unit)",
          )
          .eq("sale_id", sale.id);
        if (error) throw error;
        saleItems = (data ?? []) as SaleItem[];
      }

      // Para vendas mistas, o detalhamento da divisão fica em `notes`
      // gravado como "[Misto] Dinheiro 10,00 + PIX 5,00".
      const isMixed = sale.payment_method === "mixed";
      const mixedDescription = (sale.notes ?? "").replace(/^\[Misto\]\s*/i, "").trim();
      const paymentLabel = isMixed
        ? mixedDescription
          ? `Misto — ${mixedDescription}`
          : "Misto"
        : cfg.label;

      const cashReceived =
        sale.payment_method === "cash" && sale.payment_amount != null
          ? Number(sale.payment_amount)
          : undefined;
      const change =
        sale.payment_method === "cash" && sale.change_amount != null
          ? Number(sale.change_amount)
          : undefined;

      const receipt: PrinterReceipt = {
        title: "CUPOM NÃO FISCAL — 2ª VIA",
        items: saleItems.map((i) => ({
          name: i.product_name,
          qty: Number(i.quantity),
          price: Number(i.unit_price),
          unit: i.products?.stock_unit ?? undefined,
        })),
        subtotal: Number(sale.subtotal),
        discount: Number(sale.discount_amount) > 0 ? Number(sale.discount_amount) : undefined,
        total: Number(sale.total),
        payment: paymentLabel,
        cashReceived: cashReceived && cashReceived > 0 ? cashReceived : undefined,
        change: change && change > 0 ? change : undefined,
        date: new Date(sale.created_at),
        companyName: activeCompany?.name ?? undefined,
        companyDocument: activeCompany?.document ?? undefined,
        companyPhone: activeCompany?.phone ?? undefined,
        companyAddress: activeCompany?.address ?? undefined,
        saleNumber: formatSaleNumber(sale.numeric_id ?? null, sale.id),
      };

      await printReceipt(receipt, getPrinterSettings());
      logAudit({
        companyId: activeCompany!.id,
        action: "sale.reprinted",
        entityType: "sale",
        entityId: sale.id,
        description: `Reimpressão de cupom (${fmtBRL(Number(sale.total))})`,
        metadata: { sale_id: sale.id, total: Number(sale.total) },
      });
      toast.success("Cupom enviado para impressão");
    } catch (e: any) {
      toast.error(`Falha ao reimprimir: ${e?.message ?? "erro desconhecido"}`);
    } finally {
      setReprinting(false);
    }
  }

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/40 transition-colors"
          data-testid={`sale-row-${sale.id}`}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-muted p-2">
              <Icon className={`h-4 w-4 ${cfg.color}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{cfg.label}</p>
                {customerName && (
                  <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex">
                    <User className="h-3 w-3" />
                    {customerName}
                  </span>
                )}
                {hasDiscount && (
                  <span className="hidden items-center gap-1 text-xs text-amber-500 sm:flex">
                    <Tag className="h-3 w-3" />
                    desconto
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">{fmtDate(sale.created_at)}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {isCancelled && (
              <Badge variant="destructive" className="text-xs gap-1">
                <Ban className="h-3 w-3" />
                Cancelada
              </Badge>
            )}
            {hasDiscount && !isCancelled && (
              <span className="hidden text-xs text-muted-foreground line-through sm:inline">
                {fmtBRL(Number(sale.subtotal))}
              </span>
            )}
            {refundedAmount > 0 && !isCancelled && (
              <span className="hidden text-xs text-muted-foreground line-through sm:inline">
                {fmtBRL(Number(sale.total))}
              </span>
            )}
            <Badge
              variant="secondary"
              className={`font-mono text-xs ${isCancelled ? "line-through opacity-60" : ""}`}
            >
              {fmtBRL(refundedAmount > 0 ? Number(sale.total) - refundedAmount : Number(sale.total))}
            </Badge>
            {open ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {/* Customer / discount info */}
          {(customerName || hasDiscount) && (
            <div className="flex flex-wrap gap-3 pb-1">
              {customerName && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <User className="h-3.5 w-3.5" />
                  <span>Cliente: <span className="font-medium text-foreground">{customerName}</span></span>
                </div>
              )}
              {hasDiscount && (
                <div className="flex items-center gap-1.5 text-xs text-amber-500">
                  <Tag className="h-3.5 w-3.5" />
                  <span>
                    Desconto aplicado:{" "}
                    <span className="font-semibold">
                      {fmtBRL(Number(sale.discount_amount))}
                    </span>
                    {" "}(subtotal: {fmtBRL(Number(sale.subtotal))})
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Items table */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem itens registrados.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-1.5 text-left font-medium">Produto</th>
                  <th className="pb-1.5 text-center font-medium w-24">Qtd</th>
                  <th className="pb-1.5 text-right font-medium w-24">Unit.</th>
                  <th className="pb-1.5 text-right font-medium w-24">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {items.map((item) => {
                  const unit = item.products?.stock_unit ?? null;
                  const itemDiscount = Number(item.discount_amount ?? 0);
                  return (
                    <tr key={item.id}>
                      <td className="py-1.5">
                        <span className="font-medium">{item.product_name}</span>
                        {itemDiscount > 0 && (
                          <span className="ml-1.5 text-amber-500">
                            (-{fmtBRL(itemDiscount)})
                          </span>
                        )}
                        {item.addons && item.addons.length > 0 && (
                          <p
                            className="mt-0.5 text-[11px] text-muted-foreground"
                            data-testid={`sale-item-addons-${item.id}`}
                          >
                            + {item.addons.map((a) => a.name).join(", ")}
                          </p>
                        )}
                        {item.notes && item.notes.trim().length > 0 && (
                          <p
                            className="mt-0.5 text-[11px] italic text-muted-foreground"
                            data-testid={`sale-item-notes-${item.id}`}
                          >
                            Obs: {item.notes}
                          </p>
                        )}
                      </td>
                      <td className="py-1.5 text-center text-muted-foreground">
                        {fmtQty(Number(item.quantity), unit)}
                      </td>
                      <td className="py-1.5 text-right text-muted-foreground">
                        {fmtBRL(Number(item.unit_price))}
                        {unit && !INTEGER_UNITS.includes(unit) && (
                          <span className="text-muted-foreground">/{unit}</span>
                        )}
                      </td>
                      <td className="py-1.5 text-right font-semibold">
                        {fmtBRL(Number(item.subtotal))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                {hasDiscount && (
                  <tr>
                    <td colSpan={3} className="pt-2 text-right text-muted-foreground">
                      Desconto
                    </td>
                    <td className="pt-2 text-right font-semibold text-amber-500">
                      -{fmtBRL(Number(sale.discount_amount))}
                    </td>
                  </tr>
                )}
                <tr className="border-t border-border">
                  <td colSpan={3} className="pt-2 text-right text-muted-foreground">
                    Total
                  </td>
                  <td className="pt-2 text-right font-bold text-foreground">
                    {refundedAmount > 0 ? (
                      <span className="flex flex-col items-end gap-0.5">
                        <span className="line-through text-muted-foreground font-normal text-xs">
                          {fmtBRL(Number(sale.total))}
                        </span>
                        <span>{fmtBRL(Number(sale.total) - refundedAmount)}</span>
                      </span>
                    ) : (
                      fmtBRL(Number(sale.total))
                    )}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}

          {/* Refunds list */}
          {refunds.length > 0 && (
            <div className="rounded-md border border-border bg-background/50 p-2 space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Devoluções
              </p>
              {refunds.map((r) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Undo2 className="h-3 w-3 text-amber-500 shrink-0" />
                    <span className="truncate">
                      {r.type === "full" ? "Total" : "Parcial"} · {r.reason}
                    </span>
                  </div>
                  <span className="font-semibold text-amber-500 shrink-0">
                    −{fmtBRL(Number(r.amount))}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-1 mt-1 border-t border-border text-xs">
                <span className="text-muted-foreground">Devolvido total</span>
                <span className="font-bold text-amber-500">−{fmtBRL(totalRefunded)}</span>
              </div>
            </div>
          )}

          {/* Cancellation info */}
          {isCancelled && sale.cancellation_reason && (
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
              <p className="font-semibold text-destructive flex items-center gap-1.5">
                <Ban className="h-3 w-3" /> Venda cancelada
              </p>
              <p className="text-muted-foreground mt-0.5">{sale.cancellation_reason}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 h-8 text-xs"
              onClick={handleReprint}
              disabled={reprinting}
              data-testid={`button-reprint-${sale.id}`}
            >
              <Printer className="h-3.5 w-3.5" />
              {reprinting ? "Imprimindo..." : "Reimprimir cupom"}
            </Button>
            {!isCancelled && maxRefundable > 0 && sale.payment_method !== "crediario" && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs"
                onClick={() => {
                  setRefundType("full");
                  setRefundAmount(maskMoneyFromDigits(String(Math.round(maxRefundable * 100))));
                  setReason("");
                  setRefundDialog(true);
                }}
                data-testid={`button-refund-${sale.id}`}
              >
                <Undo2 className="h-3.5 w-3.5" /> Devolver
              </Button>
            )}
            {!isCancelled && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 h-8 text-xs text-destructive hover:text-destructive"
                onClick={requestCancelAuth}
                data-testid={`button-cancel-${sale.id}`}
              >
                <XCircle className="h-3.5 w-3.5" /> Cancelar venda
              </Button>
            )}
          </div>
        </div>
      </CollapsibleContent>

      {/* ── Manager auth dialog (cancel) ──────────────────────────────────── */}
      <Dialog
        open={authDialog}
        onOpenChange={(o) => {
          setAuthDialog(o);
          if (o) setTimeout(() => authBadgeRef.current?.focus(), 50);
        }}
      >
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Autorização de gerente</DialogTitle>
            <DialogDescription>
              Bipe o cartão do gerente e digite a senha para liberar o cancelamento da venda.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); verifyManagerForCancel(); }} className="space-y-3" autoComplete="off">
            <div style={{ position: "absolute", top: -9999, left: -9999, height: 0, width: 0, overflow: "hidden" }} aria-hidden="true">
              <input type="text" name="username" tabIndex={-1} autoComplete="username" />
              <input type="password" name="password" tabIndex={-1} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`auth-badge-${sale.id}`}>Cartão</Label>
              <Input
                id={`auth-badge-${sale.id}`}
                ref={authBadgeRef}
                name="auth-badge"
                value={authBadge}
                onChange={(e) => setAuthBadge(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); authPinRef.current?.focus(); }
                }}
                placeholder="Bipe o cartão..."
                className="font-mono text-center"
                data-testid={`input-auth-badge-${sale.id}`}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`auth-pin-${sale.id}`}>Senha</Label>
              <Input
                id={`auth-pin-${sale.id}`}
                ref={authPinRef}
                name="auth-pin"
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={authPin}
                onChange={(e) => setAuthPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); verifyManagerForCancel(); }
                }}
                placeholder="••••"
                className="text-center font-mono text-lg tracking-widest [-webkit-text-security:disc] [text-security:disc]"
                style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
                data-testid={`input-auth-pin-${sale.id}`}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
              />
            </div>
          </form>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAuthDialog(false)}>Cancelar</Button>
            <Button
              onClick={verifyManagerForCancel}
              disabled={authVerifying}
              data-testid={`button-confirm-auth-${sale.id}`}
            >
              {authVerifying ? "Verificando..." : "Autorizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel dialog ─────────────────────────────────────────────────── */}
      <Dialog open={cancelDialog} onOpenChange={setCancelDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Cancelar venda</DialogTitle>
            <DialogDescription>
              Esta ação marca a venda como cancelada e a remove dos relatórios financeiros.
              Informe um motivo.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Ex: cliente desistiu, erro de digitação..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            data-testid="input-cancel-reason"
            rows={3}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelDialog(false)}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={submitting}
              data-testid="button-confirm-cancel"
            >
              Confirmar cancelamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Refund dialog ─────────────────────────────────────────────────── */}
      <Dialog open={refundDialog} onOpenChange={setRefundDialog}>
        <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Registrar devolução</DialogTitle>
            <DialogDescription>
              Registre uma devolução total ou parcial. Disponível para devolução:{" "}
              <strong>{fmtBRL(maxRefundable)}</strong>.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant={refundType === "full" ? "default" : "outline"}
                onClick={() => {
                  setRefundType("full");
                  setRefundAmount(
                    maskMoneyFromDigits(String(Math.round(maxRefundable * 100))),
                  );
                }}
                className="h-9"
              >
                Total
              </Button>
              <Button
                type="button"
                variant={refundType === "partial" ? "default" : "outline"}
                onClick={() => {
                  setRefundType("partial");
                  setRefundAmount("");
                }}
                className="h-9"
              >
                Parcial
              </Button>
            </div>
            {refundType === "partial" && (
              <Input
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={refundAmount ? `R$ ${refundAmount}` : ""}
                onChange={(e) => setRefundAmount(maskMoneyFromDigits(e.target.value))}
                className="text-left font-mono"
                data-testid="input-refund-amount"
              />
            )}
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger data-testid="select-refund-method">
                <SelectValue placeholder="Forma de devolução" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PAYMENT_CONFIG).map(([k, c]) => (
                  <SelectItem key={k} value={k}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Textarea
              placeholder="Motivo da devolução"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-refund-reason"
              rows={2}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRefundDialog(false)}>
              Voltar
            </Button>
            <Button
              onClick={handleRefund}
              disabled={submitting}
              data-testid="button-confirm-refund"
            >
              Registrar devolução
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Collapsible>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function Vendas() {
  const { activeCompany } = useCompany();
  const [period, setPeriod] = useState<Period>("today");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { start, end } = useMemo(() => periodRange(period), [period]);

  const { data: sales = [], isLoading } = useQuery({
    queryKey: ["/vendas/sales", activeCompany?.id, start, end],
    enabled: !!activeCompany,
    queryFn: async () => {
      let query = supabase
        .from("sales")
        .select(
          "id, numeric_id, total, subtotal, discount_amount, payment_method, payment_amount, change_amount, notes, status, created_at, customer_id, customers(name), cancelled_at, cancellation_reason"
        )
        .eq("company_id", activeCompany!.id)
        .order("created_at", { ascending: false });

      if (start) query = query.gte("created_at", start);
      if (end) query = query.lte("created_at", end);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Sale[];
    },
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return sales;
    const q = search.toLowerCase();
    return sales.filter((s) => {
      const cfg = PAYMENT_CONFIG[s.payment_method];
      const customerMatch = s.customers?.name?.toLowerCase().includes(q);
      return cfg?.label.toLowerCase().includes(q) || fmtDate(s.created_at).includes(q) || customerMatch;
    });
  }, [sales, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const completedSales = useMemo(
    () => filtered.filter((v) => v.status !== "cancelled"),
    [filtered]
  );
  const cancelledSalesFiltered = useMemo(
    () => filtered.filter((v) => v.status === "cancelled"),
    [filtered]
  );

  const totalCompleted = useMemo(
    () => completedSales.reduce((s, v) => s + Number(v.total), 0),
    [completedSales]
  );
  const totalCancelledAmount = useMemo(
    () => cancelledSalesFiltered.reduce((s, v) => s + Number(v.total), 0),
    [cancelledSalesFiltered]
  );

  const saleIds = useMemo(() => completedSales.map((v) => v.id), [completedSales]);

  const { data: pageRefunds = [] } = useQuery({
    queryKey: ["/vendas/refunds", saleIds],
    enabled: saleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("id, amount, sale_id")
        .in("sale_id", saleIds);
      if (error) throw error;
      return (data ?? []) as { id: string; amount: number; sale_id: string }[];
    },
  });

  const totalRefundedAmount = useMemo(
    () => pageRefunds.reduce((s, r) => s + Number(r.amount), 0),
    [pageRefunds]
  );

  const refundsBySaleId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of pageRefunds) {
      map[r.sale_id] = (map[r.sale_id] ?? 0) + Number(r.amount);
    }
    return map;
  }, [pageRefunds]);

  const totalReceita = totalCompleted - totalRefundedAmount;

  const handlePeriodChange = (v: Period) => {
    setPeriod(v);
    setPage(1);
  };

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6 p-6 md:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendas</h1>
          <p className="text-sm text-muted-foreground mt-1">Histórico completo de todas as vendas.</p>
        </div>
        <Select value={period} onValueChange={(v) => handlePeriodChange(v as Period)}>
          <SelectTrigger className="w-40" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Últimos 7 dias</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="year">Este ano</SelectItem>
            <SelectItem value="all">Todos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="relative max-w-sm w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search"
          placeholder="Buscar por pagamento, cliente, data..."
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Summary bar */}
      {!isLoading && (
        <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 text-sm space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Vendas concluídas</span>
            <span className="flex items-center gap-1">
              <span className="font-semibold text-foreground" data-testid="text-total-completed">
                {fmtBRL(totalCompleted)}
              </span>
              <span className="text-muted-foreground text-xs">({completedSales.length})</span>
            </span>
          </div>
          {totalCancelledAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Cancelamentos</span>
              <span className="flex items-center gap-1">
                <span className="font-semibold text-destructive" data-testid="text-total-cancelled">
                  −{fmtBRL(totalCancelledAmount)}
                </span>
                <span className="text-muted-foreground text-xs">({cancelledSalesFiltered.length})</span>
              </span>
            </div>
          )}
          {totalRefundedAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Devoluções</span>
              <span className="font-semibold text-destructive" data-testid="text-total-refunds">
                −{fmtBRL(totalRefundedAmount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
            <span className="font-medium text-foreground">Receita líquida</span>
            <span className="font-bold text-foreground text-base" data-testid="text-receita-liquida">
              {fmtBRL(totalReceita)}
            </span>
          </div>
        </div>
      )}

      {/* Sales list */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(8)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : paginated.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Nenhuma venda encontrada</p>
              <p className="text-xs text-muted-foreground">
                Tente mudar o período ou o filtro de busca.
              </p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-border">
                {paginated.map((sale) => (
                  <SaleRow key={sale.id} sale={sale} refundedAmount={refundsBySaleId[sale.id] ?? 0} />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border px-4 py-3">
                  <p className="text-xs text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} de{" "}
                    {filtered.length}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === 1}
                      onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === totalPages}
                      onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
