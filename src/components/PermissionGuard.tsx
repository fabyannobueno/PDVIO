import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { hasPermission, defaultLandingForRole, type Permission } from "@/lib/permissions";
import { Loader2, ShieldAlert } from "lucide-react";

interface Props {
  permission: Permission;
  children: ReactNode;
  /** When true, render an inline access-denied message instead of redirecting */
  inline?: boolean;
}

export function PermissionGuard({ permission, children, inline }: Props) {
  const { activeCompany, loading } = useCompany();
  const { effectiveRole } = useOperator();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!activeCompany) return <Navigate to="/onboarding" replace />;

  const role = effectiveRole ?? activeCompany.role;

  if (!hasPermission(role, permission)) {
    if (inline) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="rounded-full bg-muted p-4">
            <ShieldAlert className="h-8 w-8 text-muted-foreground opacity-60" />
          </div>
          <h2 className="text-lg font-semibold">Acesso restrito</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Seu perfil não tem permissão para acessar esta página. Fale com o proprietário ou gerente da empresa.
          </p>
        </div>
      );
    }
    return <Navigate to={defaultLandingForRole(role)} replace />;
  }

  return <>{children}</>;
}
