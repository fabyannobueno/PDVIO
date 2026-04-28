import { createContext, useContext, useEffect, useState, useRef, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { hydrateSettingsFromDB } from "@/lib/printer";
import { useAuth } from "./AuthContext";

export type CompanyRole = "owner" | "manager" | "cashier" | "waiter" | "kitchen";

export interface Company {
  id: string;
  name: string;
  business_type: string;
  document: string | null;
  logo_url: string | null;
  phone: string | null;
  address: string | null;
  role: CompanyRole;
}

interface CompanyContextValue {
  companies: Company[];
  activeCompany: Company | null;
  loading: boolean;
  setActiveCompany: (c: Company) => void;
  refresh: () => Promise<void>;
}

const STORAGE_KEY = "pdv_active_company_id";
const CompanyContext = createContext<CompanyContextValue | undefined>(undefined);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompany, setActiveCompanyState] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const initialized = useRef(false);
  const lastUserId = useRef<string | null | undefined>(undefined);

  if (lastUserId.current !== (user?.id ?? null)) {
    lastUserId.current = user?.id ?? null;
    if (user) {
      if (!loading) setLoading(true);
      if (companies.length) setCompanies([]);
      if (activeCompany) setActiveCompanyState(null);
    }
  }

  const refresh = useCallback(async (isInitial = false) => {
    if (!user) {
      setCompanies([]);
      setActiveCompanyState(null);
      setLoading(false);
      initialized.current = false;
      return;
    }
    if (isInitial) setLoading(true);

    const { data, error } = await supabase
      .from("company_members")
      .select("role, companies:company_id (id, name, business_type, document, logo_url, phone, address)")
      .eq("user_id", user.id);

    if (error || !data) {
      setCompanies([]);
      setLoading(false);
      return;
    }

    const list: Company[] = data
      .filter((row: any) => row.companies)
      .map((row: any) => ({
        id: row.companies.id,
        name: row.companies.name,
        business_type: row.companies.business_type,
        document: row.companies.document,
        logo_url: row.companies.logo_url,
        phone: row.companies.phone ?? null,
        address: row.companies.address ?? null,
        role: row.role as CompanyRole,
      }));

    setCompanies(list);

    const savedId = localStorage.getItem(STORAGE_KEY);
    const found = list.find((c) => c.id === savedId) ?? list[0] ?? null;
    setActiveCompanyState(found);
    setLoading(false);
    if (found) hydrateSettingsFromDB(found.id).catch(() => {});
  }, [user]);

  useEffect(() => {
    initialized.current = false;
    refresh(true);
  }, [refresh]);

  const setActiveCompany = (c: Company) => {
    localStorage.setItem(STORAGE_KEY, c.id);
    setActiveCompanyState(c);
    hydrateSettingsFromDB(c.id).catch(() => {});
  };

  return (
    <CompanyContext.Provider value={{ companies, activeCompany, loading, setActiveCompany, refresh }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error("useCompany must be used within CompanyProvider");
  return ctx;
}
