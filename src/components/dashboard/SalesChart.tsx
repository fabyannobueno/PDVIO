import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp } from "lucide-react";

interface Props {
  companyId: string | null;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtBRLShort(v: number) {
  if (v >= 1000) return `R$${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`;
  return `R$${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

const DAYS_PT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function last7Days() {
  const days: { label: string; date: string; start: string; end: string }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const start = d.toISOString();
    d.setHours(23, 59, 59, 999);
    const end = d.toISOString();
    const iso = start.slice(0, 10);
    const label = i === 0 ? "Hoje" : i === 1 ? "Ontem" : DAYS_PT[new Date(start).getDay()];
    days.push({ label, date: iso, start, end });
  }
  return days;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-md text-sm">
      <p className="font-medium mb-1">{label}</p>
      <p className="text-primary font-semibold">{fmtBRL(payload[0].value)}</p>
    </div>
  );
}

export default function SalesChart({ companyId }: Props) {
  const days = useMemo(() => last7Days(), []);

  const { data: sales = [], isLoading } = useQuery<{ total: number; created_at: string }[]>({
    queryKey: ["/dashboard/sales-7d", companyId],
    enabled: !!companyId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("total, created_at")
        .eq("company_id", companyId!)
        .eq("status", "completed")
        .gte("created_at", days[0].start)
        .lte("created_at", days[6].end);
      if (error) throw error;
      return data ?? [];
    },
  });

  const chartData = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const s of sales) {
      const date = s.created_at.slice(0, 10);
      byDate[date] = (byDate[date] ?? 0) + Number(s.total);
    }
    return days.map((d) => ({ label: d.label, total: byDate[d.date] ?? 0 }));
  }, [sales, days]);

  const totalWeek = chartData.reduce((s, d) => s + d.total, 0);
  const hasData = chartData.some((d) => d.total > 0);

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <TrendingUp className="h-4 w-4 text-primary" />
            Vendas — últimos 7 dias
          </CardTitle>
          {!isLoading && hasData && (
            <span className="text-sm font-semibold tabular-nums text-muted-foreground">
              {fmtBRL(totalWeek)}
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0 pb-4">
        {isLoading ? (
          <Skeleton className="h-[200px] w-full rounded-lg" />
        ) : !hasData ? (
          <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
            Nenhuma venda registrada nos últimos 7 dias
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tickFormatter={fmtBRLShort}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: "hsl(var(--border))", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="total"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#salesGrad)"
                dot={{ r: 3, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "hsl(var(--primary))", strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
