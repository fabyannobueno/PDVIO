import { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { Loader2, Upload, Trash2, CheckCircle2, AlertCircle, User as UserIcon, LogOut } from "lucide-react";
import { maskCpf, maskPhone } from "@/lib/masks";
import { isValidCPF } from "@/lib/document";

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const minBirthISO = () => {
  // 120 anos atrás
  const d = new Date();
  d.setFullYear(d.getFullYear() - 120);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const maxBirthISO = () => {
  // pelo menos 13 anos
  const d = new Date();
  d.setFullYear(d.getFullYear() - 13);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export default function CompleteProfile() {
  const { user, signOut } = useAuth();
  const { companies, loading: companiesLoading } = useCompany();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [profileExists, setProfileExists] = useState(false);
  const [alreadyComplete, setAlreadyComplete] = useState(false);

  const [fullName, setFullName] = useState("");
  const [cpf, setCpf] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [phone, setPhone] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [cpfError, setCpfError] = useState<string | null>(null);
  const [cpfChecking, setCpfChecking] = useState(false);

  const cpfDigits = onlyDigits(cpf);
  const cpfFormatValid = cpfDigits.length === 11 ? isValidCPF(cpfDigits) : null;

  // Carrega perfil existente
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, avatar_url, cpf, birth_date")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      const p: any = data || {};
      setProfileExists(!!data);
      setFullName(p.full_name ?? user.user_metadata?.full_name ?? "");
      setPhone(p.phone ? maskPhone(String(p.phone)) : "");
      setAvatar(p.avatar_url ?? null);
      setCpf(p.cpf ? maskCpf(String(p.cpf)) : "");
      setBirthDate(p.birth_date ? String(p.birth_date).slice(0, 10) : "");
      // Considera completo se tudo preenchido
      const complete = !!(p.full_name && p.phone && p.avatar_url && p.cpf && p.birth_date);
      setAlreadyComplete(complete);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Validação local do CPF (formato + dígitos verificadores)
  useEffect(() => {
    if (cpfDigits.length === 0) {
      setCpfError(null);
      return;
    }
    if (cpfDigits.length < 11) {
      setCpfError(null);
      return;
    }
    if (!isValidCPF(cpfDigits)) {
      setCpfError("CPF inválido");
      return;
    }
    setCpfError(null);
  }, [cpfDigits]);

  // Sem usuário → /auth ; sem empresa → /onboarding ; perfil já completo → /
  if (!user) return <Navigate to="/auth" replace />;
  if (!companiesLoading && companies.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }
  if (alreadyComplete && !loading) {
    return <Navigate to="/" replace />;
  }

  // ── Avatar (resize 500x500, base64 JPEG) ─────────────────────────────────
  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB).");
      return;
    }
    setAvatarUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Imagem inválida"));
        i.src = dataUrl;
      });
      const MAX = 500;
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = window.document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL("image/jpeg", 0.85);
      setAvatar(base64);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao processar imagem");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  // ── Salvar perfil ────────────────────────────────────────────────────────
  const saveProfile = useMutation({
    mutationFn: async () => {
      const trimmedName = fullName.trim();
      if (!trimmedName) throw new Error("Nome obrigatório");
      if (!avatar) throw new Error("Foto de perfil obrigatória");
      if (cpfDigits.length !== 11 || !isValidCPF(cpfDigits)) {
        throw new Error("CPF inválido");
      }
      if (!birthDate) throw new Error("Data de nascimento obrigatória");
      const phoneDigits = onlyDigits(phone);
      if (phoneDigits.length < 10) throw new Error("Telefone inválido");

      // Checa unicidade do CPF (índice único também garante no banco)
      setCpfChecking(true);
      const { data: existing, error: checkErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("cpf", cpfDigits)
        .neq("id", user!.id)
        .maybeSingle();
      setCpfChecking(false);
      if (checkErr) throw new Error(checkErr.message);
      if (existing) throw new Error("Este CPF já está vinculado a outra conta");

      const payload: any = {
        id: user!.id,
        email: user!.email ?? null,
        full_name: trimmedName,
        phone: phoneDigits,
        avatar_url: avatar,
        cpf: cpfDigits,
        birth_date: birthDate,
      };
      const { error } = await supabase.from("profiles").upsert(payload);
      if (error) {
        // Conflito de unique index → mensagem amigável
        if ((error as any).code === "23505") {
          throw new Error("Este CPF já está vinculado a outra conta");
        }
        throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Perfil completo!");
      navigate("/", { replace: true });
    },
    onError: (e: any) => {
      toast.error(e?.message ?? "Erro ao salvar perfil");
    },
  });

  const canSubmit =
    !!fullName.trim() &&
    !!avatar &&
    cpfDigits.length === 11 &&
    !!cpfFormatValid &&
    !!birthDate &&
    onlyDigits(phone).length >= 10 &&
    !saveProfile.isPending &&
    !avatarUploading &&
    !cpfChecking;

  if (loading || companiesLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const initials = (fullName || user.email || "U").trim().slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-gradient-subtle">
      <header className="flex items-center justify-between border-b border-border/60 bg-background/50 px-6 py-4 backdrop-blur">
        <Logo />
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await signOut();
              navigate("/auth", { replace: true });
            }}
            data-testid="button-signout"
          >
            <LogOut className="mr-1 h-4 w-4" />
            Sair
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-12 sm:py-16">
        <div className="mb-8 space-y-3 text-center animate-fade-in">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <UserIcon className="h-3.5 w-3.5" />
            Complete seu perfil
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Falta pouco para começar
          </h1>
          <p className="text-muted-foreground">
            Precisamos de algumas informações suas para liberar o acesso ao sistema.
          </p>
        </div>

        <Card className="shadow-elev-lg animate-scale-in">
          <CardHeader>
            <CardTitle>Seus dados</CardTitle>
            <CardDescription>
              Esses dados são obrigatórios e ficam visíveis apenas para você e a equipe da sua empresa.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveProfile.mutate();
              }}
              className="space-y-5"
            >
              {/* Avatar */}
              <div className="space-y-2">
                <Label>Foto de perfil *</Label>
                <div className="flex items-center gap-4">
                  <Avatar className="h-20 w-20 border border-border">
                    <AvatarImage src={avatar ?? undefined} alt="Avatar" />
                    <AvatarFallback className="text-lg">{initials}</AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAvatarFile(f);
                      }}
                      data-testid="input-profile-avatar"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      data-testid="button-upload-avatar"
                    >
                      {avatarUploading ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {avatar ? "Trocar foto" : "Enviar foto"}
                    </Button>
                    {avatar && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setAvatar(null)}
                        data-testid="button-remove-avatar"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Remover
                      </Button>
                    )}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  A imagem é redimensionada para 500×500 pixels automaticamente.
                </p>
              </div>

              {/* Nome */}
              <div className="space-y-2">
                <Label htmlFor="full-name">Nome completo *</Label>
                <Input
                  id="full-name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ex: João da Silva"
                  data-testid="input-full-name"
                />
              </div>

              {/* CPF */}
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <div className="relative">
                  <Input
                    id="cpf"
                    required
                    value={cpf}
                    onChange={(e) => setCpf(maskCpf(e.target.value))}
                    placeholder="000.000.000-00"
                    inputMode="numeric"
                    autoComplete="off"
                    className={
                      cpfError
                        ? "border-destructive pr-10"
                        : cpfFormatValid
                        ? "border-emerald-500/60 pr-10"
                        : "pr-10"
                    }
                    data-testid="input-cpf"
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {cpfChecking ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : cpfError ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : cpfFormatValid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                  </div>
                </div>
                {cpfError && (
                  <p className="text-xs text-destructive" data-testid="text-cpf-error">
                    {cpfError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  CPF é único — só pode ser usado em uma conta.
                </p>
              </div>

              {/* Data de nascimento */}
              <div className="space-y-2">
                <Label htmlFor="birth-date">Data de nascimento *</Label>
                <Input
                  id="birth-date"
                  type="date"
                  required
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                  min={minBirthISO()}
                  max={maxBirthISO()}
                  data-testid="input-birth-date"
                />
              </div>

              {/* Telefone */}
              <div className="space-y-2">
                <Label htmlFor="phone">Telefone (WhatsApp) *</Label>
                <Input
                  id="phone"
                  required
                  value={phone}
                  onChange={(e) => setPhone(maskPhone(e.target.value))}
                  placeholder="(11) 91234-5678"
                  inputMode="numeric"
                  autoComplete="tel"
                  data-testid="input-phone"
                />
                <p className="text-xs text-muted-foreground">
                  Usado para suporte e recuperação de conta.
                </p>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={!canSubmit}
                  data-testid="button-save-profile"
                >
                  {saveProfile.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar e entrar no sistema
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
