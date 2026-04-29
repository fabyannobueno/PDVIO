import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Search, ShoppingBag, AlertTriangle, TrendingUp } from "lucide-react";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  stock_unit: string;
  min_stock: number;
  cost_price: number | null;
}

interface SaleRow {
  id: string;
  created_at: string;
}

interface ItemRow {
  product_id: string | null;
  quantity: number;
}

const INTEGER_UNITS = new Set(["un", "cx", "pç"]);

function fmtQty(qty: number, unit: string | null | undefined): string {
  const u = unit ?? "un";
  if (INTEGER_UNITS.has(u)) return `${Math.round(qty)} ${u}`;
  return `${qty.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${u}`;
}

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface Props {
  companyId: string | null;
  products: ProductRow[];
  loadingProducts: boolean;
}

export default function PurchaseSuggestions({ companyId, products, loadingProducts }: Props) {
  const [windowDays, setWindowDays] = useState(30);
  const [coverageDays, setCoverageDays] = useState(14);
  const [search, setSearch] = useState("");

  const since = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - windowDays);
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  }, [windowDays]);

  // Vendas concluídas dentro da janela.
  const { data: sales = [], isLoading: loadingSales } = useQuery<SaleRow[]>({
    queryKey: ["/purchase-suggestions/sales", companyId, since],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, created_at")
        .eq("company_id", companyId!)
        .eq("status", "completed")
        .gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: items = [], isLoading: loadingItems } = useQuery<ItemRow[]>({
    queryKey: ["/purchase-suggestions/items", companyId, since, sales.length],
    enabled: !!companyId && sales.length > 0,
    queryFn: async () => {
      const ids = sales.map((s) => s.id);
      const { data, error } = await supabase
        .from("sale_items")
        .select("product_id, quantity")
        .in("sale_id", ids);
      if (error) throw error;
      return (data ?? []) as ItemRow[];
    },
  });

  // Vendas por produto na janela.
  const soldMap = useMemo(() => {
    const map: Record<string, number> = {};
    for (const it of items) {
      if (!it.product_id) continue;
      map[it.product_id] = (map[it.product_id] ?? 0) + Number(it.quantity);
    }
    return map;
  }, [items]);

  const suggestions = useMemo(() => {
    const rows = products.map((p) => {
      const sold = soldMap[p.id] ?? 0;
      const dailyAvg = sold / windowDays;
      const stock = Number(p.stock_quantity) || 0;
      const coverage = dailyAvg > 0 ? stock / dailyAvg : Infinity;
      // Quantidade-alvo = cobertura desejada × média + estoque mínimo cadastrado.
      // Sugestão = alvo - estoque, nunca negativa.
      const target = dailyAvg * coverageDays + Number(p.min_stock || 0);
      const rawSuggest = target - stock;
      const suggest = INTEGER_UNITS.has(p.stock_unit)
        ? Math.max(0, Math.ceil(rawSuggest))
        : Math.max(0, Number(rawSuggest.toFixed(2)));
      return {
        product: p,
        sold,
        dailyAvg,
        stock,
        coverage,
        suggest,
        cost: Number(p.cost_price ?? 0) * suggest,
      };
    });
    // Mostrar apenas produtos com algum movimento OU com sugestão.
    return rows.filter((r) => r.sold > 0 || r.suggest > 0);
  }, [products, soldMap, coverageDays, windowDays]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? suggestions.filter(
          (s) =>
            s.product.name.toLowerCase().includes(q) ||
            (s.product.sku ?? "").toLowerCase().includes(q),
        )
      : suggestions;
    return [...list].sort((a, b) => {
      // Urgência: cobertura ascendente; depois sugest descendente.
      if (a.coverage !== b.coverage) return a.coverage - b.coverage;
      return b.suggest - a.suggest;
    });
  }, [suggestions, search]);

  const totalEstimate = useMemo(
    () => filtered.reduce((acc, r) => acc + r.cost, 0),
    [filtered],
  );

  const urgent = filtered.filter((r) => r.coverage < 7).length;
  const loading = loadingProducts || loadingSales || loadingItems;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <Card className="border-border/60">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Janela de análise</p>
            <Select value={String(windowDays)} onValueChange={(v) => setWindowDays(Number(v))}>
              <SelectTrigger data-testid="select-window-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="15">Últimos 15 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
                <SelectItem value="60">Últimos 60 dias</SelectItem>
                <SelectItem value="90">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">Cobertura desejada</p>
            <Select value={String(coverageDays)} onValueChange={(v) => setCoverageDays(Number(v))}>
              <SelectTrigger data-testid="select-coverage-days">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="14">14 dias</SelectItem>
                <SelectItem value="21">21 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="45">45 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="lg:col-span-2">
            <p className="mb-1 text-xs font-medium text-muted-foreground">Buscar produto</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Nome ou SKU..."
                className="pl-9"
                data-testid="input-search-suggestion"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Resumo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary/10 p-2 text-primary">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Itens com sugestão</p>
                <p className="text-xl font-bold" data-testid="text-suggestions-count">
                  {filtered.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-amber-500/15 p-2 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Urgentes (cobertura &lt; 7d)</p>
                <p className="text-xl font-bold" data-testid="text-urgent-count">
                  {urgent}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/15 p-2 text-emerald-600">
                <TrendingUp className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Investimento estimado</p>
                <p className="text-xl font-bold tabular-nums" data-testid="text-suggestion-total">
                  {fmtBRL(totalEstimate)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabela */}
      <Card className="border-border/60">
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-10 text-center">
              <div className="rounded-full bg-muted p-3">
                <ShoppingBag className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">Nenhuma sugestão de compra no momento</p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Estoque suficiente para a cobertura desejada com base nas vendas dos últimos {windowDays} dias.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Produto</TableHead>
                    <TableHead className="text-right">Vendido ({windowDays}d)</TableHead>
                    <TableHead className="text-right">Média/dia</TableHead>
                    <TableHead className="text-right">Estoque</TableHead>
                    <TableHead className="text-right">Cobertura</TableHead>
                    <TableHead className="text-right">Sugerir compra</TableHead>
                    <TableHead className="text-right">Custo est.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((r) => {
                    const cov = r.coverage;
                    const covLabel =
                      cov === Infinity
                        ? "—"
                        : `${cov.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d`;
                    const covTone =
                      cov < 3
                        ? "bg-red-500/15 text-red-600 border-red-500/30"
                        : cov < 7
                          ? "bg-amber-500/15 text-amber-600 border-amber-500/30"
                          : cov < 14
                            ? "bg-blue-500/15 text-blue-600 border-blue-500/30"
                            : "bg-emerald-500/15 text-emerald-600 border-emerald-500/30";
                    return (
                      <TableRow key={r.product.id} data-testid={`row-suggestion-${r.product.id}`}>
                        <TableCell>
                          <div className="font-medium">{r.product.name}</div>
                          {r.product.sku && (
                            <div className="text-xs text-muted-foreground">SKU: {r.product.sku}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtQty(r.sold, r.product.stock_unit)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {r.dailyAvg.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {fmtQty(r.stock, r.product.stock_unit)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className={covTone}>
                            {covLabel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-bold tabular-nums text-primary">
                          {r.suggest > 0 ? fmtQty(r.suggest, r.product.stock_unit) : "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {r.cost > 0 ? fmtBRL(r.cost) : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        A previsão usa a média de vendas dos últimos {windowDays} dias e busca manter{" "}
        {coverageDays} dias de cobertura, somado ao estoque mínimo cadastrado. Use como referência
        — sazonalidade e promoções podem alterar o consumo real.
      </p>
    </div>
  );
}
