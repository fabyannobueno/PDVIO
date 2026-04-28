import { useMemo, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchQuotes, getCachedQuotes, type CurrencyQuote } from "@/lib/awesomeApiQuotes";
import { geocodeCity, fetchCurrentWeather, getCachedGeo, getCachedWeather, type CurrentWeather } from "@/lib/openMeteo";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
import {
  ShoppingCart,
  Package,
  Users,
  TrendingUp,
  ArrowRight,
  ClipboardList,
  Wallet,
  BarChart3,
  CheckCircle2,
  Circle,
  Receipt,
  Banknote,
  BookOpen,
  CreditCard,
  QrCode,
  Ticket,
  ArrowDownRight,
  ArrowUpRight,
  Droplets,
  Wind,
  CloudRain,
  DollarSign,
  Euro,
  type LucideIcon,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Sale {
  id: string;
  total: number;
  payment_method: string;
  status: string;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const businessLabels: Record<string, string> = {
  restaurant: "Restaurante",
  snack_bar: "Lanchonete",
  market: "Mercado",
  distributor: "Distribuidora",
  delivery: "Delivery",
  retail: "Loja física",
  other: "Outro",
};

const PAYMENT_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  cash: { label: "Dinheiro", icon: Banknote, color: "text-emerald-500" },
  credit_card: { label: "Crédito", icon: CreditCard, color: "text-blue-500" },
  debit_card: { label: "Débito", icon: CreditCard, color: "text-violet-500" },
  pix: { label: "PIX", icon: QrCode, color: "text-primary" },
  ticket: { label: "Ticket", icon: Ticket, color: "text-orange-500" },
  crediario: { label: "Crediário", icon: BookOpen, color: "text-rose-500" },
  mixed: { label: "Misto", icon: Wallet, color: "text-amber-500" },
};

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

const quickLinks = [
  { title: "Abrir PDV", desc: "Comece a vender agora", icon: ShoppingCart, to: "/pdv", primary: true },
  { title: "Cadastrar produtos", desc: "Com cálculo automático de margem", icon: Package, to: "/produtos" },
  { title: "Clientes", desc: "Cadastro de clientes", icon: Users, to: "/clientes" },
  { title: "Ver relatórios", desc: "Vendas, lucro e CMV", icon: BarChart3, to: "/relatorios" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const navigate = useNavigate();
  const cid = activeCompany?.id;

  const firstName = (user?.user_metadata?.full_name || "").split(" ")[0];
  const { start, end } = useMemo(() => todayRange(), []);

  // Sales today
  const { data: todaySales = [], isLoading: loadingSales } = useQuery<Sale[]>({
    queryKey: ["/dashboard/sales-today", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, payment_method, status, created_at")
        .eq("company_id", cid!)
        .eq("status", "completed")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Recent sales (last 5)
  const { data: recentSales = [], isLoading: loadingRecent } = useQuery<Sale[]>({
    queryKey: ["/dashboard/recent-sales", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, total, payment_method, status, created_at")
        .eq("company_id", cid!)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Refunds for today's sales
  const todaySaleIds = useMemo(() => todaySales.map((s) => s.id), [todaySales]);
  const { data: todayRefunds = [] } = useQuery<{ sale_id: string; amount: number }[]>({
    queryKey: ["/dashboard/refunds-today", todaySaleIds],
    enabled: todaySaleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("sale_id, amount")
        .in("sale_id", todaySaleIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Refunds for recent sales
  const recentSaleIds = useMemo(() => recentSales.map((s) => s.id), [recentSales]);
  const { data: recentRefunds = [] } = useQuery<{ sale_id: string; amount: number }[]>({
    queryKey: ["/dashboard/refunds-recent", recentSaleIds],
    enabled: recentSaleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("refunds")
        .select("sale_id, amount")
        .in("sale_id", recentSaleIds);
      if (error) throw error;
      return data ?? [];
    },
  });

  const refundsByRecentSaleId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of recentRefunds) {
      map[r.sale_id] = (map[r.sale_id] ?? 0) + Number(r.amount);
    }
    return map;
  }, [recentRefunds]);

  const totalRefundedHoje = useMemo(
    () => todayRefunds.reduce((s, r) => s + Number(r.amount), 0),
    [todayRefunds]
  );

  // Customer count
  const { data: customerCount = 0, isLoading: loadingCustomers } = useQuery<number>({
    queryKey: ["/dashboard/customer-count", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("customers")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Product count (for onboarding)
  const { data: productCount = 0, isLoading: loadingProducts } = useQuery<number>({
    queryKey: ["/dashboard/product-count", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("products")
        .select("id", { count: "exact", head: true })
        .eq("company_id", cid!);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // Computed stats
  const totalHojeBruto = todaySales.reduce((s, v) => s + Number(v.total), 0);
  const totalHoje = totalHojeBruto - totalRefundedHoje;
  const pedidosHoje = todaySales.length;
  const ticketMedio = pedidosHoje > 0 ? totalHoje / pedidosHoje : 0;
  const hasAnySale = recentSales.length > 0;

  const stats = [
    {
      label: "Vendas hoje",
      value: loadingSales ? null : fmtBRL(totalHoje),
      icon: ShoppingCart,
      tone: "text-primary",
    },
    {
      label: "Pedidos hoje",
      value: loadingSales ? null : String(pedidosHoje),
      icon: ClipboardList,
      tone: "text-primary",
    },
    {
      label: "Clientes",
      value: loadingCustomers ? null : String(customerCount),
      icon: Users,
      tone: "text-primary",
    },
    {
      label: "Ticket médio",
      value: loadingSales ? null : fmtBRL(ticketMedio),
      icon: TrendingUp,
      tone: "text-primary",
    },
  ];

  const onboardingSteps = [
    { label: "Criar empresa", done: true },
    { label: "Cadastrar primeiros produtos", done: productCount > 0 },
    { label: "Registrar primeira venda", done: hasAnySale },
  ];

  const allStepsDone = onboardingSteps.every((s) => s.done);
  const onboardingLoading = loadingProducts || loadingRecent || loadingSales;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 p-6 md:p-8 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-subtle p-8">
        <div className="absolute -right-24 -top-24 h-64 w-64 rounded-full bg-gradient-primary opacity-10 blur-3xl" />
        <div className="relative">
          <p className="text-sm font-medium text-muted-foreground">
            Olá{firstName ? `, ${firstName}` : ""} 👋
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            {activeCompany?.name}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {activeCompany && businessLabels[activeCompany.business_type]} · Sistema pronto para começar
          </p>
        </div>
      </div>

      {/* Cotações + tempo */}
      <ExtrasRow companyId={cid ?? null} />

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                    {s.label}
                  </p>
                  {s.value === null ? (
                    <Skeleton className="mt-2 h-8 w-24" />
                  ) : (
                    <p className="mt-2 text-2xl font-bold" data-testid={`stat-${s.label}`}>
                      {s.value}
                    </p>
                  )}
                </div>
                <div className={`rounded-lg bg-muted p-2 ${s.tone}`}>
                  <s.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className={`grid gap-6 ${!allStepsDone ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>
        {/* Quick actions */}
        <div className={`${!allStepsDone ? "lg:col-span-2" : ""} space-y-6`}>
          <div>
            <h2 className="mb-4 text-lg font-semibold">Atalhos rápidos</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {quickLinks.map((l) => (
                <button
                  key={l.to}
                  onClick={() => navigate(l.to)}
                  className={`group flex items-start gap-4 rounded-xl border p-4 text-left transition-all hover:shadow-elev-md ${
                    l.primary
                      ? "border-primary/40 bg-gradient-primary/5 hover:border-primary"
                      : "border-border bg-card hover:border-primary/40"
                  }`}
                >
                  <div
                    className={`rounded-lg p-2.5 ${
                      l.primary ? "bg-gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-foreground"
                    }`}
                  >
                    <l.icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold">{l.title}</p>
                    <p className="text-sm text-muted-foreground">{l.desc}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>

          {/* Recent sales */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Vendas recentes</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate("/vendas")}
                data-testid="button-ver-todas-vendas"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Ver todos
              </Button>
            </div>
            <Card className="border-border/60">
              <CardContent className="p-0">
                {loadingRecent ? (
                  <div className="space-y-3 p-4">
                    {[...Array(4)].map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : recentSales.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 p-10 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <Wallet className="h-6 w-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium">Nenhuma venda registrada</p>
                    <p className="text-xs text-muted-foreground">
                      Abra o PDV para registrar sua primeira venda
                    </p>
                    <Button size="sm" onClick={() => navigate("/pdv")} className="mt-1">
                      <ShoppingCart className="mr-2 h-4 w-4" />
                      Abrir PDV
                    </Button>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {recentSales.map((sale) => {
                      const date = new Date(sale.created_at);
                      const isToday =
                        date.toDateString() === new Date().toDateString();
                      const label = isToday
                        ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
                        : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
                          " " +
                          date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      const cfg = PAYMENT_CONFIG[sale.payment_method] ?? {
                        label: sale.payment_method,
                        icon: Receipt,
                        color: "text-muted-foreground",
                      };
                      const Icon = cfg.icon;
                      return (
                        <div
                          key={sale.id}
                          className="flex items-center justify-between px-4 py-3"
                          data-testid={`sale-row-${sale.id}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="rounded-lg bg-muted p-2">
                              <Icon className={`h-4 w-4 ${cfg.color}`} />
                            </div>
                            <div>
                              <p className="text-sm font-medium">{cfg.label}</p>
                              <p className="text-xs text-muted-foreground">{label}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {refundsByRecentSaleId[sale.id] > 0 && (
                              <span className="text-xs text-muted-foreground line-through hidden sm:inline">
                                {fmtBRL(Number(sale.total))}
                              </span>
                            )}
                            <Badge variant="secondary" className="font-mono text-xs">
                              {fmtBRL(Number(sale.total) - (refundsByRecentSaleId[sale.id] ?? 0))}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Onboarding checklist — hidden while loading and once all steps are done */}
        {!onboardingLoading && !allStepsDone && (
          <Card className="border-border/60 self-start">
            <CardHeader>
              <CardTitle className="text-base">Primeiros passos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {onboardingSteps.map((s) => (
                <div key={s.label} className="flex items-center gap-3">
                  {s.done ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={`text-sm ${s.done ? "text-muted-foreground line-through" : "font-medium"}`}
                  >
                    {s.label}
                  </span>
                </div>
              ))}
              <Button
                variant="outline"
                className="mt-4 w-full"
                onClick={() => navigate(productCount === 0 ? "/produtos" : "/pdv")}
              >
                {productCount === 0 ? "Cadastrar produtos" : "Abrir PDV"}
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

// ── ExtrasRow: cotações + tempo ───────────────────────────────────────────────

function ExtrasRow({ companyId }: { companyId: string | null }) {
  const [quotes, setQuotes] = useState<CurrencyQuote[] | null>(() => getCachedQuotes());
  const [quotesError, setQuotesError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchQuotes()
      .then((q) => { if (!cancelled) setQuotes(q); })
      .catch(() => { if (!cancelled && !getCachedQuotes()) setQuotesError(true); });
    const id = setInterval(() => {
      fetchQuotes().then((q) => { if (!cancelled) setQuotes(q); }).catch(() => {});
    }, 5 * 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const { data: address } = useQuery({
    queryKey: ["/dashboard/company-address", companyId],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("address")
        .eq("id", companyId!)
        .maybeSingle();
      if (error) throw error;
      try {
        const a = JSON.parse((data as any)?.address ?? "null") as { cidade?: string; estado?: string } | null;
        return a;
      } catch { return null; }
    },
  });

  const [weather, setWeather] = useState<{ city: string; data: CurrentWeather } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const city = address?.cidade?.trim() ?? "";
    const state = address?.estado?.trim() ?? "";
    if (!city) { setWeather(null); return; }
    const cachedGeo = getCachedGeo(city, state);
    if (cachedGeo) {
      const cachedW = getCachedWeather(cachedGeo);
      if (cachedW) setWeather({ city: cachedGeo.name, data: cachedW });
    }
    (async () => {
      const geo = cachedGeo ?? (await geocodeCity(city, state));
      if (!geo) { if (!cancelled) setWeather(null); return; }
      const w = await fetchCurrentWeather(geo);
      if (!cancelled && w) setWeather({ city: geo.name, data: w });
    })();
    return () => { cancelled = true; };
  }, [address?.cidade, address?.estado]);

  const usd = quotes?.find((q) => q.code === "USD");
  const eur = quotes?.find((q) => q.code === "EUR");

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <QuoteCard label="Dólar (USD)" quote={usd} loading={!quotes && !quotesError} icon={DollarSign} />
      <QuoteCard label="Euro (EUR)" quote={eur} loading={!quotes && !quotesError} icon={Euro} />
      <WeatherCard data={weather} hasCity={!!address?.cidade} />
    </div>
  );
}

function QuoteCard({ label, quote, loading, icon: Icon = Banknote }: { label: string; quote?: CurrencyQuote; loading: boolean; icon?: LucideIcon }) {
  const positive = (quote?.pctChange ?? 0) >= 0;
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <Icon className="h-6 w-6" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
          {loading ? (
            <Skeleton className="mt-1.5 h-7 w-28" />
          ) : quote ? (
            <>
              <p className="text-2xl font-bold tabular-nums" data-testid={`quote-${quote.code}`}>
                {quote.bid.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </p>
              <p className={`mt-0.5 flex items-center gap-1 text-xs ${positive ? "text-success" : "text-destructive"}`}>
                {positive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {quote.pctChange.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}% hoje
              </p>
            </>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">Sem dados.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function WeatherCard({ data, hasCity }: { data: { city: string; data: CurrentWeather } | null; hasCity: boolean }) {
  return (
    <Card className="border-border/60">
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-2xl">
          {data?.data.icon ?? "🌡️"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Tempo {data?.city ? `em ${data.city}` : ""}
          </p>
          {!hasCity ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Cadastre o endereço da empresa para ver o tempo.
            </p>
          ) : !data ? (
            <Skeleton className="mt-1.5 h-7 w-28" />
          ) : (
            <>
              <p className="text-2xl font-bold tabular-nums" data-testid="weather-temp">
                {Math.round(data.data.temperature)}°C
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                <span>{data.data.description}</span>
                <span className="flex items-center gap-1"><Droplets className="h-3 w-3" />{data.data.humidity}%</span>
                <span className="flex items-center gap-1"><Wind className="h-3 w-3" />{Math.round(data.data.windKmh)} km/h</span>
                <span className="flex items-center gap-1"><CloudRain className="h-3 w-3" />{data.data.precipitationProb}%</span>
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
