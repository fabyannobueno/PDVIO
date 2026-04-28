import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { LogOut, Building2, Check, Plus, Lock, Unlock, UserCog, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

const roleLabels: Record<string, string> = {
  owner: "Dono",
  manager: "Gerente",
  cashier: "Caixa",
  waiter: "Garçom",
  kitchen: "Cozinha",
};

export function AppHeader() {
  const { user, signOut } = useAuth();
  const { companies, activeCompany, setActiveCompany } = useCompany();
  const { activeOperator, lockEnabled, enableOperatorMode, clearOperator } = useOperator();
  const navigate = useNavigate();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showEnableLock, setShowEnableLock] = useState(false);

  const { data: profile } = useQuery<{ avatar_url: string | null; full_name: string | null } | null>({
    queryKey: ["/config/profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("avatar_url, full_name")
        .eq("id", user!.id)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      return data ?? null;
    },
  });

  const displayName = profile?.full_name || user?.user_metadata?.full_name || user?.email || "U";
  const initials = displayName
    .split(" ")
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const handleSignOut = async () => {
    await signOut();
    toast.success("Sessão encerrada");
    navigate("/auth", { replace: true });
  };

  const isManagerOrOwner =
    activeCompany?.role === "owner" || activeCompany?.role === "manager";

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center gap-2 border-b border-border bg-background/80 px-2 backdrop-blur-md md:gap-3 md:px-4">
        <SidebarTrigger />

        {activeCompany && activeOperator && (
          <div className="flex min-w-0 items-center gap-2 px-2 font-medium md:px-3">
            <Building2 className="h-4 w-4 shrink-0 text-primary" />
            <span className="max-w-[80px] truncate md:max-w-[180px]">{activeCompany.name}</span>
          </div>
        )}

        {activeCompany && !activeOperator && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="min-w-0 gap-2 px-2 font-medium md:px-3">
                <Building2 className="h-4 w-4 shrink-0 text-primary" />
                <span className="max-w-[80px] truncate md:max-w-[180px]">{activeCompany.name}</span>
                <Badge variant="secondary" className="ml-1 hidden text-[10px] font-semibold uppercase md:inline-flex">
                  {roleLabels[activeCompany.role]}
                </Badge>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>Trocar empresa</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {companies.map((c) => (
                <DropdownMenuItem key={c.id} onClick={() => setActiveCompany(c)} className="justify-between">
                  <span className="truncate">{c.name}</span>
                  {c.id === activeCompany.id && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/onboarding?new=1")}>
                <Plus className="mr-2 h-4 w-4" />
                Nova empresa
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Active operator indicator */}
        {activeOperator && (
          <div className="flex min-w-0 items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-1 md:gap-2 md:px-2.5">
            <UserCog className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span
              className="max-w-[60px] truncate text-xs font-medium md:max-w-none"
              data-testid="text-operador-ativo"
            >
              {activeOperator.name}
            </span>
            <Badge
              variant="outline"
              className="hidden text-[10px] font-semibold uppercase md:inline-flex"
            >
              {roleLabels[activeOperator.role]}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              title="Trocar operador"
              onClick={clearOperator}
              data-testid="button-trocar-operador"
            >
              <RefreshCw className="h-3 w-3" />
            </Button>
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-1 md:gap-2">
          {/* Operator mode quick toggle (visible to owner/manager only) */}
          {isManagerOrOwner && !lockEnabled && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowEnableLock(true)}
              className="gap-2"
              data-testid="button-ativar-modo-operador"
              title="Ativar modo operador"
            >
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Modo operador</span>
            </Button>
          )}
          {lockEnabled && activeOperator && (
            <Button
              variant="outline"
              size="sm"
              onClick={clearOperator}
              className="gap-2"
              data-testid="button-bloquear-terminal"
              title="Bloquear terminal"
            >
              <Unlock className="h-3.5 w-3.5" />
              <span className="hidden md:inline">Bloquear</span>
            </Button>
          )}

          <ThemeToggle />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Avatar className="h-8 w-8">
                  {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt="Avatar" />}
                  <AvatarFallback className="bg-gradient-primary text-xs font-semibold text-primary-foreground">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="font-normal">
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{profile?.full_name || user?.user_metadata?.full_name || "Usuário"}</p>
                  <p className="text-xs text-muted-foreground">{user?.email}</p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {isManagerOrOwner && !lockEnabled && (
                <DropdownMenuItem
                  onClick={() => setShowEnableLock(true)}
                  data-testid="menu-ativar-modo-operador"
                >
                  <Lock className="mr-2 h-4 w-4" />
                  Ativar modo operador
                </DropdownMenuItem>
              )}
              {lockEnabled && activeOperator && (
                <DropdownMenuItem
                  onClick={clearOperator}
                  data-testid="menu-bloquear-terminal"
                >
                  <Unlock className="mr-2 h-4 w-4" />
                  Bloquear terminal
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setShowLogoutDialog(true)}
                className="text-destructive focus:text-destructive"
                data-testid="button-sair"
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair da conta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja encerrar sua sessão?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancelar-logout">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleSignOut}
              data-testid="button-confirmar-logout"
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showEnableLock} onOpenChange={setShowEnableLock}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Ativar modo operador</AlertDialogTitle>
            <AlertDialogDescription>
              O terminal será bloqueado e cada funcionário precisará bipar o cartão e
              digitar o PIN para usar o sistema. As permissões passam a ser do
              operador ativo. Você poderá desbloquear depois com sua senha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                enableOperatorMode();
                setShowEnableLock(false);
                toast.success("Terminal bloqueado");
              }}
              data-testid="button-confirmar-ativar-modo-operador"
            >
              Ativar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
