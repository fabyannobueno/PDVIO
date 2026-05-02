import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { usePermissions } from "@/hooks/usePermission";
import type { Promotion, Coupon, PromotionKind, CouponKind } from "@/lib/promotions";
import { isPromotionActive, isCouponActive } from "@/lib/promotions";
import { PREDEFINED_CATEGORIES } from "@/lib/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MoneyInput, formatMoneyInput, parseMoney } from "@/components/ui/money-input";
import { PercentInput, formatPercentInput, parsePercent } from "@/components/ui/percent-input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Tag,
  Ticket,
  Percent,
  Package,
  Search,
  ChevronsUpDown,
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  Bike,
  ShoppingBag,
  Info,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function fmtBRL(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtDateTimeLocal(d: string | null): string {
  if (!d) return "";
  // ISO -> "YYYY-MM-DDTHH:mm" para input datetime-local
  const dt = new Date(d);
  const tz = dt.getTimezoneOffset();
  const local = new Date(dt.getTime() - tz * 60_000);
  return local.toISOString().slice(0, 16);
}

function localDateTimeToISO(value: string): string | null {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

interface ProductOption {
  id: string;
  name: string;
  category: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default function Promocoes() {
  const { activeCompany } = useCompany();
  const { can } = usePermissions();
  const canManage = can("manage_promocoes");
  const companyId = activeCompany?.id ?? "";

  useEffect(() => {
    scrollAppToTop();
  }, []);

  // Catálogo (produtos + categorias) para popular selects
  const productsQuery = useQuery({
    queryKey: ["promo-products", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<ProductOption[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, category")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as ProductOption[];
    },
  });

  const categories = useMemo(() => {
    const set = new Set<string>(PREDEFINED_CATEGORIES);
    (productsQuery.data ?? []).forEach((p) => {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [productsQuery.data]);

  return (
    <div className="space-y-4 p-4 sm:space-y-6 sm:p-6 md:p-8 animate-fade-in">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Promoções e cupons</h1>
        <p className="text-sm text-muted-foreground">
          Crie regras automáticas que aplicam desconto no PDV e cupons com código
          que o cliente digita ao finalizar a compra.
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-500/30 bg-blue-500/8 px-4 py-3 text-sm text-blue-700 dark:text-blue-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          As promoções automáticas e os cupons de desconto também são válidos no{" "}
          <strong>cardápio digital</strong> — tanto para pedidos de{" "}
          <span className="inline-flex items-center gap-1 font-medium"><Bike className="h-3.5 w-3.5" />delivery</span>{" "}
          quanto para{" "}
          <span className="inline-flex items-center gap-1 font-medium"><ShoppingBag className="h-3.5 w-3.5" />retirada no local</span>.
        </span>
      </div>

      <Tabs defaultValue="promotions" className="w-full">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="promotions" className="gap-2">
            <Tag className="h-4 w-4" />
            Promoções
          </TabsTrigger>
          <TabsTrigger value="coupons" className="gap-2">
            <Ticket className="h-4 w-4" />
            Cupons
          </TabsTrigger>
        </TabsList>

        <TabsContent value="promotions" className="mt-4">
          <PromotionsTab
            companyId={companyId}
            canManage={canManage}
            products={productsQuery.data ?? []}
            categories={categories}
          />
        </TabsContent>

        <TabsContent value="coupons" className="mt-4">
          <CouponsTab companyId={companyId} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Promotions tab
// ─────────────────────────────────────────────────────────────────────────────

interface PromotionsTabProps {
  companyId: string;
  canManage: boolean;
  products: ProductOption[];
  categories: string[];
}

interface PromotionForm {
  name: string;
  kind: PromotionKind;
  category: string;
  product_id: string;
  discount_percent: string;
  buy_qty: string;
  pay_qty: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

const EMPTY_PROMO_FORM: PromotionForm = {
  name: "",
  kind: "category_percent",
  category: "",
  product_id: "",
  discount_percent: "",
  buy_qty: "3",
  pay_qty: "2",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

function PromotionsTab({ companyId, canManage, products, categories }: PromotionsTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState<PromotionForm>(EMPTY_PROMO_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [categoryComboOpen, setCategoryComboOpen] = useState(false);
  const [productComboOpen, setProductComboOpen] = useState(false);
  const [page, setPage] = useState(1);

  const promotionsQuery = useQuery({
    queryKey: ["promotions", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Promotion[]> => {
      const { data, error } = await (supabase as any)
        .from("promotions")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Promotion[];
    },
  });

  const filtered = useMemo(() => {
    const list = promotionsQuery.data ?? [];
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name.toLocaleLowerCase("pt-BR").includes(q) ||
        (p.category ?? "").toLocaleLowerCase("pt-BR").includes(q),
    );
  }, [promotionsQuery.data, search]);

  // ── Auto-desativar promoções vencidas ────────────────────────────────────────
  const checkedPromoIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const list = promotionsQuery.data ?? [];
    if (!list.length || !companyId) return;
    const now = new Date();
    const expired = list.filter(
      (p) =>
        p.is_active &&
        p.ends_at &&
        new Date(p.ends_at).getTime() < now.getTime() &&
        !checkedPromoIdsRef.current.has(p.id),
    );
    if (expired.length === 0) return;
    expired.forEach((p) => checkedPromoIdsRef.current.add(p.id));

    (async () => {
      const { error } = await (supabase as any)
        .from("promotions")
        .update({ is_active: false })
        .in("id", expired.map((p) => p.id))
        .eq("company_id", companyId);
      if (error) return;
      queryClient.invalidateQueries({ queryKey: ["promotions", companyId] });
      const names = expired.map((p) => p.name).join(", ");
      toast.info(
        expired.length === 1
          ? `Promoção encerrada: ${names}`
          : `${expired.length} promoções encerradas automaticamente`,
      );
    })();
  }, [promotionsQuery.data, companyId, queryClient]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const resetPage = () => setPage(1);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_PROMO_FORM);
    setDialogOpen(true);
  }

  function openEdit(p: Promotion) {
    setEditing(p);
    setForm({
      name: p.name,
      kind: p.kind,
      category: p.category ?? "",
      product_id: p.product_id ?? "",
      discount_percent:
        p.discount_percent != null ? formatPercentInput(p.discount_percent) : "",
      buy_qty: p.buy_qty != null ? String(p.buy_qty) : "3",
      pay_qty: p.pay_qty != null ? String(p.pay_qty) : "2",
      starts_at: fmtDateTimeLocal(p.starts_at),
      ends_at: fmtDateTimeLocal(p.ends_at),
      is_active: p.is_active,
    });
    setDialogOpen(true);
  }

  const upsertMutation = useMutation({
    mutationFn: async (input: PromotionForm) => {
      const name = input.name.trim();
      if (!name) throw new Error("Dê um nome à promoção.");
      const payload: Record<string, unknown> = {
        company_id: companyId,
        name,
        kind: input.kind,
        is_active: input.is_active,
        starts_at: localDateTimeToISO(input.starts_at),
        ends_at: localDateTimeToISO(input.ends_at),
        category: null,
        product_id: null,
        discount_percent: null,
        buy_qty: null,
        pay_qty: null,
      };
      if (input.kind === "category_percent") {
        const cat = input.category.trim();
        if (!cat) throw new Error("Escolha uma categoria.");
        const pct = Number(input.discount_percent.replace(",", "."));
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100)
          throw new Error("Desconto deve ser entre 0 e 100%.");
        payload.category = cat;
        payload.discount_percent = pct;
      } else {
        if (!input.product_id) throw new Error("Selecione o produto da promoção.");
        const buy = parseInt(input.buy_qty, 10);
        const pay = parseInt(input.pay_qty, 10);
        if (!Number.isFinite(buy) || buy <= 0)
          throw new Error("Informe a quantidade comprada (Leve N).");
        if (!Number.isFinite(pay) || pay < 0)
          throw new Error("Informe a quantidade paga (Pague M).");
        if (pay >= buy) throw new Error("Pague M deve ser menor que Leve N.");
        payload.product_id = input.product_id;
        payload.buy_qty = buy;
        payload.pay_qty = pay;
      }
      if (editing) {
        const { error } = await (supabase as any)
          .from("promotions")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("promotions").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Promoção atualizada." : "Promoção criada.");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["promotions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["promotions-active", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (p: Promotion) => {
      const { error } = await (supabase as any)
        .from("promotions")
        .update({ is_active: !p.is_active })
        .eq("id", p.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["promotions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["promotions-active", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("promotions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Promoção removida.");
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["promotions", companyId] });
      queryClient.invalidateQueries({ queryKey: ["promotions-active", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Buscar por nome ou categoria…"
            className="pl-9"
          />
        </div>
        {canManage && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Nova promoção
          </Button>
        )}
      </div>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {promotionsQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-full rounded-md" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {search
              ? "Nenhuma promoção encontrada para essa busca."
              : "Nenhuma promoção cadastrada. Crie a primeira regra de desconto automático."}
          </div>
        ) : (
          paginated.map((p) => {
            const productName = products.find((x) => x.id === p.product_id)?.name;
            const active = isPromotionActive(p);
            return (
              <div
                key={p.id}
                className="rounded-md border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-tight break-words">{p.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.kind === "category_percent"
                        ? p.category
                        : productName ?? "—"}
                    </p>
                  </div>
                  {active ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">
                      Ativa
                    </Badge>
                  ) : p.is_active ? (
                    <Badge variant="outline">Fora da vigência</Badge>
                  ) : (
                    <Badge variant="secondary">Desativada</Badge>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  {p.kind === "category_percent" ? (
                    <span className="inline-flex items-center gap-1">
                      <Percent className="h-3.5 w-3.5 text-emerald-600" />
                      {Number(p.discount_percent ?? 0).toLocaleString("pt-BR", {
                        maximumFractionDigits: 2,
                      })}
                      %
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Package className="h-3.5 w-3.5 text-blue-600" />
                      Leve {p.buy_qty} · Pague {p.pay_qty}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {fmtDate(p.starts_at)} → {fmtDate(p.ends_at)}
                  </span>
                </div>
                {canManage && (
                  <div className="flex items-center justify-end gap-1 border-t border-border pt-2">
                    <Switch
                      checked={p.is_active}
                      onCheckedChange={() => toggleMutation.mutate(p)}
                      aria-label="Ativar/desativar"
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(p)}
                      aria-label="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setDeleteId(p.id)}
                      aria-label="Remover"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Aplica em</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promotionsQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                  {search
                    ? "Nenhuma promoção encontrada para essa busca."
                    : "Nenhuma promoção cadastrada. Crie a primeira regra de desconto automático."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((p) => {
                const productName = products.find((x) => x.id === p.product_id)?.name;
                const active = isPromotionActive(p);
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell>
                      {p.kind === "category_percent" ? (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Percent className="h-3.5 w-3.5 text-emerald-600" />
                          {Number(p.discount_percent ?? 0).toLocaleString("pt-BR", {
                            maximumFractionDigits: 2,
                          })}
                          % por categoria
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-sm">
                          <Package className="h-3.5 w-3.5 text-blue-600" />
                          Leve {p.buy_qty} · Pague {p.pay_qty}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.kind === "category_percent"
                        ? p.category
                        : productName ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {fmtDate(p.starts_at)} → {fmtDate(p.ends_at)}
                    </TableCell>
                    <TableCell className="text-center">
                      {active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">
                          Ativa
                        </Badge>
                      ) : p.is_active ? (
                        <Badge variant="outline">Fora da vigência</Badge>
                      ) : (
                        <Badge variant="secondary">Desativada</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canManage && (
                          <>
                            <Switch
                              checked={p.is_active}
                              onCheckedChange={() => toggleMutation.mutate(p)}
                              aria-label="Ativar/desativar"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(p)}
                              aria-label="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(p.id)}
                              aria-label="Remover"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card px-3 py-3 sm:flex-row sm:justify-between sm:px-4">
          <p className="text-xs text-muted-foreground sm:text-sm">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} promoções
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={safePage === 1}
              onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm font-medium sm:hidden">
              {safePage} / {totalPages}
            </span>
            <div className="hidden items-center gap-1 sm:flex">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  size="icon"
                  variant={p === safePage ? "default" : "ghost"}
                  className="h-8 w-8 text-sm"
                  onClick={() => { setPage(p); scrollAppToTop(); }}
                >
                  {p}
                </Button>
              ))}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={safePage === totalPages}
              onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar promoção" : "Nova promoção"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="promo-name">Nome</Label>
              <Input
                id="promo-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex.: Black Friday Bebidas"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Tipo de promoção</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as PromotionKind })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="category_percent">
                    Desconto % por categoria
                  </SelectItem>
                  <SelectItem value="product_buy_x_pay_y">
                    Leve N pague M (por produto)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.kind === "category_percent" ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Categoria</Label>
                  <Popover open={categoryComboOpen} onOpenChange={setCategoryComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={categoryComboOpen}
                        className={cn(
                          "w-full justify-between font-normal",
                          !form.category && "text-muted-foreground",
                        )}
                      >
                        <span className="truncate">
                          {form.category || "Selecione…"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[--radix-popover-trigger-width] min-w-[260px] p-0"
                      align="start"
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      <Command
                        filter={(value, search) => {
                          const s = search
                            .toLowerCase()
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "");
                          const vNorm = value
                            .toLowerCase()
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "");
                          return vNorm.includes(s) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Buscar categoria..." />
                        <CommandList
                          className="max-h-64 overflow-y-auto overscroll-contain"
                          onWheel={(e) => e.stopPropagation()}
                        >
                          <CommandEmpty>Nenhuma categoria encontrada.</CommandEmpty>
                          <CommandGroup>
                            {categories.map((c) => (
                              <CommandItem
                                key={c}
                                value={c}
                                onSelect={() => {
                                  setForm((f) => ({ ...f, category: c }));
                                  setCategoryComboOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    form.category === c ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {c}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="promo-pct">Desconto (%)</Label>
                  <PercentInput
                    id="promo-pct"
                    value={form.discount_percent}
                    onChange={(v) => setForm({ ...form, discount_percent: v })}
                  />
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Produto</Label>
                  <Popover open={productComboOpen} onOpenChange={setProductComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        role="combobox"
                        aria-expanded={productComboOpen}
                        className={cn(
                          "w-full justify-between font-normal",
                          !form.product_id && "text-muted-foreground",
                        )}
                      >
                        <span className="truncate">
                          {products.find((p) => p.id === form.product_id)?.name ||
                            "Selecione um produto…"}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-[--radix-popover-trigger-width] min-w-[260px] p-0"
                      align="start"
                      onWheel={(e) => e.stopPropagation()}
                      onTouchMove={(e) => e.stopPropagation()}
                    >
                      <Command
                        filter={(value, search) => {
                          const s = search
                            .toLowerCase()
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "");
                          const vNorm = value
                            .toLowerCase()
                            .normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "");
                          return vNorm.includes(s) ? 1 : 0;
                        }}
                      >
                        <CommandInput placeholder="Buscar produto..." />
                        <CommandList
                          className="max-h-64 overflow-y-auto overscroll-contain"
                          onWheel={(e) => e.stopPropagation()}
                        >
                          <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                          <CommandGroup>
                            {products.map((p) => (
                              <CommandItem
                                key={p.id}
                                value={p.name}
                                onSelect={() => {
                                  setForm((f) => ({ ...f, product_id: p.id }));
                                  setProductComboOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    form.product_id === p.id ? "opacity-100" : "opacity-0",
                                  )}
                                />
                                {p.name}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-buy">Leve (N)</Label>
                    <Input
                      id="promo-buy"
                      inputMode="numeric"
                      value={form.buy_qty}
                      onChange={(e) =>
                        setForm({ ...form, buy_qty: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder="Ex.: 3"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="promo-pay">Pague (M)</Label>
                    <Input
                      id="promo-pay"
                      inputMode="numeric"
                      value={form.pay_qty}
                      onChange={(e) =>
                        setForm({ ...form, pay_qty: e.target.value.replace(/\D/g, "") })
                      }
                      placeholder="Ex.: 2"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ex.: Leve 3, Pague 2 → o item mais barato sai grátis a cada 3 unidades.
                </p>
              </>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="promo-start">Início (opcional)</Label>
                <Input
                  id="promo-start"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="promo-end">Término (opcional)</Label>
                <Input
                  id="promo-end"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="promo-active" className="cursor-pointer">
                  Promoção ativa
                </Label>
                <p className="text-xs text-muted-foreground">
                  Quando desativada, não aplica no PDV mesmo dentro da vigência.
                </p>
              </div>
              <Switch
                id="promo-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => upsertMutation.mutate(form)}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover esta promoção?</AlertDialogTitle>
            <AlertDialogDescription>
              Vendas anteriores não serão afetadas. Apenas o PDV deixará de aplicar
              o desconto a partir de agora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Coupons tab
// ─────────────────────────────────────────────────────────────────────────────

interface CouponsTabProps {
  companyId: string;
  canManage: boolean;
}

interface CouponForm {
  code: string;
  kind: CouponKind;
  value: string;
  min_purchase: string;
  max_uses: string;
  max_uses_per_customer: string;
  starts_at: string;
  ends_at: string;
  is_active: boolean;
}

const EMPTY_COUPON_FORM: CouponForm = {
  code: "",
  kind: "percent",
  value: "",
  min_purchase: "",
  max_uses: "",
  max_uses_per_customer: "",
  starts_at: "",
  ends_at: "",
  is_active: true,
};

function CouponsTab({ companyId, canManage }: CouponsTabProps) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);
  const [form, setForm] = useState<CouponForm>(EMPTY_COUPON_FORM);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [usesCoupon, setUsesCoupon] = useState<Coupon | null>(null);

  const couponsQuery = useQuery({
    queryKey: ["coupons", companyId],
    enabled: !!companyId,
    queryFn: async (): Promise<Coupon[]> => {
      const { data, error } = await (supabase as any)
        .from("coupons")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Coupon[];
    },
  });

  const filtered = useMemo(() => {
    const list = couponsQuery.data ?? [];
    const q = search.trim().toLocaleLowerCase("pt-BR");
    if (!q) return list;
    return list.filter((c) => c.code.toLocaleLowerCase("pt-BR").includes(q));
  }, [couponsQuery.data, search]);

  // ── Auto-desativar cupons vencidos ────────────────────────────────────────────
  const checkedCouponIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const list = couponsQuery.data ?? [];
    if (!list.length || !companyId) return;
    const now = new Date();
    const expired = list.filter(
      (c) =>
        c.is_active &&
        ((c.ends_at && new Date(c.ends_at).getTime() < now.getTime()) ||
          (c.max_uses != null && c.uses_count >= c.max_uses)) &&
        !checkedCouponIdsRef.current.has(c.id),
    );
    if (expired.length === 0) return;
    expired.forEach((c) => checkedCouponIdsRef.current.add(c.id));

    (async () => {
      const { error } = await (supabase as any)
        .from("coupons")
        .update({ is_active: false })
        .in("id", expired.map((c) => c.id))
        .eq("company_id", companyId);
      if (error) return;
      queryClient.invalidateQueries({ queryKey: ["coupons", companyId] });
      const exhausted = expired.filter(
        (c) => c.max_uses != null && c.uses_count >= c.max_uses,
      );
      const byDate = expired.filter(
        (c) => c.ends_at && new Date(c.ends_at).getTime() < now.getTime(),
      );
      if (exhausted.length > 0) {
        const codes = exhausted.map((c) => c.code).join(", ");
        toast.info(
          exhausted.length === 1
            ? `Cupom esgotado: ${codes}`
            : `${exhausted.length} cupons esgotados automaticamente`,
        );
      }
      if (byDate.length > 0) {
        const codes = byDate.map((c) => c.code).join(", ");
        toast.info(
          byDate.length === 1
            ? `Cupom encerrado: ${codes}`
            : `${byDate.length} cupons encerrados automaticamente`,
        );
      }
    })();
  }, [couponsQuery.data, companyId, queryClient]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const resetPage = () => setPage(1);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_COUPON_FORM);
    setDialogOpen(true);
  }

  function openEdit(c: Coupon) {
    setEditing(c);
    setForm({
      code: c.code,
      kind: c.kind,
      value: c.kind === "fixed" ? formatMoneyInput(c.value) : formatPercentInput(c.value),
      min_purchase: c.min_purchase ? formatMoneyInput(c.min_purchase) : "",
      max_uses: c.max_uses != null ? String(c.max_uses) : "",
      max_uses_per_customer: c.max_uses_per_customer != null ? String(c.max_uses_per_customer) : "",
      starts_at: fmtDateTimeLocal(c.starts_at),
      ends_at: fmtDateTimeLocal(c.ends_at),
      is_active: c.is_active,
    });
    setDialogOpen(true);
  }

  const upsertMutation = useMutation({
    mutationFn: async (input: CouponForm) => {
      const code = input.code.trim().toUpperCase();
      if (!code) throw new Error("Digite o código do cupom.");
      if (!/^[A-Z0-9_-]{3,40}$/.test(code))
        throw new Error("Código deve ter de 3 a 40 letras/números (sem espaços).");
      const value =
        input.kind === "fixed"
          ? parseMoney(input.value)
          : Number(input.value.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Valor do desconto deve ser maior que zero.");
      if (input.kind === "percent" && value > 100)
        throw new Error("Desconto em % não pode passar de 100.");
      const minPurchase = input.min_purchase ? parseMoney(input.min_purchase) : 0;
      if (!Number.isFinite(minPurchase) || minPurchase < 0)
        throw new Error("Compra mínima inválida.");
      const maxUses = input.max_uses ? parseInt(input.max_uses, 10) : null;
      if (maxUses != null && (!Number.isFinite(maxUses) || maxUses <= 0))
        throw new Error("Limite de usos inválido.");
      const maxUsesPerCustomer = input.max_uses_per_customer
        ? parseInt(input.max_uses_per_customer, 10)
        : null;
      if (maxUsesPerCustomer != null && (!Number.isFinite(maxUsesPerCustomer) || maxUsesPerCustomer <= 0))
        throw new Error("Limite por cliente inválido.");

      const payload: Record<string, unknown> = {
        company_id: companyId,
        code,
        kind: input.kind,
        value,
        min_purchase: minPurchase,
        max_uses: maxUses,
        max_uses_per_customer: maxUsesPerCustomer,
        starts_at: localDateTimeToISO(input.starts_at),
        ends_at: localDateTimeToISO(input.ends_at),
        is_active: input.is_active,
      };

      if (editing) {
        const { error } = await (supabase as any)
          .from("coupons")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("coupons").insert(payload);
        if (error) {
          if ((error.message || "").includes("coupons_company_code_uidx"))
            throw new Error("Já existe um cupom com esse código.");
          throw error;
        }
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Cupom atualizado." : "Cupom criado.");
      setDialogOpen(false);
      queryClient.invalidateQueries({ queryKey: ["coupons", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (c: Coupon) => {
      const { error } = await (supabase as any)
        .from("coupons")
        .update({ is_active: !c.is_active })
        .eq("id", c.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["coupons", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("coupons").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Cupom removido.");
      setDeleteId(null);
      queryClient.invalidateQueries({ queryKey: ["coupons", companyId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); resetPage(); }}
            placeholder="Buscar por código…"
            className="pl-9"
          />
        </div>
        {canManage && (
          <Button onClick={openCreate} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo cupom
          </Button>
        )}
      </div>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {couponsQuery.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-md" />
          ))
        ) : filtered.length === 0 ? (
          <div className="rounded-md border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            {search
              ? "Nenhum cupom encontrado para essa busca."
              : "Nenhum cupom cadastrado. Crie códigos para campanhas e fidelidade."}
          </div>
        ) : (
          paginated.map((c) => {
            const active = isCouponActive(c);
            return (
              <div
                key={c.id}
                className="rounded-md border border-border bg-card p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono font-semibold leading-tight break-all">
                      {c.code}
                    </p>
                    <p className="mt-1 text-sm">
                      {c.kind === "percent"
                        ? `${Number(c.value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% de desconto`
                        : `${fmtBRL(Number(c.value))} de desconto`}
                    </p>
                  </div>
                  {active ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">
                      Ativo
                    </Badge>
                  ) : c.is_active ? (
                    <Badge variant="outline">
                      {c.max_uses != null && c.uses_count >= c.max_uses
                        ? "Esgotado"
                        : "Fora da vigência"}
                    </Badge>
                  ) : (
                    <Badge variant="secondary">Desativado</Badge>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <div>
                    <span className="block">Compra mínima</span>
                    <span className="text-foreground">
                      {Number(c.min_purchase) > 0 ? fmtBRL(Number(c.min_purchase)) : "—"}
                    </span>
                  </div>
                  <div>
                    <span className="block">Usos</span>
                    <span className="text-foreground">
                      {c.uses_count}
                      {c.max_uses != null ? ` / ${c.max_uses} total` : ""}
                      {c.max_uses_per_customer != null ? ` · ${c.max_uses_per_customer}×/cliente` : ""}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="block">Vigência</span>
                    <span className="text-foreground">
                      {fmtDate(c.starts_at)} → {fmtDate(c.ends_at)}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-1 border-t border-border pt-2">
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setUsesCoupon(c)}
                    aria-label="Ver usos"
                    title="Ver usos"
                  >
                    <History className="h-4 w-4" />
                  </Button>
                  {canManage && (
                    <>
                      <Switch
                        checked={c.is_active}
                        onCheckedChange={() => toggleMutation.mutate(c)}
                        aria-label="Ativar/desativar"
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openEdit(c)}
                        aria-label="Editar"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteId(c.id)}
                        aria-label="Remover"
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block rounded-md border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Desconto</TableHead>
              <TableHead>Compra mínima</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Vigência</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {couponsQuery.isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={7}>
                    <Skeleton className="h-8 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-muted-foreground">
                  {search
                    ? "Nenhum cupom encontrado para essa busca."
                    : "Nenhum cupom cadastrado. Crie códigos para campanhas e fidelidade."}
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => {
                const active = isCouponActive(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono font-semibold">{c.code}</TableCell>
                    <TableCell>
                      {c.kind === "percent"
                        ? `${Number(c.value).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`
                        : fmtBRL(Number(c.value))}
                    </TableCell>
                    <TableCell className="text-sm">
                      {Number(c.min_purchase) > 0 ? fmtBRL(Number(c.min_purchase)) : "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span>{c.uses_count}{c.max_uses != null ? ` / ${c.max_uses}` : ""}</span>
                      {c.max_uses_per_customer != null && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          ({c.max_uses_per_customer}×/cliente)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {fmtDate(c.starts_at)} → {fmtDate(c.ends_at)}
                    </TableCell>
                    <TableCell className="text-center">
                      {active ? (
                        <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400">
                          Ativo
                        </Badge>
                      ) : c.is_active ? (
                        <Badge variant="outline">
                          {c.max_uses != null && c.uses_count >= c.max_uses
                            ? "Esgotado"
                            : "Fora da vigência"}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Desativado</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setUsesCoupon(c)}
                          aria-label="Ver usos"
                          title="Ver usos"
                        >
                          <History className="h-4 w-4" />
                        </Button>
                        {canManage && (
                          <>
                            <Switch
                              checked={c.is_active}
                              onCheckedChange={() => toggleMutation.mutate(c)}
                              aria-label="Ativar/desativar"
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(c)}
                              aria-label="Editar"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => setDeleteId(c.id)}
                              aria-label="Remover"
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {filtered.length > PAGE_SIZE && (
        <div className="flex flex-col items-center gap-2 rounded-md border border-border bg-card px-3 py-3 sm:flex-row sm:justify-between sm:px-4">
          <p className="text-xs text-muted-foreground sm:text-sm">
            {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length} cupons
          </p>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={safePage === 1}
              onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-2 text-sm font-medium sm:hidden">
              {safePage} / {totalPages}
            </span>
            <div className="hidden items-center gap-1 sm:flex">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  size="icon"
                  variant={p === safePage ? "default" : "ghost"}
                  className="h-8 w-8 text-sm"
                  onClick={() => { setPage(p); scrollAppToTop(); }}
                >
                  {p}
                </Button>
              ))}
            </div>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              disabled={safePage === totalPages}
              onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar cupom" : "Novo cupom"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cup-code">Código</Label>
              <Input
                id="cup-code"
                value={form.code}
                onChange={(e) =>
                  setForm({
                    ...form,
                    code: e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""),
                  })
                }
                placeholder="Ex.: BEMVINDO10"
                className="font-mono"
                disabled={!!editing}
              />
              {editing && (
                <p className="text-xs text-muted-foreground">
                  O código não pode ser alterado depois de criado.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Tipo de desconto</Label>
                <Select
                  value={form.kind}
                  onValueChange={(v) => setForm({ ...form, kind: v as CouponKind })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Porcentagem (%)</SelectItem>
                    <SelectItem value="fixed">Valor fixo (R$)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cup-value">
                  {form.kind === "percent" ? "Valor (%)" : "Valor (R$)"}
                </Label>
                {form.kind === "percent" ? (
                  <PercentInput
                    id="cup-value"
                    value={form.value}
                    onChange={(v) => setForm({ ...form, value: v })}
                  />
                ) : (
                  <MoneyInput
                    id="cup-value"
                    value={form.value}
                    onChange={(v) => setForm({ ...form, value: v })}
                  />
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cup-min">Compra mínima (R$)</Label>
                <MoneyInput
                  id="cup-min"
                  value={form.min_purchase}
                  onChange={(v) => setForm({ ...form, min_purchase: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cup-max">Limite de usos total</Label>
                <Input
                  id="cup-max"
                  type="number"
                  min={1}
                  value={form.max_uses}
                  onChange={(e) =>
                    setForm({ ...form, max_uses: e.target.value.replace(/\D/g, "") })
                  }
                  placeholder="Ilimitado"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cup-max-per-customer">Limite de usos por cliente</Label>
              <Input
                id="cup-max-per-customer"
                type="number"
                min={1}
                value={form.max_uses_per_customer}
                onChange={(e) =>
                  setForm({ ...form, max_uses_per_customer: e.target.value.replace(/\D/g, "") })
                }
                placeholder="Ilimitado por cliente"
              />
              <p className="text-xs text-muted-foreground">
                Quantas vezes o mesmo cliente pode usar este cupom. Deixe em branco para sem limite.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cup-start">Início (opcional)</Label>
                <Input
                  id="cup-start"
                  type="datetime-local"
                  value={form.starts_at}
                  onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cup-end">Término (opcional)</Label>
                <Input
                  id="cup-end"
                  type="datetime-local"
                  value={form.ends_at}
                  onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <div>
                <Label htmlFor="cup-active" className="cursor-pointer">
                  Cupom ativo
                </Label>
                <p className="text-xs text-muted-foreground">
                  Quando desativado, o código é recusado no PDV.
                </p>
              </div>
              <Switch
                id="cup-active"
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => upsertMutation.mutate(form)}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending ? "Salvando…" : editing ? "Salvar" : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover este cupom?</AlertDialogTitle>
            <AlertDialogDescription>
              Vendas anteriores que usaram o cupom não serão afetadas, mas o
              código deixará de funcionar no PDV.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CouponUsesDialog
        coupon={usesCoupon}
        companyId={companyId}
        onClose={() => setUsesCoupon(null)}
      />
    </div>
  );
}

interface CouponUseRow {
  id: string;
  used_at: string;
  customer_name: string;
  customer_id: string;
  discount_amount: number;
  sale_id: string | null;
}

function CouponUsesDialog({
  coupon,
  companyId,
  onClose,
}: {
  coupon: Coupon | null;
  companyId: string;
  onClose: () => void;
}) {
  const usesQuery = useQuery({
    queryKey: ["coupon-uses", coupon?.id, companyId],
    enabled: !!coupon?.id && !!companyId,
    queryFn: async (): Promise<CouponUseRow[]> => {
      const { data, error } = await (supabase as any)
        .from("coupon_uses")
        .select("id, used_at, customer_name, customer_id, discount_amount, sale_id")
        .eq("company_id", companyId)
        .eq("coupon_id", coupon!.id)
        .order("used_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CouponUseRow[];
    },
  });

  const rows = usesQuery.data ?? [];
  const total = rows.reduce((s, r) => s + Number(r.discount_amount ?? 0), 0);

  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [coupon?.id]);
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <Dialog open={!!coupon} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="break-all">
            Usos do cupom{coupon ? ` ${coupon.code}` : ""}
          </DialogTitle>
        </DialogHeader>
        {usesQuery.isLoading ? (
          <div className="space-y-2 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Este cupom ainda não foi utilizado.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{rows.length} {rows.length === 1 ? "uso" : "usos"}</span>
              <span>
                Total descontado:{" "}
                <strong className="text-foreground">{fmtBRL(total)}</strong>
              </span>
            </div>
            {/* Mobile: card list */}
            <div className="space-y-2 sm:hidden">
              {pageRows.map((r) => (
                <div
                  key={r.id}
                  className="rounded-md border border-border p-3 space-y-1"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium break-words">{r.customer_name}</span>
                    <span className="whitespace-nowrap font-semibold">
                      {fmtBRL(Number(r.discount_amount))}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {new Date(r.used_at).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden sm:block rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Cliente</TableHead>
                    <TableHead className="text-right">Desconto</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {new Date(r.used_at).toLocaleString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="font-medium">{r.customer_name}</TableCell>
                      <TableCell className="text-right">
                        {fmtBRL(Number(r.discount_amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {rows.length > PAGE_SIZE && (
              <div className="flex flex-col items-center gap-2 text-sm sm:flex-row sm:justify-between">
                <span className="text-muted-foreground">
                  Página {safePage} de {totalPages}
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="px-2 text-sm font-medium sm:hidden">
                    {safePage} / {totalPages}
                  </span>
                  <div className="hidden items-center gap-1 sm:flex">
                    {Array.from({ length: totalPages }).map((_, i) => {
                      const p = i + 1;
                      return (
                        <Button
                          key={p}
                          variant={p === safePage ? "default" : "outline"}
                          size="sm"
                          className="min-w-[2rem]"
                          onClick={() => setPage(p)}
                        >
                          {p}
                        </Button>
                      );
                    })}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
