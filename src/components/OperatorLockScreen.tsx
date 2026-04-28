import { useEffect, useRef, useState } from "react";
import { Lock, Loader2, ScanLine, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function OperatorLockScreen() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const { setOperator, disableOperatorMode } = useOperator();
  const [mode, setMode] = useState<"operator" | "exit">("operator");
  const [badge, setBadge] = useState("");
  const [pin, setPin] = useState("");
  const [exitPwd, setExitPwd] = useState("");
  const [loading, setLoading] = useState(false);
  const [exitLoading, setExitLoading] = useState(false);
  const badgeRef = useRef<HTMLInputElement>(null);
  const pinRef = useRef<HTMLInputElement>(null);
  const pwdRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "operator") {
      badgeRef.current?.focus();
    } else {
      pwdRef.current?.focus();
    }
  }, [mode]);

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!activeCompany || loading) return;
    if (!badge.trim() || !pin.trim()) {
      toast.error("Informe o cartão e o PIN");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase as any).rpc("verify_staff_pin", {
        _company_id: activeCompany.id,
        _badge_code: badge.trim(),
        _pin: pin.trim(),
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        toast.error("Cartão ou PIN inválido");
        setPin("");
        pinRef.current?.focus();
        return;
      }
      setOperator({ id: row.id, name: row.name, role: row.role });
      toast.success(`Bem-vindo, ${row.name}`);
      setBadge("");
      setPin("");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao validar");
    } finally {
      setLoading(false);
    }
  }

  async function handleExit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user?.email) return;
    if (!exitPwd) {
      toast.error("Informe sua senha");
      return;
    }
    setExitLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: exitPwd,
      });
      if (error) {
        toast.error("Senha incorreta");
        setExitPwd("");
        pwdRef.current?.focus();
        return;
      }
      disableOperatorMode();
      setExitPwd("");
      toast.success("Modo operador desativado");
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao validar senha");
    } finally {
      setExitLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Lock className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">
              {mode === "operator" ? "Terminal bloqueado" : "Sair do modo operador"}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {mode === "operator"
                ? "Bipe seu cartão e digite o PIN para começar"
                : "Confirme sua senha de gerência para desbloquear"}
            </p>
          </div>
          {activeCompany && (
            <p className="text-xs font-medium text-muted-foreground">{activeCompany.name}</p>
          )}
        </div>

        {mode === "operator" ? (
          <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
            <div style={{ position: "absolute", top: -9999, left: -9999, height: 0, width: 0, overflow: "hidden" }} aria-hidden="true">
              <input type="text" name="username" tabIndex={-1} autoComplete="username" />
              <input type="password" name="password" tabIndex={-1} autoComplete="current-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="badge" className="text-xs uppercase tracking-wide text-muted-foreground">
                Cartão
              </Label>
              <div className="relative">
                <ScanLine className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="badge"
                  ref={badgeRef}
                  name="operator-badge"
                  value={badge}
                  onChange={(e) => setBadge(e.target.value.replace(/[@\s]/g, ""))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      pinRef.current?.focus();
                    }
                  }}
                  placeholder="Bipe ou digite o código"
                  className="pl-9 text-base"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  data-testid="input-operador-cartao"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="pin" className="text-xs uppercase tracking-wide text-muted-foreground">
                PIN
              </Label>
              <Input
                id="pin"
                ref={pinRef}
                name="operator-pin"
                type="text"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="text-center text-2xl tracking-[0.5em] [-webkit-text-security:disc] [text-security:disc]"
                style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                maxLength={8}
                data-testid="input-operador-pin"
              />
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
              data-testid="button-operador-entrar"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Entrar"}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleExit} className="space-y-4" autoComplete="off">
            <div style={{ position: "absolute", top: -9999, left: -9999, height: 0, width: 0, overflow: "hidden" }} aria-hidden="true">
              <input type="text" name="username" tabIndex={-1} autoComplete="username" />
              <input type="password" name="password" tabIndex={-1} autoComplete="current-password" />
            </div>
            <div className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Conta logada: <span className="font-medium text-foreground">{user?.email}</span>
            </div>
            <div className="space-y-2">
              <Label htmlFor="exit-pwd" className="text-xs uppercase tracking-wide text-muted-foreground">
                Senha
              </Label>
              <Input
                id="exit-pwd"
                ref={pwdRef}
                name="exit-pwd"
                type="text"
                value={exitPwd}
                onChange={(e) => setExitPwd(e.target.value)}
                placeholder="Sua senha de gerência"
                className="[-webkit-text-security:disc] [text-security:disc]"
                style={{ WebkitTextSecurity: "disc" } as React.CSSProperties}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                readOnly
                onFocus={(e) => e.currentTarget.removeAttribute("readonly")}
                data-lpignore="true"
                data-1p-ignore="true"
                data-form-type="other"
                data-testid="input-senha-sair-operador"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={exitLoading}
              data-testid="button-confirmar-sair-operador"
            >
              {exitLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Desbloquear"}
            </Button>
          </form>
        )}

        <div className="mt-6 border-t border-border pt-4 text-center">
          {mode === "operator" ? (
            <button
              type="button"
              onClick={() => setMode("exit")}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              data-testid="button-sair-modo-operador"
            >
              Sair do modo operador (gerência)
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setMode("operator");
                setExitPwd("");
              }}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              data-testid="button-voltar-bloqueio"
            >
              <ArrowLeft className="h-3 w-3" />
              Voltar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default OperatorLockScreen;
