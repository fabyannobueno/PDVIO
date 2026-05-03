import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { useAuth } from "@/contexts/AuthContext";
import { playLowStockAlert } from "@/lib/beep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus,
  Search,
  Trash2,
  ClipboardList,
  Clock,
  CheckCircle2,
  XCircle,
  CreditCard,
  Banknote,
  QrCode,
  Ticket,
  Minus,
  ShoppingBag,
  Package,
  ScanBarcode,
  AlertTriangle,
  Wallet,
  BookOpen,
  UserRound,
  SplitSquareVertical,
  Users,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import { useReservedStock } from "@/hooks/useReservedStock";
import {
  MixedPaymentEditor,
  type MixedSplit,
  splitsTotal,
  describeSplits,
} from "@/components/app/MixedPaymentEditor";
import { printReceipt, getSettings as getPrinterSettings, formatSaleNumber, type Receipt } from "@/lib/printer";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { PixConfirmDialog } from "@/components/app/PixConfirmDialog";
import type { PixKeyType } from "@/lib/pixPayload";
import { Printer, Loader2, Keyboard } from "lucide-react";
import { PdvShortcutsHelp } from "@/components/app/PdvShortcutsHelp";

// Hotkeys for the close-comanda dialog (mounted only while open)
function CloseDialogHotkeys({
  openSession,
  paymentMethod,
  setPaymentMethod,
  openHelp,
  confirm,
}: {
  openSession: boolean;
  paymentMethod: string;
  setPaymentMethod: (v: string) => void;
  openHelp: () => void;
  confirm: () => void;
}) {
  useEffect(() => {
    function isTyping(t: EventTarget | null) {
      const el = t as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        openHelp();
        return;
      }
      if (e.key === "F1") {
        e.preventDefault();
        openHelp();
        return;
      }
      if (e.key === "F8") {
        e.preventDefault();
        const enabled = PAYMENT_METHODS.filter(
          (m) => m.value !== "cash" || openSession,
        );
        const idx = enabled.findIndex((m) => m.value === paymentMethod);
        const next = enabled[(idx + 1) % enabled.length];
        if (next) setPaymentMethod(next.value);
        return;
      }
      if (e.key === "F9") {
        e.preventDefault();
        if (paymentMethod !== "cash") setPaymentMethod("cash");
        setTimeout(() => {
          const el = document.querySelector<HTMLInputElement>(
            '[data-testid="comanda-cash-received"]',
          );
          el?.focus();
          el?.select();
        }, 50);
        return;
      }
      if (e.key === "Enter" && !isTyping(e.target)) {
        e.preventDefault();
        confirm();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openSession, paymentMethod, setPaymentMethod, openHelp, confirm]);
  return null;
}

const PAYMENT_LABELS_COMANDA: Record<string, string> = {
  cash: "Dinheiro",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  pix: "PIX",
  ticket: "Ticket",
  crediario: "Crediário",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Comanda {
  id: string;
  company_id: string;
  identifier: string;
  status: "open" | "closed" | "cancelled";
  notes: string | null;
  payment_method: string | null;
  total: number;
  created_at: string;
  closed_at: string | null;
}

interface ItemAddon {
  name: string;
  price: number;
}

interface ComandaItem {
  id: string;
  comanda_id: string;
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  notes?: string | null;
  addons?: ItemAddon[] | null;
}

interface ProductAddon {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sort_order: number;
}

interface Product {
  id: string;
  numeric_id: number | null;
  name: string;
  barcode: string | null;
  sku: string | null;
  sale_price: number;
  is_promotion: boolean;
  promotion_price: number | null;
  stock_unit: string;
  is_active: boolean;
  is_prepared: boolean;
  stock_quantity: number;
  min_stock: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INTEGER_UNITS = ["un", "cx", "pç"];

const PAYMENT_METHODS = [
  { value: "cash", label: "Dinheiro", icon: Banknote },
  { value: "credit_card", label: "Crédito", icon: CreditCard },
  { value: "debit_card", label: "Débito", icon: CreditCard },
  { value: "pix", label: "PIX", icon: QrCode },
  { value: "ticket", label: "Ticket", icon: Ticket },
  { value: "mixed", label: "Misto", icon: Wallet },
  { value: "crediario", label: "Crediário", icon: BookOpen },
];

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  credit_card: "Crédito",
  debit_card: "Débito",
  pix: "PIX",
  ticket: "Ticket",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number | null | undefined) {
  if (v == null) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskMoneyFromDigits(digits: string): string {
  const cents = parseInt(digits.replace(/\D/g, "") || "0", 10);
  const abs = Math.abs(cents);
  const str = String(abs).padStart(3, "0");
  const intPart = str.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decPart = str.slice(-2);
  return `${intPart || "0"},${decPart}`;
}

function parseMaskedMoney(str: string): number {
  const cents = parseInt(str.replace(/\D/g, "") || "0", 10);
  return cents / 100;
}

function fmtQty(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function timeAgo(dateStr: string) {
  const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  const h = Math.floor(diff / 3600);
  const m = Math.floor((diff % 3600) / 60);
  return m > 0 ? `${h}h${m}min` : `${h}h`;
}

function productPrice(p: Product) {
  return p.is_promotion && p.promotion_price != null ? p.promotion_price : p.sale_price;
}

function isDecimalUnit(unit: string) {
  return !INTEGER_UNITS.includes(unit);
}

// Bank-style 3-decimal input (digits enter right-to-left)
function applyQty3Key(current: string, key: string): string {
  if (key === "Backspace") {
    const digits = current.replace(/\D/g, "").slice(0, -1).padStart(4, "0");
    const int = digits.slice(0, -3) || "0";
    return `${int},${digits.slice(-3)}`;
  }
  if (!/^\d$/.test(key)) return current;
  const digits = (current.replace(/\D/g, "") + key).slice(-7).padStart(4, "0");
  const int = digits.slice(0, -3).replace(/^0+/, "") || "0";
  return `${int},${digits.slice(-3)}`;
}

function parseQty3(val: string): number {
  return parseFloat(val.replace(",", ".")) || 0;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Comandas() {
  const { activeCompany } = useCompany();
  const { activeOperator } = useOperator();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const cid = activeCompany?.id;

  // Dialog states
  const [newOpen, setNewOpen] = useState(false);
  const [newIdentifier, setNewIdentifier] = useState("");
  const [newNotes, setNewNotes] = useState("");

  const [detailComanda, setDetailComanda] = useState<Comanda | null>(null);

  // Real-time reservations from PDV carts and other open comandas
  const { reserved: reservedByOthers } = useReservedStock({
    companyId: activeCompany?.id,
    excludeComandaId: detailComanda?.id ?? null,
  });
  const availableStock = useCallback(
    (productId: string, baseStock: number): number =>
      Math.max(0, baseStock - (reservedByOthers.get(productId) ?? 0)),
    [reservedByOthers],
  );
  const [itemSearch, setItemSearch] = useState("");

  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [pixConfirmOpen, setPixConfirmOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<Receipt | null>(null);
  const [printingReceipt, setPrintingReceipt] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState("cash");
  const [crediarioCustomerId, setCrediarioCustomerId] = useState<string | null>(null);

  const { data: crediarioCustomers = [] } = useQuery<{ id: string; name: string; phone: string | null; credit_limit: number | null }[]>({
    queryKey: ["/comandas/crediario-customers", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, phone, credit_limit" as any)
        .eq("company_id", activeCompany!.id)
        .order("name");
      if (error) throw error;
      return ((data as any[]) ?? []) as any;
    },
  });
  const selectedCrediarioCustomer = useMemo(
    () => crediarioCustomers.find((c) => c.id === crediarioCustomerId) ?? null,
    [crediarioCustomers, crediarioCustomerId],
  );

  const paymentSettings = usePaymentSettings(activeCompany?.id);
  const enabledPaymentMethods = useMemo(() => {
    const allowed = new Set(paymentSettings.enabled);
    return PAYMENT_METHODS.filter((m) => allowed.has(m.value as any));
  }, [paymentSettings]);

  useEffect(() => {
    if (enabledPaymentMethods.length === 0) return;
    if (!enabledPaymentMethods.some((m) => m.value === selectedPayment)) {
      setSelectedPayment(enabledPaymentMethods[0].value);
    }
  }, [enabledPaymentMethods, selectedPayment]);

  const { data: pixBank } = useQuery<{ pix_key: string | null; pix_key_type: PixKeyType | null } | null>({
    queryKey: ["/comandas/pix_bank", activeCompany?.id],
    enabled: !!activeCompany?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("company_bank_accounts")
        .select("pix_key, pix_key_type")
        .eq("company_id", activeCompany!.id)
        .not("pix_key", "is", null)
        .limit(1)
        .maybeSingle();
      return (data as any) ?? null;
    },
  });
  const [cashReceivedStr, setCashReceivedStr] = useState("");
  const [mixedSplits, setMixedSplits] = useState<MixedSplit[]>([
    { method: "pix", amountStr: "" },
  ]);

  const [cancelId, setCancelId] = useState<string | null>(null);

  // Qty dialog for decimal-unit products
  const [qtyProduct, setQtyProduct] = useState<Product | null>(null);
  const [qtyVal, setQtyVal] = useState("0,000");
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // Preparation dialog (addons + notes) for prepared products
  const [prepProduct, setPrepProduct] = useState<Product | null>(null);
  const [prepQty, setPrepQty] = useState<number>(1);
  const [prepAddons, setPrepAddons] = useState<ProductAddon[]>([]);
  const [prepSelected, setPrepSelected] = useState<Set<string>>(new Set());
  const [prepNotes, setPrepNotes] = useState<string>("");
  const [prepLoading, setPrepLoading] = useState(false);

  // Camera barcode scanner
  const [scannerOpen, setScannerOpen] = useState(false);

  // QR Code das Mesas
  const [qrDialogOpen, setQrDialogOpen] = useState(false);
  const [qrTableCount, setQrTableCount] = useState(10);
  const [qrPrefix, setQrPrefix] = useState("Mesa");

  // Dividir conta
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitPeople, setSplitPeople] = useState(2);

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: openSession } = useQuery<{ id: string } | null>({
    queryKey: ["/api/cash_sessions/open", cid, activeOperator?.id ?? user?.id ?? null],
    enabled: !!cid && !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("cash_sessions")
        .select("id")
        .eq("company_id", cid!)
        .eq("status", "open");
      if (activeOperator?.id) {
        q = q.eq("operator_id", activeOperator.id);
      } else {
        q = q.is("operator_id", null).eq("opened_by", user!.id);
      }
      const { data } = await q.maybeSingle();
      return data ?? null;
    },
  });

  const { data: comandas = [], isFetching: isLoading } = useQuery<Comanda[]>({
    queryKey: ["/comandas", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comandas")
        .select("*")
        .eq("company_id", cid!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: comandaItems = [], isLoading: loadingItems } = useQuery<ComandaItem[]>({
    queryKey: ["/comanda-items", detailComanda?.id],
    enabled: !!detailComanda?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comanda_items")
        .select("*")
        .eq("comanda_id", detailComanda!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products-active", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, numeric_id, name, barcode, sku, sale_price, is_promotion, promotion_price, stock_unit, is_active, is_prepared, stock_quantity, min_stock")
        .eq("company_id", cid!)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Realtime: refresh products whenever stock changes (sales from PDV,
  // other comandas being closed, manual stock adjustments, etc.)
  useEffect(() => {
    if (!cid) return;
    const channel = supabase
      .channel(`comandas-products-${cid}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products", filter: `company_id=eq.${cid}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["/api/products-active", cid] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements", filter: `company_id=eq.${cid}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["/api/products-active", cid] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cid, queryClient]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const productUnitById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) m.set(p.id, p.stock_unit);
    return m;
  }, [products]);

  const openComandas = useMemo(() => comandas.filter((c) => c.status === "open"), [comandas]);
  const allClosedComandas = useMemo(
    () => comandas.filter((c) => c.status !== "open"),
    [comandas]
  );
  const CLOSED_PAGE_SIZE = 6;
  const [closedPage, setClosedPage] = useState(1);
  const totalClosedPages = Math.max(1, Math.ceil(allClosedComandas.length / CLOSED_PAGE_SIZE));
  useEffect(() => {
    if (closedPage > totalClosedPages) setClosedPage(totalClosedPages);
  }, [closedPage, totalClosedPages]);
  const closedComandas = useMemo(
    () =>
      allClosedComandas.slice(
        (closedPage - 1) * CLOSED_PAGE_SIZE,
        closedPage * CLOSED_PAGE_SIZE
      ),
    [allClosedComandas, closedPage]
  );

  const [consumptionComanda, setConsumptionComanda] = useState<Comanda | null>(null);
  const { data: consumptionItems = [], isLoading: loadingConsumption } = useQuery<ComandaItem[]>({
    queryKey: ["/comanda-items", consumptionComanda?.id],
    enabled: !!consumptionComanda?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comanda_items")
        .select("id, comanda_id, product_id, product_name, quantity, unit_price, subtotal, addons, notes")
        .eq("comanda_id", consumptionComanda!.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ComandaItem[];
    },
  });

  const filteredProducts = useMemo(() => {
    const q = itemSearch.toLowerCase().trim();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.numeric_id != null && String(p.numeric_id).includes(q))
    );
  }, [products, itemSearch]);

  const detailTotal = useMemo(
    () => Math.floor(comandaItems.reduce((s, i) => s + Number(i.subtotal), 0) * 100) / 100,
    [comandaItems]
  );

  const cashReceivedAmtComanda = useMemo(
    () => parseMaskedMoney(cashReceivedStr),
    [cashReceivedStr]
  );
  const changeComanda = Math.max(0, cashReceivedAmtComanda - detailTotal);

  // Sync comanda card total whenever items change
  useEffect(() => {
    if (!detailComanda?.id) return;
    const total = Math.floor(
      comandaItems.reduce((s, i) => s + Number(i.subtotal), 0) * 100
    ) / 100;
    supabase.from("comandas").update({ total }).eq("id", detailComanda.id).then(() => {
      queryClient.setQueryData(["/comandas", cid], (old: Comanda[] | undefined) => {
        if (!old) return old;
        return old.map((c) => (c.id === detailComanda.id ? { ...c, total } : c));
      });
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comandaItems]);

  // ── Mutations ──────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: async () => {
      const id = newIdentifier.trim();
      if (!id) throw new Error("Informe um identificador (ex: Mesa 1)");
      const { error } = await supabase.from("comandas").insert({
        company_id: cid!,
        identifier: id,
        notes: newNotes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comandas", cid] });
      toast.success("Comanda aberta!");
      setNewOpen(false);
      setNewIdentifier("");
      setNewNotes("");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao criar comanda"),
  });

  const addItemMutation = useMutation({
    mutationFn: async ({
      product,
      qty,
      addons,
      notes,
    }: {
      product: Product;
      qty: number;
      addons?: ItemAddon[];
      notes?: string;
    }) => {
      // Stock guard: prevent adding more than available (considering other carts/comandas)
      const baseStock = Number(product.stock_quantity ?? 0);
      const reservedOther = reservedByOthers.get(product.id) ?? 0;
      const stock = Math.max(0, baseStock - reservedOther);
      const currentInComanda = comandaItems
        .filter((i) => i.product_id === product.id)
        .reduce((s, i) => s + Number(i.quantity), 0);
      if (qty > 0 && currentInComanda + qty > stock) {
        throw new Error(
          reservedOther > 0
            ? `Estoque insuficiente de ${product.name}: outro caixa/comanda já reservou ${reservedOther} ${product.stock_unit}. Disponível: ${stock} ${product.stock_unit}.`
            : `Estoque insuficiente de ${product.name} (${stock} ${product.stock_unit})`,
        );
      }

      const basePrice = productPrice(product);
      const addonTotal = (addons ?? []).reduce((sum, a) => sum + Number(a.price || 0), 0);
      const unitPrice = Math.floor((basePrice + addonTotal) * 100) / 100;

      // Sempre insere como uma nova linha — adicionar o mesmo produto duas vezes
      // gera dois registros separados, mantendo o histórico individualizado.
      const sub = Math.floor(unitPrice * qty * 100) / 100;
      const { error } = await supabase.from("comanda_items").insert({
        comanda_id: detailComanda!.id,
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: unitPrice,
        subtotal: sub,
        notes: notes && notes.trim().length > 0 ? notes.trim() : null,
        addons: addons ?? [],
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comanda-items", detailComanda?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao adicionar item"),
  });

  // ── Prep modal (addons + notes for prepared products) ─────────────────────

  async function openPrepModal(product: Product, qty: number = 1) {
    setPrepProduct(product);
    setPrepQty(qty);
    setPrepSelected(new Set());
    setPrepNotes("");
    setPrepAddons([]);
    setPrepLoading(true);
    const { data } = await supabase
      .from("product_addons" as never)
      .select("*")
      .eq("product_id", product.id)
      .order("sort_order");
    setPrepAddons(((data ?? []) as unknown as ProductAddon[]) || []);
    setPrepLoading(false);
  }

  function confirmPrep() {
    if (!prepProduct) return;
    const chosen: ItemAddon[] = prepAddons
      .filter((a) => prepSelected.has(a.id))
      .map((a) => ({ name: a.name, price: Number(a.price) }));
    addItemMutation.mutate({
      product: prepProduct,
      qty: prepQty,
      addons: chosen,
      notes: prepNotes,
    });
    setPrepProduct(null);
  }

  function handleProductClick(p: Product) {
    const avail = availableStock(p.id, Number(p.stock_quantity ?? 0));
    if (avail <= 0) {
      const reservedOther = reservedByOthers.get(p.id) ?? 0;
      toast.error(
        reservedOther > 0
          ? `${p.name}: estoque reservado por outro caixa/comanda.`
          : `${p.name} sem estoque`,
      );
      return;
    }
    if (p.is_prepared) {
      // For prepared products, ask for addons/notes; qty stays 1 (decimal not common here)
      openPrepModal(p, 1);
      return;
    }
    if (isDecimalUnit(p.stock_unit)) {
      setQtyProduct(p);
      setQtyVal("0,000");
      setTimeout(() => qtyInputRef.current?.focus(), 50);
      return;
    }
    addItemMutation.mutate({ product: p, qty: 1 });
  }

  // ── Add by barcode (USB scanner / camera) ──────────────────────────────────

  const addByBarcode = useCallback((code: string) => {
    if (!detailComanda || detailComanda.status !== "open") {
      toast.error("Abra uma comanda para escanear produtos");
      return;
    }
    const trimmed = code.trim();
    if (!trimmed) return;
    const product =
      products.find((p) => p.barcode && p.barcode === trimmed) ||
      products.find((p) => p.sku && p.sku.toLowerCase() === trimmed.toLowerCase()) ||
      products.find((p) => p.numeric_id != null && String(p.numeric_id) === trimmed);
    if (!product) {
      toast.error(`Produto não encontrado: ${trimmed}`);
      return;
    }
    {
      const avail = availableStock(product.id, Number(product.stock_quantity ?? 0));
      if (avail <= 0) {
        const reservedOther = reservedByOthers.get(product.id) ?? 0;
        toast.error(
          reservedOther > 0
            ? `${product.name}: estoque reservado por outro caixa/comanda.`
            : `${product.name} sem estoque`,
        );
        return;
      }
    }
    if (product.is_prepared) {
      openPrepModal(product, 1);
      return;
    }
    if (isDecimalUnit(product.stock_unit)) {
      setQtyProduct(product);
      setQtyVal("0,000");
      setTimeout(() => qtyInputRef.current?.focus(), 50);
      return;
    }
    // Beep do leitor: se já existe um item igual (mesmo produto, sem
    // adicionais e sem observação), apenas incrementa a quantidade dessa linha.
    const existing = comandaItems.find(
      (i) =>
        i.product_id === product.id &&
        (!i.notes || i.notes.trim() === "") &&
        (!Array.isArray(i.addons) || i.addons.length === 0),
    );
    if (existing) {
      const newQty = Number(existing.quantity) + 1;
      const newSub = Math.floor(Number(existing.unit_price) * newQty * 100) / 100;
      supabase
        .from("comanda_items")
        .update({ quantity: newQty, subtotal: newSub })
        .eq("id", existing.id)
        .then(({ error }) => {
          if (error) {
            toast.error(error.message ?? "Erro ao incrementar item");
            return;
          }
          queryClient.invalidateQueries({ queryKey: ["/comanda-items", detailComanda.id] });
          toast.success(`${product.name} +1`);
        });
      return;
    }
    addItemMutation.mutate({ product, qty: 1 });
    toast.success(`${product.name} adicionado`);
  }, [detailComanda, products, comandaItems, addItemMutation, queryClient]);

  // USB barcode reader: collects rapid keystrokes and fires on Enter / Ctrl+J
  const usbBufferRef = useRef("");
  const usbLastKeyRef = useRef(0);

  useEffect(() => {
    if (!detailComanda || detailComanda.status !== "open") return;

    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const now = Date.now();
      const gap = now - usbLastKeyRef.current;
      usbLastKeyRef.current = now;
      const isScannerPace = gap < 50 || usbBufferRef.current.length > 0;

      // Scanners often send Ctrl+J (LF) as terminator
      if (e.ctrlKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        const code = usbBufferRef.current.trim();
        usbBufferRef.current = "";
        if (code.length >= 3) addByBarcode(code);
        return;
      }

      if (e.key === "Enter") {
        if (isScannerPace) e.preventDefault();
        const code = usbBufferRef.current.trim();
        usbBufferRef.current = "";
        if (code.length >= 3) addByBarcode(code);
        return;
      }

      if (gap > 100) usbBufferRef.current = "";
      if (e.key.length === 1) {
        if (isScannerPace) e.preventDefault();
        usbBufferRef.current += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailComanda, addByBarcode]);

  const removeItemMutation = useMutation({
    mutationFn: async (itemId: string) => {
      const { error } = await supabase.from("comanda_items").delete().eq("id", itemId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comanda-items", detailComanda?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover item"),
  });

  const changeQtyMutation = useMutation({
    mutationFn: async ({ item, delta }: { item: ComandaItem; delta: number }) => {
      if (delta > 0 && item.product_id) {
        const product = products.find((p) => p.id === item.product_id);
        if (product) {
          const stock = availableStock(product.id, Number(product.stock_quantity ?? 0));
          const currentTotal = comandaItems
            .filter((i) => i.product_id === item.product_id)
            .reduce((s, i) => s + Number(i.quantity), 0);
          if (currentTotal + delta > stock) {
            throw new Error(
              `Estoque insuficiente de ${product.name} (disponível: ${stock} ${product.stock_unit})`,
            );
          }
        }
      }
      const newQty = Math.max(0, Number(item.quantity) + delta);
      if (newQty === 0) {
        const { error } = await supabase.from("comanda_items").delete().eq("id", item.id);
        if (error) throw error;
      } else {
        const newSub = Math.floor(item.unit_price * newQty * 100) / 100;
        const { error } = await supabase
          .from("comanda_items")
          .update({ quantity: newQty, subtotal: newSub })
          .eq("id", item.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comanda-items", detailComanda?.id] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao alterar quantidade"),
  });

  const closeMutation = useMutation({
    mutationFn: async () => {
      if (selectedPayment === "cash" && !openSession) {
        throw new Error("Abra o caixa para receber em dinheiro");
      }
      if (selectedPayment === "crediario") {
        if (!selectedCrediarioCustomer) {
          throw new Error("Selecione um cliente para venda no Crediário");
        }
        if (
          selectedCrediarioCustomer.credit_limit == null ||
          Number(selectedCrediarioCustomer.credit_limit) <= 0
        ) {
          throw new Error(
            "Cliente sem limite de crediário definido. Defina um limite na caderneta antes de vender no crediário.",
          );
        }
        const { data: entries, error: entriesErr } = await (supabase as any)
          .from("crediario_entries")
          .select("kind, amount")
          .eq("company_id", cid!)
          .eq("customer_id", selectedCrediarioCustomer.id);
        if (entriesErr) throw new Error("Erro ao verificar limite do cliente");
        const balance = ((entries as any[]) ?? []).reduce(
          (s, e) => s + (e.kind === "charge" ? Number(e.amount) : -Number(e.amount)),
          0,
        );
        const limit = Number(selectedCrediarioCustomer.credit_limit);
        const available = limit - balance;
        if (detailTotal > available + 1e-6) {
          throw new Error(
            `Limite insuficiente. Disponível: ${fmtBRL(Math.max(0, available))} · Necessário: ${fmtBRL(detailTotal)}`,
          );
        }
      }
      // Final stock guard: re-check fresh stock from DB before closing comanda
      const productIds = Array.from(
        new Set(
          comandaItems
            .map((i) => i.product_id)
            .filter((x): x is string => !!x),
        ),
      );
      if (productIds.length > 0) {
        const { data: freshProducts, error: freshErr } = await supabase
          .from("products")
          .select("id,name,stock_quantity,stock_unit")
          .in("id", productIds);
        if (freshErr) throw freshErr;
        const freshMap = new Map(((freshProducts as any[]) ?? []).map((p) => [p.id, p]));
        const totalsByProduct = new Map<string, number>();
        for (const it of comandaItems) {
          if (!it.product_id) continue;
          totalsByProduct.set(
            it.product_id,
            (totalsByProduct.get(it.product_id) ?? 0) + Number(it.quantity),
          );
        }
        for (const [pid, qty] of totalsByProduct) {
          const fp = freshMap.get(pid);
          if (!fp) continue;
          const stock = Number(fp.stock_quantity ?? 0);
          if (qty > stock) {
            throw new Error(
              `Estoque insuficiente de ${fp.name} (disponível: ${stock} ${fp.stock_unit}, na comanda: ${qty}). Ajuste a comanda para fechar.`,
            );
          }
        }
      }
      const total = detailTotal;
      const mixedHasCash = mixedSplits.some(
        (s) =>
          s.method === "cash" &&
          parseFloat(s.amountStr.replace(/\./g, "").replace(",", ".") || "0") > 0,
      );
      if (selectedPayment === "mixed") {
        if (Math.abs(splitsTotal(mixedSplits) - total) > 0.009) {
          throw new Error("A soma dos pagamentos deve ser igual ao total");
        }
        if (mixedHasCash && !openSession) {
          throw new Error("Abra o caixa para receber em dinheiro");
        }
      }
      const { error } = await supabase
        .from("comandas")
        .update({
          status: "closed",
          payment_method: selectedPayment,
          total,
          closed_at: new Date().toISOString(),
        })
        .eq("id", detailComanda!.id);
      if (error) throw error;
      // Also create a sale record
      const baseNote = `Comanda: ${detailComanda!.identifier}`;
      const notes =
        selectedPayment === "mixed"
          ? `${baseNote} | [Misto] ${describeSplits(mixedSplits)}`
          : baseNote;
      const { data: saleData, error: saleErr } = await supabase
        .from("sales")
        .insert({
          company_id: cid!,
          subtotal: total,
          discount_amount: 0,
          total,
          payment_method: selectedPayment,
          payment_amount: total,
          change_amount: 0,
          notes,
          status: "completed",
          ...(openSession?.id ? { cash_session_id: openSession.id } : {}),
        } as any)
        .select("id, numeric_id")
        .single();
      if (saleErr) throw saleErr;
      if (saleData && comandaItems.length > 0) {
        const items = comandaItems.map((i) => ({
          sale_id: saleData.id,
          product_id: i.product_id,
          product_name: i.product_name,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount_amount: 0,
          subtotal: i.subtotal,
        }));
        const { error: itemsErr } = await supabase.from("sale_items").insert(items);
        if (itemsErr) throw itemsErr;

        // Crediário: register charge for this comanda's sale
        if (selectedPayment === "crediario" && selectedCrediarioCustomer) {
          const { error: credErr } = await (supabase as any)
            .from("crediario_entries")
            .insert({
              company_id: cid!,
              customer_id: selectedCrediarioCustomer.id,
              sale_id: saleData.id,
              kind: "charge",
              description: `Comanda ${detailComanda?.identifier ?? ""} · Venda #${saleData.id.slice(0, 8)}`,
              amount: total,
              reference_date: new Date().toISOString().slice(0, 10),
              due_date: null,
              notes: null,
              created_by: user?.id ?? null,
            });
          if (credErr) {
            console.error("Falha ao registrar crediário:", credErr);
            toast.error("Comanda fechada, mas falhou ao lançar no Crediário");
          } else {
            queryClient.invalidateQueries({ queryKey: ["/crediario/entries", cid] });
          }
        }

        // Stock movements: decrement on sale (trigger updates products.stock_quantity)
        const soldProductIds = Array.from(
          new Set(comandaItems.filter((i) => !!i.product_id).map((i) => i.product_id as string)),
        );
        const stockRows = comandaItems
          .filter((i) => !!i.product_id)
          .map((i) => ({
            company_id: cid!,
            product_id: i.product_id,
            kind: "sale",
            quantity: -Math.abs(Number(i.quantity)),
            reference: `Comanda ${detailComanda?.identifier ?? ""} · Venda #${saleData.id.slice(0, 8)}`,
          }));
        if (stockRows.length > 0) {
          const { error: stockErr } = await (supabase as any).from("stock_movements").insert(stockRows);
          if (stockErr) console.error("Falha ao registrar movimento de estoque:", stockErr);

          try {
            const { data: updated } = await supabase
              .from("products")
              .select("id,name,stock_quantity,min_stock,stock_unit")
              .in("id", soldProductIds);
            const lowItems = ((updated as any[]) ?? []).filter(
              (p) => Number(p.min_stock) > 0 && Number(p.stock_quantity) <= Number(p.min_stock),
            );
            if (lowItems.length > 0) {
              playLowStockAlert();
              for (const p of lowItems) {
                const isZero = Number(p.stock_quantity) <= 0;
                toast.warning(
                  isZero
                    ? `${p.name} zerou o estoque!`
                    : `${p.name} atingiu o estoque mínimo (${Number(p.stock_quantity).toLocaleString("pt-BR")} ${p.stock_unit})`,
                  { duration: 6000 },
                );
              }
            }
          } catch (e) {
            console.error("Falha ao checar estoque mínimo:", e);
          }
        }
        queryClient.invalidateQueries({ queryKey: ["/api/products-active", cid] });
      }
      return saleData
        ? { id: saleData.id as string, numericId: (saleData as any).numeric_id ?? null }
        : null;
    },
    onSuccess: async (saleResult) => {
      queryClient.invalidateQueries({ queryKey: ["/comandas", cid] });
      queryClient.invalidateQueries({ queryKey: ["/comanda-items", detailComanda?.id] });
      toast.success("Comanda fechada e venda registrada!");

      if (detailComanda) {
        const receipt: Receipt = {
          title: `CUPOM NÃO FISCAL — ${detailComanda.identifier}`,
          items: comandaItems.map((i) => ({
            name: i.product_name,
            qty: i.quantity,
            price: i.unit_price,
            unit: i.product_id ? productUnitById.get(i.product_id) : undefined,
          })),
          subtotal: detailTotal,
          total: detailTotal,
          payment:
            selectedPayment === "mixed"
              ? `Misto — ${describeSplits(mixedSplits)}`
              : PAYMENT_LABELS_COMANDA[selectedPayment] ?? selectedPayment,
          cashReceived: selectedPayment === "cash" && cashReceivedAmtComanda > 0 ? cashReceivedAmtComanda : undefined,
          change: selectedPayment === "cash" && cashReceivedAmtComanda > 0 ? changeComanda : undefined,
          date: new Date(),
          companyName: activeCompany?.name ?? undefined,
          companyDocument: activeCompany?.document ?? undefined,
          companyPhone: activeCompany?.phone ?? undefined,
          companyAddress: activeCompany?.address ?? undefined,
          saleNumber: saleResult ? formatSaleNumber(saleResult.numericId, saleResult.id) : undefined,
        };
        const printerSettings = getPrinterSettings();
        if (printerSettings.autoPrintOnFinalize) {
          try {
            await printReceipt(receipt, printerSettings);
          } catch (printErr: any) {
            toast.error(`Falha ao imprimir: ${printErr?.message ?? "erro desconhecido"}`);
          }
        } else {
          setPendingReceipt(receipt);
        }
      }

      setCloseDialogOpen(false);
      setDetailComanda(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao fechar comanda"),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("comandas")
        .update({ status: "cancelled", closed_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/comandas", cid] });
      toast.success("Comanda cancelada");
      setCancelId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao cancelar comanda"),
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 md:p-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Comandas</h1>
          <p className="text-sm text-muted-foreground">
            {openComandas.length} comanda{openComandas.length !== 1 ? "s" : ""} aberta
            {openComandas.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setQrDialogOpen(true)}
            title="Gerar QR Codes das mesas"
          >
            <QrCode className="mr-2 h-4 w-4" />
            QR das Mesas
          </Button>
          <Button onClick={() => setNewOpen(true)} data-testid="button-new-comanda">
            <Plus className="mr-2 h-4 w-4" />
            Nova comanda
          </Button>
        </div>
      </div>

      {/* Open comandas grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
      ) : openComandas.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border py-16 text-center">
          <div className="rounded-full bg-muted p-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-base font-semibold">Nenhuma comanda aberta</p>
          <p className="text-sm text-muted-foreground">
            Clique em "Nova comanda" para abrir uma mesa ou pedido
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {openComandas.map((c) => (
            <button
              key={c.id}
              data-testid={`comanda-card-${c.id}`}
              onClick={() => setDetailComanda(c)}
              className="group relative flex flex-col gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-lg font-bold leading-tight">{c.identifier}</span>
                <Badge variant="default" className="shrink-0 bg-green-500/15 text-green-700 dark:text-green-400">
                  Aberta
                </Badge>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Clock className="h-3.5 w-3.5" />
                <span>{timeAgo(c.created_at)}</span>
              </div>
              {c.notes && (
                <p className="truncate text-xs text-muted-foreground">{c.notes}</p>
              )}
              <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
                <span className="text-sm font-semibold">{fmtBRL(Number(c.total))}</span>
                <span className="text-xs text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Abrir →
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Closed comandas */}
      {allClosedComandas.length > 0 && (
        <div>
          <h2 className="mb-3 text-base font-semibold text-muted-foreground">
            Comandas recentes
          </h2>
          <div className="overflow-hidden rounded-xl border border-border">
            <div className="divide-y divide-border">
              {closedComandas.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  data-testid={`comanda-closed-${c.id}`}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {c.status === "closed" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="h-4 w-4 shrink-0 text-destructive" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{c.identifier}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.closed_at
                          ? new Date(c.closed_at).toLocaleString("pt-BR", {
                              day: "2-digit",
                              month: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                        {c.payment_method
                          ? ` · ${PAYMENT_LABELS[c.payment_method] ?? c.payment_method}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="font-mono text-sm font-semibold">
                      {fmtBRL(Number(c.total))}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConsumptionComanda(c)}
                      data-testid={`button-view-consumption-${c.id}`}
                    >
                      <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
                      Ver consumo
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {totalClosedPages > 1 && (
            <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span className="text-center sm:text-left" data-testid="text-closed-page-info">
                Página {closedPage} de {totalClosedPages} · {allClosedComandas.length} comandas
              </span>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => { setClosedPage((p) => Math.max(1, p - 1)); scrollAppToTop(); }}
                  disabled={closedPage <= 1}
                  data-testid="button-closed-prev"
                >
                  Anterior
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 sm:flex-none"
                  onClick={() => { setClosedPage((p) => Math.min(totalClosedPages, p + 1)); scrollAppToTop(); }}
                  disabled={closedPage >= totalClosedPages}
                  data-testid="button-closed-next"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Consumption dialog ─────────────────────────────────────────────── */}
      <Dialog open={!!consumptionComanda} onOpenChange={(o) => !o && setConsumptionComanda(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Consumo — {consumptionComanda?.identifier}</DialogTitle>
            <DialogDescription>
              {consumptionComanda?.closed_at
                ? `Fechada em ${new Date(consumptionComanda.closed_at).toLocaleString("pt-BR")}`
                : ""}
              {consumptionComanda?.payment_method
                ? ` · ${PAYMENT_LABELS[consumptionComanda.payment_method] ?? consumptionComanda.payment_method}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto">
            {loadingConsumption ? (
              <div className="space-y-2 py-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : consumptionItems.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum item consumido.
              </p>
            ) : (
              <div className="divide-y divide-border">
                {consumptionItems.map((it) => (
                  <div
                    key={it.id}
                    className="flex items-start justify-between gap-3 py-2.5"
                    data-testid={`consumption-item-${it.id}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{it.product_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmtQty(Number(it.quantity))}{it.product_id && productUnitById.get(it.product_id) ? ` ${productUnitById.get(it.product_id)}` : ""} × {fmtBRL(Number(it.unit_price))}
                      </p>
                      {it.addons && it.addons.length > 0 && (
                        <p
                          className="mt-0.5 text-[11px] text-muted-foreground"
                          data-testid={`consumption-item-addons-${it.id}`}
                        >
                          + {it.addons.map((a) => a.name).join(", ")}
                        </p>
                      )}
                      {it.notes && (
                        <p
                          className="mt-0.5 text-[11px] italic text-muted-foreground"
                          data-testid={`consumption-item-notes-${it.id}`}
                        >
                          Obs: {it.notes}
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-sm font-semibold">
                      {fmtBRL(Number(it.subtotal))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter className="border-t border-border pt-3">
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-semibold text-muted-foreground">Total</span>
              <span className="font-mono text-base font-bold" data-testid="consumption-total">
                {fmtBRL(Number(consumptionComanda?.total ?? 0))}
              </span>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New comanda dialog ────────────────────────────────────────────── */}
      <Dialog open={newOpen} onOpenChange={(o) => { setNewOpen(o); if (!o) { setNewIdentifier(""); setNewNotes(""); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nova comanda</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="identifier">Mesa / identificador *</Label>
              <Input
                id="identifier"
                data-testid="input-comanda-identifier"
                placeholder="Ex: Mesa 1, Balcão, João..."
                value={newIdentifier}
                onChange={(e) => setNewIdentifier(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createMutation.mutate()}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                data-testid="input-comanda-notes"
                placeholder="Sem cebola, alergia a glúten..."
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => createMutation.mutate()}
              disabled={!newIdentifier.trim() || createMutation.isPending}
              data-testid="button-confirm-new-comanda"
            >
              Abrir comanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Comanda detail dialog ─────────────────────────────────────────── */}
      <Dialog
        open={!!detailComanda}
        onOpenChange={(o) => { if (!o) { setDetailComanda(null); setItemSearch(""); } }}
      >
        <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-screen max-w-[100vw] flex-col gap-0 rounded-none p-0 sm:h-[90vh] sm:max-w-3xl sm:rounded-lg">
          <DialogHeader className="border-b border-border px-4 py-3 sm:px-6 sm:py-4">
            <DialogTitle className="text-xl">{detailComanda?.identifier}</DialogTitle>
            {detailComanda && (
              <p className="text-xs text-muted-foreground">
                Aberta há {timeAgo(detailComanda.created_at)}
                {detailComanda.notes ? ` · ${detailComanda.notes}` : ""}
              </p>
            )}
          </DialogHeader>

          <div className="flex min-h-0 flex-1 flex-col-reverse overflow-hidden sm:flex-row">
            {/* Left: product search */}
            <div className="flex h-[40vh] w-full shrink-0 flex-col border-t border-border bg-muted/30 sm:h-auto sm:w-56 sm:border-r sm:border-t-0 lg:w-64">
              <div className="p-3 space-y-2">
                <div className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      data-testid="input-item-search"
                      placeholder="Buscar produto..."
                      value={itemSearch}
                      onChange={(e) => setItemSearch(e.target.value)}
                      className="h-8 pl-8 text-xs"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    title="Escanear código de barras"
                    data-testid="button-scan-comanda"
                    onClick={() => setScannerOpen(true)}
                  >
                    <ScanBarcode className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Use o leitor USB ou a câmera
                </p>
              </div>
              <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:h-full [&>[data-radix-scroll-area-viewport]]:h-full">
                <div className="space-y-0.5 px-2 pb-3 h-full">
                  {filteredProducts.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                      <Package className="h-10 w-10 opacity-30" />
                      <p className="text-sm">Nenhum produto</p>
                    </div>
                  ) : (
                    filteredProducts.map((p) => {
                      const baseStock = Number(p.stock_quantity ?? 0);
                      const reservedOther = reservedByOthers.get(p.id) ?? 0;
                      const availStock = Math.max(0, baseStock - reservedOther);
                      const outOfStock = availStock <= 0;
                      const reservedLabel = reservedOther > 0 && availStock > 0;
                      return (
                        <button
                          key={p.id}
                          data-testid={`product-add-${p.id}`}
                          disabled={detailComanda?.status !== "open" || addItemMutation.isPending || outOfStock}
                          onClick={() => handleProductClick(p)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-background disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <div className="flex-1 min-w-0 flex items-baseline gap-1.5">
                            <span className="min-w-0 flex-1 font-medium leading-tight truncate">{p.name}</span>
                            {isDecimalUnit(p.stock_unit) && (
                              <span className="shrink-0 text-[10px] text-muted-foreground">/{p.stock_unit}</span>
                            )}
                            {outOfStock ? (
                              <span className="shrink-0 rounded bg-destructive/15 px-1 text-[9px] font-bold uppercase text-destructive">
                                {reservedOther > 0 ? "Reservado" : "Sem estoque"}
                              </span>
                            ) : reservedLabel ? (
                              <span
                                className="shrink-0 rounded bg-amber-500/15 px-1 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400"
                                title={`${reservedOther} ${p.stock_unit} em outro caixa/comanda`}
                              >
                                {availStock} disp.
                              </span>
                            ) : null}
                          </div>
                          <span className="shrink-0 font-mono text-muted-foreground">
                            {fmtBRL(productPrice(p))}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: items list */}
            <div className="flex flex-1 flex-col overflow-hidden">
              <ScrollArea className="flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:h-full [&>[data-radix-scroll-area-viewport]]:h-full">
                {loadingItems ? (
                  <div className="space-y-2 p-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
                  </div>
                ) : comandaItems.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
                    <ShoppingBag className="h-10 w-10 opacity-30" />
                    <p className="text-sm">Nenhum item ainda</p>
                    <p className="text-xs">Clique em um produto para adicionar</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {comandaItems.map((item) => (
                      <div
                        key={item.id}
                        data-testid={`item-row-${item.id}`}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 sm:flex-nowrap sm:px-4 sm:py-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-sm font-medium">{item.product_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtQty(Number(item.quantity))}{item.product_id && productUnitById.get(item.product_id) ? ` ${productUnitById.get(item.product_id)}` : ""} × {fmtBRL(item.unit_price)}
                          </p>
                          {item.addons && item.addons.length > 0 && (
                            <p className="mt-0.5 text-[11px] text-muted-foreground">
                              + {item.addons.map((a) => a.name).join(", ")}
                            </p>
                          )}
                          {item.notes && (
                            <p className="mt-0.5 text-[11px] italic text-amber-600 dark:text-amber-400">
                              Obs: {item.notes}
                            </p>
                          )}
                        </div>
                        <span className="shrink-0 font-mono text-sm font-semibold">
                          {fmtBRL(Number(item.subtotal))}
                        </span>
                        {detailComanda?.status === "open" && (
                          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              data-testid={`button-dec-${item.id}`}
                              onClick={() => changeQtyMutation.mutate({ item, delta: -1 })}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              data-testid={`button-inc-${item.id}`}
                              onClick={() => changeQtyMutation.mutate({ item, delta: 1 })}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7 text-destructive hover:text-destructive"
                              data-testid={`button-remove-${item.id}`}
                              onClick={() => removeItemMutation.mutate(item.id)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>

              {/* Footer total + close button */}
              <div className="border-t border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total</span>
                  <span className="text-2xl font-bold">{fmtBRL(detailTotal)}</span>
                </div>
                {detailComanda?.status === "open" ? (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={comandaItems.length === 0 || closeMutation.isPending}
                      onClick={() => { setSelectedPayment(openSession ? "cash" : "credit_card"); setCloseDialogOpen(true); }}
                      data-testid="button-close-comanda"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Fechar comanda
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full text-destructive hover:text-destructive"
                      onClick={() => setCancelId(detailComanda!.id)}
                      data-testid="button-cancel-comanda"
                    >
                      <XCircle className="mr-1.5 h-4 w-4" />
                      Cancelar comanda
                    </Button>
                  </div>
                ) : (
                  <Badge variant="secondary" className="w-full justify-center py-2 text-sm">
                    {detailComanda?.status === "closed" ? "Comanda fechada" : "Comanda cancelada"}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Close comanda payment dialog ──────────────────────────────────── */}
      <Dialog open={closeDialogOpen} onOpenChange={(o) => {
        setCloseDialogOpen(o);
        if (!o) {
          setCashReceivedStr("");
          setMixedSplits([{ method: "pix", amountStr: "" }]);
          setCrediarioCustomerId(null);
          setSplitEnabled(false);
          setSplitPeople(2);
        }
      }}>
        {closeDialogOpen && <CloseDialogHotkeys
          openSession={!!openSession}
          paymentMethod={selectedPayment}
          setPaymentMethod={setSelectedPayment}
          openHelp={() => setShortcutsOpen(true)}
          confirm={() => {
            const valid =
              !closeMutation.isPending &&
              !(selectedPayment === "cash" && !openSession) &&
              !(selectedPayment === "cash" && cashReceivedAmtComanda > 0 && cashReceivedAmtComanda < detailTotal) &&
              !(selectedPayment === "mixed" && Math.abs(splitsTotal(mixedSplits) - detailTotal) > 0.009);
            if (valid) closeMutation.mutate();
          }}
        />}
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between gap-2">
              <span>Fechar comanda</span>
              <button
                type="button"
                onClick={() => setShortcutsOpen(true)}
                title="Atalhos de teclado (?)"
                className="hidden h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:inline-flex"
                data-testid="comanda-shortcuts-help"
              >
                <Keyboard className="h-4 w-4" />
              </button>
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between rounded-lg bg-muted px-4 py-3">
              <span className="text-sm text-muted-foreground">Total a receber</span>
              <span className="text-xl font-bold">{fmtBRL(detailTotal)}</span>
            </div>

            {/* Dividir conta */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
              <button
                type="button"
                onClick={() => { setSplitEnabled((v) => !v); if (splitEnabled) setSplitPeople(2); }}
                className="flex w-full items-center justify-between gap-2 text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <SplitSquareVertical className="h-4 w-4 text-primary" />
                  Dividir conta
                </span>
                <span className={`text-xs px-2 py-0.5 rounded-full transition-colors ${splitEnabled ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {splitEnabled ? "Ativado" : "Desativado"}
                </span>
              </button>
              {splitEnabled && (
                <div className="space-y-2 pt-1">
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground whitespace-nowrap">Nº de pessoas</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => setSplitPeople((n) => Math.max(2, n - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-8 text-center font-bold tabular-nums">{splitPeople}</span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => setSplitPeople((n) => Math.min(20, n + 1))}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Array.from({ length: splitPeople }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between rounded-md bg-background px-2.5 py-1.5 text-xs border border-border">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Users className="h-3 w-3" />
                          Pessoa {i + 1}
                        </span>
                        <span className="font-semibold tabular-nums">{fmtBRL(Math.ceil((detailTotal / splitPeople) * 100) / 100)}</span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground text-center">
                    Selecione a forma de pagamento de cada pessoa abaixo
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Forma de pagamento</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {enabledPaymentMethods.map((m) => {
                  const disabled = m.value === "cash" && !openSession;
                  return (
                    <button
                      key={m.value}
                      data-testid={`payment-${m.value}`}
                      onClick={() => !disabled && setSelectedPayment(m.value)}
                      disabled={disabled}
                      title={disabled ? "Abra o caixa para receber em dinheiro" : undefined}
                      className={`flex flex-col items-center gap-1.5 rounded-lg border p-3 text-xs font-medium transition-colors ${
                        disabled
                          ? "cursor-not-allowed border-dashed border-border/60 bg-muted/20 text-muted-foreground/50"
                          : selectedPayment === m.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card hover:border-primary/50"
                      }`}
                    >
                      <m.icon className="h-4 w-4" />
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {!openSession && (
              <div
                className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning"
                data-testid="comanda-cash-blocked"
              >
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1 text-xs leading-relaxed">
                  <p className="font-semibold">Caixa fechado</p>
                  <p className="text-warning/80">
                    Para receber em dinheiro, abra o caixa primeiro.{" "}
                    <Link
                      to="/caixa"
                      onClick={() => setCloseDialogOpen(false)}
                      className="underline underline-offset-2 hover:text-warning"
                      data-testid="link-comanda-abrir-caixa"
                    >
                      Ir para o caixa
                    </Link>
                  </p>
                </div>
              </div>
            )}

            {selectedPayment === "crediario" && (
              <div className="space-y-2 rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <Label className="flex items-center gap-1.5 text-sm">
                  <UserRound className="h-3.5 w-3.5" /> Cliente do Crediário
                </Label>
                <Select
                  value={crediarioCustomerId ?? ""}
                  onValueChange={(v) => setCrediarioCustomerId(v || null)}
                >
                  <SelectTrigger data-testid="select-crediario-customer">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {crediarioCustomers.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">
                        Nenhum cliente cadastrado.
                      </div>
                    ) : (
                      crediarioCustomers.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                          {c.credit_limit != null
                            ? ` · limite ${fmtBRL(Number(c.credit_limit))}`
                            : ""}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {selectedCrediarioCustomer?.credit_limit != null && (
                  <p className="text-[11px] text-muted-foreground">
                    Limite de crédito: {fmtBRL(Number(selectedCrediarioCustomer.credit_limit))}.
                    O sistema bloqueia se o saldo aberto + esta venda ultrapassar o limite.
                  </p>
                )}
              </div>
            )}

            {selectedPayment === "mixed" && (
              <MixedPaymentEditor
                splits={mixedSplits}
                setSplits={setMixedSplits}
                total={detailTotal}
                openSession={!!openSession}
              />
            )}

            {selectedPayment === "cash" && (
              <div className="space-y-2">
                <Label htmlFor="comanda-cash-received" className="text-sm">Valor recebido</Label>
                <Input
                  id="comanda-cash-received"
                  data-testid="comanda-cash-received"
                  inputMode="numeric"
                  placeholder="R$ 0,00"
                  value={cashReceivedStr ? `R$ ${cashReceivedStr}` : ""}
                  onChange={(e) => setCashReceivedStr(maskMoneyFromDigits(e.target.value))}
                  className="text-left font-mono"
                />
                {cashReceivedAmtComanda > 0 && cashReceivedAmtComanda < detailTotal ? (
                  <div
                    className="flex items-center justify-between rounded-lg bg-destructive/10 px-3 py-2 text-destructive"
                    data-testid="comanda-falta"
                  >
                    <span className="text-sm font-semibold">Valor insuficiente — falta</span>
                    <span className="font-mono text-base font-bold">
                      {fmtBRL(detailTotal - cashReceivedAmtComanda)}
                    </span>
                  </div>
                ) : cashReceivedAmtComanda > 0 ? (
                  <div className="flex items-center justify-between rounded-lg bg-success/10 px-3 py-2 text-success">
                    <span className="text-sm font-semibold">Troco</span>
                    <span className="font-mono text-base font-bold" data-testid="comanda-troco">
                      {fmtBRL(changeComanda)}
                    </span>
                  </div>
                ) : null}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialogOpen(false)}>
              Voltar
            </Button>
            <Button
              onClick={() => {
                if (selectedPayment === "pix") {
                  if (!pixBank?.pix_key || !pixBank?.pix_key_type) {
                    toast.error("Cadastre uma chave PIX em Configurações > Banco");
                    return;
                  }
                  setPixConfirmOpen(true);
                  return;
                }
                closeMutation.mutate();
              }}
              disabled={
                closeMutation.isPending ||
                (selectedPayment === "cash" && !openSession) ||
                (selectedPayment === "cash" && cashReceivedAmtComanda > 0 && cashReceivedAmtComanda < detailTotal) ||
                (selectedPayment === "mixed" && Math.abs(splitsTotal(mixedSplits) - detailTotal) > 0.009) ||
                (selectedPayment === "crediario" && !crediarioCustomerId)
              }
              data-testid="button-confirm-close"
            >
              Confirmar fechamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PixConfirmDialog
        open={pixConfirmOpen}
        onOpenChange={setPixConfirmOpen}
        pixKey={pixBank?.pix_key ?? null}
        pixKeyType={pixBank?.pix_key_type ?? null}
        merchantName={activeCompany?.name ?? "RECEBEDOR"}
        amount={detailTotal}
        isProcessing={closeMutation.isPending}
        onConfirm={() => {
          closeMutation.mutate(undefined, {
            onSuccess: () => setPixConfirmOpen(false),
          });
        }}
      />

      {/* ── Qty dialog for decimal-unit products ─────────────────────────── */}
      <Dialog open={!!qtyProduct} onOpenChange={(o) => !o && setQtyProduct(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle className="truncate">{qtyProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-xs text-muted-foreground">
              Informe a quantidade em <strong>{qtyProduct?.stock_unit}</strong>
            </p>
            <div className="relative">
              <Input
                ref={qtyInputRef}
                data-testid="input-qty-decimal"
                className="text-center font-mono text-2xl"
                value={qtyVal}
                readOnly
                onKeyDown={(e) => {
                  e.preventDefault();
                  setQtyVal((v) => applyQty3Key(v, e.key));
                }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                {qtyProduct?.stock_unit}
              </span>
            </div>
            {qtyProduct && parseQty3(qtyVal) > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                = {fmtBRL(Math.floor(productPrice(qtyProduct) * parseQty3(qtyVal) * 100) / 100)}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQtyProduct(null)}>Cancelar</Button>
            <Button
              data-testid="button-confirm-qty"
              disabled={parseQty3(qtyVal) <= 0 || addItemMutation.isPending}
              onClick={() => {
                if (!qtyProduct) return;
                addItemMutation.mutate({ product: qtyProduct, qty: parseQty3(qtyVal) });
                setQtyProduct(null);
              }}
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Prep dialog: addons + observation for prepared products ────── */}
      <Dialog open={!!prepProduct} onOpenChange={(o) => !o && setPrepProduct(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="truncate">{prepProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {prepLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {prepAddons.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Adicionais</p>
                    <div className="space-y-1.5 rounded-lg border border-border p-2">
                      {prepAddons.map((a) => {
                        const checked = prepSelected.has(a.id);
                        return (
                          <label
                            key={a.id}
                            data-testid={`label-prep-addon-${a.id}`}
                            className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                data-testid={`checkbox-prep-addon-${a.id}`}
                                className="h-4 w-4 shrink-0 accent-primary"
                                checked={checked}
                                onChange={(e) =>
                                  setPrepSelected((s) => {
                                    const next = new Set(s);
                                    if (e.target.checked) next.add(a.id);
                                    else next.delete(a.id);
                                    return next;
                                  })
                                }
                              />
                              <span className="truncate">{a.name}</span>
                            </div>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              + {fmtBRL(Number(a.price))}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="prep-notes" className="text-sm font-medium">
                    Observações
                  </Label>
                  <Textarea
                    id="prep-notes"
                    data-testid="input-prep-notes"
                    value={prepNotes}
                    onChange={(e) => setPrepNotes(e.target.value.toUpperCase())}
                    placeholder="EX: SEM CEBOLA, BEM PASSADO, SEM SAL..."
                    rows={3}
                    style={{ textTransform: "uppercase" }}
                  />
                </div>

                {prepProduct && (
                  <div className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-sm">
                    <span className="text-muted-foreground">Total do item</span>
                    <strong className="font-mono">
                      {fmtBRL(
                        productPrice(prepProduct) +
                          prepAddons
                            .filter((a) => prepSelected.has(a.id))
                            .reduce((s, a) => s + Number(a.price), 0),
                      )}
                    </strong>
                  </div>
                )}
              </>
            )}
          </div>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setPrepProduct(null)}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              data-testid="button-confirm-prep"
              disabled={prepLoading || addItemMutation.isPending}
              onClick={confirmPrep}
              className="w-full sm:w-auto"
            >
              Adicionar à comanda
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Cancel confirmation ───────────────────────────────────────────── */}
      <AlertDialog open={!!cancelId} onOpenChange={(o) => !o && setCancelId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar comanda?</AlertDialogTitle>
            <AlertDialogDescription>
              A comanda será marcada como cancelada. Os itens não serão cobrados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => cancelId && cancelMutation.mutate(cancelId)}
            >
              Cancelar comanda
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Camera barcode scanner ──────────────────────────────────────── */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(result) => {
          setScannerOpen(false);
          addByBarcode(result.barcode);
        }}
      />

      <Dialog open={!!pendingReceipt} onOpenChange={(o) => { if (!o) setPendingReceipt(null); }}>
        <DialogContent data-testid="dialog-print-receipt-comanda">
          <DialogHeader>
            <DialogTitle>Imprimir cupom?</DialogTitle>
            <DialogDescription>
              A comanda foi fechada. Deseja imprimir o cupom não fiscal para o cliente?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingReceipt(null)}
              data-testid="button-skip-print-comanda"
            >
              Não imprimir
            </Button>
            <Button
              onClick={async () => {
                if (!pendingReceipt) return;
                setPrintingReceipt(true);
                try {
                  await printReceipt(pendingReceipt);
                  setPendingReceipt(null);
                } catch (e: any) {
                  toast.error(`Falha ao imprimir: ${e?.message ?? "erro desconhecido"}`);
                } finally {
                  setPrintingReceipt(false);
                }
              }}
              disabled={printingReceipt}
              data-testid="button-confirm-print-comanda"
            >
              {printingReceipt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Imprimir cupom
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdvShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} context="comanda" />

      {/* ── QR Code das Mesas dialog ─────────────────────────────────────── */}
      <Dialog open={qrDialogOpen} onOpenChange={setQrDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5 text-primary" />
              QR Code das Mesas
            </DialogTitle>
            <DialogDescription>
              Gere e imprima QR Codes para as mesas. O cliente escaneia e a comanda abre automaticamente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Config */}
            <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <div className="space-y-1">
                <Label className="text-xs">Prefixo</Label>
                <input
                  type="text"
                  value={qrPrefix}
                  onChange={(e) => setQrPrefix(e.target.value)}
                  className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Mesa"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Quantidade de mesas</Label>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setQrTableCount((n) => Math.max(1, n - 1))}>
                    <Minus className="h-3.5 w-3.5" />
                  </Button>
                  <span className="w-10 text-center font-bold tabular-nums">{qrTableCount}</span>
                  <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setQrTableCount((n) => Math.min(30, n + 1))}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => window.print()}
                className="gap-2 ml-auto print:hidden"
              >
                <Printer className="h-4 w-4" />
                Imprimir
              </Button>
            </div>

            {/* QR grid */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-4">
              {Array.from({ length: qrTableCount }).map((_, i) => {
                const tableLabel = `${qrPrefix.trim() || "Mesa"} ${i + 1}`;
                const url = `${window.location.origin}/mesa/${cid}/${encodeURIComponent(tableLabel)}`;
                return (
                  <div
                    key={i}
                    className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center"
                  >
                    <QRCodeSVG
                      value={url}
                      size={120}
                      bgColor="transparent"
                      fgColor="currentColor"
                      className="text-foreground"
                      level="M"
                    />
                    <div>
                      <p className="text-sm font-bold">{tableLabel}</p>
                      <p className="text-[10px] text-muted-foreground break-all leading-tight mt-0.5">
                        {activeCompany?.name}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-muted-foreground text-center">
              O cliente escaneia o QR Code → informa o nome → comanda abre automaticamente no sistema
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQrDialogOpen(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
