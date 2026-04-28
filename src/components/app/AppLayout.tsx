import { Outlet, Navigate } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { AppHeader } from "./AppHeader";
import { useCompany } from "@/contexts/CompanyContext";
import { useOperator } from "@/contexts/OperatorContext";
import { OperatorLockScreen } from "@/components/OperatorLockScreen";
import { Loader2 } from "lucide-react";

export function AppLayout() {
  const { companies, loading } = useCompany();
  const { isLocked } = useOperator();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (companies.length === 0) {
    return <Navigate to="/onboarding" replace />;
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
