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
  delivery_slug: string | null;
}

type Step = "loading" | "occupied" | "name" | "done";

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
        .select("id, name, logo_url, delivery_slug")
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
      if (!compRes.data) {
        setNotFound(true);
        return;
      }
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
    if (!name) {
      toast.error("Por favor, informe seu nome");
      return;
    }
    if (!companyId) return;
    setCreating(true);
    try {
      // Double-check: re-verify table isn't occupied (race condition guard)
      const { data: existing } = await supabase
        .from("comandas")
        .select("id")
        .eq("company_id", companyId)
        .eq("identifier", decodedTable)
        .eq("status", "open")
        .maybeSingle();

      if (existing) {
        setStep("occupied");
        return;
      }

      const { data: newComanda, error } = await supabase
        .from("comandas")
        .insert({
          company_id: companyId,
          identifier: decodedTable,
          notes: name,
        } as never)
        .select("id")
        .single();

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

  const menuUrl = company?.delivery_slug
    ? `https://pdvio.shop/${company.delivery_slug}`
    : null;

  // ── Shared header ──────────────────────────────────────────────────────────
  function CompanyHeader({ badge }: { badge?: React.ReactNode }) {
    if (!company) return null;
    return (
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
          {badge}
        </div>
      </div>
    );
  }

  // ── Render: loading ────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 p-6 bg-background">
        <Skeleton className="h-20 w-20 rounded-2xl" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-32" />
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
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-8">
          <CompanyHeader />

          <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30 p-5 text-center space-y-2">
            <p className="font-semibold text-amber-800 dark:text-amber-300">Mesa em atendimento</p>
            <p className="text-sm text-amber-700 dark:text-amber-400">
              Esta mesa já possui uma comanda aberta. Chame o atendente ou acesse o cardápio.
            </p>
          </div>

          <ActionButtons
            garcomChamado={garcomChamado}
            onChamarGarcom={handleChamarGarcom}
            menuUrl={menuUrl}
          />
        </div>
      </div>
    );
  }

  // ── Render: step "name" ────────────────────────────────────────────────────
  if (step === "name") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
        <div className="w-full max-w-sm space-y-8">
          <CompanyHeader />

          <div className="space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm">
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
              Confirmar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: step "done" ────────────────────────────────────────────────────
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm space-y-8">
        <CompanyHeader />

        {/* Success banner */}
        <div className="flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 dark:border-green-800/40 dark:bg-green-950/30 p-4">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-green-800 dark:text-green-300">
              Comanda aberta, {customerName}!
            </p>
            <p className="text-sm text-green-700 dark:text-green-400 mt-0.5">
              Seu atendimento foi registrado na {decodedTable}.
            </p>
          </div>
        </div>

        <ActionButtons
          garcomChamado={garcomChamado}
          onChamarGarcom={handleChamarGarcom}
          menuUrl={menuUrl}
        />
      </div>
    </div>
  );
}

// ── Action buttons (shared between "done" and "occupied") ─────────────────────

function ActionButtons({
  garcomChamado,
  onChamarGarcom,
  menuUrl,
}: {
  garcomChamado: boolean;
  onChamarGarcom: () => void;
  menuUrl: string | null;
}) {
  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-medium text-muted-foreground">O que deseja fazer?</p>

      <Button
        size="lg"
        className="w-full gap-2"
        variant={garcomChamado ? "secondary" : "default"}
        onClick={onChamarGarcom}
        disabled={garcomChamado}
      >
        {garcomChamado ? (
          <>
            <ConciergeBell className="h-5 w-5" />
            Garçom a caminho!
          </>
        ) : (
          <>
            <BellRing className="h-5 w-5" />
            Chamar garçom
          </>
        )}
      </Button>

      {menuUrl ? (
        <Button
          size="lg"
          variant="outline"
          className="w-full gap-2"
          asChild
        >
          <a href={menuUrl} target="_blank" rel="noopener noreferrer">
            <UtensilsCrossed className="h-5 w-5" />
            Ver cardápio digital
            <ExternalLink className="h-3.5 w-3.5 ml-auto opacity-60" />
          </a>
        </Button>
      ) : (
        <Button size="lg" variant="outline" className="w-full gap-2" disabled>
          <UtensilsCrossed className="h-5 w-5" />
          Cardápio digital indisponível
        </Button>
      )}
    </div>
  );
}
