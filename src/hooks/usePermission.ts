import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { hasPermission, type Permission } from "@/lib/permissions";

/**
 * Returns the role currently in effect for permission checks.
 * If an operator is logged in (badge+PIN), uses the operator's role.
 * Otherwise, falls back to the logged-in account's company role.
 */
function useEffectiveRole() {
  const { activeCompany } = useCompany();
  const { effectiveRole } = useOperator();
  return effectiveRole ?? activeCompany?.role ?? null;
}

export function usePermission(perm: Permission): boolean {
  const role = useEffectiveRole();
  return hasPermission(role, perm);
}

export function usePermissions() {
  const role = useEffectiveRole();
  return {
    role,
    can: (perm: Permission) => hasPermission(role, perm),
  };
}
