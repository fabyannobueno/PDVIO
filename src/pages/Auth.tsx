import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "sonner";
import { Loader2, ShoppingCart, TrendingUp, Package, Users, Eye, EyeOff, ArrowLeft, Mail } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type AuthView = "default" | "forgot-password" | "forgot-password-sent" | "resend-confirmation" | "resend-confirmation-sent";

export default function Auth() {
  const { user, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<AuthView>("default");

  const tabParam = searchParams.get("tab");
  const initialTab = tabParam === "register" || tabParam === "signup" ? "signup" : "signin";
  const [activeTab, setActiveTab] = useState<"signin" | "signup">(initialTab);

  useEffect(() => {
    const t = searchParams.get("tab");
    if (t === "register" || t === "signup") setActiveTab("signup");
    else if (t === "login" || t === "signin") setActiveTab("signin");
  }, [searchParams]);

  const [signInEmail, setSignInEmail] = useState("");
  const [signInPassword, setSignInPassword] = useState("");
  const [signUpName, setSignUpName] = useState("");
  const [signUpEmail, setSignUpEmail] = useState("");
  const [signUpPassword, setSignUpPassword] = useState("");
  const [showSignInPassword, setShowSignInPassword] = useState(false);
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resendEmail, setResendEmail] = useState("");

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await signIn(signInEmail, signInPassword);
    setLoading(false);
    if (error) {
      const msg = error.message || "";
      if (/email not confirmed|not confirmed|email_not_confirmed/i.test(msg)) {
        toast.error("Seu email ainda não foi confirmado. Reenviamos o link de confirmação.");
        setResendEmail(signInEmail);
        setView("resend-confirmation");
      } else {
        toast.error(msg === "Invalid login credentials" ? "Email ou senha inválidos" : msg);
      }
    } else {
      toast.success("Bem-vindo de volta!");
      navigate("/", { replace: true });
    }
  };

  const handleResendConfirmation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resendEmail) {
      toast.error("Informe seu email");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: resendEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message || "Não foi possível reenviar o email. Tente novamente.");
    } else {
      setView("resend-confirmation-sent");
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signUpPassword.length < 6) {
      toast.error("A senha deve ter pelo menos 6 caracteres");
      return;
    }
    setLoading(true);
    const { error, session: newSession } = await signUp(signUpEmail, signUpPassword, signUpName);
    setLoading(false);
    if (error) {
      if (error.message.includes("already registered")) {
        toast.error("Este email já está cadastrado");
      } else {
        toast.error(error.message);
      }
    } else if (!newSession) {
      // Email confirmation is required — session will only be created after clicking the link
      toast.success("Conta criada! Verifique seu email para confirmar o cadastro.");
      setResendEmail(signUpEmail);
      setView("resend-confirmation-sent");
    } else {
      // Session created immediately — navigate into the app
      toast.success("Conta criada! Entrando...");
      navigate("/", { replace: true });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      toast.error("Não foi possível enviar o email. Tente novamente.");
    } else {
      setView("forgot-password-sent");
    }
  };

  const features = [
    { icon: ShoppingCart, title: "Frente de caixa ágil", desc: "Venda em segundos, com código de barras e múltiplas formas de pagamento." },
    { icon: Package, title: "Estoque inteligente", desc: "Custo, margem, markup e lucro calculados automaticamente." },
    { icon: TrendingUp, title: "Relatórios em tempo real", desc: "Dashboards de vendas, CMV e produtos mais rentáveis." },
    { icon: Users, title: "Equipe e permissões", desc: "Convide caixas, gerentes e garçons com acesso controlado." },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle />
      </div>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Left: Marketing */}
        <div className="relative hidden overflow-hidden bg-gradient-subtle p-12 lg:flex lg:flex-col lg:justify-between">
          <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-gradient-primary opacity-20 blur-3xl" />
          <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-gradient-accent opacity-10 blur-3xl" />

          <Logo />

          <div className="relative space-y-10">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-4 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" />
                Plataforma PDV completa
              </div>
              <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">
                O caixa do seu negócio,{" "}
                <span className="bg-gradient-primary bg-clip-text text-transparent">sem complicação.</span>
              </h1>
              <p className="text-lg text-muted-foreground">
                Vendas, comandas, estoque e finanças em uma só plataforma. Moderno, rápido e pronto para escalar.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {features.map((f) => (
                <div key={f.title} className="rounded-xl border border-border bg-card/40 p-4 backdrop-blur-sm">
                  <f.icon className="mb-2 h-5 w-5 text-primary" />
                  <h3 className="text-sm font-semibold">{f.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>

          <p className="relative text-xs text-muted-foreground">© {new Date().getFullYear()} PDVIO. Todos os direitos reservados.</p>
        </div>

        {/* Right: Form */}
        <div className="flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-md animate-fade-in">
            <div className="mb-8 lg:hidden">
              <Logo />
            </div>

            {/* Default: Sign In / Sign Up */}
            {view === "default" && (
              <>
                <Card className="border-border/60 shadow-elev-lg">
                  <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl">Acesse sua conta</CardTitle>
                    <CardDescription>Entre ou crie uma conta para começar.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Tabs value={activeTab} onValueChange={(v) => { setActiveTab(v as "signin" | "signup"); const next = new URLSearchParams(searchParams); next.set("tab", v === "signup" ? "register" : "login"); setSearchParams(next, { replace: true }); }} className="w-full">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="signin" data-testid="tab-signin">Entrar</TabsTrigger>
                        <TabsTrigger value="signup" data-testid="tab-signup">Criar conta</TabsTrigger>
                      </TabsList>

                      <TabsContent value="signin">
                        <form onSubmit={handleSignIn} className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label htmlFor="signin-email">Email</Label>
                            <Input data-testid="input-signin-email" id="signin-email" type="email" required value={signInEmail} onChange={(e) => setSignInEmail(e.target.value)} placeholder="voce@empresa.com" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="signin-password">Senha</Label>
                            <div className="relative">
                              <Input data-testid="input-signin-password" id="signin-password" type={showSignInPassword ? "text" : "password"} required value={signInPassword} onChange={(e) => setSignInPassword(e.target.value)} placeholder="••••••••" className="pr-10" />
                              <button type="button" onClick={() => setShowSignInPassword(!showSignInPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                {showSignInPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                            <div className="flex justify-end">
                              <button
                                type="button"
                                data-testid="link-forgot-password"
                                onClick={() => { setResetEmail(signInEmail); setView("forgot-password"); }}
                                className="text-xs text-primary hover:underline"
                              >
                                Esqueceu a senha?
                              </button>
                            </div>
                          </div>
                          <Button data-testid="button-signin" type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Entrar
                          </Button>
                          <p className="text-center text-xs text-muted-foreground">
                            Não recebeu o email de confirmação?{" "}
                            <button
                              type="button"
                              data-testid="link-resend-confirmation"
                              onClick={() => { setResendEmail(signInEmail); setView("resend-confirmation"); }}
                              className="text-primary hover:underline"
                            >
                              Reenviar
                            </button>
                          </p>
                        </form>
                      </TabsContent>

                      <TabsContent value="signup">
                        <form onSubmit={handleSignUp} className="space-y-4 pt-4">
                          <div className="space-y-2">
                            <Label htmlFor="signup-name">Nome completo</Label>
                            <Input data-testid="input-signup-name" id="signup-name" required value={signUpName} onChange={(e) => setSignUpName(e.target.value)} placeholder="João da Silva" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="signup-email">Email</Label>
                            <Input data-testid="input-signup-email" id="signup-email" type="email" required value={signUpEmail} onChange={(e) => setSignUpEmail(e.target.value)} placeholder="voce@empresa.com" />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="signup-password">Senha</Label>
                            <div className="relative">
                              <Input data-testid="input-signup-password" id="signup-password" type={showSignUpPassword ? "text" : "password"} required minLength={6} value={signUpPassword} onChange={(e) => setSignUpPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="pr-10" />
                              <button type="button" onClick={() => setShowSignUpPassword(!showSignUpPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                {showSignUpPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                              </button>
                            </div>
                          </div>
                          <Button data-testid="button-signup" type="submit" className="w-full" disabled={loading}>
                            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Criar minha conta
                          </Button>
                        </form>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                </Card>

                <p className="mt-6 text-center text-xs text-muted-foreground">
                  Ao continuar, você concorda com nossos{" "}
                  <Link to="/termos-de-uso" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">termos de uso</Link>
                  {" "}e{" "}
                  <Link to="/politica-de-privacidade" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">política de privacidade</Link>.
                </p>
              </>
            )}

            {/* Forgot Password: Enter email */}
            {view === "forgot-password" && (
              <Card className="border-border/60 shadow-elev-lg">
                <CardHeader className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setView("default")}
                    className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
                    data-testid="button-back-to-login"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
                  </button>
                  <CardTitle className="text-2xl">Recuperar senha</CardTitle>
                  <CardDescription>
                    Informe seu email e enviaremos um link para redefinir sua senha.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="reset-email">Email</Label>
                      <Input
                        data-testid="input-reset-email"
                        id="reset-email"
                        type="email"
                        required
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="voce@empresa.com"
                      />
                    </div>
                    <Button data-testid="button-send-reset" type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Enviar link de recuperação
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Resend Confirmation: Enter email */}
            {view === "resend-confirmation" && (
              <Card className="border-border/60 shadow-elev-lg">
                <CardHeader className="space-y-1">
                  <button
                    type="button"
                    onClick={() => setView("default")}
                    className="mb-1 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
                    data-testid="button-back-to-login-resend"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" /> Voltar ao login
                  </button>
                  <CardTitle className="text-2xl">Reenviar confirmação</CardTitle>
                  <CardDescription>
                    Informe seu email e enviaremos um novo link para confirmar sua conta.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleResendConfirmation} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="resend-email">Email</Label>
                      <Input
                        data-testid="input-resend-email"
                        id="resend-email"
                        type="email"
                        required
                        value={resendEmail}
                        onChange={(e) => setResendEmail(e.target.value)}
                        placeholder="voce@empresa.com"
                      />
                    </div>
                    <Button data-testid="button-send-resend" type="submit" className="w-full" disabled={loading}>
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Reenviar email de confirmação
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}

            {/* Resend Confirmation: Email sent */}
            {view === "resend-confirmation-sent" && (
              <Card className="border-border/60 shadow-elev-lg">
                <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">Email enviado!</h2>
                    <p className="text-sm text-muted-foreground">
                      Enviamos um link de confirmação para <span className="font-medium text-foreground">{resendEmail}</span>.
                      Verifique sua caixa de entrada (e o spam).
                    </p>
                  </div>
                  <Button
                    data-testid="button-back-to-login-resend-sent"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => { setView("default"); setResendEmail(""); }}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Forgot Password: Email sent */}
            {view === "forgot-password-sent" && (
              <Card className="border-border/60 shadow-elev-lg">
                <CardContent className="flex flex-col items-center gap-4 py-10 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                    <Mail className="h-8 w-8 text-primary" />
                  </div>
                  <div className="space-y-2">
                    <h2 className="text-xl font-semibold">Email enviado!</h2>
                    <p className="text-sm text-muted-foreground">
                      Enviamos um link de recuperação para <span className="font-medium text-foreground">{resetEmail}</span>.
                      Verifique sua caixa de entrada (e o spam).
                    </p>
                  </div>
                  <Button
                    data-testid="button-back-to-login-sent"
                    variant="outline"
                    className="mt-2 w-full"
                    onClick={() => { setView("default"); setResetEmail(""); }}
                  >
                    <ArrowLeft className="mr-2 h-4 w-4" />
                    Voltar ao login
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
