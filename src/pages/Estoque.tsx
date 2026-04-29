import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import {
  Boxes,
  ArrowDownToLine,
  Pencil,
  ClipboardCheck,
  AlertTriangle,
  Loader2,
  History,
  TrendingDown,
  TrendingUp,
  Package as PackageIcon,
  Search,
  ShoppingBag,
} from "lucide-react";
import PurchaseSuggestions from "@/components/estoque/PurchaseSuggestions";

interface ProductRow {
  id: string;
  name: string;
  sku: string | null;
  stock_quantity: number;
  stock_unit: string;
  min_stock: number;
  cost_price: number | null;
}

interface Movement {
  id: string;
  product_id: string;
  supplier_id: string | null;
  kind: "entry" | "adjustment" | "count" | "loss" | "sale";
  quantity: number;
  unit_cost: number | null;
  reference: string | null;
  notes: string | null;
  created_at: string;
  products?: { name: string; stock_unit: string } | null;
  suppliers?: { name: string } | null;
}

interface Supplier {
  id: string;
  name: string;
}

const KIND_LABEL: Record<Movement["kind"], string> = {
  entry: "Entrada",
  adjustment: "Ajuste",
  count: "Contagem",
  loss: "Perda",
  sale: "Venda",
};

const KIND_COLOR: Record<Movement["kind"], string> = {
  entry: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  adjustment: "bg-blue-500/15 text-blue-600 border-blue-500/30",
  count: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  loss: "bg-red-500/15 text-red-600 border-red-500/30",
  sale: "bg-purple-500/15 text-purple-600 border-purple-500/30",
};

function fmtBRL(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) +
    " " +
    d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
  );
}

type EntryForm = {
  product_id: string;
  supplier_id: string;
  quantity: string;
  unit_cost: string;
  reference: string;
  notes: string;
};

type AdjustForm = {
  product_id: string;
  delta: string; // signed (e.g. -3)
  notes: string;
};

type CountForm = {
  product_id: string;
  counted_quantity: string;
  notes: string;
};

type LossForm = {
  product_id: string;
  quantity: string; // positive
  notes: string;
};

export default function Estoque() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [posPage, setPosPage] = useState(1);
  const [alertPage, setAlertPage] = useState(1);
  const [histPage, setHistPage] = useState(1);
  const [activeDialog, setActiveDialog] = useState<null | "entry" | "adjust" | "count" | "loss">(null);
  const [entryForm, setEntryForm] = useState<EntryForm>({
    product_id: "",
    supplier_id: "",
    quantity: "",
    unit_cost: "",
    reference: "",
    notes: "",
  });
  const [adjustForm, setAdjustForm] = useState<AdjustForm>({ product_id: "", delta: "", notes: "" });
  const [countForm, setCountForm] = useState<CountForm>({ product_id: "", counted_quantity: "", notes: "" });
  const [lossForm, setLossForm] = useState<LossForm>({ product_id: "", quantity: "", notes: "" });
  const [minStockEditId, setMinStockEditId] = useState<string | null>(null);
  const [minStockValue, setMinStockValue] = useState("");

  const { data: products = [], isLoading: loadingProducts } = useQuery<ProductRow[]>({
    queryKey: ["/api/estoque/products", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("products")
        .select("id, name, sku, stock_quantity, stock_unit, min_stock, cost_price")
        .eq("company_id", activeCompany!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", activeCompany?.id, "select"],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("suppliers")
        .select("id, name")
        .eq("company_id", activeCompany!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const { data: movements = [], isLoading: loadingMovements } = useQuery<Movement[]>({
    queryKey: ["/api/stock_movements", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("stock_movements")
        .select("*, products(name, stock_unit), suppliers(name)")
        .eq("company_id", activeCompany!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Movement[];
    },
  });

  const filteredProducts = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
    );
  }, [products, search]);

  const PAGE_SIZE = 8;
  const posTotalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const safePosPage = Math.min(posPage, posTotalPages);
  const paginatedProducts = filteredProducts.slice((safePosPage - 1) * PAGE_SIZE, safePosPage * PAGE_SIZE);

  const lowStock = useMemo(
    () => products.filter((p) => p.min_stock > 0 && p.stock_quantity <= p.min_stock),
    [products],
  );

  const alertTotalPages = Math.max(1, Math.ceil(lowStock.length / PAGE_SIZE));
  const safeAlertPage = Math.min(alertPage, alertTotalPages);
  const paginatedLowStock = lowStock.slice((safeAlertPage - 1) * PAGE_SIZE, safeAlertPage * PAGE_SIZE);

  const histTotalPages = Math.max(1, Math.ceil(movements.length / PAGE_SIZE));
  const safeHistPage = Math.min(histPage, histTotalPages);
  const paginatedMovements = movements.slice((safeHistPage - 1) * PAGE_SIZE, safeHistPage * PAGE_SIZE);

  const totalInventoryValue = useMemo(
    () => products.reduce((acc, p) => acc + (p.cost_price ?? 0) * (p.stock_quantity ?? 0), 0),
    [products],
  );

  const insertMovement = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await (supabase as any).from("stock_movements").insert({
        company_id: activeCompany!.id,
        ...payload,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estoque/products", activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/stock_movements", activeCompany?.id] });
      setActiveDialog(null);
      toast.success("Movimentação registrada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao registrar"),
  });

  const updateMinStock = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: number }) => {
      const { error } = await (supabase as any)
        .from("products")
        .update({ min_stock: value })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/estoque/products", activeCompany?.id] });
      setMinStockEditId(null);
      toast.success("Estoque mínimo atualizado");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar"),
  });

  function openEntry() {
    setEntryForm({ product_id: "", supplier_id: "", quantity: "", unit_cost: "", reference: "", notes: "" });
    setActiveDialog("entry");
  }
  function openAdjust(productId?: string) {
    setAdjustForm({ product_id: productId ?? "", delta: "", notes: "" });
    setActiveDialog("adjust");
  }
  function openCount(productId?: string) {
    setCountForm({ product_id: productId ?? "", counted_quantity: "", notes: "" });
    setActiveDialog("count");
  }
  function openLoss(productId?: string) {
    setLossForm({ product_id: productId ?? "", quantity: "", notes: "" });
    setActiveDialog("loss");
  }

  function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(entryForm.quantity.replace(",", "."));
    if (!entryForm.product_id || !qty || qty <= 0) {
      toast.error("Produto e quantidade são obrigatórios");
      return;
    }
    insertMovement.mutate({
      product_id: entryForm.product_id,
      supplier_id: entryForm.supplier_id || null,
      kind: "entry",
      quantity: qty,
      unit_cost: entryForm.unit_cost ? parseFloat(entryForm.unit_cost.replace(",", ".")) : null,
      reference: entryForm.reference.trim() || null,
      notes: entryForm.notes.trim() || null,
    });
  }

  function submitAdjust(e: React.FormEvent) {
    e.preventDefault();
    const delta = parseFloat(adjustForm.delta.replace(",", "."));
    if (!adjustForm.product_id || !delta) {
      toast.error("Produto e quantidade são obrigatórios");
      return;
    }
    insertMovement.mutate({
      product_id: adjustForm.product_id,
      kind: "adjustment",
      quantity: delta,
      notes: adjustForm.notes.trim() || null,
    });
  }

  function submitCount(e: React.FormEvent) {
    e.preventDefault();
    const counted = parseFloat(countForm.counted_quantity.replace(",", "."));
    if (!countForm.product_id || isNaN(counted) || counted < 0) {
      toast.error("Produto e quantidade contada são obrigatórios");
      return;
    }
    const product = products.find((p) => p.id === countForm.product_id);
    if (!product) return;
    const delta = counted - product.stock_quantity;
    if (delta === 0) {
      toast.info("Estoque do sistema já confere com o contado");
      setActiveDialog(null);
      return;
    }
    insertMovement.mutate({
      product_id: countForm.product_id,
      kind: "count",
      quantity: delta,
      reference: `Contagem cíclica: ${counted}`,
      notes: countForm.notes.trim() || null,
    });
  }

  function submitLoss(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseFloat(lossForm.quantity.replace(",", "."));
    if (!lossForm.product_id || !qty || qty <= 0) {
      toast.error("Produto e quantidade são obrigatórios");
      return;
    }
    insertMovement.mutate({
      product_id: lossForm.product_id,
      kind: "loss",
      quantity: -Math.abs(qty),
      notes: lossForm.notes.trim() || null,
    });
  }

  const productMap = useMemo(() => {
    const m = new Map<string, ProductRow>();
    products.forEach((p) => m.set(p.id, p));
    return m;
  }, [products]);

  return (
    <div className="space-y-6 p-4 md:p-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            Entradas, ajustes, contagens e histórico de movimentações
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button data-testid="btn-stock-entry" onClick={openEntry}>
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Entrada
          </Button>
          <Button variant="outline" data-testid="btn-stock-adjust" onClick={() => openAdjust()}>
            <Pencil className="mr-2 h-4 w-4" />
            Ajuste
          </Button>
          <Button variant="outline" data-testid="btn-stock-count" onClick={() => openCount()}>
            <ClipboardCheck className="mr-2 h-4 w-4" />
            Contagem
          </Button>
          <Button variant="outline" data-testid="btn-stock-loss" onClick={() => openLoss()}>
            <TrendingDown className="mr-2 h-4 w-4" />
            Perda
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <Boxes className="h-4 w-4" /> Produtos ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-total-products">{products.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Valor de estoque (custo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold" data-testid="text-stock-value">{fmtBRL(totalInventoryValue)}</p>
          </CardContent>
        </Card>
        <Card className={lowStock.length > 0 ? "border-amber-500/40" : ""}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Estoque baixo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-amber-600" data-testid="text-low-stock-count">{lowStock.length}</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="positions" className="w-full">
        <TabsList>
          <TabsTrigger value="positions" data-testid="tab-positions">
            <PackageIcon className="mr-2 h-4 w-4" /> Posições
          </TabsTrigger>
          <TabsTrigger value="alerts" data-testid="tab-alerts">
            <AlertTriangle className="mr-2 h-4 w-4" /> Alertas ({lowStock.length})
          </TabsTrigger>
          <TabsTrigger value="suggestions" data-testid="tab-suggestions">
            <ShoppingBag className="mr-2 h-4 w-4" /> Sugestão de compra
          </TabsTrigger>
          <TabsTrigger value="history" data-testid="tab-history">
            <History className="mr-2 h-4 w-4" /> Histórico
          </TabsTrigger>
        </TabsList>

        <TabsContent value="positions" className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              data-testid="input-search-product"
              placeholder="Buscar produto..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPosPage(1);
              }}
              className="pl-9"
            />
          </div>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {loadingProducts ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-1/2" />
                </div>
              ))
            ) : paginatedProducts.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                Nenhum produto encontrado
              </div>
            ) : (
              paginatedProducts.map((p) => {
                const isLow = p.min_stock > 0 && p.stock_quantity <= p.min_stock;
                return (
                  <div key={p.id} className="rounded-lg border border-border bg-card p-3" data-testid={`card-stock-${p.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.name}</p>
                        {p.sku && <p className="font-mono text-xs text-muted-foreground">{p.sku}</p>}
                      </div>
                      <div className={`shrink-0 text-right font-mono text-sm ${isLow ? "font-bold text-amber-600" : ""}`}>
                        {p.stock_quantity.toLocaleString("pt-BR")} {p.stock_unit}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                      <span>Mín: <span className="font-mono">{p.min_stock.toLocaleString("pt-BR")}</span></span>
                      <span>Custo: <span className="font-mono">{fmtBRL(p.cost_price)}</span></span>
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openAdjust(p.id)}>
                        Ajustar
                      </Button>
                      <Button size="sm" variant="outline" className="flex-1" onClick={() => openCount(p.id)}>
                        Contar
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead className="text-right">Estoque</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Custo unit.</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingProducts ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : paginatedProducts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                      Nenhum produto encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProducts.map((p) => {
                    const isLow = p.min_stock > 0 && p.stock_quantity <= p.min_stock;
                    const isEditingMin = minStockEditId === p.id;
                    return (
                      <TableRow key={p.id} data-testid={`row-stock-${p.id}`}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="font-mono text-xs">{p.sku ?? "—"}</TableCell>
                        <TableCell className="text-right">
                          <span className={isLow ? "font-bold text-amber-600" : "font-mono"}>
                            {p.stock_quantity.toLocaleString("pt-BR")} {p.stock_unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {isEditingMin ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                className="h-7 w-20 text-right"
                                value={minStockValue}
                                onChange={(e) => setMinStockValue(e.target.value)}
                                autoFocus
                              />
                              <Button
                                size="sm"
                                className="h-7"
                                onClick={() =>
                                  updateMinStock.mutate({
                                    id: p.id,
                                    value: parseFloat(minStockValue.replace(",", ".")) || 0,
                                  })
                                }
                              >
                                OK
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="font-mono text-muted-foreground hover:text-foreground hover:underline"
                              onClick={() => {
                                setMinStockEditId(p.id);
                                setMinStockValue(String(p.min_stock));
                              }}
                              data-testid={`btn-edit-min-${p.id}`}
                            >
                              {p.min_stock.toLocaleString("pt-BR")}
                            </button>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtBRL(p.cost_price)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => openAdjust(p.id)} data-testid={`btn-adjust-${p.id}`}>
                            Ajustar
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => openCount(p.id)} data-testid={`btn-count-${p.id}`}>
                            Contar
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {posTotalPages > 1 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-muted-foreground sm:text-left">
                Página {safePosPage} de {posTotalPages} · {filteredProducts.length} produto(s)
              </p>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safePosPage <= 1} onClick={() => { setPosPage((p) => p - 1); scrollAppToTop(); }} data-testid="btn-pos-prev">
                  Anterior
                </Button>
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safePosPage >= posTotalPages} onClick={() => { setPosPage((p) => p + 1); scrollAppToTop(); }} data-testid="btn-pos-next">
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="alerts" className="space-y-3">
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {paginatedLowStock.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-12">
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <AlertTriangle className="h-10 w-10 opacity-30" />
                  <p className="text-sm">Nenhum produto abaixo do mínimo</p>
                </div>
              </div>
            ) : (
              paginatedLowStock.map((p) => (
                <div key={p.id} className="rounded-lg border border-border bg-card p-3" data-testid={`card-alert-${p.id}`}>
                  <p className="truncate font-medium">{p.name}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 border-t border-border pt-2 text-center text-xs">
                    <div>
                      <p className="text-muted-foreground">Atual</p>
                      <p className="font-mono font-bold text-amber-600">{p.stock_quantity.toLocaleString("pt-BR")}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Mínimo</p>
                      <p className="font-mono">{p.min_stock.toLocaleString("pt-BR")}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Diferença</p>
                      <p className="font-mono text-red-600">{(p.stock_quantity - p.min_stock).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => {
                      setEntryForm({ ...entryForm, product_id: p.id, quantity: "", unit_cost: "", reference: "", notes: "", supplier_id: "" });
                      setActiveDialog("entry");
                    }}
                  >
                    Repor
                  </Button>
                </div>
              ))
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-right">Estoque atual</TableHead>
                  <TableHead className="text-right">Mínimo</TableHead>
                  <TableHead className="text-right">Diferença</TableHead>
                  <TableHead className="w-32 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedLowStock.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <AlertTriangle className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Nenhum produto abaixo do mínimo</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedLowStock.map((p) => (
                    <TableRow key={p.id} data-testid={`row-alert-${p.id}`}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right font-mono text-amber-600 font-bold">
                        {p.stock_quantity.toLocaleString("pt-BR")} {p.stock_unit}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {p.min_stock.toLocaleString("pt-BR")} {p.stock_unit}
                      </TableCell>
                      <TableCell className="text-right font-mono text-red-600">
                        {(p.stock_quantity - p.min_stock).toLocaleString("pt-BR")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button size="sm" variant="outline" onClick={() => {
                          setEntryForm({ ...entryForm, product_id: p.id, quantity: "", unit_cost: "", reference: "", notes: "", supplier_id: "" });
                          setActiveDialog("entry");
                        }} data-testid={`btn-replenish-${p.id}`}>
                          Repor
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          {alertTotalPages > 1 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-muted-foreground sm:text-left">
                Página {safeAlertPage} de {alertTotalPages} · {lowStock.length} alerta(s)
              </p>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safeAlertPage <= 1} onClick={() => { setAlertPage((p) => p - 1); scrollAppToTop(); }} data-testid="btn-alert-prev">
                  Anterior
                </Button>
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safeAlertPage >= alertTotalPages} onClick={() => { setAlertPage((p) => p + 1); scrollAppToTop(); }} data-testid="btn-alert-next">
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-3">
          <PurchaseSuggestions
            companyId={activeCompany?.id ?? null}
            products={products}
            loadingProducts={loadingProducts}
          />
        </TabsContent>

        <TabsContent value="history" className="space-y-3">
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {loadingMovements ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-border bg-card p-3">
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ))
            ) : paginatedMovements.length === 0 ? (
              <div className="rounded-lg border border-border bg-card py-12 text-center text-sm text-muted-foreground">
                Nenhuma movimentação ainda
              </div>
            ) : (
              paginatedMovements.map((m) => {
                const product = m.products ?? productMap.get(m.product_id);
                const unit = product?.stock_unit ?? "";
                return (
                  <div key={m.id} className="rounded-lg border border-border bg-card p-3" data-testid={`card-movement-${m.id}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <Badge variant="outline" className={KIND_COLOR[m.kind]}>
                          {KIND_LABEL[m.kind]}
                        </Badge>
                        <p className="mt-1 truncate font-medium">{product?.name ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(m.created_at)}</p>
                      </div>
                      <div className={`shrink-0 text-right font-mono text-sm ${m.quantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {m.quantity > 0 ? "+" : ""}
                        {m.quantity.toLocaleString("pt-BR")} {unit}
                      </div>
                    </div>
                    {(m.suppliers?.name || m.unit_cost || m.reference || m.notes) && (
                      <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                        {m.suppliers?.name && <p>Fornecedor: {m.suppliers.name}</p>}
                        {m.unit_cost ? <p>Custo unit.: <span className="font-mono">{fmtBRL(m.unit_cost)}</span></p> : null}
                        {m.reference && <p>Ref: {m.reference}</p>}
                        {m.notes && <p>{m.notes}</p>}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead className="text-right">Quantidade</TableHead>
                  <TableHead className="text-right">Custo unit.</TableHead>
                  <TableHead>Observação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingMovements ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : paginatedMovements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                      Nenhuma movimentação ainda
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedMovements.map((m) => {
                    const product = m.products ?? productMap.get(m.product_id);
                    const unit = product?.stock_unit ?? "";
                    return (
                      <TableRow key={m.id} data-testid={`row-movement-${m.id}`}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(m.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={KIND_COLOR[m.kind]}>
                            {KIND_LABEL[m.kind]}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">{product?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs">{m.suppliers?.name ?? "—"}</TableCell>
                        <TableCell className={`text-right font-mono ${m.quantity >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                          {m.quantity > 0 ? "+" : ""}
                          {m.quantity.toLocaleString("pt-BR")} {unit}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtBRL(m.unit_cost)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.reference ? <span className="block">{m.reference}</span> : null}
                          {m.notes}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {histTotalPages > 1 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-muted-foreground sm:text-left">
                Página {safeHistPage} de {histTotalPages} · {movements.length} movimento(s)
              </p>
              <div className="flex w-full gap-2 sm:w-auto">
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safeHistPage <= 1} onClick={() => { setHistPage((p) => p - 1); scrollAppToTop(); }} data-testid="btn-hist-prev">
                  Anterior
                </Button>
                <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safeHistPage >= histTotalPages} onClick={() => { setHistPage((p) => p + 1); scrollAppToTop(); }} data-testid="btn-hist-next">
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Entry Dialog */}
      <Dialog open={activeDialog === "entry"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Entrada de mercadoria</DialogTitle>
            <DialogDescription>Registra a chegada de produtos vindos de um fornecedor.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitEntry} className="space-y-4">
            <div>
              <Label>Produto *</Label>
              <Select value={entryForm.product_id} onValueChange={(v) => setEntryForm({ ...entryForm, product_id: v })}>
                <SelectTrigger data-testid="select-entry-product"><SelectValue placeholder="Selecione um produto" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Fornecedor</Label>
              <Select value={entryForm.supplier_id || "none"} onValueChange={(v) => setEntryForm({ ...entryForm, supplier_id: v === "none" ? "" : v })}>
                <SelectTrigger data-testid="select-entry-supplier"><SelectValue placeholder="Sem fornecedor" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem fornecedor</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Quantidade *</Label>
                <Input
                  data-testid="input-entry-qty"
                  inputMode="decimal"
                  value={entryForm.quantity}
                  onChange={(e) => setEntryForm({ ...entryForm, quantity: e.target.value })}
                />
              </div>
              <div>
                <Label>Custo unitário (R$)</Label>
                <Input
                  data-testid="input-entry-cost"
                  inputMode="decimal"
                  value={entryForm.unit_cost}
                  onChange={(e) => setEntryForm({ ...entryForm, unit_cost: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Nota fiscal / referência</Label>
              <Input
                data-testid="input-entry-ref"
                value={entryForm.reference}
                onChange={(e) => setEntryForm({ ...entryForm, reference: e.target.value })}
              />
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancelar</Button>
              <Button type="submit" disabled={insertMovement.isPending} data-testid="btn-save-entry">
                {insertMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar entrada
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Adjust Dialog */}
      <Dialog open={activeDialog === "adjust"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ajuste manual</DialogTitle>
            <DialogDescription>Use valor positivo para somar e negativo para subtrair (ex: -3).</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitAdjust} className="space-y-4">
            <div>
              <Label>Produto *</Label>
              <Select value={adjustForm.product_id} onValueChange={(v) => setAdjustForm({ ...adjustForm, product_id: v })}>
                <SelectTrigger data-testid="select-adjust-product"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (atual: {p.stock_quantity} {p.stock_unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade (com sinal) *</Label>
              <Input
                data-testid="input-adjust-delta"
                inputMode="decimal"
                placeholder="Ex: 5 ou -3"
                value={adjustForm.delta}
                onChange={(e) => setAdjustForm({ ...adjustForm, delta: e.target.value })}
              />
            </div>
            <div>
              <Label>Motivo / observações</Label>
              <Textarea rows={2} value={adjustForm.notes} onChange={(e) => setAdjustForm({ ...adjustForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancelar</Button>
              <Button type="submit" disabled={insertMovement.isPending} data-testid="btn-save-adjust">
                {insertMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar ajuste
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Count Dialog */}
      <Dialog open={activeDialog === "count"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Contagem cíclica</DialogTitle>
            <DialogDescription>Informe a quantidade real contada. O sistema calculará a diferença e ajustará o estoque.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submitCount} className="space-y-4">
            <div>
              <Label>Produto *</Label>
              <Select value={countForm.product_id} onValueChange={(v) => setCountForm({ ...countForm, product_id: v })}>
                <SelectTrigger data-testid="select-count-product"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} (sistema: {p.stock_quantity} {p.stock_unit})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade contada *</Label>
              <Input
                data-testid="input-count-qty"
                inputMode="decimal"
                value={countForm.counted_quantity}
                onChange={(e) => setCountForm({ ...countForm, counted_quantity: e.target.value })}
              />
              {countForm.product_id && countForm.counted_quantity && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Diferença:{" "}
                  <span className="font-mono font-medium">
                    {(
                      parseFloat(countForm.counted_quantity.replace(",", ".")) -
                      (productMap.get(countForm.product_id)?.stock_quantity ?? 0)
                    ).toLocaleString("pt-BR")}
                  </span>
                </p>
              )}
            </div>
            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={countForm.notes} onChange={(e) => setCountForm({ ...countForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancelar</Button>
              <Button type="submit" disabled={insertMovement.isPending} data-testid="btn-save-count">
                {insertMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirmar contagem
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Loss Dialog */}
      <Dialog open={activeDialog === "loss"} onOpenChange={(o) => !o && setActiveDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar perda / quebra</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitLoss} className="space-y-4">
            <div>
              <Label>Produto *</Label>
              <Select value={lossForm.product_id} onValueChange={(v) => setLossForm({ ...lossForm, product_id: v })}>
                <SelectTrigger data-testid="select-loss-product"><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantidade perdida *</Label>
              <Input
                data-testid="input-loss-qty"
                inputMode="decimal"
                value={lossForm.quantity}
                onChange={(e) => setLossForm({ ...lossForm, quantity: e.target.value })}
              />
            </div>
            <div>
              <Label>Motivo</Label>
              <Textarea rows={2} value={lossForm.notes} onChange={(e) => setLossForm({ ...lossForm, notes: e.target.value })} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setActiveDialog(null)}>Cancelar</Button>
              <Button type="submit" disabled={insertMovement.isPending} data-testid="btn-save-loss" className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {insertMovement.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Registrar perda
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
