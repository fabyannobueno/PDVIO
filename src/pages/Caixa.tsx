import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { useOperator } from "@/contexts/OperatorContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { logAudit } from "@/lib/auditLog";
import {
  Wallet,
  Lock,
  Unlock,
  ArrowDownCircle,
  ArrowUpCircle,
  Banknote,
  CreditCard,
  QrCode,
  Ticket,
  Receipt,
  Calculator,
  AlertTriangle,
  CheckCircle2,
  Archive,
} from "lucide-react";

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

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

const PAYMENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  cash: { label: "Dinheiro", icon: Banknote, color: "text-emerald-500" },
  credit_card: { label: "Crédito", icon: CreditCard, color: "text-blue-500" },
  debit_card: { label: "Débito", icon: CreditCard, color: "text-violet-500" },
  pix: { label: "PIX", icon: QrCode, color: "text-primary" },
  ticket: { label: "Ticket", icon: Ticket, color: "text-orange-500" },
};

// ── Types ──────────────────────────────────────────────────────────────────────
type CashSession = {
  id: string;
  company_id: string;
  opened_by: string;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  opening_amount: number;
  expected_amount: number | null;
  closing_amount: number | null;
  difference: number | null;
  status: "open" | "closed";
  notes: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
};

type CashMovement = {
  id: string;
  type: "sangria" | "suprimento";
  amount: number;
  reason: string | null;
  created_at: string;
};

type SaleRow = {
  id: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
};

type RefundRow = {
  id: string;
  amount: number;
  refund_method: string;
};

// ── Page ───────────────────────────────────────────────────────────────────────
export default function Caixa() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { activeOperator } = useOperator();
  const qc = useQueryClient();

  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [moveDialog, setMoveDialog] = useState<null | "sangria" | "suprimento">(null);
  const [openingAmount, setOpeningAmount] = useState("");
  const [closingAmount, setClosingAmount] = useState("");
  const [closingNotes, setClosingNotes] = useState("");
  const [moveAmount, setMoveAmount] = useState("");
  const [moveReason, setMoveReason] = useState("");
  const [moveReasonPreset, setMoveReasonPreset] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const SANGRIA_REASONS = ["Depósito bancário", "Troco para outro caixa", "Retirada do proprietário", "Sangria de segurança", "Outro"];
  const SUPRIMENTO_REASONS = ["Reforço de troco", "Entrada de caixa", "Fundo de abertura", "Transferência interna", "Outro"];

  // ── Manager authorization ───────────────────────────────────────────────────
  type AuthAction = "sangria" | "suprimento" | "openCash" | "closeCash";
  const [authDialog, setAuthDialog] = useState(false);
  const [authPendingAction, setAuthPendingAction] = useState<AuthAction | null>(null);
  const [authBadge, setAuthBadge] = useState("");
  const [authPin, setAuthPin] = useState("");
  const [authVerifying, setAuthVerifying] = useState(false);
  const [authorizedStaff, setAuthorizedStaff] = useState<{ id: string; name: string; role: string } | null>(null);
  const authBadgeRef = useRef<HTMLInputElement>(null);
  const authPinRef = useRef<HTMLInputElement>(null);

  const AUTH_ACTION_LABEL: Record<AuthAction, string> = {
    sangria: "sangria",
    suprimento: "suprimento",
    openCash: "abertura de caixa",
    closeCash: "fechamento de caixa",
  };

  function requestAuth(action: AuthAction) {
    setAuthBadge("");
    setAuthPin("");
    setAuthorizedStaff(null);
    setAuthPendingAction(action);
    setAuthDialog(true);
  }

  async function verifyManager() {
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
      setAuthorizedStaff({ id: staff.id, name: staff.name, role: staff.role });
      setAuthDialog(false);
      // dispatch to the correct action
      if (authPendingAction === "sangria") setMoveDialog("sangria");
      else if (authPendingAction === "suprimento") setMoveDialog("suprimento");
      else if (authPendingAction === "openCash") setOpenDialog(true);
      else if (authPendingAction === "closeCash") {
        setClosingAmount(maskMoneyFromDigits(String(Math.round(expectedCash * 100))));
        setCloseDialog(true);
      }
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao verificar");
    } finally {
      setAuthVerifying(false);
    }
  }

  // ── Active session ──────────────────────────────────────────────────────────
  const { data: activeSession, isLoading: loadingActive, isFetched: activeFetched } = useQuery({
    queryKey: ["/caixa/active", activeCompany?.id, activeOperator?.id ?? user?.id ?? null],
    enabled: !!activeCompany && !!user?.id,
    queryFn: async () => {
      let q = (supabase as any)
        .from("cash_sessions")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .eq("status", "open");
      if (activeOperator?.id) {
        q = q.eq("operator_id", activeOperator.id);
      } else {
        q = q.is("operator_id", null).eq("opened_by", user!.id);
      }
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      return data as CashSession | null;
    },
  });

  // ── Movements during active session ────────────────────────────────────────
  const { data: movements = [] } = useQuery({
    queryKey: ["/caixa/movements", activeSession?.id],
    enabled: !!activeSession,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cash_movements")
        .select("*")
        .eq("cash_session_id", activeSession!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CashMovement[];
    },
  });

  // ── Sales during active session ────────────────────────────────────────────
  const { data: sessionSales = [] } = useQuery({
    queryKey: ["/caixa/sales", activeSession?.id],
    enabled: !!activeSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, payment_method, status, created_at")
        .eq("cash_session_id" as any, activeSession!.id)
        .eq("status", "completed");
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
  });

  // ── Cancelled sales during active session ──────────────────────────────────
  const { data: cancelledSales = [] } = useQuery({
    queryKey: ["/caixa/cancelled", activeSession?.id],
    enabled: !!activeSession,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, payment_method, status, created_at")
        .eq("cash_session_id" as any, activeSession!.id)
        .eq("status", "cancelled");
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
  });

  // ── Refunds during active session ───────────────────────────────────────────
  const { data: sessionRefunds = [] } = useQuery({
    queryKey: ["/caixa/refunds", activeSession?.id],
    enabled: !!activeSession,
    queryFn: async () => {
      const { data: sales } = await supabase
        .from("sales")
        .select("id")
        .eq("cash_session_id" as any, activeSession!.id);
      if (!sales?.length) return [] as RefundRow[];
      const saleIds = sales.map((s) => s.id);
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("id, amount, refund_method")
        .in("sale_id", saleIds);
      if (error) throw error;
      return (data ?? []) as RefundRow[];
    },
  });

  // ── Recent sessions ────────────────────────────────────────────────────────
  const { data: recentSessions = [] } = useQuery({
    queryKey: ["/caixa/recent", activeCompany?.id, activeOperator?.id ?? null],
    enabled: !!activeCompany,
    queryFn: async () => {
      let q = (supabase as any)
        .from("cash_sessions")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .eq("status", "closed")
        .order("closed_at", { ascending: false })
        .limit(10);
      // Operadores veem só as próprias sessões; gerentes/donos veem todas
      if (activeOperator?.id) {
        q = q.eq("operator_id", activeOperator.id);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CashSession[];
    },
  });

  // ── Outras sessões abertas (visão consolidada para gerência) ───────────────
  const isManagerView = !activeOperator && (activeCompany?.role === "owner" || activeCompany?.role === "manager");
  type OpenSessionSummary = CashSession & { operator_name?: string | null };
  const { data: otherOpenSessions = [] } = useQuery<OpenSessionSummary[]>({
    queryKey: ["/caixa/all-open", activeCompany?.id],
    enabled: !!activeCompany && isManagerView,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cash_sessions")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .eq("status", "open")
        .order("opened_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenSessionSummary[];
    },
  });

  // ── Calculations ───────────────────────────────────────────────────────────
  const breakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const s of sessionSales) {
      const m = s.payment_method;
      if (!map[m]) map[m] = { count: 0, total: 0 };
      map[m].count += 1;
      map[m].total += Number(s.total);
    }
    return map;
  }, [sessionSales]);

  const totalSales = useMemo(
    () => sessionSales.reduce((s, v) => s + Number(v.total), 0),
    [sessionSales]
  );

  const totalCashSales = breakdown["cash"]?.total ?? 0;
  const totalSuprimento = useMemo(
    () => movements.filter((m) => m.type === "suprimento").reduce((s, v) => s + Number(v.amount), 0),
    [movements]
  );
  const totalSangria = useMemo(
    () => movements.filter((m) => m.type === "sangria").reduce((s, v) => s + Number(v.amount), 0),
    [movements]
  );
  const totalCancelled = useMemo(
    () => cancelledSales.reduce((s, v) => s + Number(v.total), 0),
    [cancelledSales]
  );
  const totalRefunds = useMemo(
    () => sessionRefunds.reduce((s, v) => s + Number(v.amount), 0),
    [sessionRefunds]
  );
  const totalCashRefunds = useMemo(
    () => sessionRefunds.filter((r) => r.refund_method === "cash").reduce((s, v) => s + Number(v.amount), 0),
    [sessionRefunds]
  );

  const expectedCash =
    Number(activeSession?.opening_amount ?? 0) + totalCashSales + totalSuprimento - totalSangria - totalCashRefunds;

  const declaredCash = parseMaskedMoney(closingAmount);
  const closingDifference = declaredCash - expectedCash;

  // ── Actions ────────────────────────────────────────────────────────────────
  async function handleOpen() {
    if (!activeCompany || !user) return;
    setSubmitting(true);
    try {
      const amount = parseMaskedMoney(openingAmount);
      const { data: inserted, error } = await (supabase as any)
        .from("cash_sessions")
        .insert({
          company_id: activeCompany.id,
          opened_by: user.id,
          opening_amount: amount,
          operator_id: activeOperator?.id ?? null,
          operator_name: activeOperator?.name ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      logAudit({
        companyId: activeCompany.id,
        action: "cash.opened",
        entityType: "cash_session",
        entityId: inserted?.id ?? null,
        description: `Abriu caixa com ${fmtBRL(amount)}`,
        metadata: { opening_amount: amount },
        staffId: authorizedStaff?.id ?? null,
        staffName: authorizedStaff?.name ?? null,
      });
      toast.success("Caixa aberto");
      setOpenDialog(false);
      setOpeningAmount("");
      qc.invalidateQueries({ queryKey: ["/caixa/active"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao abrir caixa");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClose() {
    if (!activeSession || !user) return;
    setSubmitting(true);
    try {
      const { error } = await (supabase as any)
        .from("cash_sessions")
        .update({
          status: "closed",
          closed_at: new Date().toISOString(),
          closed_by: user.id,
          closing_amount: declaredCash,
          expected_amount: expectedCash,
          difference: closingDifference,
          notes: closingNotes || null,
        })
        .eq("id", activeSession.id);
      if (error) throw error;
      logAudit({
        companyId: activeCompany!.id,
        action: "cash.closed",
        entityType: "cash_session",
        entityId: activeSession.id,
        description: `Fechou caixa — declarado ${fmtBRL(declaredCash)}, esperado ${fmtBRL(expectedCash)}, diferença ${fmtBRL(closingDifference)}`,
        metadata: {
          declared: declaredCash,
          expected: expectedCash,
          difference: closingDifference,
          notes: closingNotes || null,
        },
        staffId: authorizedStaff?.id ?? null,
        staffName: authorizedStaff?.name ?? null,
      });
      toast.success("Caixa fechado");
      setCloseDialog(false);
      setClosingAmount("");
      setClosingNotes("");
      qc.invalidateQueries({ queryKey: ["/caixa/active"] });
      qc.invalidateQueries({ queryKey: ["/caixa/recent"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao fechar caixa");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleMovement() {
    if (!activeSession || !activeCompany || !user || !moveDialog) return;
    const amount = parseMaskedMoney(moveAmount);
    if (amount <= 0) {
      toast.error("Valor inválido");
      return;
    }
    setSubmitting(true);
    try {
      const reasonText =
        (moveReasonPreset && moveReasonPreset !== "Outro" ? moveReasonPreset : moveReason) || null;
      const { data: insertedMov, error } = await (supabase as any)
        .from("cash_movements")
        .insert({
          cash_session_id: activeSession.id,
          company_id: activeCompany.id,
          type: moveDialog,
          amount,
          reason: reasonText,
          created_by: user.id,
          authorized_by_staff_id: moveDialog === "sangria" ? authorizedStaff?.id ?? null : null,
          authorized_by_name: moveDialog === "sangria" ? authorizedStaff?.name ?? null : null,
        })
        .select("id")
        .single();
      if (error) throw error;
      logAudit({
        companyId: activeCompany.id,
        action: "cash.movement",
        entityType: "cash_movement",
        entityId: insertedMov?.id ?? null,
        description: `${moveDialog === "sangria" ? "Sangria" : "Suprimento"} de ${fmtBRL(amount)}${reasonText ? ` — ${reasonText}` : ""}`,
        metadata: { type: moveDialog, amount, reason: reasonText },
        staffId: authorizedStaff?.id ?? null,
        staffName: authorizedStaff?.name ?? null,
      });
      toast.success(moveDialog === "sangria" ? "Sangria registrada" : "Suprimento registrado");
      setMoveDialog(null);
      setMoveAmount("");
      setMoveReason("");
      setMoveReasonPreset(null);
      setAuthorizedStaff(null);
      qc.invalidateQueries({ queryKey: ["/caixa/movements"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao registrar movimento");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  // Skeleton de página inteira no carregamento inicial. Após carregar pela
  // primeira vez, refetches em segundo plano não exibem o skeleton novamente.
  const initialLoaded = !!activeCompany?.id && activeFetched;

  if (!initialLoaded) {
    return (
      <div className="space-y-6 p-4 sm:p-6 md:p-8 animate-fade-in">
        {/* Header skeleton */}
        <div className="space-y-2">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        {/* Status card skeleton */}
        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-lg" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-40" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-24" />
              <Skeleton className="h-9 w-28" />
            </div>
          </div>
        </div>

        {/* Summary cards skeleton */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>

        {/* List card skeleton */}
        <div className="rounded-xl border border-border/60 bg-card p-4 sm:p-6 space-y-4">
          <div className="space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64 max-w-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-3">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 md:p-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Caixa</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Controle de abertura, fechamento, sangria e suprimento.
        </p>
      </div>

      {isManagerView && otherOpenSessions.filter((s) => s.id !== activeSession?.id).length > 0 && (
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Outros caixas abertos</CardTitle>
            <CardDescription className="text-xs">
              Sessões em andamento por outros operadores nesta empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y divide-border">
              {otherOpenSessions
                .filter((s) => s.id !== activeSession?.id)
                .map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center justify-between gap-3 py-2.5"
                    data-testid={`row-other-open-${s.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {s.operator_name ?? "Sem operador"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Aberto em {fmtDateTime(s.opened_at)} · {fmtBRL(Number(s.opening_amount))}
                      </p>
                    </div>
                    <Badge variant="secondary" className="text-[10px] uppercase">
                      Aberto
                    </Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {loadingActive ? (
        <Skeleton className="h-48 w-full" />
      ) : !activeSession ? (
        // ── No open session ─────────────────────────────────────────────────
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
            <div className="rounded-full bg-muted p-4">
              <Wallet className="h-8 w-8 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-semibold">Nenhum caixa aberto</p>
              <p className="text-sm text-muted-foreground mt-1">
                Abra o caixa para começar a registrar vendas em dinheiro.
              </p>
            </div>
            <Button
              onClick={() => requestAuth("openCash")}
              data-testid="button-open-cash"
              className="gap-2"
            >
              <Unlock className="h-4 w-4" />
              Abrir caixa
            </Button>
          </CardContent>
        </Card>
      ) : (
        // ── Active session ──────────────────────────────────────────────────
        <>
          {/* Status header */}
          <Card className="border-border/60">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-500">
                  <Unlock className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-base font-semibold">Caixa aberto</p>
                    {activeSession.operator_name && (
                      <Badge variant="outline" className="text-xs" data-testid="badge-caixa-operador">
                        {activeSession.operator_name}
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-xs">
                      {fmtDateTime(activeSession.opened_at)}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Abertura: {fmtBRL(Number(activeSession.opening_amount))}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestAuth("suprimento")}
                  className="gap-2"
                  data-testid="button-suprimento"
                >
                  <ArrowDownCircle className="h-4 w-4 text-emerald-500" />
                  Suprimento
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => requestAuth("sangria")}
                  className="gap-2"
                  data-testid="button-sangria"
                >
                  <ArrowUpCircle className="h-4 w-4 text-amber-500" />
                  Sangria
                </Button>
                <Button
                  size="sm"
                  onClick={() => requestAuth("closeCash")}
                  className="gap-2"
                  data-testid="button-close-cash"
                >
                  <Lock className="h-4 w-4" />
                  Fechar caixa
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[
              {
                label: "Vendas no caixa",
                value: fmtBRL(totalSales),
                icon: Receipt,
                color: "text-primary",
                negative: false,
              },
              {
                label: "Dinheiro vendido",
                value: fmtBRL(totalCashSales),
                icon: Banknote,
                color: "text-emerald-500",
                negative: false,
              },
              {
                label: "Suprimentos",
                value: fmtBRL(totalSuprimento),
                icon: ArrowDownCircle,
                color: "text-emerald-500",
                negative: false,
              },
              {
                label: "Sangrias",
                value: fmtBRL(totalSangria),
                icon: ArrowUpCircle,
                color: "text-amber-500",
                negative: true,
              },
              {
                label: "Cancelamentos",
                value: fmtBRL(totalCancelled),
                icon: AlertTriangle,
                color: "text-destructive",
                negative: true,
              },
              {
                label: "Devoluções",
                value: fmtBRL(totalRefunds),
                icon: CheckCircle2,
                color: "text-destructive",
                negative: true,
              },
            ].map((k) => (
              <Card key={k.label} className="border-border/60">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {k.label}
                      </p>
                      <p className={`mt-2 text-2xl font-bold ${k.negative && (k.label === "Cancelamentos" ? totalCancelled > 0 : totalRefunds > 0) ? "text-destructive" : ""}`}>
                        {k.negative ? "−" : ""}{k.value}
                      </p>
                    </div>
                    <div className={`rounded-lg bg-muted p-2 ${k.color}`}>
                      <k.icon className="h-5 w-5" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Expected cash card */}
          <Card className="border-primary/40 bg-primary/5">
            <CardContent className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <Calculator className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Saldo esperado em dinheiro</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Abertura + dinheiro vendido + suprimentos − sangrias − devoluções em dinheiro
                  </p>
                </div>
              </div>
              <p className="text-2xl font-bold text-primary" data-testid="text-expected-cash">
                {fmtBRL(expectedCash)}
              </p>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            {/* Payment breakdown */}
            <Card className="border-border/60 min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">Vendas por forma de pagamento</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {Object.keys(breakdown).length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma venda registrada nesse caixa ainda.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {Object.entries(breakdown).map(([method, { count, total }]) => {
                      const cfg = PAYMENT_CONFIG[method] ?? {
                        label: method,
                        icon: Receipt,
                        color: "text-muted-foreground",
                      };
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={method}
                          className="flex items-center justify-between px-4 py-3"
                        >
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${cfg.color}`} />
                            <span className="text-sm font-medium">{cfg.label}</span>
                            <span className="text-xs text-muted-foreground">({count})</span>
                          </div>
                          <span className="text-sm font-semibold">{fmtBRL(total)}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Movements list */}
            <Card className="border-border/60 min-w-0 overflow-hidden">
              <CardHeader>
                <CardTitle className="text-base">Movimentações de caixa</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {movements.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhuma sangria ou suprimento.
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {movements.map((m) => {
                      const isOut = m.type === "sangria";
                      return (
                        <div
                          key={m.id}
                          className="flex items-center justify-between px-4 py-3"
                          data-testid={`movement-${m.id}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            {isOut ? (
                              <ArrowUpCircle className="h-4 w-4 text-amber-500 shrink-0" />
                            ) : (
                              <ArrowDownCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium capitalize">{m.type}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {m.reason || fmtDateTime(m.created_at)}
                              </p>
                            </div>
                          </div>
                          <span
                            className={`text-sm font-semibold shrink-0 ${
                              isOut ? "text-amber-500" : "text-emerald-500"
                            }`}
                          >
                            {isOut ? "−" : "+"}
                            {fmtBRL(Number(m.amount))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Recent sessions */}
      <Card className="border-border/60 min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Histórico de fechamentos</CardTitle>
          <CardDescription>Últimos 10 caixas fechados.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {recentSessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
              <div className="rounded-full bg-muted p-4">
                <Archive className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Nenhum caixa fechado ainda.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {recentSessions.map((s) => {
                const diff = Number(s.difference ?? 0);
                const ok = Math.abs(diff) < 0.01;
                return (
                  <div
                    key={s.id}
                    className="flex items-center justify-between px-4 py-3"
                    data-testid={`session-${s.id}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {fmtDateTime(s.opened_at)} → {s.closed_at ? fmtDateTime(s.closed_at) : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Esperado: {fmtBRL(Number(s.expected_amount ?? 0))} · Declarado:{" "}
                        {fmtBRL(Number(s.closing_amount ?? 0))}
                      </p>
                    </div>
                    <Badge
                      variant={ok ? "secondary" : "destructive"}
                      className="font-mono text-xs shrink-0"
                    >
                      {ok ? (
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                      ) : (
                        <AlertTriangle className="h-3 w-3 mr-1" />
                      )}
                      {diff >= 0 ? "+" : ""}
                      {fmtBRL(diff)}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Open dialog ─────────────────────────────────────────────────────── */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Abrir caixa</DialogTitle>
            <DialogDescription>
              Informe o valor em dinheiro disponível para troco no início do turno.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="opening">Valor de abertura (R$)</Label>
            <Input
              id="opening"
              data-testid="input-opening-amount"
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={openingAmount ? `R$ ${openingAmount}` : ""}
              onChange={(e) => setOpeningAmount(maskMoneyFromDigits(e.target.value))}
              className="text-left font-mono"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpenDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleOpen} disabled={submitting} data-testid="button-confirm-open">
              Abrir caixa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close dialog ────────────────────────────────────────────────────── */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar caixa</DialogTitle>
            <DialogDescription>
              Confira o valor em dinheiro contado e registre o fechamento.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg bg-muted p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Abertura</span>
                <span>{fmtBRL(Number(activeSession?.opening_amount ?? 0))}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">+ Dinheiro vendido</span>
                <span className="text-emerald-600">+{fmtBRL(totalCashSales)}</span>
              </div>
              {totalSuprimento > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">+ Suprimentos</span>
                  <span className="text-emerald-600">+{fmtBRL(totalSuprimento)}</span>
                </div>
              )}
              {totalSangria > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− Sangrias</span>
                  <span className="text-amber-600">−{fmtBRL(totalSangria)}</span>
                </div>
              )}
              {totalCashRefunds > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">− Devoluções em dinheiro</span>
                  <span className="text-destructive">−{fmtBRL(totalCashRefunds)}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border pt-1.5 font-semibold">
                <span>Esperado em dinheiro</span>
                <span>{fmtBRL(expectedCash)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="closing">Valor contado (R$)</Label>
              <Input
                id="closing"
                data-testid="input-closing-amount"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={closingAmount ? `R$ ${closingAmount}` : ""}
                onChange={(e) => setClosingAmount(maskMoneyFromDigits(e.target.value))}
                className="text-left font-mono"
              />
            </div>
            <div
              className={`rounded-lg p-3 text-sm font-semibold flex justify-between ${
                Math.abs(closingDifference) < 0.01
                  ? "bg-emerald-500/10 text-emerald-600"
                  : closingDifference > 0
                  ? "bg-blue-500/10 text-blue-600"
                  : "bg-amber-500/10 text-amber-600"
              }`}
            >
              <span>Diferença</span>
              <span>
                {closingDifference >= 0 ? "+" : ""}
                {fmtBRL(closingDifference)}
              </span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">Observações (opcional)</Label>
              <Textarea
                id="notes"
                value={closingNotes}
                onChange={(e) => setClosingNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCloseDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleClose} disabled={submitting} data-testid="button-confirm-close">
              Confirmar fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Manager auth dialog ─────────────────────────────────────────────── */}
      <Dialog
        open={authDialog}
        onOpenChange={(o) => {
          setAuthDialog(o);
          if (o) setTimeout(() => authBadgeRef.current?.focus(), 50);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Autorização de gerente</DialogTitle>
            <DialogDescription>
              Bipe o cartão do gerente e digite a senha para liberar{" "}
              {authPendingAction ? AUTH_ACTION_LABEL[authPendingAction] : "a operação"}.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); verifyManager(); }} className="space-y-3" autoComplete="off">
            <div style={{ position: "absolute", top: -9999, left: -9999, height: 0, width: 0, overflow: "hidden" }} aria-hidden="true">
              <input type="text" name="username" tabIndex={-1} autoComplete="username" />
              <input type="password" name="password" tabIndex={-1} autoComplete="current-password" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="auth-badge">Cartão</Label>
              <Input
                id="auth-badge"
                ref={authBadgeRef}
                name="auth-badge"
                value={authBadge}
                onChange={(e) => setAuthBadge(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    authPinRef.current?.focus();
                  }
                }}
                placeholder="Bipe o cartão..."
                className="font-mono text-center"
                data-testid="input-auth-badge"
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
              <Label htmlFor="auth-pin">Senha</Label>
              <Input
                id="auth-pin"
                ref={authPinRef}
                name="auth-pin"
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={authPin}
                onChange={(e) => setAuthPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    verifyManager();
                  }
                }}
                placeholder="••••"
                className="text-center font-mono text-lg tracking-widest [-webkit-text-security:disc] [text-security:disc]"
                style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
                data-testid="input-auth-pin"
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
              onClick={verifyManager}
              disabled={authVerifying}
              data-testid="button-confirm-auth"
            >
              {authVerifying ? "Verificando..." : "Autorizar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Movement dialog ─────────────────────────────────────────────────── */}
      <Dialog open={!!moveDialog} onOpenChange={(o) => { if (!o) { setMoveDialog(null); setMoveReasonPreset(null); setMoveReason(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {moveDialog === "sangria" ? "Registrar sangria" : "Registrar suprimento"}
            </DialogTitle>
            <DialogDescription>
              {moveDialog === "sangria"
                ? "Retirada de dinheiro do caixa (depósito, troco para outro caixa, etc.)."
                : "Adição de dinheiro ao caixa (reforço de troco, depósito inicial, etc.)."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="amount">Valor (R$)</Label>
              <Input
                id="amount"
                data-testid="input-movement-amount"
                inputMode="numeric"
                placeholder="R$ 0,00"
                value={moveAmount ? `R$ ${moveAmount}` : ""}
                onChange={(e) => setMoveAmount(maskMoneyFromDigits(e.target.value))}
                className="text-left font-mono"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <div className="flex flex-wrap gap-2">
                {(moveDialog === "sangria" ? SANGRIA_REASONS : SUPRIMENTO_REASONS).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => { setMoveReasonPreset(opt); if (opt !== "Outro") setMoveReason(""); }}
                    className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                      moveReasonPreset === opt
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-muted hover:bg-accent"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              {moveReasonPreset === "Outro" && (
                <Input
                  autoFocus
                  value={moveReason}
                  onChange={(e) => setMoveReason(e.target.value)}
                  placeholder="Descreva o motivo..."
                  data-testid="input-move-reason-custom"
                />
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMoveDialog(null); setMoveReasonPreset(null); setMoveReason(""); }}>
              Cancelar
            </Button>
            <Button onClick={handleMovement} disabled={submitting} data-testid="button-confirm-movement">
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
