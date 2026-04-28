import { createContext, useContext, useEffect, useMemo, useState, useCallback, type ReactNode } from "react";
import { useCompany } from "./CompanyContext";
import type { CompanyRole } from "@/lib/permissions";

export interface ActiveOperator {
  id: string;
  name: string;
  role: CompanyRole;
}

interface OperatorContextValue {
  activeOperator: ActiveOperator | null;
  lockEnabled: boolean;
  isLocked: boolean;
  effectiveRole: CompanyRole | null;
  enableOperatorMode: () => void;
  disableOperatorMode: () => void;
  setOperator: (op: ActiveOperator) => void;
  clearOperator: () => void;
}

const OperatorContext = createContext<OperatorContextValue | undefined>(undefined);

const lockKey = (companyId: string) => `pdv_operator_lock_${companyId}`;
const opKey = (companyId: string) => `pdv_active_operator_${companyId}`;

export function OperatorProvider({ children }: { children: ReactNode }) {
  const { activeCompany } = useCompany();
  const companyId = activeCompany?.id ?? null;

  const [lockEnabled, setLockEnabled] = useState(false);
  const [activeOperator, setActiveOperatorState] = useState<ActiveOperator | null>(null);

  useEffect(() => {
    if (!companyId) {
      setLockEnabled(false);
      setActiveOperatorState(null);
      return;
    }
    const lock = localStorage.getItem(lockKey(companyId)) === "1";
    setLockEnabled(lock);
    const stored = localStorage.getItem(opKey(companyId));
    if (stored) {
      try {
        setActiveOperatorState(JSON.parse(stored));
      } catch {
        setActiveOperatorState(null);
      }
    } else {
      setActiveOperatorState(null);
    }
  }, [companyId]);

  const enableOperatorMode = useCallback(() => {
    if (!companyId) return;
    localStorage.setItem(lockKey(companyId), "1");
    localStorage.removeItem(opKey(companyId));
    setLockEnabled(true);
    setActiveOperatorState(null);
  }, [companyId]);

  const disableOperatorMode = useCallback(() => {
    if (!companyId) return;
    localStorage.removeItem(lockKey(companyId));
    localStorage.removeItem(opKey(companyId));
    setLockEnabled(false);
    setActiveOperatorState(null);
  }, [companyId]);

  const setOperator = useCallback((op: ActiveOperator) => {
    if (!companyId) return;
    localStorage.setItem(opKey(companyId), JSON.stringify(op));
    setActiveOperatorState(op);
  }, [companyId]);

  const clearOperator = useCallback(() => {
    if (!companyId) return;
    localStorage.removeItem(opKey(companyId));
    setActiveOperatorState(null);
  }, [companyId]);

  const value = useMemo<OperatorContextValue>(() => {
    const isLocked = lockEnabled && !activeOperator;
    const effectiveRole: CompanyRole | null = activeOperator
      ? activeOperator.role
      : (activeCompany?.role ?? null);
    return {
      activeOperator,
      lockEnabled,
      isLocked,
      effectiveRole,
      enableOperatorMode,
      disableOperatorMode,
      setOperator,
      clearOperator,
    };
  }, [activeOperator, lockEnabled, activeCompany?.role, enableOperatorMode, disableOperatorMode, setOperator, clearOperator]);

  return <OperatorContext.Provider value={value}>{children}</OperatorContext.Provider>;
}

export function useOperator() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperator must be used within OperatorProvider");
  return ctx;
}
