import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowDownRight,
  ArrowUpRight,
  Download,
  AlertCircle,
} from "lucide-react";
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";

// ── Helpers ─────────────────────────────────────────────────────────────────────

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(value: number) {
  if (!isFinite(value)) return "—";
  return `${value.toFixed(1)}%`;
}

function isoDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

type PeriodKey = "month" | "last_month" | "quarter" | "year" | "custom";

interface PeriodRange {
  start: Date;
  end: Date;
  label: string;
}

function rangeFor(key: PeriodKey, customStart?: string, customEnd?: string): PeriodRange {
  const now = new Date();
  if (key === "month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start, end: endOfDay(now), label: start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }
  if (key === "last_month") {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return { start, end, label: start.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) };
  }
  if (key === "quarter") {
    const q = Math.floor(now.getMonth() / 3);
    const start = new Date(now.getFullYear(), q * 3, 1);
    return { start, end: endOfDay(now), label: `${q + 1}º trim/${now.getFullYear()}` };
  }
  if (key === "year") {
    const start = new Date(now.getFullYear(), 0, 1);
    return { start, end: endOfDay(now), label: String(now.getFullYear()) };
  }
  // custom
  const s = customStart ? new Date(customStart + "T00:00:00") : startOfDay(now);
  const e = customEnd ? new Date(customEnd + "T23:59:59") : endOfDay(now);
  return {
    start: s,
    end: e,
    label: `${s.toLocaleDateString("pt-BR")} – ${e.toLocaleDateString("pt-BR")}`,
  };
}

function previousRange(r: PeriodRange): PeriodRange {
  const ms = r.end.getTime() - r.start.getTime();
  const end = new Date(r.start.getTime() - 1);
  const start = new Date(end.getTime() - ms);
  return {
    start,
    end,
    label: `${start.toLocaleDateString("pt-BR")} – ${end.toLocaleDateString("pt-BR")}`,
  };
}

// ── Data fetching ───────────────────────────────────────────────────────────────

interface RawData {
  grossRevenue: number;
  discounts: number;
  cancellations: number;
  refunds: number;
  cogs: number;
  expensesByCategory: Record<string, number>;
  expensesTotal: number;
  otherIncome: number;
  saleCount: number;
}

async function fetchDREData(companyId: string, range: PeriodRange): Promise<RawData> {
  const startISO = range.start.toISOString();
  const endISO = range.end.toISOString();

  // Completed sales in period
  const { data: completed, error: e1 } = await supabase
    .from("sales")
    .select("id, subtotal, discount_amount, total, status, created_at")
    .eq("company_id", companyId)
    .eq("status", "completed")
    .gte("created_at", startISO)
    .lte("created_at", endISO);
  if (e1) throw e1;

  // Cancelled sales in period — subtract their value from gross
  const { data: cancelled, error: e2 } = await supabase
    .from("sales")
    .select("id, total, created_at")
    .eq("company_id", companyId)
    .eq("status", "cancelled")
    .gte("created_at", startISO)
    .lte("created_at", endISO);
  if (e2) throw e2;

  // Refunds created in period
  const { data: refunds, error: e3 } = await (supabase as any)
    .from("refunds")
    .select("id, amount, created_at")
    .eq("company_id", companyId)
    .gte("created_at", startISO)
    .lte("created_at", endISO);
  if (e3) throw e3;

  // Sale items for COGS — only for completed sales in period
  const completedIds = (completed ?? []).map((s) => s.id);
  let cogs = 0;
  if (completedIds.length > 0) {
    const CHUNK = 200;
    for (let i = 0; i < completedIds.length; i += CHUNK) {
      const ids = completedIds.slice(i, i + CHUNK);
      const { data: items, error: e4 } = await supabase
        .from("sale_items")
        .select("quantity, product_id, products!sale_items_product_id_fkey(cost_price)")
        .in("sale_id", ids);
      if (e4) throw e4;
      for (const it of items ?? []) {
        const cost = Number((it as any).products?.cost_price ?? 0);
        cogs += Number(it.quantity) * cost;
      }
    }
  }

  // Operating expenses (paid in period) and other income (paid in period)
  const startDate = isoDate(range.start);
  const endDate = isoDate(range.end);

  const { data: paidPayables, error: e5 } = await (supabase as any)
    .from("accounts")
    .select("amount, category, kind, status, paid_date")
    .eq("company_id", companyId)
    .eq("status", "paid")
    .eq("kind", "payable")
    .gte("paid_date", startDate)
    .lte("paid_date", endDate);
  if (e5) throw e5;

  const { data: paidReceivables, error: e6 } = await (supabase as any)
    .from("accounts")
    .select("amount, category, kind, status, paid_date")
    .eq("company_id", companyId)
    .eq("status", "paid")
    .eq("kind", "receivable")
    .gte("paid_date", startDate)
    .lte("paid_date", endDate);
  if (e6) throw e6;

  const expensesByCategory: Record<string, number> = {};
  let expensesTotal = 0;
  for (const a of paidPayables ?? []) {
    const cat = ((a as any).category as string | null)?.trim() || "Sem categoria";
    const amt = Number((a as any).amount);
    expensesByCategory[cat] = (expensesByCategory[cat] ?? 0) + amt;
    expensesTotal += amt;
  }

  const otherIncome = (paidReceivables ?? []).reduce((s, a) => s + Number((a as any).amount), 0);

  const grossRevenue = (completed ?? []).reduce((s, v) => s + Number(v.subtotal ?? v.total), 0);
  const discounts = (completed ?? []).reduce((s, v) => s + Number(v.discount_amount ?? 0), 0);
  const cancellations = (cancelled ?? []).reduce((s, v) => s + Number(v.total ?? 0), 0);
  const refundsTotal = (refunds ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

  return {
    grossRevenue,
    discounts,
    cancellations,
    refunds: refundsTotal,
    cogs,
    expensesByCategory,
    expensesTotal,
    otherIncome,
    saleCount: completed?.length ?? 0,
  };
}

interface DRELines {
  grossRevenue: number;
  totalDeductions: number;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  expensesTotal: number;
  otherIncome: number;
  netResult: number;
  netMargin: number;
}

function buildLines(d: RawData): DRELines {
  const totalDeductions = d.discounts + d.cancellations + d.refunds;
  const netRevenue = d.grossRevenue - totalDeductions;
  const grossProfit = netRevenue - d.cogs;
  const grossMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;
  const netResult = grossProfit - d.expensesTotal + d.otherIncome;
  const netMargin = netRevenue > 0 ? (netResult / netRevenue) * 100 : 0;
  return {
    grossRevenue: d.grossRevenue,
    totalDeductions,
    netRevenue,
    cogs: d.cogs,
    grossProfit,
    grossMargin,
    expensesTotal: d.expensesTotal,
    otherIncome: d.otherIncome,
    netResult,
    netMargin,
  };
}

// ── Variation helper ────────────────────────────────────────────────────────────

function variation(current: number, previous: number) {
  if (previous === 0 && current === 0) return null;
  if (previous === 0) return { pct: null, sign: current > 0 ? "up" : "down" } as const;
  const diff = current - previous;
  const pct = (diff / Math.abs(previous)) * 100;
  return { pct, sign: diff >= 0 ? "up" : "down" } as const;
}

function VarBadge({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  const v = variation(current, previous);
  if (!v) return <span className="text-xs text-muted-foreground">—</span>;
  const isUp = v.sign === "up";
  // For expense/COGS lines, going up is bad — invert color.
  const positive = invert ? !isUp : isUp;
  const color = positive ? "text-emerald-500" : "text-destructive";
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs ${color}`}>
      <Icon className="h-3 w-3" />
      {v.pct === null ? "—" : `${Math.abs(v.pct).toFixed(1)}%`}
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────────────────────

export default function DRE() {
  const { activeCompany } = useCompany();
  const [periodKey, setPeriodKey] = useState<PeriodKey>("month");
  const [customStart, setCustomStart] = useState<string>(isoDate(startOfDay(new Date(new Date().getFullYear(), new Date().getMonth(), 1))));
  const [customEnd, setCustomEnd] = useState<string>(isoDate(new Date()));
  const [compare, setCompare] = useState<boolean>(false);

  const range = useMemo(
    () => rangeFor(periodKey, customStart, customEnd),
    [periodKey, customStart, customEnd]
  );
  const prevRng = useMemo(() => previousRange(range), [range]);

  const { data: current, isLoading: loadingCurrent } = useQuery({
    queryKey: ["/dre/current", activeCompany?.id, range.start.toISOString(), range.end.toISOString()],
    enabled: !!activeCompany,
    queryFn: () => fetchDREData(activeCompany!.id, range),
  });

  const { data: previous, isLoading: loadingPrev } = useQuery({
    queryKey: ["/dre/previous", activeCompany?.id, prevRng.start.toISOString(), prevRng.end.toISOString()],
    enabled: !!activeCompany && compare,
    queryFn: () => fetchDREData(activeCompany!.id, prevRng),
  });

  const isLoading = loadingCurrent || (compare && loadingPrev);

  const cur = current ? buildLines(current) : null;
  const prev = previous ? buildLines(previous) : null;

  const expenseRows = useMemo(() => {
    if (!current) return [] as Array<{ category: string; amount: number; previous: number }>;
    const all = new Set<string>([...Object.keys(current.expensesByCategory)]);
    if (previous) for (const k of Object.keys(previous.expensesByCategory)) all.add(k);
    return Array.from(all)
      .map((category) => ({
        category,
        amount: current.expensesByCategory[category] ?? 0,
        previous: previous?.expensesByCategory[category] ?? 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [current, previous]);

  // ── PDF Export ────────────────────────────────────────────────────────────────
  const exportPDF = () => {
    if (!cur || !current) return;
    const doc = new jsPDF({ orientation: "portrait", format: "a4" });
    const companyName = activeCompany?.name ?? "Empresa";
    doc.setFontSize(14);
    doc.text("Demonstração do Resultado do Exercício (DRE)", 14, 18);
    doc.setFontSize(10);
    doc.text(`${companyName} — ${range.label}`, 14, 25);
    doc.text(
      `Período: ${range.start.toLocaleDateString("pt-BR")} a ${range.end.toLocaleDateString("pt-BR")}`,
      14,
      31
    );

    const rows: Array<[string, string]> = [
      ["(+) RECEITA BRUTA DE VENDAS", fmtBRL(cur.grossRevenue)],
      ["    Descontos concedidos", `(${fmtBRL(current.discounts)})`],
      ["    Cancelamentos", `(${fmtBRL(current.cancellations)})`],
      ["    Devoluções", `(${fmtBRL(current.refunds)})`],
      ["(−) Total de deduções", `(${fmtBRL(cur.totalDeductions)})`],
      ["(=) RECEITA LÍQUIDA", fmtBRL(cur.netRevenue)],
      ["(−) Custo das mercadorias vendidas (CMV)", `(${fmtBRL(cur.cogs)})`],
      ["(=) LUCRO BRUTO", `${fmtBRL(cur.grossProfit)}  (${fmtPct(cur.grossMargin)})`],
      ["(−) Despesas operacionais", `(${fmtBRL(cur.expensesTotal)})`],
    ];
    for (const [cat, amt] of expenseRows.map((r) => [r.category, r.amount] as const)) {
      rows.push([`        ${cat}`, `(${fmtBRL(amt)})`]);
    }
    rows.push(["(+) Outras receitas", fmtBRL(cur.otherIncome)]);
    rows.push(["(=) RESULTADO LÍQUIDO DO PERÍODO", `${fmtBRL(cur.netResult)}  (${fmtPct(cur.netMargin)})`]);

    autoTable(doc, {
      startY: 40,
      head: [["Conta", "Valor"]],
      body: rows,
      styles: { fontSize: 9 },
      columnStyles: {
        0: { cellWidth: 130 },
        1: { halign: "right", cellWidth: 50 },
      },
      headStyles: { fillColor: [168, 61, 202] },
      didParseCell: (data) => {
        const txt = String(data.row.raw[0] ?? "");
        if (txt.startsWith("(=)") || txt.startsWith("(+) RECEITA") || txt.startsWith("(−) Total")) {
          data.cell.styles.fontStyle = "bold";
        }
      },
    });

    const fname = `DRE_${companyName}_${isoDate(range.start)}_a_${isoDate(range.end)}.pdf`
      .replace(/\s+/g, "_");
    doc.save(fname);
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:flex-wrap">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Período</Label>
            <Select value={periodKey} onValueChange={(v) => setPeriodKey(v as PeriodKey)}>
              <SelectTrigger className="w-48" data-testid="select-dre-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Este mês</SelectItem>
                <SelectItem value="last_month">Mês passado</SelectItem>
                <SelectItem value="quarter">Este trimestre</SelectItem>
                <SelectItem value="year">Este ano</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {periodKey === "custom" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">De</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-40"
                  data-testid="input-dre-start"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Até</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-40"
                  data-testid="input-dre-end"
                />
              </div>
            </>
          )}
          <div className="flex items-center gap-2 pb-1.5">
            <Switch
              id="dre-compare"
              checked={compare}
              onCheckedChange={setCompare}
              data-testid="switch-dre-compare"
            />
            <Label htmlFor="dre-compare" className="text-sm cursor-pointer">
              Comparar com período anterior
            </Label>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={exportPDF}
          disabled={!cur}
          data-testid="button-dre-pdf"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar PDF
        </Button>
      </div>

      {/* Period header */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex items-baseline justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-base">DRE — {range.label}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {range.start.toLocaleDateString("pt-BR")} a {range.end.toLocaleDateString("pt-BR")}
                {compare && (
                  <span className="ml-2">
                    · Comparando com {prevRng.start.toLocaleDateString("pt-BR")} a {prevRng.end.toLocaleDateString("pt-BR")}
                  </span>
                )}
              </p>
            </div>
            {cur && (
              <Badge variant={cur.netResult >= 0 ? "secondary" : "destructive"} className="text-sm font-mono">
                Resultado: {fmtBRL(cur.netResult)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !cur || !current ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sem dados para o período.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[55%]">Conta</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                    {compare && <TableHead className="text-right w-32">Anterior</TableHead>}
                    {compare && <TableHead className="text-right w-24">Variação</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Receita Bruta */}
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-semibold">(+) Receita bruta de vendas</TableCell>
                    <TableCell className="text-right font-mono font-semibold" data-testid="dre-gross-revenue">
                      {fmtBRL(cur.grossRevenue)}
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? fmtBRL(prev.grossRevenue) : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.grossRevenue} previous={prev.grossRevenue} /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Deduções */}
                  <TableRow>
                    <TableCell className="pl-8 text-muted-foreground text-sm">Descontos concedidos</TableCell>
                    <TableCell className="text-right font-mono text-amber-500">
                      ({fmtBRL(current.discounts)})
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {previous ? `(${fmtBRL(previous.discounts)})` : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {previous ? <VarBadge current={current.discounts} previous={previous.discounts} invert /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-muted-foreground text-sm">Cancelamentos</TableCell>
                    <TableCell className="text-right font-mono text-destructive">
                      ({fmtBRL(current.cancellations)})
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {previous ? `(${fmtBRL(previous.cancellations)})` : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {previous ? <VarBadge current={current.cancellations} previous={previous.cancellations} invert /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8 text-muted-foreground text-sm">Devoluções</TableCell>
                    <TableCell className="text-right font-mono text-amber-500">
                      ({fmtBRL(current.refunds)})
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {previous ? `(${fmtBRL(previous.refunds)})` : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {previous ? <VarBadge current={current.refunds} previous={previous.refunds} invert /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                  <TableRow className="bg-muted/30">
                    <TableCell className="font-medium">(−) Total de deduções</TableCell>
                    <TableCell className="text-right font-mono font-medium text-destructive">
                      ({fmtBRL(cur.totalDeductions)})
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? `(${fmtBRL(prev.totalDeductions)})` : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.totalDeductions} previous={prev.totalDeductions} invert /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Receita Líquida */}
                  <TableRow className="bg-primary/10 border-y-2 border-primary/30">
                    <TableCell className="font-bold">(=) Receita líquida</TableCell>
                    <TableCell className="text-right font-mono font-bold" data-testid="dre-net-revenue">
                      {fmtBRL(cur.netRevenue)}
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? fmtBRL(prev.netRevenue) : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.netRevenue} previous={prev.netRevenue} /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* CMV */}
                  <TableRow>
                    <TableCell>(−) Custo das mercadorias vendidas (CMV)</TableCell>
                    <TableCell className="text-right font-mono text-destructive" data-testid="dre-cogs">
                      ({fmtBRL(cur.cogs)})
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? `(${fmtBRL(prev.cogs)})` : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.cogs} previous={prev.cogs} invert /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Lucro Bruto */}
                  <TableRow className="bg-primary/10 border-y-2 border-primary/30">
                    <TableCell className="font-bold">
                      (=) Lucro bruto
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        margem {fmtPct(cur.grossMargin)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold" data-testid="dre-gross-profit">
                      {fmtBRL(cur.grossProfit)}
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? fmtBRL(prev.grossProfit) : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.grossProfit} previous={prev.grossProfit} /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Despesas operacionais */}
                  <TableRow>
                    <TableCell className="font-medium">(−) Despesas operacionais</TableCell>
                    <TableCell className="text-right font-mono font-medium text-destructive">
                      ({fmtBRL(cur.expensesTotal)})
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? `(${fmtBRL(prev.expensesTotal)})` : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.expensesTotal} previous={prev.expensesTotal} invert /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                  {expenseRows.length === 0 && (
                    <TableRow>
                      <TableCell className="pl-8 text-xs text-muted-foreground italic" colSpan={compare ? 4 : 2}>
                        Nenhuma despesa paga registrada no período em "Contas a pagar".
                      </TableCell>
                    </TableRow>
                  )}
                  {expenseRows.map((r) => (
                    <TableRow key={r.category}>
                      <TableCell className="pl-8 text-muted-foreground text-sm">{r.category}</TableCell>
                      <TableCell className="text-right font-mono text-sm">
                        ({fmtBRL(r.amount)})
                      </TableCell>
                      {compare && (
                        <TableCell className="text-right font-mono text-muted-foreground text-sm">
                          {r.previous > 0 ? `(${fmtBRL(r.previous)})` : "—"}
                        </TableCell>
                      )}
                      {compare && (
                        <TableCell className="text-right">
                          {r.previous > 0 ? <VarBadge current={r.amount} previous={r.previous} invert /> : "—"}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}

                  {/* Outras receitas */}
                  <TableRow>
                    <TableCell>(+) Outras receitas (recebimentos)</TableCell>
                    <TableCell className="text-right font-mono text-emerald-600">
                      {fmtBRL(cur.otherIncome)}
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? fmtBRL(prev.otherIncome) : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.otherIncome} previous={prev.otherIncome} /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>

                  {/* Resultado */}
                  <TableRow
                    className={
                      cur.netResult >= 0
                        ? "bg-emerald-500/10 border-y-2 border-emerald-500/40"
                        : "bg-destructive/10 border-y-2 border-destructive/40"
                    }
                  >
                    <TableCell className="font-bold">
                      (=) Resultado líquido do período
                      <span className="ml-2 text-xs text-muted-foreground font-normal">
                        margem {fmtPct(cur.netMargin)}
                      </span>
                    </TableCell>
                    <TableCell
                      className={`text-right font-mono font-bold ${cur.netResult >= 0 ? "text-emerald-600" : "text-destructive"}`}
                      data-testid="dre-net-result"
                    >
                      {fmtBRL(cur.netResult)}
                    </TableCell>
                    {compare && (
                      <TableCell className="text-right font-mono text-muted-foreground">
                        {prev ? fmtBRL(prev.netResult) : "—"}
                      </TableCell>
                    )}
                    {compare && (
                      <TableCell className="text-right">
                        {prev ? <VarBadge current={cur.netResult} previous={prev.netResult} /> : "—"}
                      </TableCell>
                    )}
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* KPI cards */}
      {cur && current && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/60">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Receita líquida
              </p>
              <p className="mt-2 text-2xl font-bold">{fmtBRL(cur.netRevenue)}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {current.saleCount} venda{current.saleCount !== 1 ? "s" : ""}
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Lucro bruto
              </p>
              <p className="mt-2 text-2xl font-bold text-primary">{fmtBRL(cur.grossProfit)}</p>
              <p className="text-xs text-muted-foreground mt-1">margem {fmtPct(cur.grossMargin)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Despesas operacionais
              </p>
              <p className="mt-2 text-2xl font-bold text-destructive">{fmtBRL(cur.expensesTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">pagas no período</p>
            </CardContent>
          </Card>
          <Card className={`border-border/60 ${cur.netResult >= 0 ? "" : "border-destructive/40"}`}>
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Resultado líquido
              </p>
              <p
                className={`mt-2 text-2xl font-bold ${cur.netResult >= 0 ? "text-emerald-600" : "text-destructive"}`}
              >
                {fmtBRL(cur.netResult)}
              </p>
              <p className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                {cur.netResult > 0 ? (
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                ) : cur.netResult < 0 ? (
                  <TrendingDown className="h-3 w-3 text-destructive" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                margem {fmtPct(cur.netMargin)}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Methodology note */}
      <div className="flex gap-3 rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
        <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-500" />
        <div className="space-y-1 leading-relaxed">
          <p>
            <strong className="text-foreground">Como o DRE é calculado:</strong> Receita bruta usa o subtotal das vendas concluídas no período.
            Cancelamentos e devoluções são deduzidos pela data em que ocorreram.
            O CMV usa o custo cadastrado em cada produto vendido.
            Despesas operacionais e outras receitas vêm de "Contas" (a pagar/receber) marcadas como pagas no período.
          </p>
          <p>
            <strong className="text-foreground">Atenção:</strong> o CMV reflete o custo atual do produto. Alterações no custo após a venda afetam o cálculo retroativo.
          </p>
        </div>
      </div>
    </div>
  );
}
