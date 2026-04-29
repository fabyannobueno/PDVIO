import { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Crown, Lock, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { isRoutePlanAllowed, minPlanForRoute, PLAN_LABEL } from "@/lib/planAccess";

interface Props {
  children: ReactNode;
}

/**
 * Bloqueia o acesso à página atual se o plano da empresa não a inclui.
 * Mostra uma tela amigável com um CTA para a página de planos.
 */
export function PlanGuard({ children }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const { loading, planId } = usePlanLimits();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isRoutePlanAllowed(planId, location.pathname)) {
    return <>{children}</>;
  }

  const required = minPlanForRoute(location.pathname);
  const requiredLabel = required ? PLAN_LABEL[required] ?? required : "superior";

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-8 animate-fade-in">
      <Card className="max-w-lg border-border/60 shadow-elev-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-xl font-semibold">Recurso disponível em planos superiores</h2>
          <p className="text-sm text-muted-foreground">
            Esta página faz parte do plano <strong>{requiredLabel}</strong> ou superior.
            Faça upgrade do seu plano para liberar este e outros recursos.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => navigate("/planos")} size="lg" className="gap-2">
              <Crown className="h-4 w-4" />
              Ver planos
            </Button>
            <Button onClick={() => navigate("/")} variant="outline" size="lg">
              Voltar para o início
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
