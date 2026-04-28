import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/contexts/AuthContext";
import { CompanyProvider } from "@/contexts/CompanyContext";
import { OperatorProvider } from "@/contexts/OperatorContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AppLayout } from "@/components/app/AppLayout";
import Dashboard from "./pages/Dashboard";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import AuthConfirm from "./pages/AuthConfirm";
import Onboarding from "./pages/Onboarding";
import Produtos from "./pages/Produtos";
import PDV from "./pages/PDV";
import Clientes from "./pages/Clientes";
import Crediario from "./pages/Crediario";
import Comandas from "./pages/Comandas";
import KDS from "./pages/KDS";
import ComingSoon from "./pages/ComingSoon";
import Configuracoes from "./pages/Configuracoes";
import Financeiro from "./pages/Financeiro";
import NotFound from "./pages/NotFound.tsx";
import TermosDeUso from "./pages/TermosDeUso";
import PoliticaDePrivacidade from "./pages/PoliticaDePrivacidade";
import Lgpd from "./pages/Lgpd";
import Relatorios from "./pages/Relatorios";
import Vendas from "./pages/Vendas";
import Caixa from "./pages/Caixa";
import Auditoria from "./pages/Auditoria";
import Estoque from "./pages/Estoque";
import Balanca from "./pages/Balanca";
import Fornecedores from "./pages/Fornecedores";
import Contas from "./pages/Contas";
import Roadmap from "./pages/Roadmap";
import Promocoes from "./pages/Promocoes";
import Suporte from "./pages/Suporte";
import SuporteTicket from "./pages/SuporteTicket";
import { PermissionGuard } from "@/components/PermissionGuard";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
    },
  },
});

function useBlockBrowserShortcuts() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Block Ctrl+J / Ctrl+Shift+J (browser downloads / dev tools)
      // and Ctrl+S (save) — barcode scanners often emit these as terminators.
      if (e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "j" || k === "s") {
          e.preventDefault();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true } as any);
  }, []);
}

const AppShortcutsGuard = () => {
  useBlockBrowserShortcuts();
  return null;
};

const App = () => (
  <ThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppShortcutsGuard />
        <Toaster />
        <Sonner position="top-right" richColors />
        <BrowserRouter>
          <AuthProvider>
            <CompanyProvider>
              <OperatorProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/auth/confirm" element={<AuthConfirm />} />
                <Route path="/termos-de-uso" element={<TermosDeUso />} />
                <Route path="/politica-de-privacidade" element={<PoliticaDePrivacidade />} />
                <Route path="/lgpd" element={<Lgpd />} />
                <Route
                  path="/onboarding"
                  element={
                    <ProtectedRoute>
                      <Onboarding />
                    </ProtectedRoute>
                  }
                />
                <Route
                  element={
                    <ProtectedRoute>
                      <AppLayout />
                    </ProtectedRoute>
                  }
                >
                  <Route path="/" element={<PermissionGuard permission="view_dashboard"><Dashboard /></PermissionGuard>} />
                  <Route path="/pdv" element={<PermissionGuard permission="view_pdv"><PDV /></PermissionGuard>} />
                  <Route path="/comandas" element={<PermissionGuard permission="view_comandas"><Comandas /></PermissionGuard>} />
                  <Route path="/kds" element={<PermissionGuard permission="view_kds"><KDS /></PermissionGuard>} />
                  <Route path="/produtos" element={<PermissionGuard permission="view_produtos"><Produtos /></PermissionGuard>} />
                  <Route path="/clientes" element={<PermissionGuard permission="view_clientes"><Clientes /></PermissionGuard>} />
                  <Route path="/crediario" element={<PermissionGuard permission="view_crediario"><Crediario /></PermissionGuard>} />
                  <Route path="/financeiro" element={<PermissionGuard permission="view_financeiro"><Financeiro /></PermissionGuard>} />
                  <Route path="/relatorios" element={<PermissionGuard permission="view_relatorios"><Relatorios /></PermissionGuard>} />
                  <Route path="/vendas" element={<PermissionGuard permission="view_vendas"><Vendas /></PermissionGuard>} />
                  <Route path="/caixa" element={<PermissionGuard permission="view_caixa"><Caixa /></PermissionGuard>} />
                  <Route path="/configuracoes" element={<PermissionGuard permission="view_configuracoes"><Configuracoes /></PermissionGuard>} />
                  <Route path="/auditoria" element={<PermissionGuard permission="view_auditoria"><Auditoria /></PermissionGuard>} />
                  <Route path="/estoque" element={<PermissionGuard permission="view_estoque"><Estoque /></PermissionGuard>} />
                  <Route path="/balanca" element={<PermissionGuard permission="view_balanca"><Balanca /></PermissionGuard>} />
                  <Route path="/fornecedores" element={<PermissionGuard permission="view_fornecedores"><Fornecedores /></PermissionGuard>} />
                  <Route path="/contas" element={<PermissionGuard permission="view_contas"><Contas /></PermissionGuard>} />
                  <Route path="/promocoes" element={<PermissionGuard permission="view_promocoes"><Promocoes /></PermissionGuard>} />
                  <Route path="/roadmap" element={<Roadmap />} />
                  <Route path="/suporte" element={<Suporte />} />
                  <Route path="/suporte/ticket/:seq" element={<SuporteTicket />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
              </OperatorProvider>
            </CompanyProvider>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
