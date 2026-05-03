/**
 * Página pública para o cliente escanear o QR Code da mesa.
 * Rota: /mesa/:companyId/:tableLabel
 * Sem autenticação — usa chave anônima do Supabase.
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  CheckCircle2,
  Loader2,
  UtensilsCrossed,
  BellRing,
  ExternalLink,
  ConciergeBell,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  delivery_logo_url: string | null;
  delivery_primary_color: string | null;
  delivery_slug: string | null;
}

type Step = "loading" | "occupied" | "name" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

function hexToRgb(hex: string) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return "109 40 217";
  return m.map((x) => parseInt(x, 16)).join(" ");
}

function isLight(hex: string) {
  const m = hex.replace("#", "").match(/.{2}/g);
  if (!m) return false;
  const [r, g, b] = m.map((x) => parseInt(x, 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function MesaCliente() {
  const { companyId, tableLabel } = useParams<{ companyId: string; tableLabel: string }>();
  const decodedTable = decodeURIComponent(tableLabel ?? "");

  const [step, setStep] = useState<Step>("loading");
  const [customerName, setCustomerName] = useState("");
  const [creating, setCreating] = useState(false);
  const [garcomChamado, setGarcomChamado] = useState(false);
  const [comandaId, setComandaId] = useState<string | null>(null);
  const [company, setCompany] = useState<Company | null>(null);
  const [notFound, setNotFound] = useState(false);

  // ── Load company + check if table is already occupied ─────────────────────
  useEffect(() => {
    if (!companyId) return;
    Promise.all([
      supabase
        .from("companies")
        .select("id, name, logo_url, delivery_logo_url, delivery_primary_color, delivery_slug")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("comandas")
        .select("id")
        .eq("company_id", companyId)
        .eq("identifier", decodedTable)
        .eq("status", "open")
        .maybeSingle(),
    ]).then(([compRes, comandaRes]) => {
      if (!compRes.data) { setNotFound(true); return; }
      setCompany(compRes.data as Company);
      if (comandaRes.data) {
        setComandaId(comandaRes.data.id);
        setStep("occupied");
      } else {
        setStep("name");
      }
    });
  }, [companyId, decodedTable]);

  // ── Create comanda ─────────────────────────────────────────────────────────
  async function handleEnter() {
    const name = customerName.trim();
    if (!name) { toast.error("Por favor, informe seu nome"); return; }
    if (!companyId) return;
    setCreating(true);
    try {
      const { data: existing } = await supabase
        .from("comandas").select("id")
        .eq("company_id", companyId).eq("identifier", decodedTable).eq("status", "open")
        .maybeSingle();
      if (existing) { setStep("occupied"); return; }

      const { data: newComanda, error } = await supabase
        .from("comandas")
        .insert({ company_id: companyId, identifier: decodedTable, notes: name } as never)
        .select("id").single();
      if (error) throw error;
      setComandaId((newComanda as any)?.id ?? null);
      setStep("done");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao abrir comanda. Chame o atendente.");
    } finally {
      setCreating(false);
    }
  }

  async function handleChamarGarcom() {
    if (!companyId) return;
    setGarcomChamado(true);
    toast.success("Garçom chamado! Aguarde um momento.");
    try {
      await supabase.from("waiter_calls" as never).insert({
        company_id: companyId,
        table_label: decodedTable,
        comanda_id: comandaId ?? undefined,
      } as never);
    } catch {}
  }

  // ── Derived brand values ───────────────────────────────────────────────────
  const brandColor  = company?.delivery_primary_color || "#6d28d9";
  const logoUrl     = company?.delivery_logo_url || company?.logo_url || null;
  const onBrand     = isLight(brandColor) ? "#1a1a1a" : "#ffffff";
  const brandRgb    = hexToRgb(brandColor);

  const menuUrl = company?.delivery_slug
    ? `https://pdvio.shop/${company.delivery_slug}?mesa=${encodeURIComponent(decodedTable)}&empresa=${encodeURIComponent(companyId ?? "")}&modo=mesa`
    : null;

  // ── Shared brand header ────────────────────────────────────────────────────
  function BrandHeader({ status }: { status?: "occupied" | "done" }) {
    return (
      <div
        className="relative w-full overflow-hidden"
        style={{ background: brandColor }}
      >
        {/* dot grid */}
        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,0.15) 1.5px, transparent 1.5px)",
          backgroundSize: "20px 20px",
        }} />
        {/* vignette */}
        <div className="pointer-events-none absolute inset-0" style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.3) 100%)",
        }} />

        <div className="relative z-10 flex flex-col items-center gap-3 px-6 pb-8 pt-10 text-center">
          {/* logo */}
          <div className="h-20 w-20 rounded-2xl overflow-hidden shadow-xl ring-4 ring-white/20 flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.15)" }}>
            {logoUrl ? (
              <img src={logoUrl} alt={company?.name} className="h-full w-full object-cover" />
            ) : (
              <span className="text-4xl font-black" style={{ color: onBrand }}>
                {(company?.name ?? "L").charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          {/* name */}
          <div>
            <h1 className="text-2xl font-bold drop-shadow-sm" style={{ color: onBrand }}>
              {company?.name}
            </h1>
            {/* mesa pill */}
            <div className="mt-2 inline-flex items-center gap-1.5 rounded-full px-4 py-1"
              style={{ background: "rgba(255,255,255,0.18)", border: "1px solid rgba(255,255,255,0.35)" }}>
              <span className="text-sm font-semibold" style={{ color: onBrand }}>{decodedTable}</span>
            </div>
          </div>

          {/* status badge */}
          {status === "occupied" && (
            <div className="rounded-full bg-amber-400/90 px-3 py-0.5 text-xs font-bold text-amber-900">
              Mesa em atendimento
            </div>
          )}
          {status === "done" && (
            <div className="flex items-center gap-1.5 rounded-full bg-green-400/90 px-3 py-0.5 text-xs font-bold text-green-900">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Comanda aberta!
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Brand button ───────────────────────────────────────────────────────────
  function BrandButton({
    onClick, disabled, loading, children, variant = "brand",
  }: {
    onClick?: () => void;
    disabled?: boolean;
    loading?: boolean;
    children: React.ReactNode;
    variant?: "brand" | "outline";
  }) {
    if (variant === "outline") {
      return (
        <button
          onClick={onClick}
          disabled={disabled}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 px-4 py-3.5 text-sm font-semibold transition-all active:scale-95 disabled:opacity-50"
          style={{ borderColor: brandColor, color: brandColor }}
        >
          {children}
        </button>
      );
    }
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className="flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3.5 text-sm font-bold shadow-md transition-all active:scale-95 disabled:opacity-60"
        style={{ background: disabled ? `rgba(${brandRgb}/0.5)` : brandColor, color: onBrand }}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    );
  }

  // ── Render: loading ────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        {/* header skeleton */}
        <div className="relative overflow-hidden bg-muted/60 pb-8 pt-10">
          <div className="pointer-events-none absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite]"
            style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.07), transparent)" }} />
          <div className="flex flex-col items-center gap-3 px-6">
            <Skeleton className="h-20 w-20 rounded-2xl" />
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col gap-3 p-6">
          <Skeleton className="h-12 w-full rounded-2xl" />
          <Skeleton className="h-12 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  // ── Render: not found ──────────────────────────────────────────────────────
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

  // ── Render: mesa ocupada ───────────────────────────────────────────────────
  if (step === "occupied") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <BrandHeader status="occupied" />
        <div className="flex flex-col gap-4 p-6">
          <p className="text-center text-sm text-muted-foreground">
            Esta mesa já possui uma comanda aberta. Chame o atendente ou acesse o cardápio.
          </p>
          <ActionButtons
            garcomChamado={garcomChamado}
            onChamarGarcom={handleChamarGarcom}
            menuUrl={menuUrl}
            BrandButton={BrandButton}
          />
        </div>
      </div>
    );
  }

  // ── Render: step "name" ────────────────────────────────────────────────────
  if (step === "name") {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        <BrandHeader />
        <div className="flex flex-col gap-5 p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Bem-vindo(a)!</h2>
            <p className="text-sm text-muted-foreground">
              Informe seu nome para registrar sua chegada.
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
              className="h-12 rounded-xl text-base"
            />
          </div>
          <BrandButton
            onClick={handleEnter}
            disabled={creating || !customerName.trim()}
            loading={creating}
          >
            {!creating && <CheckCircle2 className="h-4 w-4" />}
            Confirmar
          </BrandButton>
        </div>
      </div>
    );
  }

  // ── Render: step "done" ────────────────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <BrandHeader status="done" />
      <div className="flex flex-col gap-4 p-6">
        <p className="text-center text-sm text-muted-foreground">
          Seu atendimento foi registrado na {decodedTable}. O que deseja fazer?
        </p>
        <ActionButtons
          garcomChamado={garcomChamado}
          onChamarGarcom={handleChamarGarcom}
          menuUrl={menuUrl}
          BrandButton={BrandButton}
        />
      </div>
    </div>
  );
}

// ── Action buttons ─────────────────────────────────────────────────────────────

function ActionButtons({
  garcomChamado,
  onChamarGarcom,
  menuUrl,
  BrandButton,
}: {
  garcomChamado: boolean;
  onChamarGarcom: () => void;
  menuUrl: string | null;
  BrandButton: React.ComponentType<any>;
}) {
  return (
    <div className="space-y-3">
      <BrandButton
        onClick={onChamarGarcom}
        disabled={garcomChamado}
        variant={garcomChamado ? "outline" : "brand"}
      >
        {garcomChamado ? (
          <><ConciergeBell className="h-5 w-5" />Garçom a caminho!</>
        ) : (
          <><BellRing className="h-5 w-5" />Chamar garçom</>
        )}
      </BrandButton>

      {menuUrl ? (
        <a href={menuUrl} target="_blank" rel="noopener noreferrer" className="block">
          <BrandButton variant="outline">
            <UtensilsCrossed className="h-5 w-5" />
            Ver cardápio digital
            <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-60" />
          </BrandButton>
        </a>
      ) : (
        <BrandButton variant="outline" disabled>
          <UtensilsCrossed className="h-5 w-5" />
          Cardápio digital indisponível
        </BrandButton>
      )}
    </div>
  );
}
