import { Link } from "react-router-dom";
import { AlertTriangle, Clock } from "lucide-react";
import { useActiveSubscription, useUpcomingInvoice } from "@/hooks/useSubscription";
import { useCompany } from "@/contexts/CompanyContext";
import { daysUntil, formatBRL } from "@/lib/plans";

export function PlanBanner() {
  const { activeCompany } = useCompany();
  const { data: active } = useActiveSubscription();
  const upcoming = useUpcomingInvoice();

  if (!activeCompany || activeCompany.role !== "owner") return null;

  // Sem assinatura nenhuma → convite a escolher plano
  if (!active?.subscription) {
    return (
      <Link
        to="/planos"
        data-testid="banner-no-plan"
        className="flex items-center gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning hover:bg-warning/15"
      >
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">
          <strong>Você ainda não escolheu um plano.</strong>{" "}
          Selecione um plano para liberar todos os recursos do PDVIO.
        </span>
        <span className="font-medium underline">Ver planos</span>
      </Link>
    );
  }

  // Fatura pendente próxima do vencimento
  if (upcoming) {
    const days = daysUntil(upcoming.due_date);
    if (days <= 7) {
      const overdue = days < 0;
      return (
        <Link
          to="/faturas"
          data-testid="banner-upcoming-invoice"
          className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-sm hover:bg-opacity-80 ${
            overdue
              ? "border-destructive/30 bg-destructive/10 text-destructive"
              : "border-warning/30 bg-warning/10 text-warning"
          }`}
        >
          {overdue ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <Clock className="h-4 w-4 shrink-0" />}
          <span className="flex-1">
            {overdue ? (
              <>
                <strong>Fatura vencida:</strong> {formatBRL(Number(upcoming.amount))} venceu há{" "}
                {Math.abs(days)} dia(s).
              </>
            ) : (
              <>
                <strong>Fatura próxima do vencimento:</strong> {formatBRL(Number(upcoming.amount))} em{" "}
                {days === 0 ? "hoje" : `${days} dia(s)`}.
              </>
            )}
          </span>
          <span className="font-medium underline">Pagar agora</span>
        </Link>
      );
    }
  }

  return null;
}
