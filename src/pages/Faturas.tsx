import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Receipt,
  Crown,
  Calendar,
  Check,
  Clock,
  XCircle,
  AlertCircle,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useActiveSubscription, useInvoices } from "@/hooks/useSubscription";
import { useCompany } from "@/contexts/CompanyContext";
import {
  formatBRL,
  billingCycleLabel,
  statusLabel,
  daysUntil,
  type InvoiceRow,
  type InvoiceStatus,
} from "@/lib/plans";
import QRCode from "qrcode";
import { useEffect } from "react";
import { Copy } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getPixStatus } from "@/services/pix-api.service";

const STATUS_STYLE: Record<InvoiceStatus, { variant: "default" | "secondary" | "destructive" | "outline"; icon: typeof Check }> = {
  paid: { variant: "default", icon: Check },
  pending: { variant: "secondary", icon: Clock },
  expired: { variant: "destructive", icon: XCircle },
  cancelled: { variant: "outline", icon: XCircle },
};

export default function Faturas() {
  const { activeCompany } = useCompany();
  const { data: active, isFetched: subFetched } = useActiveSubscription();
  const { data: invoices = [], isFetched: invoicesFetched } = useInvoices();
  const [openInvoice, setOpenInvoice] = useState<InvoiceRow | null>(null);

  const initialLoaded = !!activeCompany?.id && subFetched && invoicesFetched;

  if (!initialLoaded) {
    return (
      <div className="space-y-6 p-6 md:p-8 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const sub = active?.subscription;
  const plan = active?.plan;

  return (
    <div className="space-y-6 p-6 md:p-8 animate-fade-in" data-testid="page-faturas">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Plano e faturas</h1>
          <p className="mt-1 text-muted-foreground">
            Gerencie sua assinatura e veja o histórico de pagamentos.
          </p>
        </div>
        <Button asChild variant="outline" data-testid="button-mudar-plano">
          <Link to="/planos">
            <Crown className="mr-2 h-4 w-4" /> Mudar plano
          </Link>
        </Button>
      </div>

      {/* Resumo da assinatura */}
      {sub && plan ? (
        <div className="rounded-2xl border bg-gradient-to-br from-primary/5 to-transparent p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                Plano atual
              </p>
              <h2 className="mt-1 text-2xl font-bold">{plan.name}</h2>
              <p className="text-sm text-muted-foreground">{plan.description}</p>
            </div>
            <Badge variant={sub.status === "active" ? "default" : "secondary"}>
              {statusLabel(sub.status)}
            </Badge>
          </div>

          <div className="mt-5 grid gap-4 border-t pt-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Ciclo</p>
              <p className="font-medium">{billingCycleLabel(sub.billing_cycle)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Início</p>
              <p className="font-medium">
                {sub.started_at ? new Date(sub.started_at).toLocaleDateString("pt-BR") : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Próximo vencimento</p>
              <p className="font-medium">
                {sub.next_due_at ? (
                  <>
                    {new Date(sub.next_due_at).toLocaleDateString("pt-BR")}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({daysUntil(sub.next_due_at)} dias)
                    </span>
                  </>
                ) : (
                  "—"
                )}
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="flex items-center gap-3 rounded-2xl border border-dashed p-6 text-muted-foreground"
          data-testid="card-no-subscription"
        >
          <AlertCircle className="h-5 w-5" />
          <p className="flex-1 text-sm">
            Você ainda não possui um plano ativo. Escolha um plano para começar.
          </p>
          <Button asChild>
            <Link to="/planos">Ver planos</Link>
          </Button>
        </div>
      )}

      {/* Faturas */}
      <div>
        <h2 className="mb-3 text-lg font-semibold">Histórico de faturas</h2>

        {invoices.length === 0 ? (
          <div className="rounded-2xl border bg-muted/20 p-10 text-center text-muted-foreground">
            <Receipt className="mx-auto mb-3 h-10 w-10 opacity-50" />
            <p>Nenhuma fatura ainda.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-card">
            {invoices.map((inv) => {
              const style = STATUS_STYLE[inv.status];
              const Icon = style.icon;
              const days = daysUntil(inv.due_date);
              const overdue = inv.status === "pending" && days < 0;

              return (
                <button
                  key={inv.id}
                  type="button"
                  onClick={() => inv.status === "pending" && inv.pix_copia_e_cola && setOpenInvoice(inv)}
                  className="flex w-full items-center gap-4 border-b px-4 py-3 text-left last:border-b-0 hover:bg-muted/40 transition disabled:cursor-default"
                  disabled={inv.status !== "pending" || !inv.pix_copia_e_cola}
                  data-testid={`row-invoice-${inv.id}`}
                >
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-${overdue ? "destructive" : "muted"}/20`}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium truncate">
                        {inv.plan_id.charAt(0).toUpperCase() + inv.plan_id.slice(1)}
                      </p>
                      <Badge variant={style.variant} className="text-[10px]">
                        {statusLabel(inv.status)}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {billingCycleLabel(inv.billing_cycle)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Venc. {new Date(inv.due_date + "T00:00:00").toLocaleDateString("pt-BR")}
                      </span>
                      {inv.paid_at && (
                        <span>Pago em {new Date(inv.paid_at).toLocaleDateString("pt-BR")}</span>
                      )}
                      {overdue && (
                        <span className="text-destructive font-medium">
                          {Math.abs(days)} dia(s) em atraso
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{formatBRL(Number(inv.amount))}</p>
                    {inv.status === "pending" && inv.pix_copia_e_cola && (
                      <span className="flex items-center justify-end gap-1 text-xs text-primary">
                        Pagar <ChevronRight className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <PixPayDialog
        invoice={openInvoice}
        onClose={() => setOpenInvoice(null)}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PixPayDialog({
  invoice,
  onClose,
}: {
  invoice: InvoiceRow | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const open = !!invoice;

  useEffect(() => {
    if (!open) {
      setQrDataUrl(null);
      setPaid(false);
      return;
    }
    if (!invoice?.pix_copia_e_cola) return;
    let cancelled = false;
    QRCode.toDataURL(invoice.pix_copia_e_cola, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 280,
    })
      .then((url) => !cancelled && setQrDataUrl(url))
      .catch(() => !cancelled && setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [open, invoice?.pix_copia_e_cola]);

  // Polling
  useEffect(() => {
    if (!open || !invoice?.pix_txid || paid) return;
    let active = true;

    const tick = async () => {
      try {
        const status = await getPixStatus(invoice.pix_txid!);
        if (!active) return;
        if (status.status === "CONCLUIDA") {
          setPaid(true);
          await (supabase as any)
            .from("invoices")
            .update({ status: "paid", paid_at: new Date().toISOString() })
            .eq("id", invoice.id);

          // Renova período da assinatura se for renovação
          const { data: sub } = await (supabase as any)
            .from("subscriptions")
            .select("*")
            .eq("id", invoice.subscription_id)
            .maybeSingle();
          if (sub) {
            const start = sub.current_period_end ? new Date(sub.current_period_end) : new Date();
            const end = new Date(start);
            end.setMonth(end.getMonth() + (invoice.billing_cycle === "yearly" ? 12 : 1));
            await (supabase as any)
              .from("subscriptions")
              .update({
                status: "active",
                current_period_start: start.toISOString(),
                current_period_end: end.toISOString(),
                next_due_at: end.toISOString(),
                started_at: sub.started_at ?? new Date().toISOString(),
              })
              .eq("id", sub.id);
          }

          await queryClient.invalidateQueries({ queryKey: ["/billing/active-subscription"] });
          await queryClient.invalidateQueries({ queryKey: ["/billing/invoices"] });
          toast({ title: "Pagamento confirmado!", description: "Sua fatura foi quitada." });
          setTimeout(onClose, 2000);
        }
      } catch (e) {
        console.warn("[Faturas] erro polling:", e);
      }
    };
    const id = setInterval(tick, 5000);
    tick();
    return () => {
      active = false;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoice?.pix_txid, paid]);

  async function handleCopy() {
    if (!invoice?.pix_copia_e_cola) return;
    try {
      await navigator.clipboard.writeText(invoice.pix_copia_e_cola);
      setCopied(true);
      toast({ title: "Código copiado!" });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast({ title: "Falha ao copiar", variant: "destructive" });
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pagar fatura via PIX</DialogTitle>
        </DialogHeader>

        {paid ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center text-success">
            <Check className="h-10 w-10" />
            <p className="font-semibold">Pagamento confirmado!</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-semibold">{formatBRL(Number(invoice?.amount ?? 0))}</span>
            </div>

            <div className="flex justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code PIX"
                  className="h-56 w-56 rounded-md border bg-white p-2"
                />
              ) : (
                <Skeleton className="h-56 w-56" />
              )}
            </div>

            {invoice?.pix_copia_e_cola && (
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  PIX Copia e Cola
                </p>
                <div className="flex gap-2">
                  <code className="flex-1 max-h-20 overflow-y-auto break-all rounded-md border bg-muted/40 px-2 py-2 text-[11px]">
                    {invoice.pix_copia_e_cola}
                  </code>
                  <Button
                    type="button"
                    size="icon"
                    variant="outline"
                    onClick={handleCopy}
                  >
                    {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Aguardando confirmação automática…
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
