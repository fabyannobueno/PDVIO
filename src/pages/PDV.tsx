import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { useAuth } from "@/contexts/AuthContext";
import { playLowStockAlert } from "@/lib/beep";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  X,
  Package,
  Loader2,
  Banknote,
  CreditCard,
  QrCode,
  Ticket,
  ShoppingCart,
  CheckCircle2,
  UserRound,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ScanBarcode,
  AlertTriangle,
  Wallet,
  BookOpen,
} from "lucide-react";
import { Link } from "react-router-dom";
import { BarcodeScanner } from "@/components/app/BarcodeScanner";
import {
  MixedPaymentEditor,
  type MixedSplit,
  splitsTotal,
  describeSplits,
} from "@/components/app/MixedPaymentEditor";
import { printReceipt, getSettings as getPrinterSettings, formatSaleNumber, type Receipt } from "@/lib/printer";
import { decodePriceLabelBarcode, productScaleCode } from "@/lib/weighBarcode";
import { usePaymentSettings } from "@/hooks/usePaymentSettings";
import { PixConfirmDialog } from "@/components/app/PixConfirmDialog";
import type { PixKeyType } from "@/lib/pixPayload";
import { logAudit } from "@/lib/auditLog";
import { Printer, Keyboard } from "lucide-react";
import { PdvShortcutsHelp } from "@/components/app/PdvShortcutsHelp";
import { useIsMobile } from "@/hooks/use-mobile";
import { useReservedStock } from "@/hooks/useReservedStock";
import {
  getOrCreateCartId,
  upsertReservation,
  deleteReservation,
  clearCart as clearCartReservations,
} from "@/lib/cartReservations";

const PAYMENT_LABELS: Record<string, string> = {
  cash: "Dinheiro",
  credit_card: "Cartão de Crédito",
  debit_card: "Cartão de Débito",
  pix: "PIX",
  ticket: "Ticket",
  crediario: "Crediário",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  numeric_id: number;
  name: string;
  category: string | null;
  sale_price: number;
  is_promotion: boolean;
  promotion_price: number | null;
  stock_unit: string;
  is_active: boolean;
  sku: string | null;
  barcode: string | null;
  is_prepared?: boolean | null;
  stock_quantity: number;
  min_stock: number;
}

interface ProductAddon {
  id: string;
  product_id: string;
  name: string;
  price: number;
  sort_order: number;
}

interface ItemAddon {
  name: string;
  price: number;
}

interface Customer {
  id: string;
  name: string;
  phone: string | null;
  document: string | null;
  credit_limit: number | null;
}

interface CartItem {
  lineId: string;
  productId: string;
  name: string;
  unitPrice: number;
  originalPrice: number;
  quantity: number;
  itemDiscount: number;
  isPromotion: boolean;
  stock_unit: string;
  addons: ItemAddon[];
  notes: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const INTEGER_UNITS = ["un", "cx", "pç"];

const PAYMENT_METHODS = [
  { value: "cash", label: "Dinheiro", icon: Banknote, color: "text-emerald-500" },
  { value: "credit_card", label: "Crédito", icon: CreditCard, color: "text-blue-500" },
  { value: "debit_card", label: "Débito", icon: CreditCard, color: "text-violet-500" },
  { value: "pix", label: "PIX", icon: QrCode, color: "text-primary" },
  { value: "ticket", label: "Ticket", icon: Ticket, color: "text-orange-500" },
  { value: "mixed", label: "Misto", icon: Wallet, color: "text-amber-500" },
  { value: "crediario", label: "Crediário", icon: BookOpen, color: "text-rose-500" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function itemSubtotal(item: CartItem): number {
  const raw = Math.max(0, (item.unitPrice - item.itemDiscount) * item.quantity);
  return Math.floor(raw * 100) / 100;
}

function fromCents(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const str = String(abs).padStart(3, "0");
  const intPart = str.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decPart = str.slice(-2);
  return `${intPart || "0"},${decPart}`;
}

function parseMoney(str: string): number {
  const cents = parseInt(str.replace(/\D/g, "") || "0", 10);
  return cents / 100;
}

function formatQty3(thousandths: number): string {
  const abs = Math.abs(Math.round(thousandths));
  const str = String(abs).padStart(4, "0");
  const intPart = str.slice(0, -3).replace(/\B(?=(\d{3})+(?!\d))/g, ".") || "0";
  const decPart = str.slice(-3);
  return `${intPart},${decPart}`;
}

function parseQty(val: string, unit: string): number {
  if (INTEGER_UNITS.includes(unit)) {
    return Math.max(0, parseInt(val.replace(/\D/g, "") || "0", 10));
  }
  const digits = parseInt(val.replace(/\D/g, "") || "0", 10);
  return digits / 1000;
}

function fmtQtyDisplay(qty: number, unit: string): string {
  if (INTEGER_UNITS.includes(unit)) return Math.round(qty).toString();
  return qty.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function initQtyVal(qty: number, unit: string): string {
  if (INTEGER_UNITS.includes(unit)) return Math.round(qty).toString();
  return formatQty3(Math.round(qty * 1000));
}

function MoneyInput({
  value,
  onChange,
  onBlur,
  onConfirm,
  onCancel,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  onBlur?: () => void;
  onConfirm?: () => void;
  onCancel?: () => void;
  className?: string;
  "data-testid"?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const target = e.currentTarget;
    const hasSelection =
      target.selectionStart != null &&
      target.selectionEnd != null &&
      target.selectionStart !== target.selectionEnd;
    // Allow native copy/cut/select-all combos
    if ((e.metaKey || e.ctrlKey) && ["a", "c", "x", "v"].includes(e.key.toLowerCase())) {
      return;
    }
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      const baseCents = hasSelection ? 0 : parseInt(value.replace(/\D/g, "") || "0", 10);
      onChange(fromCents(baseCents * 10 + parseInt(e.key, 10)));
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (hasSelection) {
        onChange("0,00");
      } else {
        const cents = parseInt(value.replace(/\D/g, "") || "0", 10);
        onChange(fromCents(Math.floor(cents / 10)));
      }
    } else if (e.key === "Delete") {
      e.preventDefault();
      onChange("0,00");
    } else if (e.key === "Enter") {
      onConfirm?.();
    } else if (e.key === "Escape") {
      onCancel?.();
    }
  };
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
    if (!pasted) return;
    onChange(fromCents(parseInt(pasted, 10)));
  };
  return (
    <input
      {...props}
      value={value || "0,00"}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onChange={() => {}}
      onBlur={onBlur}
      inputMode="numeric"
    />
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PDV() {
  const { activeCompany } = useCompany();
  const { activeOperator } = useOperator();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Cart identifier (per browser tab + company + operator). Used to publish
  // real-time stock reservations so other PDVs/comandas don't oversell.
  const cartId = useMemo(() => {
    if (!activeCompany?.id) return "";
    const scope = `${activeCompany.id}:${activeOperator?.id ?? user?.id ?? "anon"}`;
    return getOrCreateCartId(scope);
  }, [activeCompany?.id, activeOperator?.id, user?.id]);

  const { reserved: reservedByOthers } = useReservedStock({
    companyId: activeCompany?.id,
    excludeCartId: cartId || null,
  });

  // Mobile view toggle
  const [mobileView, setMobileView] = useState<"products" | "cart">("products");

  // Scanner
  const [scannerOpen, setScannerOpen] = useState(false);

  // Left panel
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [page, setPage] = useState(1);

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const cartRef = useRef<CartItem[]>([]);
  useEffect(() => {
    cartRef.current = cart;
  }, [cart]);
  const [paymentMethod, setPaymentMethod] = useState("cash");

  // Filter payment methods based on company configuration (real-time)
  const paymentSettings = usePaymentSettings(activeCompany?.id);
  const enabledPaymentMethods = useMemo(() => {
    const allowed = new Set(paymentSettings.enabled);
    return PAYMENT_METHODS.filter((m) => allowed.has(m.value as any));
  }, [paymentSettings]);

  // Auto-fallback if current paymentMethod was disabled
  useEffect(() => {
    if (enabledPaymentMethods.length === 0) return;
    if (!enabledPaymentMethods.some((m) => m.value === paymentMethod)) {
      setPaymentMethod(enabledPaymentMethods[0].value);
    }
  }, [enabledPaymentMethods, paymentMethod]);

  // PIX key for QR generation
  const { data: pixBank } = useQuery<{ pix_key: string | null; pix_key_type: PixKeyType | null } | null>({
    queryKey: ["/pdv/pix_bank", activeCompany?.id],
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
  const [cashReceived, setCashReceived] = useState("");
  const [mixedSplits, setMixedSplits] = useState<MixedSplit[]>([
    { method: "pix", amountStr: "" },
  ]);
  const [orderDiscount, setOrderDiscount] = useState("");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingDiscountVal, setEditingDiscountVal] = useState("");
  const [editingQtyId, setEditingQtyId] = useState<string | null>(null);
  const [editingQtyVal, setEditingQtyVal] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState<Receipt | null>(null);
  const [printing, setPrinting] = useState(false);

  // Prep modal (addons + notes for prepared products)
  const [prepProduct, setPrepProduct] = useState<Product | null>(null);
  const [prepAddons, setPrepAddons] = useState<ProductAddon[]>([]);
  const [prepSelected, setPrepSelected] = useState<Set<string>>(new Set());
  const [prepNotes, setPrepNotes] = useState<string>("");
  const [prepLoading, setPrepLoading] = useState(false);

  // Customer
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerDropdown, setCustomerDropdown] = useState(false);
  const [customerHighlight, setCustomerHighlight] = useState<number>(0);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);

  // Keyboard / quick sale
  const searchRef = useRef<HTMLInputElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState<number>(-1);
  const isMobile = useIsMobile();

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,numeric_id,name,category,sale_price,is_promotion,promotion_price,stock_unit,is_active,sku,barcode,is_prepared,stock_quantity,min_stock")
        .eq("company_id", activeCompany!.id)
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Product[];
    },
  });

  // Realtime: refresh products whenever stock changes (sales from other PDVs,
  // comandas being closed, manual stock adjustments, etc.)
  useEffect(() => {
    if (!activeCompany?.id) return;
    const channel = supabase
      .channel(`pdv-products-${activeCompany.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "products", filter: `company_id=eq.${activeCompany.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["/api/products", activeCompany.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_movements", filter: `company_id=eq.${activeCompany.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ["/api/products", activeCompany.id] });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeCompany?.id, queryClient]);

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,phone,document,credit_limit" as any)
        .eq("company_id", activeCompany!.id)
        .order("name");
      if (error) throw error;
      return ((data ?? []) as any[]) as Customer[];
    },
  });

  // Crediário balance for the selected customer (sum of charges - payments)
  const { data: customerCrediarioBalance = 0 } = useQuery<number>({
    queryKey: ["/crediario/balance", activeCompany?.id, selectedCustomer?.id],
    enabled: !!activeCompany?.id && !!selectedCustomer?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crediario_entries")
        .select("kind, amount")
        .eq("company_id", activeCompany!.id)
        .eq("customer_id", selectedCustomer!.id);
      if (error) throw error;
      return ((data as any[]) ?? []).reduce(
        (s, e) => s + (e.kind === "charge" ? Number(e.amount) : -Number(e.amount)),
        0,
      );
    },
  });

  const { data: openSession } = useQuery<{ id: string } | null>({
    queryKey: ["/api/cash_sessions/open", activeCompany?.id, activeOperator?.id ?? user?.id ?? null],
    enabled: !!activeCompany?.id && !!user?.id,
    refetchInterval: 30_000,
    queryFn: async () => {
      let q = (supabase as any)
        .from("cash_sessions")
        .select("id")
        .eq("company_id", activeCompany!.id)
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

  // ── Computed ───────────────────────────────────────────────────────────────

  const categories = useMemo(() => {
    const cats = products.map((p) => p.category).filter(Boolean) as string[];
    return Array.from(new Set(cats)).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [products]);

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        !search ||
        p.name.toLowerCase().includes(q) ||
        String(p.numeric_id).includes(search);
      const matchCat = categoryFilter === "all" || p.category === categoryFilter;
      return matchSearch && matchCat;
    });
  }, [products, search, categoryFilter]);

  const PAGE_SIZE = 20;
  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const paginatedProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Reset arrow-nav selection when the visible list changes
  useEffect(() => {
    setSelectedIdx(-1);
  }, [search, categoryFilter, page]);

  function getGridCols(): number {
    const grid = gridRef.current;
    if (!grid) return 1;
    const children = Array.from(grid.children) as HTMLElement[];
    if (children.length <= 1) return Math.max(1, children.length);
    const firstTop = children[0].offsetTop;
    let cols = 0;
    for (const c of children) {
      if (c.offsetTop === firstTop) cols++;
      else break;
    }
    return Math.max(1, cols);
  }

  const filteredCustomers = useMemo(() => {
    const q = customerSearch.toLowerCase().trim();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.phone?.includes(q) ||
          c.document?.includes(q)
      )
      .slice(0, 8);
  }, [customers, customerSearch]);

  const cartSubtotal = cart.reduce((sum, item) => sum + itemSubtotal(item), 0);
  const orderDiscountAmt = Math.min(parseMoney(orderDiscount), cartSubtotal);
  const grandTotal = Math.max(0, cartSubtotal - orderDiscountAmt);
  const cashReceivedAmt = parseMoney(cashReceived);
  const change = Math.max(0, cashReceivedAmt - grandTotal);
  const cartQty = cart.reduce((s, i) => s + i.quantity, 0);

  // ── Stock available (after others' reservations) ───────────────────────────
  const availableStock = useCallback(
    (productId: string, baseStock: number): number =>
      Math.max(0, baseStock - (reservedByOthers.get(productId) ?? 0)),
    [reservedByOthers],
  );

  // Sync cart -> cart_reservations (immediate, so other terminals see it in real time).
  const lastSyncedRef = useRef<Map<string, number>>(new Map());
  useEffect(() => {
    if (!cartId || !activeCompany?.id) return;
    const totals = new Map<string, number>();
    for (const item of cart) {
      if (!item.productId) continue;
      totals.set(item.productId, (totals.get(item.productId) ?? 0) + Number(item.quantity || 0));
    }
    const prev = lastSyncedRef.current;
    // Upsert any product whose total changed
    for (const [pid, qty] of totals) {
      if (prev.get(pid) !== qty) {
        void upsertReservation({
          companyId: activeCompany.id,
          cartId,
          productId: pid,
          quantity: qty,
          reservedBy: user?.id ?? null,
          operatorId: activeOperator?.id ?? null,
          operatorName: activeOperator?.name ?? null,
        });
      }
    }
    // Delete any product no longer in cart
    for (const pid of prev.keys()) {
      if (!totals.has(pid)) {
        void deleteReservation(cartId, pid);
      }
    }
    lastSyncedRef.current = totals;
  }, [cart, cartId, activeCompany?.id, user?.id, activeOperator?.id, activeOperator?.name]);

  // Cleanup on tab close / navigation
  useEffect(() => {
    if (!cartId) return;
    const onUnload = () => {
      try {
        void clearCartReservations(cartId);
      } catch {
        /* noop */
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [cartId]);

  // ── Cart handlers ──────────────────────────────────────────────────────────

  function genLineId() {
    return (typeof crypto !== "undefined" && (crypto as any).randomUUID)
      ? (crypto as any).randomUUID()
      : `line_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function addToCart(
    product: Product,
    opts?: { addons?: ItemAddon[]; notes?: string; qty?: number },
  ): boolean {
    const basePrice =
      product.is_promotion && product.promotion_price != null
        ? product.promotion_price
        : product.sale_price;

    const isDecimal = !INTEGER_UNITS.includes(product.stock_unit);
    const addons = opts?.addons ?? [];
    const notes = (opts?.notes ?? "").trim();
    const hasCustomization = addons.length > 0 || notes.length > 0;
    const addonTotal = addons.reduce((s, a) => s + Number(a.price || 0), 0);
    const unitPrice = Math.floor((basePrice + addonTotal) * 100) / 100;
    const qty = opts?.qty ?? (isDecimal ? 0 : 1);
    const newLineId = genLineId();
    const baseStock = Number(product.stock_quantity ?? 0);
    const reservedOther = reservedByOthers.get(product.id) ?? 0;
    const stock = Math.max(0, baseStock - reservedOther);

    // Stock guard (uses cartRef to always read the latest cart, avoiding stale
    // closure bugs from useCallback / fast scanner bursts)
    const currentInCart = cartRef.current
      .filter((i) => i.productId === product.id)
      .reduce((s, i) => s + i.quantity, 0);
    if (qty > 0 && currentInCart + qty > stock) {
      toast.error(
        reservedOther > 0
          ? `Estoque insuficiente de ${product.name}: outro caixa/comanda já reservou ${reservedOther} ${product.stock_unit}. Disponível: ${stock} ${product.stock_unit}.`
          : `Estoque insuficiente de ${product.name} (${stock} ${product.stock_unit})`,
      );
      return false;
    }

    // Optimistically reserve qty in the ref so rapid back-to-back calls
    // (e.g. USB scanner bursts) see the updated total before React re-renders.
    cartRef.current = [
      ...cartRef.current,
      { lineId: "__pending__", productId: product.id, quantity: qty } as any,
    ];

    setCart((prev) => {
      // Decimal/weighed items: skip duplicate add (qty editor handles existing line)
      if (!hasCustomization && isDecimal) {
        const existing = prev.find(
          (i) => i.productId === product.id && i.addons.length === 0 && !i.notes,
        );
        if (existing) return prev;
      }
      // All other adds — including the same product clicked twice — become
      // separate line items so each registro fica individualizado.
      return [
        ...prev,
        {
          lineId: newLineId,
          productId: product.id,
          name: product.name,
          unitPrice,
          originalPrice: product.sale_price,
          quantity: qty,
          itemDiscount: 0,
          isPromotion: product.is_promotion && product.promotion_price != null,
          stock_unit: product.stock_unit,
          addons,
          notes,
        },
      ];
    });

    // For decimal units (without customization), immediately open the qty editor
    if (isDecimal && !hasCustomization) {
      const existing = cart.find(
        (i) => i.productId === product.id && i.addons.length === 0 && !i.notes,
      );
      const targetId = existing?.lineId ?? newLineId;
      setEditingQtyId(targetId);
      setEditingQtyVal("0,000");
    }
    return true;
  }

  function updateQuantity(lineId: string, delta: number) {
    if (delta > 0) {
      const line = cart.find((i) => i.lineId === lineId);
      if (line?.productId) {
        const product = products.find((p) => p.id === line.productId);
        if (product) {
          const stock = availableStock(product.id, Number(product.stock_quantity ?? 0));
          const currentTotal = cart
            .filter((i) => i.productId === line.productId)
            .reduce((s, i) => s + i.quantity, 0);
          if (currentTotal + delta > stock) {
            toast.error(`Estoque insuficiente de ${product.name} (disponível: ${stock} ${product.stock_unit})`);
            return;
          }
        }
      }
    }
    setCart((prev) =>
      prev
        .map((item) =>
          item.lineId === lineId
            ? { ...item, quantity: Math.max(0, item.quantity + delta) }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  }

  function applyItemDiscount(lineId: string, val: string) {
    const discount = parseMoney(val);
    setCart((prev) =>
      prev.map((item) =>
        item.lineId === lineId
          ? { ...item, itemDiscount: Math.min(discount, item.unitPrice) }
          : item
      )
    );
  }

  function applyQty(lineId: string, val: string, unit: string) {
    const qty = parseQty(val, unit);
    if (qty <= 0) {
      removeFromCart(lineId);
    } else {
      const line = cart.find((i) => i.lineId === lineId);
      if (line?.productId) {
        const product = products.find((p) => p.id === line.productId);
        if (product) {
          const stock = availableStock(product.id, Number(product.stock_quantity ?? 0));
          const otherLinesTotal = cart
            .filter((i) => i.productId === line.productId && i.lineId !== lineId)
            .reduce((s, i) => s + i.quantity, 0);
          if (otherLinesTotal + qty > stock) {
            toast.error(`Estoque insuficiente de ${product.name} (disponível: ${stock} ${product.stock_unit})`);
            setEditingQtyId(null);
            return;
          }
        }
      }
      setCart((prev) =>
        prev.map((item) => item.lineId === lineId ? { ...item, quantity: qty } : item)
      );
    }
    setEditingQtyId(null);
  }

  function removeFromCart(lineId: string) {
    setCart((prev) => prev.filter((i) => i.lineId !== lineId));
    if (editingItemId === lineId) setEditingItemId(null);
    if (editingQtyId === lineId) setEditingQtyId(null);
  }

  function clearCart() {
    setCart([]);
    setOrderDiscount("");
    setCashReceived("");
    setPaymentMethod("cash");
    setMixedSplits([{ method: "pix", amountStr: "" }]);
    setEditingItemId(null);
    setSelectedCustomer(null);
    setCustomerSearch("");
    setCustomerDropdown(false);
    setMobileView("products");
    if (cartId) {
      lastSyncedRef.current = new Map();
      void clearCartReservations(cartId);
    }
  }

  // ── Prep modal (addons + notes for prepared products) ────────────────────

  async function openPrepModal(product: Product) {
    setPrepProduct(product);
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
    const isDecimal = !INTEGER_UNITS.includes(prepProduct.stock_unit);
    addToCart(prepProduct, {
      addons: chosen,
      notes: prepNotes,
      qty: isDecimal ? 0 : 1,
    });
    setPrepProduct(null);
  }

  // ── Barcode scanner helpers ────────────────────────────────────────────────

  const handleAddProduct = useCallback((product: Product): boolean => {
    const avail = availableStock(product.id, Number(product.stock_quantity ?? 0));
    if (avail <= 0) {
      const reservedOther = reservedByOthers.get(product.id) ?? 0;
      toast.error(
        reservedOther > 0
          ? `${product.name}: estoque reservado por outro caixa/comanda.`
          : `${product.name} sem estoque`,
      );
      return false;
    }
    if (product.is_prepared) {
      openPrepModal(product);
      return true;
    }
    return addToCart(product);
  }, [availableStock, reservedByOthers]); // eslint-disable-line react-hooks/exhaustive-deps

  const addToCartByBarcode = useCallback((barcode: string) => {
    // 1) Detecta etiqueta de balança (EAN-13 com prefixo "2"): preço embutido
    const weighInfo = decodePriceLabelBarcode(barcode);
    if (weighInfo) {
      const found = products.find(
        (p) => p.numeric_id != null && productScaleCode(p.numeric_id) === weighInfo.productCode,
      );
      if (!found) {
        toast.error(`Produto pesável não encontrado para o código ${weighInfo.productCode}`);
        return;
      }
      // Para pesáveis em "g", o sale_price é por grama → converte para kg.
      const basePrice =
        found.is_promotion && found.promotion_price != null
          ? Number(found.promotion_price)
          : Number(found.sale_price);
      const pricePerKg = found.stock_unit === "g" ? basePrice * 1000 : basePrice;
      if (!Number.isFinite(pricePerKg) || pricePerKg <= 0) {
        toast.error(`Preço inválido para ${found.name}`);
        return;
      }
      // qty (em kg) = total da etiqueta ÷ preço atual por kg.
      const qty = Math.round((weighInfo.priceInReais / pricePerKg) * 1000) / 1000;
      if (qty <= 0) {
        toast.error("Etiqueta com valor zerado.");
        return;
      }
      const ok = addToCart(found, { qty });
      if (ok) {
        toast.success(
          `${found.name} — ${qty.toLocaleString("pt-BR", { minimumFractionDigits: 3 })} kg (etiqueta ${weighInfo.priceInReais.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })})`,
        );
      }
      return;
    }

    // 2) Busca padrão por barcode/SKU/numeric_id
    const found =
      products.find((p) => p.barcode === barcode || p.sku === barcode) ||
      products.find((p) => String(p.numeric_id) === barcode);
    if (!found) {
      toast.error(`Produto não encontrado: ${barcode}`);
      return;
    }
    const ok = handleAddProduct(found);
    if (ok && !found.is_prepared) {
      toast.success(`${found.name} adicionado ao carrinho`);
    }
  }, [products, handleAddProduct]);

  // USB barcode reader: collects rapid keystrokes and fires on Enter
  const usbBufferRef = useRef("");
  const usbLastKeyRef = useRef(0);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ignore if an input/textarea is focused (don't hijack form inputs)
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const now = Date.now();
      const gap = now - usbLastKeyRef.current;
      usbLastKeyRef.current = now;
      const isScannerPace = gap < 50 || usbBufferRef.current.length > 0;

      // Scanners often send Ctrl+J (LF) as terminator → opens browser downloads.
      // Treat it as Enter and swallow the shortcut.
      if (e.ctrlKey && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        const code = usbBufferRef.current.trim();
        usbBufferRef.current = "";
        if (code.length >= 3) addToCartByBarcode(code);
        return;
      }

      if (e.key === "Enter") {
        if (isScannerPace) e.preventDefault();
        const code = usbBufferRef.current.trim();
        usbBufferRef.current = "";
        if (code.length >= 3) {
          addToCartByBarcode(code);
        }
        return;
      }

      // If too much time has passed, reset buffer
      if (gap > 100) usbBufferRef.current = "";

      if (e.key.length === 1) {
        if (isScannerPace) e.preventDefault();
        usbBufferRef.current += e.key;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [addToCartByBarcode]);

  // ── Hotkeys (Venda rápida) ─────────────────────────────────────────────────
  useEffect(() => {
    function isTyping(target: EventTarget | null) {
      const el = target as HTMLElement | null;
      const tag = el?.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || el?.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      // ? opens help (only when not typing)
      if (e.key === "?" && !isTyping(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      switch (e.key) {
        case "F1": {
          e.preventDefault();
          setShortcutsOpen(true);
          return;
        }
        case "F2": {
          e.preventDefault();
          searchRef.current?.focus();
          searchRef.current?.select();
          return;
        }
        case "F4": {
          e.preventDefault();
          setScannerOpen(true);
          return;
        }
        case "F7": {
          e.preventDefault();
          if (selectedCustomer) {
            setSelectedCustomer(null);
          }
          setCustomerSearch("");
          setCustomerHighlight(0);
          setCustomerDropdown(true);
          setTimeout(() => customerSearchRef.current?.focus(), 30);
          return;
        }
        case "F8": {
          e.preventDefault();
          setPaymentMethod((current) => {
            const enabled = enabledPaymentMethods.filter(
              (m) => m.value !== "cash" || !!openSession,
            );
            const idx = enabled.findIndex((m) => m.value === current);
            const next = enabled[(idx + 1) % enabled.length];
            return next?.value ?? current;
          });
          return;
        }
        case "F9": {
          e.preventDefault();
          if (paymentMethod !== "cash") setPaymentMethod("cash");
          setTimeout(() => {
            const el = document.querySelector<HTMLInputElement>(
              '[data-testid="pdv-cash-received"]',
            );
            el?.focus();
            el?.select();
          }, 50);
          return;
        }
        case "F10": {
          if (paginatedProducts.length === 0) return;
          e.preventDefault();
          if (selectedIdx >= 0) {
            setSelectedIdx(-1);
          } else {
            (document.activeElement as HTMLElement | null)?.blur?.();
            setSelectedIdx(0);
            requestAnimationFrame(() => {
              const child = gridRef.current?.children[0] as HTMLElement | undefined;
              child?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
          }
          return;
        }
        case "F12": {
          if (cart.length === 0 || !paymentMethod) return;
          e.preventDefault();
          finalizeSale();
          return;
        }
        case "Escape": {
          if (isTyping(e.target)) return;
          if (cart.length === 0) return;
          e.preventDefault();
          setClearConfirmOpen(true);
          return;
        }
        case "ArrowRight":
        case "ArrowLeft":
        case "ArrowUp":
        case "ArrowDown": {
          if (isTyping(e.target)) return;
          if (paginatedProducts.length === 0) return;
          if (selectedIdx < 0) return;
          e.preventDefault();
          const cols = getGridCols();
          const len = paginatedProducts.length;
          setSelectedIdx((curr) => {
            let next = curr;
            if (curr < 0) {
              next = 0;
            } else if (e.key === "ArrowRight") {
              next = curr + 1 >= len ? curr : curr + 1;
            } else if (e.key === "ArrowLeft") {
              next = curr - 1 < 0 ? curr : curr - 1;
            } else if (e.key === "ArrowDown") {
              next = curr + cols >= len ? curr : curr + cols;
            } else if (e.key === "ArrowUp") {
              next = curr - cols < 0 ? curr : curr - cols;
            }
            requestAnimationFrame(() => {
              const grid = gridRef.current;
              const child = grid?.children[next] as HTMLElement | undefined;
              child?.scrollIntoView({ block: "nearest", behavior: "smooth" });
            });
            return next;
          });
          return;
        }
        case "Enter": {
          if (isTyping(e.target)) return;
          if (selectedIdx < 0 || selectedIdx >= paginatedProducts.length) return;
          e.preventDefault();
          handleAddProduct(paginatedProducts[selectedIdx]);
          return;
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSession, paymentMethod, cart, grandTotal, mixedSplits, cashReceivedAmt, paginatedProducts, selectedIdx]);

  // ── Finalize ───────────────────────────────────────────────────────────────

  const [pixConfirmOpen, setPixConfirmOpen] = useState(false);

  async function finalizeSale(opts: { pixConfirmed?: boolean } = {}) {
    if (cart.length === 0) {
      toast.error("Adicione produtos ao carrinho");
      return;
    }
    if (grandTotal <= 0) {
      toast.error("Total da venda inválido");
      return;
    }
    if (paymentMethod === "cash" && cashReceivedAmt > 0 && cashReceivedAmt < grandTotal) {
      toast.error("Valor recebido menor que o total");
      return;
    }
    if (paymentMethod === "cash" && !openSession) {
      toast.error("Abra o caixa para finalizar vendas em dinheiro");
      return;
    }
    if (paymentMethod === "crediario") {
      if (!selectedCustomer) {
        toast.error("Selecione um cliente para venda no Crediário");
        return;
      }
      if (selectedCustomer.credit_limit == null || Number(selectedCustomer.credit_limit) <= 0) {
        toast.error(
          "Cliente sem limite de crediário definido. Defina um limite na caderneta antes de vender no crediário.",
          { duration: 6000 },
        );
        return;
      }
      // Compute current open balance = sum(charges) - sum(payments)
      const { data: entries, error: entriesErr } = await (supabase as any)
        .from("crediario_entries")
        .select("kind, amount")
        .eq("company_id", activeCompany!.id)
        .eq("customer_id", selectedCustomer.id);
      if (entriesErr) {
        toast.error("Erro ao verificar limite do cliente");
        return;
      }
      const balance = ((entries as any[]) ?? []).reduce(
        (s, e) => s + (e.kind === "charge" ? Number(e.amount) : -Number(e.amount)),
        0,
      );
      const limit = Number(selectedCustomer.credit_limit);
      const available = limit - balance;
      if (grandTotal > available + 1e-6) {
        toast.error(
          `Limite insuficiente. Disponível: ${fmtBRL(Math.max(0, available))} · Necessário: ${fmtBRL(grandTotal)}`,
          { duration: 6000 },
        );
        return;
      }
    }

    if (paymentMethod === "pix" && !opts.pixConfirmed) {
      if (!pixBank?.pix_key || !pixBank?.pix_key_type) {
        toast.error("Cadastre uma chave PIX em Configurações > Banco");
        return;
      }
      setPixConfirmOpen(true);
      return;
    }
    const mixedPaid = splitsTotal(mixedSplits);
    const mixedHasCash = mixedSplits.some(
      (s) => s.method === "cash" && parseFloat(s.amountStr.replace(/\./g, "").replace(",", ".") || "0") > 0,
    );
    if (paymentMethod === "mixed") {
      if (Math.abs(mixedPaid - grandTotal) > 0.009) {
        toast.error("A soma dos pagamentos deve ser igual ao total");
        return;
      }
      if (mixedHasCash && !openSession) {
        toast.error("Abra o caixa para receber em dinheiro");
        return;
      }
    }

    setIsSaving(true);
    try {
      // Final stock guard: re-check fresh stock from DB before persisting sale
      const productIds = Array.from(
        new Set(cart.map((i) => i.productId).filter((x): x is string => !!x)),
      );
      if (productIds.length > 0) {
        const { data: freshProducts, error: freshErr } = await supabase
          .from("products")
          .select("id,name,stock_quantity,stock_unit")
          .in("id", productIds);
        if (freshErr) throw freshErr;
        const freshMap = new Map(((freshProducts as any[]) ?? []).map((p) => [p.id, p]));
        const totalsByProduct = new Map<string, number>();
        for (const item of cart) {
          if (!item.productId) continue;
          totalsByProduct.set(
            item.productId,
            (totalsByProduct.get(item.productId) ?? 0) + item.quantity,
          );
        }
        for (const [pid, qty] of totalsByProduct) {
          const fp = freshMap.get(pid);
          if (!fp) continue;
          const stock = Number(fp.stock_quantity ?? 0);
          if (qty > stock) {
            toast.error(
              `Estoque insuficiente de ${fp.name} (disponível: ${stock} ${fp.stock_unit}, no carrinho: ${qty}). Ajuste o carrinho para finalizar.`,
              { duration: 6000 },
            );
            setIsSaving(false);
            return;
          }
        }
      }

      const mixedNote =
        paymentMethod === "mixed" ? `[Misto] ${describeSplits(mixedSplits)}` : "";

      const { data: sale, error: saleErr } = await supabase
        .from("sales")
        .insert({
          company_id: activeCompany!.id,
          customer_id: selectedCustomer?.id ?? null,
          subtotal: cartSubtotal,
          discount_amount: orderDiscountAmt,
          total: grandTotal,
          payment_method: paymentMethod,
          payment_amount: paymentMethod === "cash" ? cashReceivedAmt || grandTotal : grandTotal,
          change_amount: paymentMethod === "cash" ? change : 0,
          status: "completed",
          ...(mixedNote ? { notes: mixedNote } : {}),
          ...(openSession?.id ? { cash_session_id: openSession.id } : {}),
        } as any)
        .select("id, numeric_id")
        .single();

      if (saleErr) throw saleErr;

      const { error: itemsErr } = await supabase.from("sale_items").insert(
        cart.map((item) => ({
          sale_id: sale.id,
          product_id: item.productId,
          product_name: item.name,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          discount_amount: item.itemDiscount * item.quantity,
          subtotal: itemSubtotal(item),
          addons: item.addons ?? [],
          notes: item.notes && item.notes.trim().length > 0 ? item.notes : null,
        })) as any
      );
      if (itemsErr) throw itemsErr;

      // Crediário: register a charge linked to this sale
      if (paymentMethod === "crediario" && selectedCustomer) {
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);
        const { error: credErr } = await (supabase as any)
          .from("crediario_entries")
          .insert({
            company_id: activeCompany!.id,
            customer_id: selectedCustomer.id,
            sale_id: sale.id,
            kind: "charge",
            description: `Venda #${sale.id.slice(0, 8)}`,
            amount: grandTotal,
            reference_date: today.toISOString().slice(0, 10),
            due_date: dueDate.toISOString().slice(0, 10),
            notes: null,
            created_by: user?.id ?? null,
          });
        if (credErr) {
          console.error("Falha ao registrar crediário:", credErr);
          toast.error("Venda registrada, mas falhou ao lançar no Crediário");
        } else {
          queryClient.invalidateQueries({ queryKey: ["/crediario/entries", activeCompany!.id] });
        }
      }

      // Stock movements: decrement product stock on sale (trigger updates products.stock_quantity)
      const soldProductIds = Array.from(new Set(cart.filter((i) => !!i.productId).map((i) => i.productId!)));
      const stockRows = cart
        .filter((item) => !!item.productId)
        .map((item) => ({
          company_id: activeCompany!.id,
          product_id: item.productId,
          kind: "sale",
          quantity: -Math.abs(item.quantity),
          reference: `Venda #${sale.id.slice(0, 8)}`,
        }));
      if (stockRows.length > 0) {
        const { error: stockErr } = await (supabase as any).from("stock_movements").insert(stockRows);
        if (stockErr) console.error("Falha ao registrar movimento de estoque:", stockErr);

        // Check if any sold product hit minimum/zero — beep + toast
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
      queryClient.invalidateQueries({ queryKey: ["/api/products", activeCompany!.id] });

      // Audit: log discount applied (order or item-level)
      const totalItemDiscount = cart.reduce(
        (s, i) => s + i.itemDiscount * i.quantity,
        0
      );
      const totalDiscount = orderDiscountAmt + totalItemDiscount;
      if (totalDiscount > 0) {
        logAudit({
          companyId: activeCompany!.id,
          action: "sale.discount_applied",
          entityType: "sale",
          entityId: sale.id,
          description: `Desconto de ${fmtBRL(totalDiscount)} em venda de ${fmtBRL(grandTotal)}`,
          metadata: {
            order_discount: orderDiscountAmt,
            item_discount: totalItemDiscount,
            subtotal: cartSubtotal,
            total: grandTotal,
          },
        });
      }

      toast.success("Venda finalizada com sucesso!");

      const receipt: Receipt = {
        title: "CUPOM NÃO FISCAL",
        items: cart.map((i) => {
          const extras: string[] = [];
          if (i.addons.length > 0) extras.push(`+ ${i.addons.map((a) => a.name).join(", ")}`);
          if (i.notes && i.notes.trim().length > 0) extras.push(`Obs: ${i.notes.trim()}`);
          const name = extras.length > 0 ? `${i.name}\n${extras.join("\n")}` : i.name;
          return {
            name,
            qty: i.quantity,
            price: i.unitPrice - i.itemDiscount,
            unit: i.stock_unit,
          };
        }),
        subtotal: cartSubtotal,
        discount: orderDiscountAmt,
        total: grandTotal,
        payment:
          paymentMethod === "mixed"
            ? `Misto — ${describeSplits(mixedSplits)}`
            : PAYMENT_LABELS[paymentMethod] ?? paymentMethod,
        cashReceived: paymentMethod === "cash" && cashReceivedAmt > 0 ? cashReceivedAmt : undefined,
        change: paymentMethod === "cash" && cashReceivedAmt > 0 ? change : undefined,
        date: new Date(),
        companyName: activeCompany?.name ?? undefined,
        companyDocument: activeCompany?.document ?? undefined,
        companyPhone: activeCompany?.phone ?? undefined,
        companyAddress: activeCompany?.address ?? undefined,
        saleNumber: formatSaleNumber((sale as any)?.numeric_id, sale.id),
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

      clearCart();
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao finalizar venda");
    } finally {
      setIsSaving(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full overflow-hidden bg-background">

      {/* ── LEFT: Product browser ── */}
      <div className={`flex flex-col overflow-hidden ${mobileView === "cart" ? "hidden md:flex" : "flex"} flex-1`}>

        {/* Search bar */}
        <div className="border-b border-border bg-background px-4 py-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={searchRef}
                data-testid="pdv-search"
                placeholder={isMobile ? "Buscar por nome ou código" : "Buscar por nome ou código (F2) — Enter para venda rápida"}
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const first = filteredProducts[0];
                    if (first) {
                      handleAddProduct(first);
                      setSearch("");
                      setPage(1);
                    } else if (search.trim()) {
                      toast.error("Nenhum produto encontrado");
                    }
                  } else if (e.key === "Escape") {
                    if (search) {
                      e.preventDefault();
                      setSearch("");
                    }
                  }
                }}
                className="h-10 pl-9 text-sm"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-10 w-10 shrink-0"
              data-testid="pdv-scan-camera"
              title="Escanear com câmera (F4)"
              onClick={() => setScannerOpen(true)}
            >
              <ScanBarcode className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="hidden h-10 w-10 shrink-0 md:inline-flex"
              data-testid="pdv-shortcuts-help"
              title="Atalhos de teclado (?)"
              onClick={() => setShortcutsOpen(true)}
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Category tabs */}
        {categories.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-border bg-background px-4 py-2 scrollbar-none">
            <button
              onClick={() => { setCategoryFilter("all"); setPage(1); }}
              className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
              }`}
            >
              Todos
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setCategoryFilter(cat); setPage(1); }}
                className={`shrink-0 rounded-full px-3.5 py-1 text-xs font-semibold transition-colors ${
                  categoryFilter === cat
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Products grid */}
        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center p-16">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 p-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <Package className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Nenhum produto encontrado</p>
            </div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-2 gap-2.5 p-4 pb-24 sm:grid-cols-3 sm:pb-4 lg:grid-cols-4 xl:grid-cols-5">
              {paginatedProducts.map((product, idx) => {
                const price =
                  product.is_promotion && product.promotion_price != null
                    ? product.promotion_price
                    : product.sale_price;
                const inCartQty = cart
                  .filter((i) => i.productId === product.id)
                  .reduce((s, i) => s + i.quantity, 0);
                const inCart = inCartQty > 0;
                const isPromo = product.is_promotion && product.promotion_price != null;

                const baseStock = Number(product.stock_quantity ?? 0);
                const reservedOther = reservedByOthers.get(product.id) ?? 0;
                const availStock = Math.max(0, baseStock - reservedOther);
                const outOfStock = availStock <= 0;
                const reservedLabel = reservedOther > 0 && availStock > 0;
                return (
                  <button
                    key={product.id}
                    data-testid={`pdv-product-${product.id}`}
                    onClick={() => handleAddProduct(product)}
                    disabled={outOfStock}
                    className={`group relative flex flex-col rounded-xl border bg-card p-3 text-left transition-all hover:shadow-md active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:shadow-none disabled:active:scale-100 ${
                      inCart
                        ? "border-primary/50 bg-primary/5 shadow-sm"
                        : "border-border hover:border-primary/40"
                    } ${
                      selectedIdx === idx
                        ? "ring-2 ring-primary ring-offset-2 ring-offset-background"
                        : ""
                    }`}
                  >
                    {outOfStock ? (
                      <span className="absolute right-2 top-2 rounded-md bg-destructive/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-destructive">
                        {reservedOther > 0 ? "Reservado" : "Sem estoque"}
                      </span>
                    ) : reservedLabel ? (
                      <span
                        className="absolute right-2 top-2 rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold uppercase text-amber-600 dark:text-amber-400"
                        title={`${reservedOther} ${product.stock_unit} em outro caixa/comanda`}
                      >
                        {availStock} disp.
                      </span>
                    ) : null}
                    {/* Top row: code + cart qty badge */}
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-[10px] font-medium text-muted-foreground/60">
                        #{product.numeric_id}
                      </span>
                      {inCart && inCart.quantity > 0 && (
                        INTEGER_UNITS.includes(product.stock_unit) ? (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                            {inCart.quantity}
                          </span>
                        ) : (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">
                            ✓
                          </span>
                        )
                      )}
                    </div>

                    {/* Promo badge */}
                    {isPromo && (
                      <span className="mb-1.5 inline-flex w-fit items-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                        PROMO
                      </span>
                    )}

                    {/* Name */}
                    <p className="line-clamp-2 flex-1 text-sm font-semibold leading-snug">
                      {product.name}
                    </p>

                    {/* Category */}
                    {product.category && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">{product.category}</p>
                    )}

                    {/* Price */}
                    <div className="mt-2 border-t border-border/50 pt-2">
                      {isPromo ? (
                        <>
                          <p className="text-base font-bold leading-none text-destructive">
                            {fmtBRL(product.promotion_price!)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground line-through">
                            {fmtBRL(product.sale_price)}
                          </p>
                        </>
                      ) : (
                        <p className="text-base font-bold leading-none">{fmtBRL(product.sale_price)}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border bg-background px-4 py-2">
            <p className="text-xs text-muted-foreground">
              {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredProducts.length)} de {filteredProducts.length} produtos
            </p>
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={page === 1}
                onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}
                data-testid="pdv-page-prev"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  size="icon"
                  variant={p === page ? "default" : "ghost"}
                  className="h-7 w-7 text-xs"
                  onClick={() => { setPage(p); scrollAppToTop(); }}
                  data-testid={`pdv-page-${p}`}
                >
                  {p}
                </Button>
              ))}
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                disabled={page === totalPages}
                onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}
                data-testid="pdv-page-next"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
        {/* Mobile: floating cart button */}
        <div className="block md:hidden">
          <button
            data-testid="pdv-mobile-cart-btn"
            onClick={() => setMobileView("cart")}
            className="fixed bottom-16 right-5 z-50 flex items-center gap-2.5 rounded-2xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground shadow-lg active:scale-95 transition-transform"
          >
            <ShoppingCart className="h-5 w-5" />
            {cart.length > 0 ? (
              <>
                <span>Ver carrinho</span>
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-foreground/20 text-xs font-black">
                  {cartQty > 99 ? "99+" : cartQty}
                </span>
                <span className="font-mono">{fmtBRL(grandTotal)}</span>
              </>
            ) : (
              <span>Carrinho vazio</span>
            )}
          </button>
        </div>
      </div>

      {/* ── RIGHT: Cart panel ── */}
      <div className={`flex h-full min-h-0 shrink-0 flex-col overflow-hidden border-l border-border bg-muted/20 ${mobileView === "products" ? "hidden md:flex" : "flex"} w-full md:w-[400px]`}>

        {/* Cart header */}
        <div className="flex items-center justify-between border-b border-border bg-background px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            {/* Mobile back button */}
            <button
              className="mr-1 flex items-center justify-center rounded-lg p-1.5 text-muted-foreground hover:bg-muted md:hidden"
              onClick={() => setMobileView("products")}
              data-testid="pdv-mobile-back"
              aria-label="Voltar para produtos"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <ShoppingCart className="h-5 w-5 text-foreground" />
            <h2 className="text-base font-semibold">Pedido</h2>
            {cart.length > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                {cart.length}
              </span>
            )}
          </div>
          {cart.length > 0 && (
            <button
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              onClick={clearCart}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Limpar
            </button>
          )}
        </div>

        {/* Customer selector */}
        <div className="relative border-b border-border bg-background px-5 py-2.5">
          {selectedCustomer ? (
            (() => {
              const limit = Number(selectedCustomer.credit_limit ?? 0);
              const balance = Number(customerCrediarioBalance ?? 0);
              const available = Math.max(0, limit - balance);
              const hasCrediario = limit > 0;
              const overdue = balance > limit + 0.009;
              return (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
                        <UserRound className="h-3.5 w-3.5 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-none" data-testid="text-pdv-customer-name">
                          {selectedCustomer.name}
                        </p>
                        {selectedCustomer.phone && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{selectedCustomer.phone}</p>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedCustomer(null)}
                      className="rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                      data-testid="pdv-clear-customer"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {hasCrediario ? (
                    <div
                      className={`flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                        overdue
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-300"
                      }`}
                      data-testid="badge-pdv-customer-crediario"
                    >
                      <BookOpen className="h-3 w-3" />
                      <span className="font-medium">Crediário</span>
                      <span className="opacity-70">·</span>
                      <span>
                        Limite <strong>{fmtBRL(limit)}</strong>
                      </span>
                      <span className="opacity-70">·</span>
                      <span>
                        Em aberto <strong>{fmtBRL(balance)}</strong>
                      </span>
                      <span className="opacity-70">·</span>
                      <span>
                        Disponível <strong>{fmtBRL(available)}</strong>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 rounded-md border border-dashed border-border px-2 py-1 text-[11px] text-muted-foreground">
                      <BookOpen className="h-3 w-3" />
                      <span>Sem limite de crediário cadastrado</span>
                    </div>
                  )}
                </div>
              );
            })()
          ) : (
            <button
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
              onClick={() => { setCustomerDropdown(true); setCustomerSearch(""); setCustomerHighlight(0); }}
              data-testid="pdv-select-customer"
            >
              <UserRound className="h-4 w-4" />
              <span>Consumidor final</span>
              <kbd className="ml-auto rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted-foreground">
                F7
              </kbd>
              <ChevronDown className="h-3.5 w-3.5 opacity-50" />
            </button>
          )}

          {customerDropdown && (
            <div className="absolute left-0 right-0 top-full z-50 border-b border-border bg-card shadow-lg">
              <div className="px-3 pt-2.5 pb-1">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    autoFocus
                    ref={customerSearchRef}
                    data-testid="pdv-customer-search"
                    className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                    placeholder="Buscar cliente... (↑↓ navegar · Enter selecionar · Esc fechar)"
                    value={customerSearch}
                    onChange={(e) => { setCustomerSearch(e.target.value); setCustomerHighlight(0); }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setCustomerDropdown(false);
                      } else if (e.key === "ArrowDown") {
                        e.preventDefault();
                        setCustomerHighlight((h) =>
                          filteredCustomers.length === 0 ? 0 : (h + 1) % filteredCustomers.length,
                        );
                      } else if (e.key === "ArrowUp") {
                        e.preventDefault();
                        setCustomerHighlight((h) =>
                          filteredCustomers.length === 0
                            ? 0
                            : (h - 1 + filteredCustomers.length) % filteredCustomers.length,
                        );
                      } else if (e.key === "Enter") {
                        e.preventDefault();
                        const pick = filteredCustomers[customerHighlight] ?? filteredCustomers[0];
                        if (pick) {
                          setSelectedCustomer(pick);
                          setCustomerDropdown(false);
                          setCustomerSearch("");
                        }
                      }
                    }}
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto py-1">
                {filteredCustomers.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-muted-foreground">Nenhum cliente encontrado</p>
                ) : (
                  filteredCustomers.map((c, i) => {
                    const lim = Number(c.credit_limit ?? 0);
                    const active = i === customerHighlight;
                    return (
                      <button
                        key={c.id}
                        data-testid={`pdv-customer-option-${c.id}`}
                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors ${
                          active ? "bg-muted" : "hover:bg-muted/60"
                        }`}
                        onMouseEnter={() => setCustomerHighlight(i)}
                        onClick={() => {
                          setSelectedCustomer(c);
                          setCustomerDropdown(false);
                          setCustomerSearch("");
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{c.name}</span>
                          {c.phone && (
                            <span className="block truncate text-xs text-muted-foreground">{c.phone}</span>
                          )}
                        </div>
                        {lim > 0 ? (
                          <span className="shrink-0 rounded-md border border-rose-500/30 bg-rose-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-rose-600 dark:text-rose-300">
                            <BookOpen className="mr-0.5 inline h-2.5 w-2.5" />
                            {fmtBRL(lim)}
                          </span>
                        ) : null}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="flex items-center justify-between border-t border-border p-2 text-[10px] text-muted-foreground">
                <span className="px-1">↑↓ navegar · Enter selecionar</span>
                <button
                  className="rounded px-2 py-1 hover:bg-muted hover:text-foreground"
                  onClick={() => setCustomerDropdown(false)}
                >
                  Esc para fechar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Cart items */}
        <ScrollArea className="min-h-0 flex-1 [&>[data-radix-scroll-area-viewport]>div]:!block [&>[data-radix-scroll-area-viewport]>div]:w-full">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center gap-3 p-12 text-center">
              <div className="rounded-full bg-muted p-5">
                <ShoppingCart className="h-8 w-8 text-muted-foreground opacity-30" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">Carrinho vazio</p>
              <p className="text-xs text-muted-foreground opacity-60 md:hidden">Toque nos produtos para adicionar</p>
              <p className="hidden text-xs text-muted-foreground opacity-60 md:block">Clique nos produtos ao lado para adicionar</p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {cart.map((item) => (
                <div key={item.lineId} className="bg-background px-5 py-3">
                  {/* Item name + remove */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{item.name}</p>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="font-mono">{fmtBRL(item.unitPrice)}</span>
                        <span>/</span>
                        <span>{item.stock_unit}</span>
                        {item.isPromotion && (
                          <span className="rounded bg-destructive/10 px-1 py-0.5 text-[10px] font-semibold text-destructive">promo</span>
                        )}
                      </div>
                      {item.addons.length > 0 && (
                        <p
                          className="mt-0.5 text-[11px] text-muted-foreground"
                          data-testid={`pdv-item-addons-${item.lineId}`}
                        >
                          + {item.addons.map((a) => a.name).join(", ")}
                        </p>
                      )}
                      {item.notes && item.notes.trim().length > 0 && (
                        <p
                          className="mt-0.5 text-[11px] italic text-muted-foreground"
                          data-testid={`pdv-item-notes-${item.lineId}`}
                        >
                          Obs: {item.notes}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.lineId)}
                      className="shrink-0 rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      data-testid={`pdv-remove-${item.lineId}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Qty + discount + subtotal */}
                  <div className="mt-2.5 flex items-center justify-between gap-2">
                    {/* Quantity controls */}
                    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/30 p-0.5">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-md"
                        data-testid={`pdv-minus-${item.lineId}`}
                        onClick={() => updateQuantity(item.lineId, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>

                      {editingQtyId === item.lineId ? (
                        INTEGER_UNITS.includes(item.stock_unit) ? (
                          <input
                            autoFocus
                            inputMode="numeric"
                            className="w-14 bg-transparent text-center text-sm font-mono font-bold focus:outline-none"
                            value={editingQtyVal}
                            onChange={(e) => setEditingQtyVal(e.target.value.replace(/\D/g, ""))}
                            onBlur={() => applyQty(item.lineId, editingQtyVal, item.stock_unit)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") applyQty(item.lineId, editingQtyVal, item.stock_unit);
                              if (e.key === "Escape") setEditingQtyId(null);
                            }}
                          />
                        ) : (
                          <input
                            autoFocus
                            inputMode="numeric"
                            className="w-20 bg-transparent text-center text-sm font-mono font-bold focus:outline-none"
                            value={editingQtyVal}
                            onChange={() => {}}
                            onKeyDown={(e) => {
                              if (e.key >= "0" && e.key <= "9") {
                                e.preventDefault();
                                const d = parseInt(editingQtyVal.replace(/\D/g, "") || "0", 10);
                                setEditingQtyVal(formatQty3(d * 10 + parseInt(e.key, 10)));
                              } else if (e.key === "Backspace") {
                                e.preventDefault();
                                const d = parseInt(editingQtyVal.replace(/\D/g, "") || "0", 10);
                                setEditingQtyVal(formatQty3(Math.floor(d / 10)));
                              } else if (e.key === "Delete") {
                                e.preventDefault();
                                setEditingQtyVal("0,000");
                              } else if (e.key === "Enter") {
                                applyQty(item.lineId, editingQtyVal, item.stock_unit);
                              } else if (e.key === "Escape") {
                                setEditingQtyId(null);
                              }
                            }}
                            onBlur={() => applyQty(item.lineId, editingQtyVal, item.stock_unit)}
                          />
                        )
                      ) : (
                        <button
                          className="min-w-[2rem] px-1 text-center text-sm font-mono font-bold tabular-nums hover:text-primary"
                          title="Clique para editar quantidade"
                          data-testid={`pdv-qty-${item.lineId}`}
                          onClick={() => {
                            setEditingQtyId(item.lineId);
                            setEditingQtyVal(initQtyVal(item.quantity, item.stock_unit));
                          }}
                        >
                          {fmtQtyDisplay(item.quantity, item.stock_unit)}
                        </button>
                      )}

                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 rounded-md"
                        data-testid={`pdv-plus-${item.lineId}`}
                        onClick={() => updateQuantity(item.lineId, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>

                    {/* Discount + subtotal */}
                    <div className="flex items-center gap-3">
                      {editingItemId === item.lineId ? (
                        <div className="flex items-center gap-1">
                          <span className="text-[11px] text-muted-foreground">-R$</span>
                          <MoneyInput
                            className="w-16 rounded border border-border bg-background px-1.5 py-0.5 text-right text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                            value={editingDiscountVal}
                            onChange={setEditingDiscountVal}
                            onBlur={() => { applyItemDiscount(item.lineId, editingDiscountVal); setEditingItemId(null); }}
                            onConfirm={() => { applyItemDiscount(item.lineId, editingDiscountVal); setEditingItemId(null); }}
                            onCancel={() => setEditingItemId(null)}
                            autoFocus
                          />
                        </div>
                      ) : (
                        <button
                          onClick={() => {
                            setEditingItemId(item.lineId);
                            setEditingDiscountVal(item.itemDiscount > 0 ? fromCents(Math.round(item.itemDiscount * 100)) : "0,00");
                          }}
                          className={`rounded px-1.5 py-0.5 text-xs transition-colors ${
                            item.itemDiscount > 0
                              ? "bg-orange-50 font-semibold text-orange-600 dark:bg-orange-950/30"
                              : "text-muted-foreground hover:bg-muted hover:text-foreground"
                          }`}
                          data-testid={`pdv-item-discount-${item.lineId}`}
                          title="Desconto no item"
                        >
                          {item.itemDiscount > 0 ? `-${fmtBRL(item.itemDiscount)}` : "desc."}
                        </button>
                      )}
                      <span className="min-w-[64px] text-right text-sm font-bold tabular-nums">
                        {fmtBRL(itemSubtotal(item))}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>

        {/* ── Footer ── */}
        {cart.length > 0 && (
          <div className="shrink-0 border-t border-border bg-background">

            {/* Totals */}
            <div className="space-y-1.5 px-5 py-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-mono">{fmtBRL(cartSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Desconto</span>
                <div className="flex items-center gap-1.5">
                  <MoneyInput
                    className="w-24 rounded-lg border border-border bg-muted/30 px-2 py-1 text-right text-xs font-mono focus:outline-none focus:ring-2 focus:ring-primary/30"
                    value={orderDiscount}
                    onChange={setOrderDiscount}
                    data-testid="pdv-order-discount"
                  />
                </div>
              </div>
              <Separator className="my-1" />
              <div className="flex justify-between">
                <span className="text-base font-bold">Total</span>
                <span className="font-mono text-xl font-bold text-primary">{fmtBRL(grandTotal)}</span>
              </div>
            </div>

            {/* Payment method */}
            <div className="px-5 pb-3">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Pagamento
              </p>
              <div
                className="grid gap-1.5"
                style={{ gridTemplateColumns: `repeat(${Math.max(enabledPaymentMethods.length, 1)}, minmax(0, 1fr))` }}
              >
                {enabledPaymentMethods.map(({ value, label, icon: Icon }) => {
                  const disabled = value === "cash" && !openSession;
                  return (
                    <button
                      key={value}
                      data-testid={`pdv-payment-${value}`}
                      onClick={() => !disabled && setPaymentMethod(value)}
                      disabled={disabled}
                      title={disabled ? "Abra o caixa para vender em dinheiro" : undefined}
                      className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-[10px] font-semibold transition-all ${
                        disabled
                          ? "cursor-not-allowed border-dashed border-border/60 bg-muted/20 text-muted-foreground/50"
                          : paymentMethod === value
                          ? "border-primary bg-primary text-primary-foreground shadow-sm"
                          : "border-border bg-muted/30 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>

              {paymentMethod === "cash" && !openSession && (
                <div
                  className="mt-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-warning"
                  data-testid="pdv-cash-blocked"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1 text-xs leading-relaxed">
                    <p className="font-semibold">Caixa fechado</p>
                    <p className="text-warning/80">
                      Para finalizar vendas em dinheiro, abra o caixa primeiro.{" "}
                      <Link
                        to="/caixa"
                        onClick={(e) => e.stopPropagation()}
                        className="underline underline-offset-2 hover:text-warning"
                        data-testid="link-pdv-abrir-caixa"
                      >
                        Ir para o caixa
                      </Link>
                    </p>
                  </div>
                </div>
              )}

              {/* Cash received / troco */}
              {paymentMethod === "cash" && (
                <div className="mt-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Valor recebido</Label>
                    <MoneyInput
                      className={`w-28 rounded-lg border border-border bg-muted/30 px-2 py-1.5 text-right text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                        !openSession ? "cursor-not-allowed opacity-50" : ""
                      }`}
                      value={cashReceived}
                      onChange={setCashReceived}
                      disabled={!openSession}
                      data-testid="pdv-cash-received"
                    />
                  </div>
                  {cashReceivedAmt > 0 && cashReceivedAmt < grandTotal ? (
                    <div
                      className="flex items-center justify-between rounded-xl bg-destructive/10 px-4 py-2.5 text-destructive"
                      data-testid="pdv-falta"
                    >
                      <span className="text-sm font-semibold">Valor insuficiente — falta</span>
                      <span className="font-mono text-base font-bold">{fmtBRL(grandTotal - cashReceivedAmt)}</span>
                    </div>
                  ) : cashReceivedAmt > 0 ? (
                    <div className="flex items-center justify-between rounded-xl bg-success/10 px-4 py-2.5 text-success">
                      <span className="text-sm font-semibold">Troco</span>
                      <span className="font-mono text-base font-bold">{fmtBRL(change)}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {paymentMethod === "mixed" && (
                <MixedPaymentEditor
                  splits={mixedSplits}
                  setSplits={setMixedSplits}
                  total={grandTotal}
                  openSession={!!openSession}
                />
              )}
            </div>

            {/* Finalize */}
            <div className="px-5 pb-5">
              <Button
                className="h-12 w-full text-base font-bold shadow-sm"
                size="lg"
                onClick={() => finalizeSale()}
                disabled={
                  isSaving ||
                  cart.length === 0 ||
                  (paymentMethod === "cash" && !openSession) ||
                  (paymentMethod === "mixed" &&
                    Math.abs(splitsTotal(mixedSplits) - grandTotal) > 0.009)
                }
                data-testid="pdv-finalize"
              >
                {isSaving ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-5 w-5" />
                )}
                {isSaving ? "Salvando..." : `Finalizar  •  ${fmtBRL(grandTotal)}`}
              </Button>
            </div>
          </div>
        )}
      </div>

      <PixConfirmDialog
        open={pixConfirmOpen}
        onOpenChange={setPixConfirmOpen}
        pixKey={pixBank?.pix_key ?? null}
        pixKeyType={pixBank?.pix_key_type ?? null}
        merchantName={activeCompany?.name ?? "RECEBEDOR"}
        amount={grandTotal}
        isProcessing={isSaving}
        onConfirm={async () => {
          await finalizeSale({ pixConfirmed: true });
          setPixConfirmOpen(false);
        }}
      />

      {/* Camera barcode scanner */}
      <BarcodeScanner
        open={scannerOpen}
        onClose={() => setScannerOpen(false)}
        onResult={(result) => {
          setScannerOpen(false);
          addToCartByBarcode(result.barcode);
        }}
      />

      <Dialog open={!!pendingReceipt} onOpenChange={(o) => { if (!o) setPendingReceipt(null); }}>
        <DialogContent
          data-testid="dialog-print-receipt"
          onKeyDown={async (e) => {
            if (printing) return;
            if (e.key === "Enter" || e.key === "y" || e.key === "Y" || e.key === "s" || e.key === "S") {
              e.preventDefault();
              if (!pendingReceipt) return;
              setPrinting(true);
              try {
                await printReceipt(pendingReceipt);
                setPendingReceipt(null);
              } catch (err: any) {
                toast.error(`Falha ao imprimir: ${err?.message ?? "erro desconhecido"}`);
              } finally {
                setPrinting(false);
              }
            } else if (e.key === "n" || e.key === "N") {
              e.preventDefault();
              setPendingReceipt(null);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Imprimir cupom?</DialogTitle>
            <DialogDescription>
              A venda foi finalizada. Deseja imprimir o cupom não fiscal para o cliente?
              <span className="hidden md:inline">
                <br />
                Pressione <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">Enter</kbd> para imprimir
                ou <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">Esc</kbd> para pular.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setPendingReceipt(null)}
              data-testid="button-skip-print"
            >
              Não imprimir<span className="hidden md:inline"> (N)</span>
            </Button>
            <Button
              autoFocus
              onClick={async () => {
                if (!pendingReceipt) return;
                setPrinting(true);
                try {
                  await printReceipt(pendingReceipt);
                  setPendingReceipt(null);
                } catch (e: any) {
                  toast.error(`Falha ao imprimir: ${e?.message ?? "erro desconhecido"}`);
                } finally {
                  setPrinting(false);
                }
              }}
              disabled={printing}
              data-testid="button-confirm-print"
            >
              {printing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
              Imprimir cupom<span className="hidden md:inline"> (Enter)</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Prep modal (adicionais + observações) ── */}
      <Dialog open={!!prepProduct} onOpenChange={(o) => !o && setPrepProduct(null)}>
        <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-md overflow-y-auto p-4 sm:p-6" data-testid="dialog-pdv-prep">
          <DialogHeader>
            <DialogTitle className="truncate">{prepProduct?.name}</DialogTitle>
            <DialogDescription>
              Selecione os adicionais e adicione uma observação.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-1">
            {prepLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {prepAddons.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Adicionais</p>
                    <div className="space-y-1.5 rounded-lg border border-border p-2">
                      {prepAddons.map((a) => {
                        const checked = prepSelected.has(a.id);
                        return (
                          <label
                            key={a.id}
                            data-testid={`label-pdv-prep-addon-${a.id}`}
                            className="flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                          >
                            <div className="flex min-w-0 items-center gap-2">
                              <input
                                type="checkbox"
                                data-testid={`checkbox-pdv-prep-addon-${a.id}`}
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
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Nenhum adicional cadastrado para este produto.
                  </p>
                )}

                <div className="space-y-2">
                  <Label htmlFor="pdv-prep-notes" className="text-sm font-medium">
                    Observações
                  </Label>
                  <Textarea
                    id="pdv-prep-notes"
                    data-testid="input-pdv-prep-notes"
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
                        ((prepProduct.is_promotion && prepProduct.promotion_price != null
                          ? prepProduct.promotion_price
                          : prepProduct.sale_price) +
                          prepAddons
                            .filter((a) => prepSelected.has(a.id))
                            .reduce((s, a) => s + Number(a.price), 0)),
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
              data-testid="button-pdv-prep-cancel"
            >
              Cancelar
            </Button>
            <Button
              data-testid="button-pdv-prep-confirm"
              disabled={prepLoading}
              onClick={confirmPrep}
              className="w-full sm:w-auto"
            >
              Adicionar ao carrinho
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PdvShortcutsHelp open={shortcutsOpen} onOpenChange={setShortcutsOpen} context="pdv" />

      <Dialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <DialogContent
          className="max-w-sm"
          data-testid="dialog-clear-cart"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "y" || e.key === "Y" || e.key === "s" || e.key === "S") {
              e.preventDefault();
              clearCart();
              setClearConfirmOpen(false);
            } else if (e.key === "n" || e.key === "N") {
              e.preventDefault();
              setClearConfirmOpen(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Limpar carrinho?</DialogTitle>
            <DialogDescription>
              Os {cart.length} {cart.length === 1 ? "item" : "itens"} serão removidos.
              <span className="hidden md:inline">
                {" "}Pressione <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">Enter</kbd> para confirmar
                ou <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">Esc</kbd> para cancelar.
              </span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setClearConfirmOpen(false)}
              data-testid="button-cancel-clear-cart"
            >
              Cancelar<span className="hidden md:inline"> (N)</span>
            </Button>
            <Button
              variant="destructive"
              autoFocus
              onClick={() => {
                clearCart();
                setClearConfirmOpen(false);
              }}
              data-testid="button-confirm-clear-cart"
            >
              Limpar<span className="hidden md:inline"> (Enter)</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
