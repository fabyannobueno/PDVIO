import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import QRCode from "qrcode";
import { ArrowLeft, Check, Copy, Loader2, ShieldCheck, Clock, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import {
  formatBRL,
  billingCycleLabel,
  planPriceFor,
  addMonths,
  type BillingCycle,
  type PlanRow,
  type SubscriptionRow,
  type InvoiceRow,
} from "@/lib/plans";
import { createPixCharge, getPixStatus } from "@/services/pix-api.service";

const POLL_INTERVAL_MS = 5000;

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const planId = params.get("planId");
  const billingCycle = (params.get("billingCycle") as BillingCycle) || "monthly";

  const [plan, setPlan] = useState<PlanRow | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [invoice, setInvoice] = useState<InvoiceRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const [now, setNow] = useState(Date.now());
  const startedRef = useRef(false);

  const amount = useMemo(() => (plan ? planPriceFor(plan, billingCycle) : 0), [plan, billingCycle]);

  // Load plan
  useEffect(() => {
    if (!planId) {
      setPlanLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("plans")
        .select("*")
        .eq("id", planId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        setError("Plano não encontrado.");
      } else {
        setPlan(data as PlanRow);
      }
      setPlanLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // Create subscription + invoice + PIX once plan is loaded
  useEffect(() => {
    if (!plan || !activeCompany || !user || startedRef.current) return;
    if (plan.pricing_type === "custom") {
      setError("Este plano requer contato comercial. Acesse www.pdvio.com.br/contato");
      return;
    }
    if (plan.pricing_type === "free") {
      setError("Plano gratuito não precisa de checkout. Volte para a página de planos para ativá-lo.");
      return;
    }
    if (activeCompany.role !== "owner") {
      setError("Apenas o proprietário pode contratar planos.");
      return;
    }

    startedRef.current = true;
    setCreating(true);

    (async () => {
      try {
        // 1) Cancela qualquer assinatura pendente anterior (deixa só a nova)
        await (supabase as any)
          .from("subscriptions")
          .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
          .eq("company_id", activeCompany.id)
          .eq("status", "pending");

        // 2) Cria nova subscription pendente
        const { data: sub, error: subErr } = await (supabase as any)
          .from("subscriptions")
          .insert({
            company_id: activeCompany.id,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            status: "pending",
            created_by: user.id,
          })
          .select()
          .single();
        if (subErr) throw subErr;

        // 3) Cria fatura pendente
        const dueDate = new Date();
        const { data: inv, error: invErr } = await (supabase as any)
          .from("invoices")
          .insert({
            subscription_id: (sub as SubscriptionRow).id,
            company_id: activeCompany.id,
            plan_id: plan.id,
            billing_cycle: billingCycle,
            amount,
            due_date: dueDate.toISOString().slice(0, 10),
            status: "pending",
          })
          .select()
          .single();
        if (invErr) throw invErr;

        // 4) Cria cobrança PIX
        const description = `PDVIO - ${plan.name} ${billingCycleLabel(billingCycle)}`;
        const cob = await createPixCharge(amount, description.slice(0, 140), 3600);
        const expiresAt = new Date(
          new Date(cob.calendario.criacao).getTime() + cob.calendario.expiracao * 1000
        );

        // 5) Atualiza fatura com dados PIX
        const { data: updated, error: updErr } = await (supabase as any)
          .from("invoices")
          .update({
            pix_txid: cob.txid,
            pix_copia_e_cola: cob.pixCopiaECola,
            pix_qr_location: cob.location,
            pix_expires_at: expiresAt.toISOString(),
          })
          .eq("id", (inv as InvoiceRow).id)
          .select()
          .single();
        if (updErr) throw updErr;

        setInvoice(updated as InvoiceRow);
      } catch (e: any) {
        console.error("[Checkout] erro:", e);
        setError(e?.message ?? "Não foi possível gerar a cobrança PIX.");
      } finally {
        setCreating(false);
      }
    })();
  }, [plan, activeCompany, user, billingCycle, amount]);

  // QR code rendering
  useEffect(() => {
    if (!invoice?.pix_copia_e_cola) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(invoice.pix_copia_e_cola, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 320,
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => !cancelled && setQrDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [invoice?.pix_copia_e_cola]);

  // Tick for countdown
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Polling for PIX status
  useEffect(() => {
    if (!invoice?.pix_txid || paid) return;
    let active = true;

    const tick = async () => {
      try {
        const status = await getPixStatus(invoice.pix_txid!);
        if (!active) return;
        if (status.status === "CONCLUIDA") {
          await onPaymentConfirmed();
        } else if (status.status === "EXPIRADA" || status.status.startsWith("REMOVIDA_")) {
          await (supabase as any)
            .from("invoices")
            .update({ status: "expired" })
            .eq("id", invoice.id);
          setError("A cobrança PIX expirou. Volte para os planos para tentar novamente.");
        }
      } catch (e) {
        console.warn("[Checkout] erro no polling PIX:", e);
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    tick();
    return () => {
      active = false;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.pix_txid, paid]);

  async function onPaymentConfirmed() {
    if (!invoice || !plan || !activeCompany) return;
    setPaid(true);

    const periodStart = new Date();
    const periodEnd = addMonths(periodStart, billingCycle === "yearly" ? 12 : 1);

    // 1) Marca fatura como paga
    await (supabase as any)
      .from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", invoice.id);

    // 2) Cancela assinaturas anteriores ativas (estamos trocando)
    await (supabase as any)
      .from("subscriptions")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("company_id", activeCompany.id)
      .eq("status", "active")
      .neq("id", invoice.subscription_id);

    // 3) Ativa esta assinatura
    await (supabase as any)
      .from("subscriptions")
      .update({
        status: "active",
        started_at: periodStart.toISOString(),
        current_period_start: periodStart.toISOString(),
        current_period_end: periodEnd.toISOString(),
        next_due_at: periodEnd.toISOString(),
      })
      .eq("id", invoice.subscription_id);

    toast({
      title: "Pagamento confirmado!",
      description: `Plano ${plan.name} ativado com sucesso.`,
    });

    await queryClient.invalidateQueries({ queryKey: ["/billing/active-subscription"] });
    await queryClient.invalidateQueries({ queryKey: ["/billing/invoices"] });

    setTimeout(() => navigate("/faturas"), 2000);
  }

  async function handleCopy() {
    if (!invoice?.pix_copia_e_cola) return;
    try {
      await navigator.clipboard.writeText(invoice.pix_copia_e_cola);
      setCopied(true);
      toast({ title: "Código copiado!", description: "Cole no app do banco para pagar." });
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────
  if (planLoading || creating || !plan) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6 md:p-8 animate-fade-in">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-3xl space-y-6 p-6 md:p-8 animate-fade-in">
        <Button asChild variant="ghost" size="sm">
          <Link to="/planos" data-testid="link-back-planos">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar para planos
          </Link>
        </Button>
        <div
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive"
          data-testid="checkout-error"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <div className="space-y-1">
            <p className="font-semibold">Não foi possível continuar</p>
            <p className="text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const expiresAt = invoice?.pix_expires_at ? new Date(invoice.pix_expires_at).getTime() : null;
  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const remainingMinutes = remainingMs !== null ? Math.floor(remainingMs / 60000) : null;
  const remainingSeconds = remainingMs !== null ? Math.floor((remainingMs % 60000) / 1000) : null;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6 md:p-8 animate-fade-in" data-testid="page-checkout">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/planos" data-testid="link-back-planos">
            <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
          </Link>
        </Button>
        <Badge variant="secondary">{billingCycleLabel(billingCycle)}</Badge>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <h1 className="text-2xl font-bold">Finalizar assinatura</h1>
        <p className="mt-1 text-muted-foreground">
          Plano <strong className="text-foreground">{plan.name}</strong> — {plan.description}
        </p>

        <div className="mt-5 flex items-end justify-between border-t pt-5">
          <div>
            <p className="text-sm text-muted-foreground">Total a pagar</p>
            <p className="text-3xl font-bold">{formatBRL(amount)}</p>
            {billingCycle === "yearly" && (
              <p className="mt-1 text-xs text-muted-foreground">
                Equivale a {formatBRL(amount / 12)}/mês
              </p>
            )}
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <ShieldCheck className="ml-auto h-5 w-5 text-success" />
            <p className="mt-1">Pagamento PIX seguro</p>
          </div>
        </div>
      </div>

      {paid ? (
        <div
          className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success/10 p-6 text-success"
          data-testid="checkout-paid"
        >
          <Check className="mt-0.5 h-6 w-6 shrink-0" />
          <div>
            <p className="text-lg font-semibold">Pagamento confirmado!</p>
            <p className="mt-1 text-sm">
              Seu plano está ativo. Redirecionando para suas faturas…
            </p>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card p-6">
          <div className="grid gap-6 md:grid-cols-[auto,1fr]">
            <div className="flex flex-col items-center gap-3">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code PIX"
                  className="h-72 w-72 rounded-md border bg-white p-2"
                  data-testid="img-pix-qr"
                />
              ) : (
                <Skeleton className="h-72 w-72 rounded-md" />
              )}
              {remainingMinutes !== null && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Expira em{" "}
                  <span className="font-mono font-semibold">
                    {String(remainingMinutes).padStart(2, "0")}:
                    {String(remainingSeconds).padStart(2, "0")}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <h2 className="text-lg font-semibold">Pague com PIX</h2>
                <ol className="mt-3 space-y-2 text-sm text-muted-foreground">
                  <li>1. Abra o app do seu banco</li>
                  <li>2. Escolha pagar via PIX → QR Code ou copia e cola</li>
                  <li>3. Aponte para o QR ou cole o código abaixo</li>
                  <li>4. Confirme o valor de {formatBRL(amount)}</li>
                </ol>
                <div className="mt-2 flex items-center gap-2 text-xs text-success">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Aguardando confirmação automática…
                </div>
              </div>

              {invoice?.pix_copia_e_cola && (
                <div>
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    PIX Copia e Cola
                  </p>
                  <div className="flex gap-2">
                    <code
                      className="flex-1 max-h-28 overflow-y-auto break-all whitespace-pre-wrap rounded-md border bg-muted/40 px-2 py-2 text-[11px] leading-snug"
                      data-testid="text-pix-payload"
                    >
                      {invoice.pix_copia_e_cola}
                    </code>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={handleCopy}
                      data-testid="button-copy-pix"
                    >
                      {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
