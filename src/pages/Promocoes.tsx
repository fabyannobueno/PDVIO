import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo, useEffect } from "react";
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
            onChange={(e) => setSearch(e.target.value)}
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

      <div className="rounded-md border border-border bg-card">
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
              filtered.map((p) => {
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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
              <div className="grid grid-cols-2 gap-3">
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
                <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
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

      const payload: Record<string, unknown> = {
        company_id: companyId,
        code,
        kind: input.kind,
        value,
        min_purchase: minPurchase,
        max_uses: maxUses,
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
            onChange={(e) => setSearch(e.target.value)}
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

      <div className="rounded-md border border-border bg-card">
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
              filtered.map((c) => {
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
                      {c.uses_count}
                      {c.max_uses != null ? ` / ${c.max_uses}` : ""}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
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

            <div className="grid grid-cols-2 gap-3">
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="cup-min">Compra mínima (R$)</Label>
                <MoneyInput
                  id="cup-min"
                  value={form.min_purchase}
                  onChange={(v) => setForm({ ...form, min_purchase: v })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cup-max">Limite de usos</Label>
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

            <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}
