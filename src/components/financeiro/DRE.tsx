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
  return `${value.toFixed(1).replace(".", ",")}%`;
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
      {v.pct === null ? "—" : `${Math.abs(v.pct).toFixed(1).replace(".", ",")}%`}
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
              <SelectTrigger className="w-full sm:w-48" data-testid="select-dre-period">
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
            <div className="flex gap-3">
              <div className="space-y-1.5 flex-1 sm:flex-initial">
                <Label className="text-xs text-muted-foreground">De</Label>
                <Input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="w-full sm:w-40"
                  data-testid="input-dre-start"
                />
              </div>
              <div className="space-y-1.5 flex-1 sm:flex-initial">
                <Label className="text-xs text-muted-foreground">Até</Label>
                <Input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="w-full sm:w-40"
                  data-testid="input-dre-end"
                />
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 pb-1.5">
            <Switch
              id="dre-compare"
              checked={compare}
              onCheckedChange={setCompare}
              data-testid="switch-dre-compare"
            />
            <Label htmlFor="dre-compare" className="text-sm cursor-pointer">
              <span className="hidden sm:inline">Comparar com período anterior</span>
              <span className="sm:hidden">Comparar com anterior</span>
            </Label>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={exportPDF}
          disabled={!cur}
          className="w-full sm:w-auto"
          data-testid="button-dre-pdf"
        >
          <Download className="h-4 w-4 mr-2" />
          Exportar PDF
        </Button>
      </div>

      {/* Period header */}
      <Card className="border-border/60">
        <CardHeader className="pb-3 px-4 sm:px-6">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-baseline sm:justify-between sm:flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-base truncate">DRE — {range.label}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {range.start.toLocaleDateString("pt-BR")} a {range.end.toLocaleDateString("pt-BR")}
                {compare && (
                  <span className="block sm:inline sm:ml-2">
                    <span className="hidden sm:inline">· </span>
                    Comparando com {prevRng.start.toLocaleDateString("pt-BR")} a {prevRng.end.toLocaleDateString("pt-BR")}
                  </span>
                )}
              </p>
            </div>
            {cur && (
              <Badge
                variant={cur.netResult >= 0 ? "secondary" : "destructive"}
                className="text-sm font-mono self-start sm:self-auto"
              >
                Resultado: {fmtBRL(cur.netResult)}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-3 sm:px-6">
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : !cur || !current ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              Sem dados para o período.
            </div>
          ) : (
            (() => {
              type Variant = "section" | "subsection" | "child" | "highlight" | "result";
              type Row = {
                key: string;
                label: string;
                shortLabel?: string;
                value: number;
                previous: number | null;
                variant: Variant;
                negative?: boolean;
                invert?: boolean;
                showAsParens?: boolean;
                color?: string;
                hint?: string;
              };
              const rows: Row[] = [
                { key: "gross", label: "(+) Receita bruta de vendas", shortLabel: "Receita bruta", value: cur.grossRevenue, previous: prev?.grossRevenue ?? null, variant: "section" },
                { key: "ded-disc", label: "Descontos concedidos", value: current.discounts, previous: previous?.discounts ?? null, variant: "child", showAsParens: true, color: "text-amber-500", invert: true },
                { key: "ded-canc", label: "Cancelamentos", value: current.cancellations, previous: previous?.cancellations ?? null, variant: "child", showAsParens: true, color: "text-destructive", invert: true },
                { key: "ded-ref", label: "Devoluções", value: current.refunds, previous: previous?.refunds ?? null, variant: "child", showAsParens: true, color: "text-amber-500", invert: true },
                { key: "ded-tot", label: "(−) Total de deduções", shortLabel: "Total deduções", value: cur.totalDeductions, previous: prev?.totalDeductions ?? null, variant: "subsection", showAsParens: true, color: "text-destructive", invert: true },
                { key: "net", label: "(=) Receita líquida", shortLabel: "Receita líquida", value: cur.netRevenue, previous: prev?.netRevenue ?? null, variant: "highlight" },
                { key: "cogs", label: "(−) Custo das mercadorias vendidas (CMV)", shortLabel: "CMV", value: cur.cogs, previous: prev?.cogs ?? null, variant: "section", showAsParens: true, color: "text-destructive", invert: true },
                { key: "gross-profit", label: "(=) Lucro bruto", shortLabel: "Lucro bruto", value: cur.grossProfit, previous: prev?.grossProfit ?? null, variant: "highlight", hint: `margem ${fmtPct(cur.grossMargin)}` },
                { key: "exp", label: "(−) Despesas operacionais", shortLabel: "Despesas operacionais", value: cur.expensesTotal, previous: prev?.expensesTotal ?? null, variant: "subsection", showAsParens: true, color: "text-destructive", invert: true },
                ...expenseRows.map<Row>((r) => ({
                  key: `exp-${r.category}`,
                  label: r.category,
                  value: r.amount,
                  previous: r.previous > 0 ? r.previous : null,
                  variant: "child",
                  showAsParens: true,
                  invert: true,
                })),
                { key: "other", label: "(+) Outras receitas (recebimentos)", shortLabel: "Outras receitas", value: cur.otherIncome, previous: prev?.otherIncome ?? null, variant: "section", color: "text-emerald-600" },
                { key: "result", label: "(=) Resultado líquido do período", shortLabel: "Resultado líquido", value: cur.netResult, previous: prev?.netResult ?? null, variant: "result", hint: `margem ${fmtPct(cur.netMargin)}` },
              ];

              const variantRowClass = (v: Variant) => {
                if (v === "section" || v === "subsection") return "bg-muted/30";
                if (v === "highlight") return "bg-primary/10 border-y-2 border-primary/30";
                if (v === "result") return cur.netResult >= 0
                  ? "bg-emerald-500/10 border-y-2 border-emerald-500/40"
                  : "bg-destructive/10 border-y-2 border-destructive/40";
                return "";
              };
              const variantLabelClass = (v: Variant) => {
                if (v === "section") return "font-semibold";
                if (v === "subsection") return "font-medium";
                if (v === "highlight" || v === "result") return "font-bold";
                return "pl-8 text-muted-foreground text-sm";
              };
              const variantValueClass = (v: Variant) => {
                if (v === "section") return "font-mono font-semibold";
                if (v === "subsection") return "font-mono font-medium";
                if (v === "highlight" || v === "result") return "font-mono font-bold";
                return "font-mono text-sm";
              };
              const formatVal = (r: Row) => {
                const txt = fmtBRL(r.value);
                return r.showAsParens ? `(${txt})` : txt;
              };
              const formatPrev = (r: Row) => {
                if (r.previous === null) return "—";
                const txt = fmtBRL(r.previous);
                return r.showAsParens ? `(${txt})` : txt;
              };
              const testIdFor = (key: string) => {
                if (key === "gross") return "dre-gross-revenue";
                if (key === "net") return "dre-net-revenue";
                if (key === "cogs") return "dre-cogs";
                if (key === "gross-profit") return "dre-gross-profit";
                if (key === "result") return "dre-net-result";
                return undefined;
              };

              return (
                <>
                  {/* Mobile: card list */}
                  <div className="sm:hidden flex flex-col -mx-2">
                    {rows.map((r) => {
                      const isResult = r.variant === "result";
                      const valColor =
                        isResult
                          ? cur.netResult >= 0 ? "text-emerald-600" : "text-destructive"
                          : r.color ?? "";
                      return (
                        <div
                          key={r.key}
                          className={`px-3 py-2.5 rounded-md ${variantRowClass(r.variant)} ${
                            r.variant === "child" ? "" : "my-0.5"
                          }`}
                        >
                          <div className="flex items-baseline justify-between gap-3">
                            <div className={`min-w-0 flex-1 ${variantLabelClass(r.variant)} ${r.variant === "child" ? "" : "text-sm"}`}>
                              {r.shortLabel ?? r.label}
                              {r.hint && (
                                <span className="block text-[10px] font-normal text-muted-foreground mt-0.5">
                                  {r.hint}
                                </span>
                              )}
                            </div>
                            <div
                              className={`text-right whitespace-nowrap ${variantValueClass(r.variant)} ${valColor}`}
                              data-testid={testIdFor(r.key)}
                            >
                              {formatVal(r)}
                            </div>
                          </div>
                          {compare && (
                            <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-muted-foreground font-mono">
                              <span>ant: {formatPrev(r)}</span>
                              {r.previous !== null && (
                                <VarBadge current={r.value} previous={r.previous} invert={r.invert} />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {expenseRows.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground italic">
                        Nenhuma despesa paga registrada no período em "Contas a pagar".
                      </div>
                    )}
                  </div>

                  {/* Desktop: table */}
                  <div className="hidden sm:block overflow-x-auto">
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
                        {rows.map((r, idx) => {
                          const isResult = r.variant === "result";
                          const valColor =
                            isResult
                              ? cur.netResult >= 0 ? "text-emerald-600" : "text-destructive"
                              : r.color ?? "";
                          return (
                            <TableRow key={r.key} className={variantRowClass(r.variant)}>
                              <TableCell className={variantLabelClass(r.variant)}>
                                {r.label}
                                {r.hint && (
                                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                                    {r.hint}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell
                                className={`text-right ${variantValueClass(r.variant)} ${valColor}`}
                                data-testid={testIdFor(r.key)}
                              >
                                {formatVal(r)}
                              </TableCell>
                              {compare && (
                                <TableCell className="text-right font-mono text-muted-foreground">
                                  {formatPrev(r)}
                                </TableCell>
                              )}
                              {compare && (
                                <TableCell className="text-right">
                                  {r.previous !== null ? (
                                    <VarBadge current={r.value} previous={r.previous} invert={r.invert} />
                                  ) : (
                                    "—"
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                        {expenseRows.length === 0 && (
                          <TableRow>
                            <TableCell className="pl-8 text-xs text-muted-foreground italic" colSpan={compare ? 4 : 2}>
                              Nenhuma despesa paga registrada no período em "Contas a pagar".
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </>
              );
            })()
          )}
        </CardContent>
      </Card>

      {/* KPI cards */}
      {cur && current && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
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
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Lucro bruto
              </p>
              <p className="mt-2 text-2xl font-bold text-primary">{fmtBRL(cur.grossProfit)}</p>
              <p className="text-xs text-muted-foreground mt-1">margem {fmtPct(cur.grossMargin)}</p>
            </CardContent>
          </Card>
          <Card className="border-border/60">
            <CardContent className="p-4 sm:p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Despesas operacionais
              </p>
              <p className="mt-2 text-2xl font-bold text-destructive">{fmtBRL(cur.expensesTotal)}</p>
              <p className="text-xs text-muted-foreground mt-1">pagas no período</p>
            </CardContent>
          </Card>
          <Card className={`border-border/60 ${cur.netResult >= 0 ? "" : "border-destructive/40"}`}>
            <CardContent className="p-4 sm:p-5">
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
