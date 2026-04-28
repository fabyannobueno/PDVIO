import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

type Status = "loading" | "success" | "error";

export default function AuthConfirm() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");
  const [next, setNext] = useState<string>("/");

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const url = new URL(window.location.href);
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const nextParam = url.searchParams.get("next") || "/";
      setNext(nextParam);

      if (!tokenHash || !type) {
        if (!cancelled) {
          setStatus("error");
          setMessage("Link inválido. Solicite um novo email de confirmação.");
        }
        return;
      }

      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as any });
      if (cancelled) return;

      if (error) {
        setStatus("error");
        setMessage(error.message.includes("expired") ? "Este link expirou. Solicite um novo." : "Não foi possível validar este link.");
        return;
      }

      setStatus("success");
      // Clean URL and redirect after a short success display
      window.history.replaceState({}, "", "/auth/confirm");
      setTimeout(() => {
        const target = nextParam.startsWith("http") ? new URL(nextParam).pathname || "/" : nextParam;
        navigate(target, { replace: true });
      }, 1500);
    };

    run();
    return () => { cancelled = true; };
  }, [navigate]);

  return (
    <div className="relative min-h-screen bg-background">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gradient-primary opacity-10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-gradient-accent opacity-10 blur-3xl" />

      <div className="relative flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md animate-fade-in">
          <div className="mb-8 flex justify-center"><Logo /></div>

          <Card className="border-border/60 shadow-elev-lg">
            {status === "loading" && (
              <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Validando seu link...</p>
              </CardContent>
            )}

            {status === "success" && (
              <CardHeader className="space-y-3 text-center pb-10">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                  <CheckCircle2 className="h-7 w-7 text-primary" />
                </div>
                <CardTitle className="text-2xl">Tudo certo!</CardTitle>
                <CardDescription>Seu acesso foi confirmado. Redirecionando...</CardDescription>
              </CardHeader>
            )}

            {status === "error" && (
              <>
                <CardHeader className="space-y-3 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                    <XCircle className="h-7 w-7 text-destructive" />
                  </div>
                  <CardTitle className="text-2xl">Link inválido</CardTitle>
                  <CardDescription>{message}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button data-testid="button-back-to-auth" className="w-full" onClick={() => navigate("/auth", { replace: true })}>
                    Voltar para o login
                  </Button>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
