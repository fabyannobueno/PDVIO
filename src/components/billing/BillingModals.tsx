import { useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { AlertTriangle, Clock, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import {
  useActiveSubscription,
  useInvoices,
} from "@/hooks/useSubscription";
import { daysUntil, formatBRL } from "@/lib/plans";

const RENEWAL_SNOOZE_KEY = "pdvio:renewal-snoozed-sub";
const PENDING_SNOOZE_KEY = "pdvio:pending-snoozed-inv";

/**
 * Modais globais de cobrança:
 * - Aviso de renovação 5 dias antes do vencimento (gera fatura e leva pro /faturas)
 * - Aviso de fatura pendente com botão "Pagar"
 *
 * Sempre que o usuário fecha um aviso, ele fica em silêncio até a próxima sessão
 * (sessionStorage), evitando que a modal reapareça em cada navegação.
 */
export function BillingModals() {
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { activeCompany } = useCompany();
  const { data: active } = useActiveSubscription();
  const { data: invoices = [] } = useInvoices();

  const [generating, setGenerating] = useState(false);
  const [renewalDismissed, setRenewalDismissed] = useState(false);
  const [pendingDismissed, setPendingDismissed] = useState(false);

  const sub = active?.subscription ?? null;
  const plan = active?.plan ?? null;

  const pendingInvoice = useMemo(() => {
    const pending = invoices.filter((i) => i.status === "pending");
    if (pending.length === 0) return null;
    return [...pending].sort(
      (a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime()
    )[0];
  }, [invoices]);

  const isOwner = activeCompany?.role === "owner";
  const isPaidPlan =
    !!plan && plan.pricing_type === "paid" && sub?.status === "active";

  // Renovação a vencer: 5 dias antes, sem fatura pendente, plano não cancelado.
  const renewalDays =
    isPaidPlan && sub?.next_due_at && !sub.cancelled_at
      ? daysUntil(sub.next_due_at)
      : null;
  const showRenewal =
    isOwner &&
    !renewalDismissed &&
    !pendingInvoice &&
    !!sub &&
    !!plan &&
    isPaidPlan &&
    renewalDays !== null &&
    renewalDays <= 5 &&
    renewalDays >= 0;

  const showPending =
    isOwner &&
    !pendingDismissed &&
    !!pendingInvoice &&
    location.pathname !== "/faturas" &&
    location.pathname !== "/checkout";

  // Reseta dismiss quando muda a assinatura/fatura alvo
  useEffect(() => {
    if (!sub?.id) return;
    const snoozed = sessionStorage.getItem(RENEWAL_SNOOZE_KEY);
    setRenewalDismissed(snoozed === sub.id);
  }, [sub?.id]);

  useEffect(() => {
    if (!pendingInvoice?.id) {
      setPendingDismissed(false);
      return;
    }
    const snoozed = sessionStorage.getItem(PENDING_SNOOZE_KEY);
    setPendingDismissed(snoozed === pendingInvoice.id);
  }, [pendingInvoice?.id]);

  function dismissRenewal() {
    if (sub?.id) sessionStorage.setItem(RENEWAL_SNOOZE_KEY, sub.id);
    setRenewalDismissed(true);
  }

  function dismissPending() {
    if (pendingInvoice?.id)
      sessionStorage.setItem(PENDING_SNOOZE_KEY, pendingInvoice.id);
    setPendingDismissed(true);
  }

  async function handleGenerateRenewal() {
    if (!activeCompany?.id) return;
    try {
      setGenerating(true);
      const { data: invoiceId, error } = await (supabase as any).rpc(
        "create_renewal_invoice",
        { _company_id: activeCompany.id }
      );
      if (error) throw error;
      await queryClient.invalidateQueries({
        queryKey: ["/billing/invoices"],
      });
      toast({
        title: "Fatura gerada!",
        description: "Pague para renovar seu plano sem interrupção.",
      });
      dismissRenewal();
      navigate(`/faturas?invoice=${invoiceId}`);
    } catch (e: any) {
      toast({
        title: "Erro ao gerar fatura",
        description: e?.message ?? "Tente novamente em instantes.",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  }

  function handlePayPending() {
    if (!pendingInvoice) return;
    dismissPending();
    navigate(`/faturas?invoice=${pendingInvoice.id}`);
  }

  return (
    <>
      {/* Fatura pendente — prioridade máxima */}
      <Dialog
        open={showPending}
        onOpenChange={(o) => {
          if (!o) dismissPending();
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="modal-pending-invoice">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <DialogTitle className="text-center">
              Você tem uma fatura em aberto
            </DialogTitle>
            <DialogDescription className="text-center">
              {pendingInvoice && (
                <>
                  {(() => {
                    const days = daysUntil(pendingInvoice.due_date);
                    if (days < 0)
                      return (
                        <>
                          Sua fatura de{" "}
                          <strong>{formatBRL(Number(pendingInvoice.amount))}</strong>{" "}
                          venceu há <strong>{Math.abs(days)} dia(s)</strong>.
                          Pague para evitar a perda do seu plano.
                        </>
                      );
                    if (days === 0)
                      return (
                        <>
                          Sua fatura de{" "}
                          <strong>{formatBRL(Number(pendingInvoice.amount))}</strong>{" "}
                          vence <strong>hoje</strong>.
                        </>
                      );
                    return (
                      <>
                        Sua fatura de{" "}
                        <strong>{formatBRL(Number(pendingInvoice.amount))}</strong>{" "}
                        vence em <strong>{days} dia(s)</strong>.
                      </>
                    );
                  })()}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              onClick={handlePayPending}
              className="w-full"
              data-testid="button-pay-pending"
            >
              Pagar agora
            </Button>
            <Button
              variant="ghost"
              onClick={dismissPending}
              className="w-full"
              data-testid="button-dismiss-pending"
            >
              Lembrar mais tarde
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Renovação próxima — só quando não há fatura pendente */}
      <Dialog
        open={showRenewal && !showPending}
        onOpenChange={(o) => {
          if (!o) dismissRenewal();
        }}
      >
        <DialogContent className="sm:max-w-md" data-testid="modal-renewal">
          <DialogHeader>
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-warning/10">
              <Clock className="h-6 w-6 text-warning" />
            </div>
            <DialogTitle className="text-center">
              Sua mensalidade está próxima
            </DialogTitle>
            <DialogDescription className="text-center">
              {plan && sub?.next_due_at && renewalDays !== null && (
                <>
                  O plano <strong>{plan.name}</strong> vence em{" "}
                  <strong>
                    {renewalDays === 0 ? "hoje" : `${renewalDays} dia(s)`}
                  </strong>{" "}
                  ({new Date(sub.next_due_at).toLocaleDateString("pt-BR")}).
                  Gere a fatura e pague via PIX para continuar sem interrupção.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
            <Button
              onClick={handleGenerateRenewal}
              disabled={generating}
              className="w-full"
              data-testid="button-generate-renewal"
            >
              {generating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Gerar fatura agora
            </Button>
            <Button
              variant="ghost"
              onClick={dismissRenewal}
              className="w-full"
              data-testid="button-dismiss-renewal"
            >
              Lembrar mais tarde
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
