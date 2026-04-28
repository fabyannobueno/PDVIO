import { useState, useMemo, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseMixedNote } from "@/lib/mixedPayment";
import { fmtPct } from "@/lib/utils";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import {
  Wallet,
  TrendingUp,
  ShoppingCart,
  Package,
  CreditCard,
  Banknote,
  BookOpen,
  Smartphone,
  Receipt,
  FileText,
  Image,
  Download,
  Ban,
  Undo2,
  TrendingDown,
  BarChart3,
} from "lucide-react";
import logoIconSrc from "@/assets/logo-icon.png";
// @ts-ignore
import jsPDF from "jspdf";
// @ts-ignore
import autoTable from "jspdf-autotable";

// ── Helpers ────────────────────────────────────────────────────────────────────

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDatetime(date: Date) {
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }) + " " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

const INTEGER_UNITS = ["un", "cx", "pç"];

function fmtQty(qty: number, unit: string | null | undefined): string {
  if (!unit || INTEGER_UNITS.includes(unit)) {
    return `${Math.round(qty)} unid.`;
  }
  return `${qty.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${unit}`;
}

type Period = "today" | "week" | "month" | "year" | "all";

function periodRange(period: Period): { start: string | null; end: string | null } {
  if (period === "all") return { start: null, end: null };
  const now = new Date();
  let start: Date;
  if (period === "today") {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (period === "week") {
    start = new Date(now);
    start.setDate(now.getDate() - 6);
    start.setHours(0, 0, 0, 0);
  } else if (period === "month") {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  } else {
    start = new Date(now.getFullYear(), 0, 1);
  }
  return { start: start.toISOString(), end: now.toISOString() };
}

function dayLabel(date: Date, period: Period) {
  if (period === "year") return date.toLocaleDateString("pt-BR", { month: "short" });
  if (period === "today") return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const PAYMENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  cash: { label: "Dinheiro", icon: Banknote, color: "text-emerald-500" },
  credit_card: { label: "Crédito", icon: CreditCard, color: "text-blue-500" },
  debit_card: { label: "Débito", icon: CreditCard, color: "text-violet-500" },
  pix: { label: "PIX", icon: Smartphone, color: "text-primary" },
  ticket: { label: "Ticket", icon: Receipt, color: "text-orange-500" },
  crediario: { label: "Crediário", icon: BookOpen, color: "text-rose-500" },
  mixed: { label: "Misto", icon: Wallet, color: "text-amber-500" },
};

const chartConfig: ChartConfig = {
  receita: { label: "Receita", color: "hsl(var(--primary))" },
};

const PERIOD_LABELS: Record<Period, string> = {
  today: "Hoje",
  week: "Últimos 7 dias",
  month: "Este mês",
  year: "Este ano",
  all: "Todo o período",
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function Relatorios() {
  const { activeCompany } = useCompany();
  const [period, setPeriod] = useState<Period>("today");
  const [exporting, setExporting] = useState<"csv" | "png" | "pdf" | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const { start, end } = useMemo(() => periodRange(period), [period]);

  // ── Sales ──────────────────────────────────────────────────────────────────
  const { data: sales = [], isLoading: loadingSales } = useQuery({
    queryKey: ["/relatorios/sales", activeCompany?.id, start, end],
    enabled: !!activeCompany,
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("id, total, discount_amount, payment_method, created_at, notes, customers(name)")
        .eq("company_id", activeCompany!.id)
        .eq("status", "completed");
      if (start) q = q.gte("created_at", start);
      if (end) q = q.lte("created_at", end);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        total: number;
        discount_amount: number;
        payment_method: string;
        created_at: string;
        notes: string | null;
        customers: { name: string } | null;
      }>;
    },
  });

  // ── Sale items ─────────────────────────────────────────────────────────────
  const { data: saleItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ["/relatorios/sale-items", activeCompany?.id, start, end],
    enabled: !!activeCompany && sales.length > 0,
    queryFn: async () => {
      const saleIds = sales.map((s) => s.id);
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_name, quantity, subtotal, products(stock_unit)")
        .in("sale_id", saleIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Cancelled sales ─────────────────────────────────────────────────────────
  const { data: cancelledSales = [], isLoading: loadingCancelled } = useQuery({
    queryKey: ["/relatorios/cancelled", activeCompany?.id, start, end],
    enabled: !!activeCompany,
    queryFn: async () => {
      let q = supabase
        .from("sales")
        .select("id, total, payment_method, created_at, cancellation_reason")
        .eq("company_id", activeCompany!.id)
        .eq("status", "cancelled");
      if (start) q = q.gte("created_at", start);
      if (end) q = q.lte("created_at", end);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        total: number;
        payment_method: string;
        created_at: string;
        cancellation_reason: string | null;
      }>;
    },
  });

  // ── Refunds ─────────────────────────────────────────────────────────────────
  const saleIds = useMemo(() => sales.map((s) => s.id), [sales]);
  const { data: refunds = [], isLoading: loadingRefunds } = useQuery({
    queryKey: ["/relatorios/refunds", saleIds],
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

  const isLoading = loadingSales || loadingItems || loadingCancelled || loadingRefunds;

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalBruto = useMemo(() => sales.reduce((s, v) => s + Number(v.total), 0), [sales]);
  const totalRefundedAmount = useMemo(() => refunds.reduce((s, r) => s + Number(r.amount), 0), [refunds]);
  const totalCancelledAmount = useMemo(() => cancelledSales.reduce((s, v) => s + Number(v.total), 0), [cancelledSales]);
  const totalReceita = totalBruto - totalRefundedAmount;
  const totalVendas = sales.length;
  const ticketMedio = totalVendas > 0 ? totalReceita / totalVendas : 0;
  const totalDescontos = useMemo(() => sales.reduce((s, v) => s + Number(v.discount_amount ?? 0), 0), [sales]);
  const totalItens = useMemo(() => saleItems.reduce((s, i) => s + Number(i.quantity), 0), [saleItems]);

  // ── Chart data ─────────────────────────────────────────────────────────────
  const chartData = useMemo(() => {
    if (sales.length === 0) return [];
    const map: Record<string, { receita: number; date: Date }> = {};
    for (const s of [...sales].reverse()) {
      const d = new Date(s.created_at);
      let key: string;
      let date: Date;
      if (period === "year") {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        date = new Date(d.getFullYear(), d.getMonth(), 1);
      } else if (period === "today") {
        key = `${String(d.getHours()).padStart(2, "0")}:00`;
        date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours());
      } else {
        key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      }
      if (!map[key]) map[key] = { receita: 0, date };
      map[key].receita += Number(s.total);
    }
    return Object.entries(map).map(([, { receita, date }]) => ({
      label: dayLabel(date, period),
      receita,
    }));
  }, [sales, period]);

  // ── Top products ───────────────────────────────────────────────────────────
  const topProducts = useMemo(() => {
    const map: Record<string, { qty: number; total: number; unit: string | null }> = {};
    for (const item of saleItems) {
      const name = item.product_name;
      const unit = (item as any).products?.stock_unit ?? null;
      if (!map[name]) map[name] = { qty: 0, total: 0, unit };
      map[name].qty += Number(item.quantity);
      map[name].total += Number(item.subtotal);
    }
    return Object.entries(map)
      .map(([name, { qty, total, unit }]) => ({ name, qty, total, unit }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [saleItems]);

  // ── Payment breakdown ──────────────────────────────────────────────────────
  const paymentBreakdown = useMemo(() => {
    const map: Record<string, { count: number; total: number }> = {};
    for (const s of sales) {
      if (s.payment_method === "mixed") {
        const splits = parseMixedNote(s.notes);
        if (splits.length > 0) {
          for (const sp of splits) {
            if (!map[sp.method]) map[sp.method] = { count: 0, total: 0 };
            map[sp.method].count += 1;
            map[sp.method].total += sp.amount;
          }
          continue;
        }
      }
      const m = s.payment_method;
      if (!map[m]) map[m] = { count: 0, total: 0 };
      map[m].count += 1;
      map[m].total += Number(s.total);
    }
    return Object.entries(map)
      .map(([method, { count, total }]) => ({ method, count, total }))
      .sort((a, b) => b.total - a.total);
  }, [sales]);

  const kpis = [
    { label: "Receita líquida", value: fmtBRL(totalReceita), icon: Wallet },
    { label: "Nº de vendas", value: String(totalVendas), icon: ShoppingCart },
    { label: "Ticket médio", value: fmtBRL(ticketMedio), icon: TrendingUp },
    { label: "Descontos", value: fmtBRL(totalDescontos), icon: Package },
    {
      label: "Cancelamentos",
      value: cancelledSales.length > 0 ? `${cancelledSales.length} · ${fmtBRL(totalCancelledAmount)}` : "0",
      icon: Ban,
    },
    {
      label: "Devoluções",
      value: refunds.length > 0 ? `${refunds.length} · ${fmtBRL(totalRefundedAmount)}` : "0",
      icon: Undo2,
    },
  ];

  // ── CSV Export ─────────────────────────────────────────────────────────────
  function exportCSV() {
    setExporting("csv");
    const rows: string[][] = [];
    const now = new Date();
    rows.push([`Relatório PDVIO — ${PERIOD_LABELS[period]}`]);
    rows.push([`Gerado em: ${fmtDatetime(now)}`]);
    rows.push([]);
    rows.push(["KPIs"]);
    rows.push(["Indicador", "Valor"]);
    rows.push(["Receita bruta", fmtBRL(totalBruto)]);
    rows.push(["Devoluções", `-${fmtBRL(totalRefundedAmount)}`]);
    rows.push(["Receita líquida", fmtBRL(totalReceita)]);
    rows.push(["Nº de vendas", String(totalVendas)]);
    rows.push(["Ticket médio", fmtBRL(ticketMedio)]);
    rows.push(["Descontos", fmtBRL(totalDescontos)]);
    rows.push(["Cancelamentos", `${cancelledSales.length} (${fmtBRL(totalCancelledAmount)})`]);
    rows.push(["Devoluções (qtd)", `${refunds.length} (${fmtBRL(totalRefundedAmount)})`]);
    rows.push([]);
    rows.push(["Produtos mais vendidos"]);
    rows.push(["Produto", "Quantidade", "Receita"]);
    for (const p of topProducts) {
      rows.push([p.name, fmtQty(p.qty, p.unit), fmtBRL(p.total)]);
    }
    rows.push([]);
    rows.push(["Por forma de pagamento"]);
    rows.push(["Forma de pagamento", "Nº de vendas", "Total"]);
    for (const { method, count, total } of paymentBreakdown) {
      rows.push([PAYMENT_CONFIG[method]?.label ?? method, String(count), fmtBRL(total)]);
    }
    rows.push([]);
    rows.push(["Transações recentes"]);
    rows.push(["ID", "Data/Hora", "Cliente", "Pagamento", "Total"]);
    for (const s of sales.slice(0, 20)) {
      rows.push([
        s.id.slice(0, 8).toUpperCase(),
        new Date(s.created_at).toLocaleString("pt-BR"),
        s.customers?.name ?? "—",
        PAYMENT_CONFIG[s.payment_method]?.label ?? s.payment_method,
        fmtBRL(Number(s.total)),
      ]);
    }
    if (cancelledSales.length > 0) {
      rows.push([]);
      rows.push(["Vendas canceladas"]);
      rows.push(["ID", "Data/Hora", "Pagamento", "Valor", "Motivo"]);
      for (const s of cancelledSales) {
        rows.push([
          s.id.slice(0, 8).toUpperCase(),
          new Date(s.created_at).toLocaleString("pt-BR"),
          PAYMENT_CONFIG[s.payment_method]?.label ?? s.payment_method,
          fmtBRL(Number(s.total)),
          s.cancellation_reason ?? "—",
        ]);
      }
    }
    if (refunds.length > 0) {
      rows.push([]);
      rows.push(["Devoluções"]);
      rows.push(["Venda ID", "Data/Hora", "Tipo", "Valor", "Motivo"]);
      for (const r of refunds) {
        rows.push([
          r.sale_id.slice(0, 8).toUpperCase(),
          new Date(r.created_at).toLocaleString("pt-BR"),
          r.refund_method ? (PAYMENT_CONFIG[r.refund_method]?.label ?? r.refund_method) : "—",
          fmtBRL(Number(r.amount)),
          r.reason ?? "—",
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `relatorio-pdvio-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(null);
  }

  // ── PDF Export ─────────────────────────────────────────────────────────────
  const exportPDF = useCallback(async () => {
    setExporting("pdf");
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth(); // 210
      const pageH = doc.internal.pageSize.getHeight(); // 297
      const margin = 14;
      const cw = pageW - margin * 2; // 182mm usable
      const genDate = new Date();

      // ── Shared styles ────────────────────────────────────────────────────
      const headPurple = { fillColor: [124, 58, 237] as [number,number,number], textColor: [255,255,255] as [number,number,number], fontStyle: "bold" as const, fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } };
      const bodyBase  = { fontSize: 8, textColor: [30, 30, 30] as [number,number,number], cellPadding: { top: 3, bottom: 3, left: 4, right: 4 } };
      const altRow    = { fillColor: [248, 247, 255] as [number,number,number] };

      // ── Section title helper ─────────────────────────────────────────────
      const sectionTitle = (title: string, y: number): number => {
        doc.setFillColor(237, 233, 254);
        doc.rect(margin, y, cw, 7, "F");
        doc.setFontSize(8);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(109, 40, 217);
        doc.text(title, margin + 3, y + 4.8);
        return y + 10;
      };

      // ── Footer helper ────────────────────────────────────────────────────
      const addFooter = (pageNum: number, total: number) => {
        doc.setDrawColor(220, 220, 220);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(150, 150, 150);
        doc.text(`PDVIO  |  ${activeCompany?.name ?? ""}  |  ${fmtDatetime(genDate)}`, margin, pageH - 8);
        doc.text(`${pageNum} / ${total}`, pageW - margin, pageH - 8, { align: "right" });
      };

      // ── Load logo ────────────────────────────────────────────────────────
      let logoBase64: string | null = null;
      try {
        const resp = await fetch(logoIconSrc);
        const blob2 = await resp.blob();
        logoBase64 = await new Promise<string>((res) => {
          const rd = new FileReader();
          rd.onload = () => res(rd.result as string);
          rd.readAsDataURL(blob2);
        });
      } catch (_) {}

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 1 — Resumo
      // ══════════════════════════════════════════════════════════════════════
      doc.setFillColor(124, 58, 237);
      doc.rect(0, 0, pageW, 36, "F");

      const logoX = margin;
      if (logoBase64) doc.addImage(logoBase64, "PNG", logoX, 7, 20, 20);
      const txtX = logoBase64 ? logoX + 24 : logoX;

      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.setTextColor(255, 255, 255);
      doc.text("PDVIO", txtX, 17);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(8.5);
      doc.setTextColor(210, 190, 255);
      doc.text("RELATÓRIO DE VENDAS E DESEMPENHO", txtX, 23);
      doc.setTextColor(185, 165, 240);
      doc.text(`Gerado em: ${fmtDatetime(genDate)}`, txtX, 29);

      // Info bar
      let y = 42;
      doc.setFillColor(249, 248, 255);
      doc.setDrawColor(220, 214, 250);
      doc.roundedRect(margin, y, cw, 10, 2, 2, "FD");
      doc.setFontSize(8);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(109, 40, 217);
      doc.text("Empresa:", margin + 4, y + 6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(activeCompany?.name ?? "—", margin + 24, y + 6.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(109, 40, 217);
      doc.text("Período:", margin + 96, y + 6.5);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 30, 30);
      doc.text(PERIOD_LABELS[period], margin + 116, y + 6.5);

      y += 16;

      // ── KPI table ────────────────────────────────────────────────────────
      y = sectionTitle("RESUMO DE INDICADORES", y);

      autoTable(doc, {
        startY: y,
        tableWidth: cw,
        margin: { left: margin, right: margin },
        head: [["Indicador", "Valor"]],
        body: [
          ["Receita bruta", fmtBRL(totalBruto)],
          ["Devoluções descontadas", refunds.length > 0 ? `- ${fmtBRL(totalRefundedAmount)}` : fmtBRL(0)],
          ["Receita líquida", fmtBRL(totalReceita)],
          ["Nº de vendas", String(totalVendas)],
          ["Ticket médio", fmtBRL(ticketMedio)],
          ["Itens vendidos", String(Math.round(totalItens))],
          ["Descontos concedidos", fmtBRL(totalDescontos)],
          ["Cancelamentos", `${cancelledSales.length}  (${fmtBRL(totalCancelledAmount)})`],
          ["Devoluções (qtd)", `${refunds.length}  (${fmtBRL(totalRefundedAmount)})`],
        ],
        headStyles: headPurple,
        bodyStyles: bodyBase,
        alternateRowStyles: altRow,
        columnStyles: {
          0: { cellWidth: 120, halign: "left" },
          1: { cellWidth: 62,  halign: "left", fontStyle: "bold" },
        },
        didParseCell: (d) => {
          if (d.section === "body" && d.row.index === 2) {
            d.cell.styles.fillColor = [237, 233, 254];
            d.cell.styles.textColor = [88, 28, 200];
            d.cell.styles.fontStyle = "bold";
          }
          if (d.section === "body" && (d.row.index === 7 || d.row.index === 8) && d.column.index === 1) {
            d.cell.styles.textColor = [185, 28, 28];
          }
          if (d.section === "body" && d.row.index === 1 && d.column.index === 1) {
            d.cell.styles.textColor = [185, 28, 28];
          }
        },
      });

      y = (doc as any).lastAutoTable.finalY + 8;

      // ── Payment breakdown ────────────────────────────────────────────────
      if (paymentBreakdown.length > 0) {
        y = sectionTitle("POR FORMA DE PAGAMENTO", y);

        autoTable(doc, {
          startY: y,
          tableWidth: cw,
          margin: { left: margin, right: margin },
          head: [["Forma de pagamento", "Vendas", "Total", "% da receita"]],
          body: paymentBreakdown.map(({ method, count, total }) => [
            PAYMENT_CONFIG[method]?.label ?? method,
            String(count),
            fmtBRL(total),
            totalReceita > 0 ? fmtPct((total / totalReceita) * 100) : "0%",
          ]),
          headStyles: headPurple,
          bodyStyles: bodyBase,
          alternateRowStyles: altRow,
          columnStyles: {
            0: { cellWidth: 74, halign: "left" },
            1: { cellWidth: 24, halign: "left" },
            2: { cellWidth: 52, halign: "left", fontStyle: "bold" },
            3: { cellWidth: 32, halign: "left" },
          },
        });

        y = (doc as any).lastAutoTable.finalY + 8;
      }

      // ── Top products ─────────────────────────────────────────────────────
      if (topProducts.length > 0) {
        y = sectionTitle("PRODUTOS MAIS VENDIDOS", y);

        autoTable(doc, {
          startY: y,
          tableWidth: cw,
          margin: { left: margin, right: margin },
          head: [["Produto", "Quantidade", "Receita", "%"]],
          body: topProducts.map((p) => [
            p.name,
            fmtQty(p.qty, p.unit),
            fmtBRL(p.total),
            totalReceita > 0 ? fmtPct((p.total / totalReceita) * 100) : "0%",
          ]),
          headStyles: headPurple,
          bodyStyles: bodyBase,
          alternateRowStyles: altRow,
          columnStyles: {
            0: { cellWidth: 98, halign: "left" },
            1: { cellWidth: 30, halign: "left" },
            2: { cellWidth: 34, halign: "left", fontStyle: "bold" },
            3: { cellWidth: 20, halign: "left" },
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 2 — Transações
      // ══════════════════════════════════════════════════════════════════════
      if (sales.length > 0) {
        doc.addPage();

        doc.setFillColor(124, 58, 237);
        doc.rect(0, 0, pageW, 14, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`TRANSACOES CONCLUIDAS  (${sales.length} vendas  |  Total: ${fmtBRL(totalBruto)})`, margin, 9);

        autoTable(doc, {
          startY: 18,
          tableWidth: cw,
          margin: { left: margin, right: margin },
          head: [["ID", "Data / Hora", "Cliente", "Pagamento", "Total"]],
          body: sales.map((s) => [
            s.id.slice(0, 8).toUpperCase(),
            new Date(s.created_at).toLocaleString("pt-BR"),
            s.customers?.name ?? "—",
            PAYMENT_CONFIG[s.payment_method]?.label ?? s.payment_method,
            fmtBRL(Number(s.total)),
          ]),
          headStyles: headPurple,
          bodyStyles: bodyBase,
          alternateRowStyles: altRow,
          columnStyles: {
            0: { cellWidth: 24, halign: "left" },
            1: { cellWidth: 44, halign: "left" },
            2: { cellWidth: 48, halign: "left" },
            3: { cellWidth: 30, halign: "left" },
            4: { cellWidth: 36, halign: "left", fontStyle: "bold" },
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 3 — Cancelamentos (optional)
      // ══════════════════════════════════════════════════════════════════════
      if (cancelledSales.length > 0) {
        doc.addPage();

        doc.setFillColor(185, 28, 28);
        doc.rect(0, 0, pageW, 14, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`VENDAS CANCELADAS  (${cancelledSales.length}  |  Total: ${fmtBRL(totalCancelledAmount)})`, margin, 9);

        autoTable(doc, {
          startY: 18,
          tableWidth: cw,
          margin: { left: margin, right: margin },
          head: [["ID", "Data / Hora", "Pagamento", "Valor", "Motivo"]],
          body: cancelledSales.map((s) => [
            s.id.slice(0, 8).toUpperCase(),
            new Date(s.created_at).toLocaleString("pt-BR"),
            PAYMENT_CONFIG[s.payment_method]?.label ?? s.payment_method,
            fmtBRL(Number(s.total)),
            s.cancellation_reason ?? "—",
          ]),
          headStyles: { ...headPurple, fillColor: [185, 28, 28] },
          bodyStyles: bodyBase,
          alternateRowStyles: { fillColor: [255, 245, 245] },
          columnStyles: {
            0: { cellWidth: 22, halign: "left" },
            1: { cellWidth: 44, halign: "left" },
            2: { cellWidth: 28, halign: "left" },
            3: { cellWidth: 28, halign: "left", fontStyle: "bold" },
            4: { cellWidth: 60, halign: "left" },
          },
        });
      }

      // ══════════════════════════════════════════════════════════════════════
      // PAGE 4 — Devoluções (optional)
      // ══════════════════════════════════════════════════════════════════════
      if (refunds.length > 0) {
        doc.addPage();

        doc.setFillColor(180, 83, 9);
        doc.rect(0, 0, pageW, 14, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(255, 255, 255);
        doc.text(`DEVOLUCOES  (${refunds.length}  |  Total devolvido: ${fmtBRL(totalRefundedAmount)})`, margin, 9);

        autoTable(doc, {
          startY: 18,
          tableWidth: cw,
          margin: { left: margin, right: margin },
          head: [["Venda ID", "Data / Hora", "Forma devolucao", "Valor", "Motivo"]],
          body: refunds.map((r) => [
            r.sale_id.slice(0, 8).toUpperCase(),
            new Date(r.created_at).toLocaleString("pt-BR"),
            PAYMENT_CONFIG[r.refund_method]?.label ?? r.refund_method ?? "—",
            fmtBRL(Number(r.amount)),
            r.reason ?? "—",
          ]),
          headStyles: { ...headPurple, fillColor: [180, 83, 9] },
          bodyStyles: bodyBase,
          alternateRowStyles: { fillColor: [255, 251, 235] },
          columnStyles: {
            0: { cellWidth: 22, halign: "left" },
            1: { cellWidth: 44, halign: "left" },
            2: { cellWidth: 34, halign: "left" },
            3: { cellWidth: 28, halign: "left", fontStyle: "bold" },
            4: { cellWidth: 54, halign: "left" },
          },
        });
      }

      // ── Footers on every page ────────────────────────────────────────────
      const totalPages = doc.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        addFooter(i, totalPages);
      }

      doc.save(`relatorio-pdvio-${period}-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  }, [
    activeCompany, period, totalBruto, totalRefundedAmount, totalReceita, totalVendas,
    ticketMedio, totalItens, totalDescontos, cancelledSales, refunds, paymentBreakdown,
    topProducts, sales, totalCancelledAmount,
  ]);

  // ── PNG Export ─────────────────────────────────────────────────────────────
  async function exportPNG() {
    if (!printRef.current) return;
    setExporting("png");
    try {
      const el = printRef.current;
      el.style.display = "block";
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        width: el.scrollWidth,
        height: el.scrollHeight,
      });
      el.style.display = "none";
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-pdvio-${period}-${new Date().toISOString().slice(0, 10)}.png`;
      a.click();
    } finally {
      if (printRef.current) printRef.current.style.display = "none";
      setExporting(null);
    }
  }

  const now = new Date();

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8 animate-fade-in">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Relatórios</h1>
          <p className="text-sm text-muted-foreground mt-1">Visão analítica das vendas e desempenho.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCSV} disabled={isLoading || exporting !== null} data-testid="button-export-csv" className="gap-1.5">
            {exporting === "csv" ? <Download className="h-4 w-4 animate-bounce" /> : <FileText className="h-4 w-4" />}
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={exportPNG} disabled={isLoading || exporting !== null} data-testid="button-export-png" className="gap-1.5">
            {exporting === "png" ? <Download className="h-4 w-4 animate-bounce" /> : <Image className="h-4 w-4" />}
            PNG
          </Button>
          <Button variant="default" size="sm" onClick={exportPDF} disabled={isLoading || exporting !== null} data-testid="button-export-pdf" className="gap-1.5">
            {exporting === "pdf" ? <Download className="h-4 w-4 animate-bounce" /> : <FileText className="h-4 w-4" />}
            PDF
          </Button>
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-40" data-testid="select-period">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="week">Últimos 7 dias</SelectItem>
              <SelectItem value="month">Este mês</SelectItem>
              <SelectItem value="year">Este ano</SelectItem>
              <SelectItem value="all">Todo o período</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {kpis.map((k) => {
          const isBad = k.label === "Cancelamentos" || k.label === "Devoluções";
          return (
            <Card key={k.label} className="border-border/60">
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{k.label}</p>
                    {isLoading ? <Skeleton className="mt-2 h-8 w-24" /> : (
                      <p className={`mt-2 text-2xl font-bold ${isBad && k.value !== "0" ? "text-destructive" : ""}`} data-testid={`kpi-${k.label}`}>{k.value}</p>
                    )}
                  </div>
                  <div className={`rounded-lg bg-muted p-2 ${isBad && k.value !== "0" ? "text-destructive" : "text-primary"}`}>
                    <k.icon className="h-5 w-5" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* ── Deduções resumo ─────────────────────────────────────────────────── */}
      {!isLoading && (cancelledSales.length > 0 || refunds.length > 0) && (
        <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 space-y-1.5 text-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            Deduções do período
          </p>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Receita bruta</span>
            <span className="font-semibold">{fmtBRL(totalBruto)}</span>
          </div>
          {cancelledSales.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Ban className="h-3.5 w-3.5 text-destructive" />
                Cancelamentos ({cancelledSales.length})
              </span>
              <span className="font-semibold text-destructive">−{fmtBRL(totalCancelledAmount)}</span>
            </div>
          )}
          {refunds.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Undo2 className="h-3.5 w-3.5 text-amber-500" />
                Devoluções ({refunds.length})
              </span>
              <span className="font-semibold text-amber-500">−{fmtBRL(totalRefundedAmount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5">
            <span className="font-medium flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-destructive" />
              Receita líquida
            </span>
            <span className="font-bold text-lg">{fmtBRL(totalReceita)}</span>
          </div>
        </div>
      )}

      {/* ── Chart ──────────────────────────────────────────────────────────── */}
      <Card className="border-border/60">
        <CardHeader><CardTitle className="text-base font-semibold">Receita por período</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-56 w-full" /> : chartData.length === 0 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-3 text-center">
              <div className="rounded-full bg-muted p-4">
                <BarChart3 className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Sem dados no período</p>
            </div>
          ) : (
            <ChartContainer config={chartConfig} className="h-56 w-full">
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} width={48} />
                <ChartTooltip content={<ChartTooltipContent formatter={(value) => fmtBRL(Number(value))} />} />
                <Bar dataKey="receita" fill="var(--color-receita)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          )}
        </CardContent>
      </Card>

      {/* ── Bottom grid ────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top products */}
        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader><CardTitle className="text-base font-semibold">Produtos mais vendidos</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
            ) : topProducts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Package className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Sem dados no período</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {topProducts.map((p, i) => {
                  const pct = topProducts[0].total > 0 ? (p.total / topProducts[0].total) * 100 : 0;
                  return (
                    <div key={p.name} className="px-4 py-3 space-y-1.5" data-testid={`product-row-${i}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium truncate min-w-0 flex-1">{p.name}</span>
                        <span className="text-sm font-semibold shrink-0">{fmtBRL(p.total)}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="h-1.5 flex-1 min-w-0 rounded-full bg-muted overflow-hidden">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0 text-right">{fmtQty(p.qty, p.unit)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment breakdown */}
        <Card className="border-border/60 min-w-0 overflow-hidden">
          <CardHeader><CardTitle className="text-base font-semibold">Por forma de pagamento</CardTitle></CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="space-y-3 p-4">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : paymentBreakdown.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <Wallet className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">Sem dados no período</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {paymentBreakdown.map(({ method, count, total }) => {
                  const cfg = PAYMENT_CONFIG[method] ?? { label: method, icon: Receipt, color: "text-muted-foreground" };
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
                          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
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

      {/* ── Hidden PNG template ────────────────────────────────────────────── */}
      <div
        ref={printRef}
        style={{
          display: "none",
          position: "fixed",
          top: 0,
          left: 0,
          width: "960px",
          fontFamily: "Inter, system-ui, sans-serif",
          backgroundColor: "#ffffff",
          color: "#111827",
          zIndex: -1,
        }}
      >
        {/* Header */}
        <div style={{ background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)", padding: "24px 32px", display: "flex", alignItems: "center", gap: "16px" }}>
          <img src={logoIconSrc} alt="PDVIO" style={{ width: "48px", height: "48px", objectFit: "contain" }} />
          <div>
            <div style={{ color: "#ffffff", fontSize: "24px", fontWeight: "800", letterSpacing: "0.05em" }}>PDVIO</div>
            <div style={{ color: "rgba(255,255,255,0.85)", fontSize: "14px", marginTop: "2px" }}>RELATÓRIO DE VENDAS E PEDIDOS</div>
            <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "12px", marginTop: "2px" }}>Gerado em: {fmtDatetime(now)}</div>
          </div>
        </div>

        <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: "20px" }}>

          {/* Info box */}
          <div style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>INFORMAÇÕES DO RELATÓRIO</div>
              <div style={{ fontSize: "13px", color: "#374151" }}><b>Período:</b> {PERIOD_LABELS[period]}</div>
            </div>
            <div style={{ fontSize: "13px", color: "#374151" }}>
              <b>Empresa:</b> {activeCompany?.name ?? "—"} &nbsp;|&nbsp; <b>Vendas:</b> {totalVendas}
            </div>
          </div>

          {/* Executive summary */}
          <div>
            <div style={{ background: "#7c3aed", color: "#fff", fontSize: "12px", fontWeight: "700", letterSpacing: "0.08em", padding: "8px 16px", borderRadius: "6px 6px 0 0" }}>RESUMO EXECUTIVO</div>
            <div style={{ border: "1px solid #e5e7eb", borderTop: "none", borderRadius: "0 0 8px 8px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr" }}>
              {[
                { label: "RECEITA LÍQUIDA", value: fmtBRL(totalReceita), sub: `Ticket: ${fmtBRL(ticketMedio)}` },
                { label: "Nº DE VENDAS", value: String(totalVendas), sub: "transações" },
                { label: "ITENS VENDIDOS", value: String(Math.round(totalItens)), sub: "unidades" },
                { label: "DESCONTOS", value: fmtBRL(totalDescontos), sub: "concedidos" },
                { label: "CANCELAMENTOS", value: String(cancelledSales.length), sub: fmtBRL(totalCancelledAmount) },
                { label: "DEVOLUÇÕES", value: String(refunds.length), sub: fmtBRL(totalRefundedAmount) },
              ].map((item, i) => (
                <div key={i} style={{ padding: "20px 16px", borderRight: i < 5 ? "1px solid #e5e7eb" : "none", textAlign: "center" }}>
                  <div style={{ fontSize: "10px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.06em" }}>{item.label}</div>
                  <div style={{ fontSize: "22px", fontWeight: "800", color: i >= 4 ? "#dc2626" : "#7c3aed", margin: "8px 0 4px" }}>{item.value}</div>
                  <div style={{ fontSize: "11px", color: "#9ca3af" }}>{item.sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Payment analysis */}
          {paymentBreakdown.length > 0 && (
            <div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>ANÁLISE POR FORMA DE PAGAMENTO</div>
              <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(paymentBreakdown.length, 3)}, 1fr)`, gap: "12px" }}>
                {paymentBreakdown.map(({ method, count, total }) => {
                  const label = PAYMENT_CONFIG[method]?.label ?? method;
                  const pctNum = totalReceita > 0 ? (total / totalReceita) * 100 : 0;
                  const pctLabel = totalReceita > 0 ? fmtPct(pctNum) : "0%";
                  return (
                    <div key={method} style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "16px" }}>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#374151" }}>{label}</div>
                      <div style={{ fontSize: "20px", fontWeight: "800", color: "#7c3aed", margin: "6px 0 4px" }}>{fmtBRL(total)}</div>
                      <div style={{ fontSize: "11px", color: "#9ca3af" }}>{count} venda{count !== 1 ? "s" : ""} • {pctLabel}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Top 5 products compact */}
          {topProducts.length > 0 && (
            <div>
              <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "10px" }}>TOP PRODUTOS</div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {topProducts.slice(0, 5).map((p) => {
                  const pct = totalReceita > 0 ? (p.total / totalReceita) * 100 : 0;
                  return (
                    <div key={p.name} style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <div style={{ flex: 1, fontSize: "12px", color: "#374151", fontWeight: "500" }}>{p.name}</div>
                      <div style={{ width: "120px", background: "#e5e7eb", borderRadius: "4px", height: "6px", overflow: "hidden" }}>
                        <div style={{ width: `${pct}%`, background: "#7c3aed", height: "100%", borderRadius: "4px" }} />
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "#7c3aed", minWidth: "80px", textAlign: "right" }}>{fmtBRL(p.total)}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deductions summary (only if relevant) */}
          {(cancelledSales.length > 0 || refunds.length > 0) && (
            <div style={{ border: "1px solid #fca5a5", borderRadius: "8px", padding: "14px 16px", background: "#fff7f7" }}>
              <div style={{ fontSize: "11px", fontWeight: "700", color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "8px" }}>DEDUÇÕES</div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                {cancelledSales.length > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "800", color: "#dc2626" }}>{cancelledSales.length}</div>
                    <div style={{ fontSize: "10px", color: "#9ca3af" }}>cancelamentos</div>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: "#dc2626" }}>{fmtBRL(totalCancelledAmount)}</div>
                  </div>
                )}
                {refunds.length > 0 && (
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: "18px", fontWeight: "800", color: "#f59e0b" }}>{refunds.length}</div>
                    <div style={{ fontSize: "10px", color: "#9ca3af" }}>devoluções</div>
                    <div style={{ fontSize: "12px", fontWeight: "700", color: "#f59e0b" }}>{fmtBRL(totalRefundedAmount)}</div>
                  </div>
                )}
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: "18px", fontWeight: "800", color: "#7c3aed" }}>{fmtBRL(totalReceita)}</div>
                  <div style={{ fontSize: "10px", color: "#9ca3af" }}>receita líquida</div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "16px", textAlign: "center" }}>
            <div style={{ fontSize: "13px", fontWeight: "700", color: "#7c3aed" }}>PDVIO - Sistema de Ponto de Venda</div>
            <div style={{ fontSize: "11px", color: "#9ca3af", marginTop: "4px" }}>
              Relatório gerado automaticamente em {fmtDatetime(now)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
