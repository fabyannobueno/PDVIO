import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Crown, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { usePlans, useActiveSubscription } from "@/hooks/useSubscription";
import {
  formatBRL,
  formatLimit,
  type BillingCycle,
  type PlanRow,
} from "@/lib/plans";
import { useCompany } from "@/contexts/CompanyContext";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";

export default function Planos() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const { data: plans = [], isFetched: plansFetched } = usePlans();
  const { data: active, isFetched: subFetched } = useActiveSubscription();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const initialLoaded = !!activeCompany?.id && plansFetched && subFetched;
  const currentPlanId = active?.subscription?.plan_id ?? null;

  const sortedPlans = useMemo(
    () => [...plans].sort((a, b) => a.sort_order - b.sort_order),
    [plans]
  );

  async function handleSelect(plan: PlanRow) {
    if (!activeCompany) return;

    if (plan.pricing_type === "custom") {
      window.open("https://www.pdvio.com.br/contato", "_blank");
      return;
    }

    if (plan.pricing_type === "free") {
      try {
        setActivatingId(plan.id);
        const { error } = await (supabase as any).rpc("activate_free_subscription", {
          _company_id: activeCompany.id,
        });
        if (error) throw error;
        toast({ title: "Plano ativado!", description: `Você está no plano ${plan.name}.` });
        await queryClient.invalidateQueries({ queryKey: ["/billing/active-subscription"] });
        navigate("/faturas");
      } catch (e: any) {
        toast({
          title: "Erro ao ativar plano",
          description: e?.message ?? "Tente novamente.",
          variant: "destructive",
        });
      } finally {
        setActivatingId(null);
      }
      return;
    }

    navigate(`/checkout?planId=${plan.id}&billingCycle=${cycle}`);
  }

  if (!initialLoaded) {
    return (
      <div className="space-y-8 p-6 md:p-8 animate-fade-in">
        <div className="space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 md:p-8 animate-fade-in" data-testid="page-planos">
      <div>
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Planos</h1>
        <p className="mt-1 text-muted-foreground">
          Escolha o plano ideal para sua operação. Pagamento via PIX, sem fidelidade.
        </p>
      </div>

      {/* Cycle toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-lg border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setCycle("monthly")}
            data-testid="toggle-monthly"
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              cycle === "monthly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Mensal
          </button>
          <button
            type="button"
            onClick={() => setCycle("yearly")}
            data-testid="toggle-yearly"
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition ${
              cycle === "yearly" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Anual
            <Badge variant="secondary" className="ml-2 text-[10px]">
              Economize
            </Badge>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        {sortedPlans.map((plan) => {
          const isCurrent = currentPlanId === plan.id;
          const isCustom = plan.pricing_type === "custom";
          const isFree = plan.pricing_type === "free";
          const monthly = Number(plan.price_monthly);
          const yearly = Number(plan.price_yearly);
          const yearlyMonthlyEq = yearly > 0 ? yearly / 12 : 0;
          const isLoading = activatingId === plan.id;

          return (
            <div
              key={plan.id}
              data-testid={`card-plan-${plan.id}`}
              className={`relative flex flex-col rounded-2xl border p-6 transition ${
                plan.highlight
                  ? "border-primary shadow-lg shadow-primary/10 bg-gradient-to-b from-primary/5 to-transparent"
                  : "border-border bg-card"
              }`}
            >
              {plan.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1">
                  <Sparkles className="h-3 w-3" /> Mais popular
                </Badge>
              )}
              {isCurrent && (
                <Badge variant="secondary" className="absolute -top-3 right-4 gap-1">
                  <Crown className="h-3 w-3" /> Atual
                </Badge>
              )}

              <div className="flex-1 space-y-4">
                <div>
                  <h3 className="text-xl font-bold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground min-h-[2.5rem]">
                    {plan.description}
                  </p>
                </div>

                <div>
                  {isCustom ? (
                    <div>
                      <p className="text-2xl font-bold">Sob consulta</p>
                      <p className="text-xs text-muted-foreground">Plano personalizado</p>
                    </div>
                  ) : isFree ? (
                    <div>
                      <p className="text-3xl font-bold">R$ 0</p>
                      <p className="text-xs text-muted-foreground">para sempre</p>
                    </div>
                  ) : cycle === "yearly" ? (
                    <div>
                      <p className="text-3xl font-bold">
                        {formatBRL(yearlyMonthlyEq)}
                        <span className="text-sm font-normal text-muted-foreground">/mês</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Cobrado {formatBRL(yearly)} anualmente
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="text-3xl font-bold">
                        {formatBRL(monthly)}
                        <span className="text-sm font-normal text-muted-foreground">/mês</span>
                      </p>
                      <p className="text-xs text-muted-foreground">Cobrado mensalmente</p>
                    </div>
                  )}
                </div>

                <ul className="space-y-2">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="border-t pt-3 text-xs text-muted-foreground space-y-1">
                  <div className="flex justify-between">
                    <span>Lojas</span>
                    <span className="font-medium text-foreground">{formatLimit(plan.max_stores)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Produtos</span>
                    <span className="font-medium text-foreground">{formatLimit(plan.max_products)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Usuários</span>
                    <span className="font-medium text-foreground">{formatLimit(plan.max_users)}</span>
                  </div>
                </div>
              </div>

              <Button
                className="mt-6 w-full"
                variant={plan.highlight ? "default" : "outline"}
                onClick={() => handleSelect(plan)}
                disabled={isCurrent || isLoading}
                data-testid={`button-select-${plan.id}`}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isCurrent
                  ? "Plano atual"
                  : isCustom
                  ? "Entrar em contato"
                  : isFree
                  ? "Começar grátis"
                  : cycle === "yearly"
                  ? "Assinar anual"
                  : "Assinar mensal"}
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
