import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseMixedNote } from "@/lib/mixedPayment";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  TrendingUp,
  ShoppingCart,
  Tag,
  CreditCard,
  Banknote,
  BookOpen,
  QrCode,
  Ticket,
  Receipt,
  ChevronLeft,
  ChevronRight,
  Ban,
  Undo2,
  TrendingDown,
  BarChart3,
} from "lucide-react";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " + d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

type Period = "today" | "week" | "month" | "year";

function periodRange(period: Period): { start: string; end: string; label: string } {
  const now = new Date();
  let start: Date;
  let label: string;

  if (period === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    label = "Hoje";
  } else if (period === "week") {
    const day = now.getDay();
    start = new Date(now);
    start.setDate(now.getDate() - day);
    start.setHours(0, 0, 0, 0);
    label = "Esta semana";
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
    label = "Este mês";
  } else {
    start = new Date(now.getFullYear(), 0, 1);
    label = "Este ano";
  }

  const end = new Date();
  return { start: start.toISOString(), end: end.toISOString(), label };
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

const PAGE_SIZE = 10;

// ── Component ──────────────────────────────────────────────────────────────────

export default function Financeiro() {
  const { activeCompany } = useCompany();
  const [period, setPeriod] = useState<Period>("today");
  const [page, setPage] = useState(1);
  const [showCancelled, setShowCancelled] = useState(false);

  const { start, end } = useMemo(() => periodRange(period), [period]);

  // ── Completed sales ──────────────────────────────────────────────────────
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["/financeiro/sales", activeCompany?.id, start, end],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, subtotal, discount_amount, payment_method, status, created_at, notes")
        .eq("company_id", activeCompany!.id)
        .eq("status", "completed")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Cancelled sales ──────────────────────────────────────────────────────
  const { data: cancelledSales = [], isLoading: loadingCancelled } = useQuery({
    queryKey: ["/financeiro/cancelled", activeCompany?.id, start, end],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, subtotal, discount_amount, payment_method, status, created_at, cancellation_reason, cancelled_at")
        .eq("company_id", activeCompany!.id)
        .eq("status", "cancelled")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Refunds ──────────────────────────────────────────────────────────────
  const saleIds = useMemo(() => sales.map((s) => s.id), [sales]);
  const { data: refunds = [], isLoading: loadingRefunds } = useQuery({
    queryKey: ["/financeiro/refunds", saleIds],
    enabled: saleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("id, sale_id, amount, refund_method, reason, created_at")
        .in("sale_id", saleIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        sale_id: string;
        amount: number;
        refund_method: string;
        reason: string;
        created_at: string;
      }>;
    },
  });

  const isLoading = loadingSales || loadingCancelled || loadingRefunds;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalBruto = useMemo(() => sales.reduce((s, v) => s + Number(v.total), 0), [sales]);
  const totalRefundedAmount = useMemo(() => refunds.reduce((s, r) => s + Number(r.amount), 0), [refunds]);
  const totalCancelledAmount = useMemo(() => cancelledSales.reduce((s, v) => s + Number(v.total), 0), [cancelledSales]);
  const totalReceita = totalBruto - totalRefundedAmount;
  const totalVendas = sales.length;
  const ticketMedio = totalVendas > 0 ? totalReceita / totalVendas : 0;
  const totalDescontos = useMemo(
    () => sales.reduce((s, v) => s + Number(v.discount_amount ?? 0), 0),
    [sales]
  );

  const refundsBySaleId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of refunds) {
      map[r.sale_id] = (map[r.sale_id] ?? 0) + Number(r.amount);
    }
    return map;
  }, [refunds]);

  // ── Breakdown por pagamento ────────────────────────────────────────────────
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const s of sales as any[]) {
      const refund = refundsBySaleId[s.id] ?? 0;
      const net = Number(s.total) - refund;
      if (s.payment_method === "mixed") {
        const splits = parseMixedNote(s.notes);
        const sum = splits.reduce((a, b) => a + b.amount, 0);
        if (splits.length > 0 && sum > 0) {
          for (const sp of splits) {
            if (!map[sp.method]) map[sp.method] = { count: 0, total: 0 };
            map[sp.method].count += 1;
            // Distribui o reembolso proporcionalmente
            map[sp.method].total += sp.amount - (refund * sp.amount) / sum;
          }
          continue;
        }
      }
      const m = s.payment_method;
      if (!map[m]) map[m] = { count: 0, total: 0 };
      map[m].count += 1;
      map[m].total += net;
    }
    return Object.entries(map)
      .map(([method, { count, total }]) => ({ method, count, total }))
      .sort((a, b) => b.total - a.total);
  }, [sales, refundsBySaleId]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (period === "today") {
      const buckets: Record<number, number> = {};
      for (let h = 0; h < 24; h++) buckets[h] = 0;
      for (const s of sales) {
        const h = new Date(s.created_at).getHours();
        buckets[h] += Number(s.total) - (refundsBySaleId[s.id] ?? 0);
      }
      return Object.entries(buckets).map(([h, total]) => ({
        label: `${String(h).padStart(2, "0")}h`,
        total,
      }));
    }

    const localKey = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

    const buckets = new Map<string, { total: number; date: Date }>();
    const startDate = new Date(start);
    const endDate = new Date(end);
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
    while (cursor <= endDate) {
      buckets.set(localKey(cursor), { total: 0, date: new Date(cursor) });
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const s of sales) {
      const bucket = buckets.get(localKey(new Date(s.created_at)));
      if (bucket) bucket.total += Number(s.total) - (refundsBySaleId[s.id] ?? 0);
    }
    const fmt = period === "year"
      ? (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })
      : (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return Array.from(buckets.values()).map(({ date, total }) => ({
      label: fmt(date),
      total,
    }));
  }, [sales, period, start, end, refundsBySaleId]);

  const chartTitle = period === "today" ? "Receita líquida por hora" : "Receita líquida por dia";

  // ── Pagination ─────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sales.length / PAGE_SIZE));
  const paginated = sales.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handlePeriodChange = (v: Period) => {
    setPeriod(v);
    setPage(1);
  };

  const kpis = [
    { label: "Receita líquida", value: fmtBRL(totalReceita), icon: Wallet, color: "text-primary" },
    { label: "Nº de vendas", value: String(totalVendas), icon: ShoppingCart, color: "text-primary" },
    { label: "Ticket médio", value: fmtBRL(ticketMedio), icon: TrendingUp, color: "text-primary" },
    { label: "Descontos", value: fmtBRL(totalDescontos), icon: Tag, color: "text-amber-500" },
    {
      label: "Cancelamentos",
      value: cancelledSales.length > 0 ? `${cancelledSales.length} (${fmtBRL(totalCancelledAmount)})` : "0",
      icon: Ban,
      color: "text-destructive",
    },
    {
      label: "Devoluções",
      value: refunds.length > 0 ? `${refunds.length} (${fmtBRL(totalRefundedAmount)})` : "0",
      icon: Undo2,
      color: "text-amber-500",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Receitas e movimentações da empresa.</p>
        </div>
        <Select value={period} onValueChange={(v) => handlePeriodChange(v as Period)}>
          <SelectTrigger className="w-40" data-testid="select-period">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Hoje</SelectItem>
            <SelectItem value="week">Esta semana</SelectItem>
            <SelectItem value="month">Este mês</SelectItem>
            <SelectItem value="year">Este ano</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => (
          <Card key={k.label} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {k.label}
                  </p>
                  {isLoading ? (
                    <Skeleton className="mt-2 h-8 w-24" />
                  ) : (
                    <p className="mt-2 text-2xl font-bold" data-testid={`kpi-${k.label}`}>
                      {k.value}
                    </p>
                  )}
                </div>
                <div className={`rounded-lg bg-muted p-2 ${k.color}`}>
                  <k.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Receita ao longo do tempo */}
      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{chartTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.every((d) => !d.total) ? (
            <div className="flex h-64 flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-muted p-4">
                <BarChart3 className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Sem dados no período</p>
            </div>
          ) : (
            <div className="h-64 w-full" data-testid="chart-revenue">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke="hsl(var(--muted-foreground))"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) =>
                      v >= 1000 ? `R$${(v / 1000).toFixed(1)}k` : `R$${v}`
                    }
                    width={56}
                  />
                  <Tooltip
                    cursor={{ fill: "hsl(var(--muted) / 0.4)" }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                      fontSize: "12px",
                    }}
                    labelStyle={{ color: "hsl(var(--muted-foreground))" }}
                    formatter={(value: number) => [fmtBRL(value), "Receita líquida"]}
                  />
                  <Bar
                    dataKey="total"
                    fill="hsl(var(--primary))"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancelamentos e Devoluções — resumo */}
      {!isLoading && (cancelledSales.length > 0 || refunds.length > 0) && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 space-y-1.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Deduções do período
          </p>
          {cancelledSales.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Ban className="h-3.5 w-3.5 text-destructive" />
                Cancelamentos ({cancelledSales.length})
              </span>
              <span className="font-semibold text-destructive" data-testid="text-cancelled-total">
                −{fmtBRL(totalCancelledAmount)}
              </span>
            </div>
          )}
          {refunds.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Undo2 className="h-3.5 w-3.5 text-amber-500" />
                Devoluções ({refunds.length})
              </span>
              <span className="font-semibold text-amber-500" data-testid="text-refunds-total">
                −{fmtBRL(totalRefundedAmount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              Total deduzido
            </span>
            <span className="font-bold text-destructive">
              −{fmtBRL(totalCancelledAmount + totalRefundedAmount)}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Sales list */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Transações</h2>
            {cancelledSales.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-muted-foreground"
                onClick={() => setShowCancelled((v) => !v)}
                data-testid="button-toggle-cancelled"
              >
                <Ban className="h-3.5 w-3.5 mr-1" />
                {showCancelled ? "Ocultar canceladas" : `Ver canceladas (${cancelledSales.length})`}
              </Button>
            )}
          </div>
          <Card className="border-border/60">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : paginated.length === 0 && !showCancelled ? (
                <div className="flex flex-col items-center gap-3 py-14 text-center">
                  <div className="rounded-full bg-muted p-3">
                    <Wallet className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">Nenhuma transação no período</p>
                  <p className="text-xs text-muted-foreground">
                    Registre vendas no PDV para ver o histórico aqui.
                  </p>
                </div>
              ) : (
                <>
                  <div className="divide-y divide-border">
                    {paginated.map((sale) => {
                      const cfg = PAYMENT_CONFIG[sale.payment_method] ?? {
                        label: sale.payment_method,
                        icon: Receipt,
                        color: "text-muted-foreground",
                      };
                      const Icon = cfg.icon;
                      const refunded = refundsBySaleId[sale.id] ?? 0;
                      return (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between px-4 py-3"
                          data-testid={`sale-row-${sale.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-muted p-2">
                              <Icon className={`h-4 w-4 ${cfg.color}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{cfg.label}</p>
                              <p className="text-xs text-muted-foreground">{fmtDate(sale.created_at)}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {refunded > 0 && (
                              <span className="hidden text-xs text-muted-foreground line-through sm:inline">
                                {fmtBRL(Number(sale.total))}
                              </span>
                            )}
                            {refunded > 0 && (
                              <Badge variant="outline" className="text-xs gap-1 text-amber-500 border-amber-500/30 hidden sm:flex">
                                <Undo2 className="h-3 w-3" />
                                −{fmtBRL(refunded)}
                              </Badge>
                            )}
                            {Number(sale.discount_amount) > 0 && refunded === 0 && (
                              <span className="hidden text-xs text-muted-foreground line-through sm:inline">
                                {fmtBRL(Number(sale.subtotal))}
                              </span>
                            )}
                            <Badge variant="secondary" className="font-mono text-xs">
                              {fmtBRL(Number(sale.total) - refunded)}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}

                    {/* Cancelled sales section */}
                    {showCancelled && cancelledSales.map((sale) => {
                      const cfg = PAYMENT_CONFIG[sale.payment_method] ?? {
                        label: sale.payment_method,
                        icon: Receipt,
                        color: "text-muted-foreground",
                      };
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between px-4 py-3 opacity-60"
                          data-testid={`cancelled-row-${sale.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-muted p-2">
                              <Icon className={`h-4 w-4 ${cfg.color}`} />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium">{cfg.label}</p>
                                <Badge variant="destructive" className="text-xs gap-1 py-0">
                                  <Ban className="h-3 w-3" /> Cancelada
                                </Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{fmtDate(sale.created_at)}</p>
                            </div>
                          </div>
                          <Badge variant="secondary" className="font-mono text-xs line-through">
                            {fmtBRL(Number(sale.total))}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>

                  {/* Pagination */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between border-t border-border px-4 py-3">
                      <p className="text-xs text-muted-foreground">
                        {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sales.length)} de {sales.length}
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

        {/* Payment breakdown */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Por forma de pagamento</h2>
          <Card className="border-border/60">
            <CardContent className="p-0">
              {isLoading ? (
                <div className="space-y-3 p-4">
                  {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : paymentBreakdown.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                  <div className="rounded-full bg-muted p-4">
                    <Wallet className="h-8 w-8 text-muted-foreground opacity-40" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">Sem dados</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {paymentBreakdown.map(({ method, count, total }) => {
                    const cfg = PAYMENT_CONFIG[method] ?? {
                      label: method,
                      icon: Receipt,
                      color: "text-muted-foreground",
                    };
                    const Icon = cfg.icon;
                    const pct = totalReceita > 0 ? (total / totalReceita) * 100 : 0;
                    return (
                      <div key={method} className="px-4 py-3 space-y-2" data-testid={`payment-row-${method}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Icon className={`h-4 w-4 ${cfg.color}`} />
                            <span className="text-sm font-medium">{cfg.label}</span>
                          </div>
                          <span className="text-xs text-muted-foreground">{count} venda{count !== 1 ? "s" : ""}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="h-1.5 flex-1 mr-3 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-sm font-semibold">{fmtBRL(total)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
