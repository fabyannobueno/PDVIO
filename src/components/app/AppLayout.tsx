import { useEffect, useState } from "react";
import { Outlet, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { OperatorLockScreen } from "@/components/OperatorLockScreen";
import { supabase } from "@/integrations/supabase/client";
import { useBillingRealtime } from "@/hooks/useBillingRealtime";
import { Loader2 } from "lucide-react";

export function AppLayout() {
  const { user } = useAuth();
  const { companies, loading } = useCompany();
  const { isLocked } = useOperator();
  useBillingRealtime();
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);

  useEffect(() => {
    if (!user) {
      setProfileLoading(false);
      setProfileComplete(false);
      return;
    }
    let cancelled = false;
    setProfileLoading(true);
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("profile_completed")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setProfileComplete(!!data?.profile_completed);
      setProfileLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (loading || profileLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (companies.length === 0) {
    return <Navigate to="/onboarding" replace />;
  }

  if (!profileComplete) {
    return <Navigate to="/complete-profile" replace />;
  }

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full overflow-hidden bg-background">
        <AppSidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader />
          <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div id="app-scroll" className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <Outlet />
            </div>
          </main>
        </div>
      </div>
      {isLocked && <OperatorLockScreen />}
    </SidebarProvider>
  );
}
