import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { CheckCircle2, Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";

export default function ResetPassword() {
  const { updatePassword } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validLink, setValidLink] = useState<boolean | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const code = url.searchParams.get("code");
      const errorDesc = url.searchParams.get("error_description") || url.hash.includes("error=");

      if (errorDesc) {
        if (!cancelled) setValidLink(false);
        return;
      }

      // New flow: ?token_hash=...&type=recovery (custom email hook on our domain)
      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
        window.history.replaceState({}, "", "/reset-password");
        if (!cancelled) setValidLink(!error);
        return;
      }

      // PKCE flow (legacy from default Supabase emails): ?code=...
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        window.history.replaceState({}, "", "/reset-password");
        if (!cancelled) setValidLink(!error);
        return;
      }

      // Legacy hash flow: #access_token=...&type=recovery
      const hash = window.location.hash;
      if (hash.includes("type=recovery") || hash.includes("access_token")) {
        await new Promise((r) => setTimeout(r, 200));
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setValidLink(!!data.session);
        return;
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) setValidLink(!!data.session);
    };

    init();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    if (password !== confirm) {
      toast.error("As senhas não coincidem");
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(password);
    setLoading(false);
    if (error) {
      toast.error("Não foi possível atualizar a senha. Tente novamente.");
    } else {
      setDone(true);
      toast.success("Senha atualizada com sucesso!");
      setTimeout(() => {
        supabase.auth.signOut().then(() => navigate("/auth", { replace: true }));
      }, 2000);
    }
  };

  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gradient-primary opacity-10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-gradient-accent opacity-10 blur-3xl" />

      <div className="relative flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 flex justify-center">
            <Logo />
          </div>

          <Card className="border-border/60 shadow-elev-lg">
            {validLink === null ? (
              <CardContent className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </CardContent>
            ) : !validLink ? (
              <>
                <CardHeader className="space-y-1">
                  <CardTitle className="text-2xl">Link inválido ou expirado</CardTitle>
                  <CardDescription>
                    Este link de recuperação não é mais válido. Solicite um novo para continuar.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button data-testid="button-request-new-link" className="w-full" onClick={() => navigate("/auth")}>
                    Solicitar novo link
                  </Button>
                </CardContent>
              </>
            ) : done ? (
              <>
                <CardHeader className="space-y-3 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <CheckCircle2 className="h-7 w-7 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Senha atualizada</CardTitle>
                  <CardDescription>
                    Redirecionando para o login...
                  </CardDescription>
                </CardHeader>
              </>
            ) : (
              <>
                <CardHeader className="space-y-1">
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                  </div>
                  <CardTitle className="text-2xl">Criar nova senha</CardTitle>
                  <CardDescription>
                    Escolha uma senha forte para proteger sua conta.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="password">Nova senha</Label>
                      <div className="relative">
                        <Input
                          data-testid="input-new-password"
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          minLength={6}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Mínimo 6 caracteres"
                          autoFocus
                          className="pr-10"
                        />
                        <button
                          type="button"
                          data-testid="button-toggle-password"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                          aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                          tabIndex={-1}
                        >
                          {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="confirm">Confirmar senha</Label>
                      <div className="relative">
                        <Input
                          data-testid="input-confirm-password"
                          id="confirm"
                          type={showConfirm ? "text" : "password"}
                          required
                          minLength={6}
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          placeholder="Repita a senha"
                          className="pr-10"
                        />
                        <button
                          type="button"
                          data-testid="button-toggle-confirm-password"
                          onClick={() => setShowConfirm((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/40 transition-colors"
                          aria-label={showConfirm ? "Ocultar senha" : "Mostrar senha"}
                          tabIndex={-1}
                        >
                          {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                    <Button data-testid="button-update-password" type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Atualizar senha
                    </Button>
                  </form>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
