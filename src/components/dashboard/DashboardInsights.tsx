import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from "lucide-react";

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtPct(v: number) {
  return `${v >= 0 ? "+" : ""}${v.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Retorna início (inclusivo) e fim (exclusivo) de um mês com offset relativo a hoje. */
function monthRange(offset = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offset, 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

interface SaleRec {
  id: string;
  total: number;
  created_at: string;
}

interface ItemRec {
  product_name: string;
  subtotal: number;
  sales: { created_at: string } | null;
}

export default function DashboardInsights({ companyId }: { companyId: string | null }) {
  const cur = useMemo(() => monthRange(0), []);
  const prev = useMemo(() => monthRange(-1), []);

  // Vendas dos últimos 2 meses (atual + anterior) numa única consulta.
  const { data: sales = [], isLoading: loadingSales } = useQuery<SaleRec[]>({
    queryKey: ["/dashboard-insights/sales", companyId, prev.start.toISOString(), cur.end.toISOString()],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, created_at")
        .eq("company_id", companyId!)
        .eq("status", "completed")
        .gte("created_at", prev.start.toISOString())
        .lt("created_at", cur.end.toISOString());
      if (error) throw error;
      return data ?? [];
    },
  });

  // Itens vendidos do mesmo período, juntando created_at da venda.
  const { data: items = [], isLoading: loadingItems } = useQuery<ItemRec[]>({
    queryKey: ["/dashboard-insights/items", companyId, prev.start.toISOString(), cur.end.toISOString(), sales.length],
    enabled: !!companyId && sales.length > 0,
    queryFn: async () => {
      const ids = sales.map((s) => s.id);
      // O Supabase aceita até ~1000 IDs por IN. Para a maioria das PMEs cabe folgado.
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_name, subtotal, sales!inner(created_at)")
        .in("sale_id", ids);
      if (error) throw error;
      return (data ?? []) as unknown as ItemRec[];
    },
  });

  const insights = useMemo(() => {
    const curStart = cur.start.getTime();
    const curEnd = cur.end.getTime();
    const prevStart = prev.start.getTime();
    const prevEnd = prev.end.getTime();

    let curRevenue = 0;
    let prevRevenue = 0;
    const hourBuckets: Record<number, number> = {};

    for (const s of sales) {
      const t = new Date(s.created_at).getTime();
      const total = Number(s.total);
      if (t >= curStart && t < curEnd) {
        curRevenue += total;
        const h = new Date(s.created_at).getHours();
        hourBuckets[h] = (hourBuckets[h] ?? 0) + total;
      } else if (t >= prevStart && t < prevEnd) {
        prevRevenue += total;
      }
    }

    let peakHour = -1;
    let peakRevenue = 0;
    for (const [h, r] of Object.entries(hourBuckets)) {
      if (r > peakRevenue) {
        peakRevenue = r;
        peakHour = Number(h);
      }
    }

    const curMap: Record<string, number> = {};
    const prevMap: Record<string, number> = {};
    for (const it of items) {
      if (!it.sales) continue;
      const t = new Date(it.sales.created_at).getTime();
      const sub = Number(it.subtotal);
      if (t >= curStart && t < curEnd) {
        curMap[it.product_name] = (curMap[it.product_name] ?? 0) + sub;
      } else if (t >= prevStart && t < prevEnd) {
        prevMap[it.product_name] = (prevMap[it.product_name] ?? 0) + sub;
      }
    }

    type Mover = { name: string; delta: number; pct: number };
    let topGainer: Mover | null = null;
    let topLoser: Mover | null = null;
    const allNames = new Set([...Object.keys(curMap), ...Object.keys(prevMap)]);
    for (const name of allNames) {
      const c = curMap[name] ?? 0;
      const p = prevMap[name] ?? 0;
      const delta = c - p;
      const pct = p > 0 ? (delta / p) * 100 : c > 0 ? 100 : 0;
      const rec: Mover = { name, delta, pct };
      if (delta > 0 && (!topGainer || delta > topGainer.delta)) topGainer = rec;
      if (delta < 0 && (!topLoser || delta < topLoser.delta)) topLoser = rec;
    }

    const revenueDelta = curRevenue - prevRevenue;
    const revenuePct =
      prevRevenue > 0 ? (revenueDelta / prevRevenue) * 100 : curRevenue > 0 ? 100 : 0;

    return { curRevenue, prevRevenue, revenueDelta, revenuePct, peakHour, peakRevenue, topGainer, topLoser };
  }, [sales, items, cur, prev]);

  const loading = loadingSales || loadingItems;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Comparativo do mês</h2>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="border-border/60">
              <CardContent className="p-5">
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Receita do mês vs anterior */}
          <Card className="border-border/60" data-testid="insight-revenue">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Receita do mês
              </p>
              <p className="mt-2 text-2xl font-bold tabular-nums">{fmtBRL(insights.curRevenue)}</p>
              <p
                className={`mt-1 flex items-center gap-1 text-xs ${
                  insights.revenueDelta >= 0 ? "text-emerald-600" : "text-rose-600"
                }`}
              >
                {insights.revenueDelta >= 0 ? (
                  <ArrowUpRight className="h-3 w-3" />
                ) : (
                  <ArrowDownRight className="h-3 w-3" />
                )}
                {fmtPct(insights.revenuePct)} vs mês anterior
              </p>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Anterior: {fmtBRL(insights.prevRevenue)}
              </p>
            </CardContent>
          </Card>

          {/* Produto que mais cresceu */}
          <Card className="border-border/60" data-testid="insight-top-gainer">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mais cresceu
              </p>
              {insights.topGainer ? (
                <>
                  <p className="mt-2 text-base font-semibold leading-tight line-clamp-2">
                    {insights.topGainer.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                    <TrendingUp className="h-3 w-3" />
                    +{fmtBRL(insights.topGainer.delta)} ({fmtPct(insights.topGainer.pct)})
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Sem variação positiva.</p>
              )}
            </CardContent>
          </Card>

          {/* Produto que mais caiu */}
          <Card className="border-border/60" data-testid="insight-top-loser">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Mais caiu
              </p>
              {insights.topLoser ? (
                <>
                  <p className="mt-2 text-base font-semibold leading-tight line-clamp-2">
                    {insights.topLoser.name}
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-rose-600">
                    <TrendingDown className="h-3 w-3" />
                    {fmtBRL(insights.topLoser.delta)} ({fmtPct(insights.topLoser.pct)})
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Sem queda registrada.</p>
              )}
            </CardContent>
          </Card>

          {/* Horário de pico */}
          <Card className="border-border/60" data-testid="insight-peak-hour">
            <CardContent className="p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Horário de pico
              </p>
              {insights.peakHour >= 0 ? (
                <>
                  <p className="mt-2 text-2xl font-bold tabular-nums">
                    {String(insights.peakHour).padStart(2, "0")}h
                  </p>
                  <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    {fmtBRL(insights.peakRevenue)} arrecadados
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">Ainda sem vendas neste mês.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
