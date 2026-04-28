import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { Loader2, Store, UtensilsCrossed, ShoppingBasket, Truck, Bike, ShoppingBag, Package, CheckCircle2, AlertCircle } from "lucide-react";
import { maskDocument } from "@/lib/masks";
import { onlyDigits, isValidDocument, isValidCNPJ, fetchCnpjBrasilAPI, type CnpjData } from "@/lib/document";

const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restaurante", icon: UtensilsCrossed },
  { value: "snack_bar", label: "Lanchonete", icon: ShoppingBag },
  { value: "market", label: "Mercado", icon: ShoppingBasket },
  { value: "distributor", label: "Distribuidora", icon: Truck },
  { value: "delivery", label: "Delivery", icon: Bike },
  { value: "retail", label: "Loja física", icon: Store },
  { value: "other", label: "Outro", icon: Package },
];

export default function Onboarding() {
  const { user } = useAuth();
  const { companies, loading: companiesLoading, refresh, setActiveCompany } = useCompany();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAddingNew = searchParams.get("new") === "1";

  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState("restaurant");
  const [document, setDocument] = useState("");
  const [loading, setLoading] = useState(false);
  const [docLoading, setDocLoading] = useState(false);
  const [cnpjData, setCnpjData] = useState<CnpjData | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);

  const docDigits = onlyDigits(document);
  const docValid = docDigits.length === 0 ? null : isValidDocument(document);

  useEffect(() => {
    setCnpjData(null);
    setDocError(null);
    if (lookupAbort.current) {
      lookupAbort.current.abort();
      lookupAbort.current = null;
    }

    if (docDigits.length === 0) return;

    if (docDigits.length === 11) {
      if (!docValid) setDocError("CPF inválido");
      return;
    }

    if (docDigits.length === 14) {
      if (!isValidCNPJ(docDigits)) {
        setDocError("CNPJ inválido");
        return;
      }
      const ctrl = new AbortController();
      lookupAbort.current = ctrl;
      setDocLoading(true);
      fetchCnpjBrasilAPI(docDigits, ctrl.signal)
        .then((data) => {
          if (ctrl.signal.aborted) return;
          if (!data) {
            setDocError("CNPJ não encontrado na Receita Federal");
            setCnpjData(null);
            return;
          }
          setCnpjData(data);
          setDocError(null);
          if (!name.trim()) {
            setName(data.nome_fantasia || data.razao_social || "");
          }
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setDocLoading(false);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docDigits]);

  if (!companiesLoading && companies.length > 0 && !isAddingNew) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (docDigits.length > 0 && !isValidDocument(document)) {
      toast.error(docDigits.length === 11 ? "CPF inválido" : "CNPJ inválido");
      return;
    }
    if (docDigits.length === 14) {
      if (docLoading) {
        toast.error("Aguarde a verificação do CNPJ");
        return;
      }
      if (!cnpjData) {
        toast.error("CNPJ não encontrado na Receita Federal");
        return;
      }
      const situacao = (cnpjData.situacao_cadastral || "").toUpperCase().trim();
      if (situacao !== "ATIVA") {
        toast.error(`Não é possível criar a loja: CNPJ ${situacao || "sem situação ativa"}`);
        return;
      }
    }
    setLoading(true);

    // Always get a fresh session before making the insert.
    // Use refreshSession() to ensure the JWT in the Supabase client is valid.
    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    const session = refreshed?.session;

    if (refreshErr || !session) {
      setLoading(false);
      toast.error("Sessão inválida. Faça login novamente.");
      return;
    }

    // Call the SECURITY DEFINER function that bypasses RLS on the companies table.
    // This is needed because direct INSERT may be blocked by a Supabase project-level
    // policy even when the JWT is valid and authenticated.
    const { data: rows, error } = await (supabase as any).rpc("create_company_for_user", {
      p_name: name.trim(),
      p_business_type: businessType,
      p_document: document.trim() || null,
    });

    const data = Array.isArray(rows) ? rows[0] : rows;

    setLoading(false);

    if (error || !data) {
      toast.error(error?.message || "Erro ao criar empresa");
      return;
    }

    toast.success("Empresa criada com sucesso!");
    await refresh();
    setActiveCompany({
      id: data.id,
      name: data.name,
      business_type: data.business_type,
      document: data.document,
      logo_url: data.logo_url,
      role: "owner",
    });
    navigate("/", { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="flex items-center justify-between border-b border-border/60 bg-background/50 px-6 py-4 backdrop-blur">
        <Logo />
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-2xl px-4 py-16 sm:py-24">
        <div className="mb-8 space-y-3 text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
            {isAddingNew ? "Adicionar empresa" : "Passo 1 de 1"}
          </div>
          <h1 className="text-4xl font-bold tracking-tight">
            {isAddingNew ? "Cadastre sua nova empresa" : "Vamos configurar seu negócio"}
          </h1>
          <p className="text-muted-foreground">
            {isAddingNew
              ? "Você poderá alternar entre suas empresas pelo menu superior."
              : "Em menos de 1 minuto você estará vendendo."}
          </p>
        </div>

        <Card className="shadow-elev-lg animate-scale-in">
          <CardHeader>
            <CardTitle>Sua empresa</CardTitle>
            <CardDescription>Você pode alterar essas informações depois nas configurações.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="name">Nome da empresa *</Label>
                <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lanchonete da Praça" />
              </div>

              <div className="space-y-2">
                <Label>Tipo de negócio *</Label>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {BUSINESS_TYPES.map((b) => {
                    const Icon = b.icon;
                    const active = businessType === b.value;
                    return (
                      <button
                        key={b.value}
                        type="button"
                        onClick={() => setBusinessType(b.value)}
                        className={`group flex flex-col items-center gap-2 rounded-xl border p-3 text-xs font-medium transition-all ${
                          active
                            ? "border-primary bg-primary/10 text-primary shadow-elev-sm"
                            : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {b.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="document">CNPJ / CPF (opcional)</Label>
                <div className="relative">
                  <Input
                    id="document"
                    value={document}
                    onChange={(e) => setDocument(maskDocument(e.target.value))}
                    placeholder="00.000.000/0000-00"
                    inputMode="numeric"
                    className={
                      docError
                        ? "border-destructive pr-10"
                        : docValid && !docLoading
                        ? "border-emerald-500/60 pr-10"
                        : "pr-10"
                    }
                    data-testid="input-document"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {docLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : docError ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : docValid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                  </div>
                </div>
                {docError && (
                  <p className="text-xs text-destructive" data-testid="text-doc-error">{docError}</p>
                )}
                {cnpjData && !docError && (() => {
                  const ativa = (cnpjData.situacao_cadastral || "").toUpperCase().trim() === "ATIVA";
                  return (
                  <div
                    className={
                      ativa
                        ? "rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs space-y-1"
                        : "rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs space-y-1"
                    }
                    data-testid="card-cnpj-info"
                  >
                    <div className={`flex items-center gap-2 font-semibold ${ativa ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                      {ativa ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                      {ativa ? "CNPJ verificado na Receita Federal" : "CNPJ não está ativo na Receita Federal"}
                    </div>
                    <div className="text-foreground"><span className="text-muted-foreground">Razão social:</span> {cnpjData.razao_social}</div>
                    {cnpjData.nome_fantasia && (
                      <div className="text-foreground"><span className="text-muted-foreground">Nome fantasia:</span> {cnpjData.nome_fantasia}</div>
                    )}
                    {cnpjData.cnae_fiscal_descricao && (
                      <div className="text-foreground"><span className="text-muted-foreground">Atividade:</span> {cnpjData.cnae_fiscal_descricao}</div>
                    )}
                    {(cnpjData.logradouro || cnpjData.municipio) && (
                      <div className="text-foreground">
                        <span className="text-muted-foreground">Endereço:</span>{" "}
                        {[
                          cnpjData.logradouro,
                          cnpjData.numero,
                          cnpjData.bairro,
                          cnpjData.municipio && cnpjData.uf ? `${cnpjData.municipio}/${cnpjData.uf}` : cnpjData.municipio || cnpjData.uf,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </div>
                    )}
                    {cnpjData.situacao_cadastral && (
                      <div className="text-foreground"><span className="text-muted-foreground">Situação:</span> {cnpjData.situacao_cadastral}</div>
                    )}
                  </div>
                  );
                })()}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row-reverse">
                <Button
                  type="submit"
                  className="flex-1"
                  size="lg"
                  disabled={
                    loading ||
                    !name.trim() ||
                    docLoading ||
                    (docDigits.length === 14 &&
                      (!cnpjData ||
                        (cnpjData.situacao_cadastral || "").toUpperCase().trim() !== "ATIVA"))
                  }
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Criar empresa e continuar
                </Button>
                {isAddingNew && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => navigate(-1)}
                    disabled={loading}
                  >
                    Cancelar
                  </Button>
                )}
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}