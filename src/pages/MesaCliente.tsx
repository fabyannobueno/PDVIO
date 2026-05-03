/**
 * Página pública para o cliente escanear o QR Code da mesa.
 * Rota: /mesa/:companyId/:tableLabel
 * Sem autenticação — usa chave anônima do Supabase.
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { CheckCircle2, Loader2, UtensilsCrossed, Search } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
}

interface Product {
  id: string;
  name: string;
  sale_price: number;
  is_promotion: boolean;
  promotion_price: number | null;
  stock_unit: string;
  is_active: boolean;
}

type Step = "name" | "menu";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function productPrice(p: Product) {
  return p.is_promotion && p.promotion_price != null ? p.promotion_price : p.sale_price;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MesaCliente() {
  const { companyId, tableLabel } = useParams<{ companyId: string; tableLabel: string }>();
  const decodedTable = decodeURIComponent(tableLabel ?? "");

  const [step, setStep] = useState<Step>("name");
  const [customerName, setCustomerName] = useState("");
  const [creating, setCreating] = useState(false);
  const [comandaId, setComandaId] = useState<string | null>(null);

  const [company, setCompany] = useState<Company | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingCompany, setLoadingCompany] = useState(true);
  const [search, setSearch] = useState("");
  const [notFound, setNotFound] = useState(false);

  // Load company + products
  useEffect(() => {
    if (!companyId) return;
    setLoadingCompany(true);

    Promise.all([
      supabase
        .from("companies")
        .select("id, name, logo_url")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("products")
        .select("id, name, sale_price, is_promotion, promotion_price, stock_unit, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("name"),
    ]).then(([compRes, prodRes]) => {
      if (!compRes.data) {
        setNotFound(true);
      } else {
        setCompany(compRes.data as Company);
        setProducts((prodRes.data ?? []) as Product[]);
      }
      setLoadingCompany(false);
    });
  }, [companyId]);

  async function handleEnter() {
    const name = customerName.trim();
    if (!name) {
      toast.error("Por favor, informe seu nome");
      return;
    }
    if (!companyId) return;
    setCreating(true);
    try {
      // Check if a comanda is already open for this table
      const { data: existing } = await supabase
        .from("comandas")
        .select("id")
        .eq("company_id", companyId)
        .eq("identifier", decodedTable)
        .eq("status", "open")
        .maybeSingle();

      if (existing) {
        // Comanda already open for this table — just proceed to menu
        setComandaId(existing.id);
        setStep("menu");
        return;
      }

      // Create new comanda
      const { data, error } = await supabase
        .from("comandas")
        .insert({
          company_id: companyId,
          identifier: decodedTable,
          notes: name,
        } as never)
        .select("id")
        .single();
      if (error) throw error;
      setComandaId((data as any).id);
      setStep("menu");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao abrir comanda. Chame o atendente.");
    } finally {
      setCreating(false);
    }
  }

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Render: loading ─────────────────────────────────────────────────────────

  if (loadingCompany) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 bg-background">
        <Skeleton className="h-16 w-16 rounded-full" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
    );
  }

  if (notFound || !company) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-8 text-center bg-background">
        <UtensilsCrossed className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-xl font-bold">Estabelecimento não encontrado</h1>
        <p className="text-sm text-muted-foreground">
          Este QR Code não está mais ativo. Chame o atendente.
        </p>
      </div>
    );
  }

  // ── Render: step "name" ─────────────────────────────────────────────────────

  if (step === "name") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-8">
          {/* Company header */}
          <div className="flex flex-col items-center gap-3 text-center">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="h-20 w-20 rounded-2xl object-cover shadow-md"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-4xl font-bold text-primary-foreground shadow-md">
                {company.name.charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold">{company.name}</h1>
              <Badge variant="secondary" className="mt-1 text-sm">
                {decodedTable}
              </Badge>
            </div>
          </div>

          {/* Name form */}
          <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Bem-vindo(a)!</h2>
              <p className="text-sm text-muted-foreground">
                Informe seu nome para abrir a comanda.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="customer-name">Seu nome</Label>
              <Input
                id="customer-name"
                placeholder="Ex: João"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleEnter()}
                autoFocus
                className="text-base"
              />
            </div>
            <Button
              className="w-full"
              size="lg"
              onClick={handleEnter}
              disabled={creating || !customerName.trim()}
            >
              {creating ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Entrar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: step "menu" ─────────────────────────────────────────────────────

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-4 py-3">
        <div className="flex items-center gap-3">
          {company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="h-9 w-9 rounded-lg object-cover"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">
              {company.name.charAt(0)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{company.name}</p>
            <p className="text-xs text-muted-foreground">{decodedTable} · {customerName}</p>
          </div>
          <Badge className="shrink-0 bg-green-500/15 text-green-700 dark:text-green-400">
            Comanda aberta
          </Badge>
        </div>
      </div>

      {/* Success banner */}
      <div className="flex items-center gap-3 bg-green-500/10 border-b border-green-500/20 px-4 py-3">
        <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
        <p className="text-sm text-green-700 dark:text-green-400">
          Comanda aberta com sucesso! Chame o atendente para fazer seu pedido.
        </p>
      </div>

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar no cardápio…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Menu */}
      <ScrollArea className="flex-1">
        <div className="px-4 pb-8 pt-2">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <UtensilsCrossed className="h-10 w-10 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {search ? "Nenhum item encontrado" : "Cardápio indisponível no momento"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground px-1 pb-1">
                Cardápio — {filteredProducts.length} {filteredProducts.length === 1 ? "item" : "itens"}
              </p>
              {filteredProducts.map((p) => {
                const price = productPrice(p);
                return (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{p.name}</p>
                      {p.stock_unit !== "un" && (
                        <p className="text-xs text-muted-foreground">{p.stock_unit}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      {p.is_promotion && p.promotion_price != null ? (
                        <div>
                          <p className="text-xs text-muted-foreground line-through">
                            {fmtBRL(p.sale_price)}
                          </p>
                          <p className="font-bold text-primary">{fmtBRL(price)}</p>
                        </div>
                      ) : (
                        <p className="font-semibold">{fmtBRL(price)}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
