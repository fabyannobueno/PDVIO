import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Coins,
  TrendingUp,
  Percent,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

const INTEGER_UNITS = new Set(["un", "cx", "pç"]);

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function fmtQty(qty: number, unit: string | null | undefined): string {
  const u = unit ?? "un";
  if (INTEGER_UNITS.has(u)) return `${Math.round(qty)} ${u}`;
  return `${qty.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${u}`;
}

interface ItemRec {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  products: { cost_price: number | null; stock_unit: string | null } | null;
}

interface Props {
  companyId: string | null;
  saleIds: string[];
  /** Receita líquida do período (já considerando devoluções), apenas para exibir contexto. */
  totalReceita: number;
}

export default function MarginReport({ companyId, saleIds, totalReceita }: Props) {
  const { data: items = [], isLoading } = useQuery<ItemRec[]>({
    queryKey: ["/relatorios/margin-items", companyId, saleIds.length, saleIds[0] ?? "none"],
    enabled: !!companyId && saleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_items")
        .select(
          "product_id, product_name, quantity, unit_price, subtotal, products(cost_price, stock_unit)",
        )
        .in("sale_id", saleIds);
      if (error) throw error;
      return (data ?? []) as unknown as ItemRec[];
    },
  });

  const data = useMemo(() => {
    type Row = {
      key: string;
      name: string;
      unit: string | null;
      qty: number;
      revenue: number;
      cost: number;
      profit: number;
      marginPct: number; // baseada na receita
      hasCost: boolean;
    };

    const map: Record<string, Row> = {};
    let totalRevenue = 0;
    let totalCost = 0;
    let totalProfit = 0;
    let revenueWithoutCost = 0;
    let revenueWithCost = 0;

    for (const it of items) {
      const key = it.product_id ?? `__name__${it.product_name}`;
      const cost = Number(it.products?.cost_price ?? 0);
      const qty = Number(it.quantity);
      const revenue = Number(it.subtotal);
      const itemCost = cost * qty;
      const profit = revenue - itemCost;
      const hasCost = cost > 0;

      totalRevenue += revenue;
      if (hasCost) {
        totalCost += itemCost;
        totalProfit += profit;
        revenueWithCost += revenue;
      } else {
        revenueWithoutCost += revenue;
      }

      if (!map[key]) {
        map[key] = {
          key,
          name: it.product_name,
          unit: it.products?.stock_unit ?? null,
          qty: 0,
          revenue: 0,
          cost: 0,
          profit: 0,
          marginPct: 0,
          hasCost,
        };
      }
      const r = map[key];
      r.qty += qty;
      r.revenue += revenue;
      r.cost += itemCost;
      r.profit += profit;
      r.hasCost = r.hasCost || hasCost;
    }

    const rows = Object.values(map).map((r) => ({
      ...r,
      marginPct: r.revenue > 0 ? (r.profit / r.revenue) * 100 : 0,
    }));

    const overallMarginPct = revenueWithCost > 0 ? (totalProfit / revenueWithCost) * 100 : 0;

    const sortedByProfit = [...rows]
      .filter((r) => r.hasCost)
      .sort((a, b) => b.profit - a.profit);
    const top = sortedByProfit.slice(0, 10);
    const bottom = sortedByProfit
      .filter((r) => r.profit < 0 || r.marginPct < 5)
      .sort((a, b) => a.marginPct - b.marginPct)
      .slice(0, 5);

    const noCostRows = rows.filter((r) => !r.hasCost);

    return {
      rows,
      totalRevenue,
      totalCost,
      totalProfit,
      overallMarginPct,
      revenueWithCost,
      revenueWithoutCost,
      top,
      bottom,
      noCostRows,
    };
  }, [items]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (saleIds.length === 0 || items.length === 0) {
    return (
      <Card className="border-border/60">
        <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
          <div className="rounded-full bg-muted p-3">
            <Coins className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">Sem vendas no período</p>
          <p className="text-xs text-muted-foreground">
            Não há itens para calcular margem e lucro.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs de margem */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Receita (itens c/ custo)
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums">
                  {fmtBRL(data.revenueWithCost)}
                </p>
              </div>
              <div className="rounded-lg bg-muted p-2 text-primary">
                <Coins className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Custo total
                </p>
                <p className="mt-2 text-xl font-bold tabular-nums text-rose-600">
                  {fmtBRL(data.totalCost)}
                </p>
              </div>
              <div className="rounded-lg bg-rose-500/15 p-2 text-rose-600">
                <ArrowDownRight className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Lucro bruto
                </p>
                <p
                  className={`mt-2 text-xl font-bold tabular-nums ${
                    data.totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {fmtBRL(data.totalProfit)}
                </p>
              </div>
              <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-600">
                <ArrowUpRight className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Margem média
                </p>
                <p
                  className={`mt-2 text-xl font-bold tabular-nums ${
                    data.overallMarginPct >= 0 ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {fmtPct(data.overallMarginPct)}
                </p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <Percent className="h-5 w-5" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Aviso de produtos sem custo */}
      {data.noCostRows.length > 0 && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-3 p-4">
            <div className="rounded-lg bg-amber-500/15 p-2 text-amber-600">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                {data.noCostRows.length} produto{data.noCostRows.length === 1 ? "" : "s"} sem custo cadastrado
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Receita não considerada na margem: {fmtBRL(data.revenueWithoutCost)}. Cadastre o
                preço de custo desses produtos para uma margem precisa.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top produtos por lucro */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-semibold">Top produtos por lucro</h3>
            </div>
            <span className="text-xs text-muted-foreground">
              {data.top.length} de {data.rows.filter((r) => r.hasCost).length}
            </span>
          </div>
          {data.top.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Nenhum produto com custo cadastrado neste período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Qtd</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Custo</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.top.map((r) => (
                    <TableRow key={r.key} data-testid={`row-margin-top-${r.key}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtQty(r.qty, r.unit)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(r.revenue)}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {fmtBRL(r.cost)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-bold text-emerald-600">
                        {fmtBRL(r.profit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            r.marginPct >= 30
                              ? "bg-emerald-500/15 text-emerald-600 border-emerald-500/30"
                              : r.marginPct >= 15
                                ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                                : r.marginPct >= 0
                                  ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                                  : "bg-red-500/15 text-red-600 border-red-500/30"
                          }
                        >
                          {fmtPct(r.marginPct)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Produtos com margem ruim */}
      {data.bottom.length > 0 && (
        <Card className="border-border/60">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4 text-rose-600" />
                <h3 className="text-sm font-semibold">Atenção — margem baixa ou negativa</h3>
              </div>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Receita</TableHead>
                    <TableHead className="text-right">Lucro</TableHead>
                    <TableHead className="text-right">Margem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.bottom.map((r) => (
                    <TableRow key={r.key} data-testid={`row-margin-bottom-${r.key}`}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{fmtBRL(r.revenue)}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-bold ${
                          r.profit >= 0 ? "text-amber-600" : "text-rose-600"
                        }`}
                      >
                        {fmtBRL(r.profit)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="outline"
                          className={
                            r.marginPct >= 0
                              ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                              : "bg-red-500/15 text-red-600 border-red-500/30"
                          }
                        >
                          {fmtPct(r.marginPct)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        A margem é calculada com base no preço de custo cadastrado no produto no momento da
        consulta. Receita líquida do período (após devoluções): {fmtBRL(totalReceita)}.
      </p>
    </div>
  );
}
