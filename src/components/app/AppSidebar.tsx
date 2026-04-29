import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ClipboardList,
  Users,
  BarChart3,
  Wallet,
  Settings,
  ChefHat,
  ShoppingBag,
  Landmark,
  ScrollText,
  Map,
  LifeBuoy,
  Boxes,
  Truck,
  FileText,
  BookOpen,
  Scale,
  Tag,
  Crown,
  Receipt,
  Lock,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Logo } from "@/components/Logo";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermission";
import type { Permission } from "@/lib/permissions";
import { scrollAppToTop } from "@/lib/scrollToTop";
import { usePlanLimits } from "@/hooks/usePlanLimits";
import { isRoutePlanAllowed } from "@/lib/planAccess";

type NavItem = { title: string; url: string; icon: typeof LayoutDashboard; perm: Permission };

const operational: NavItem[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard, perm: "view_dashboard" },
  { title: "PDV", url: "/pdv", icon: ShoppingCart, perm: "view_pdv" },
  { title: "Caixa", url: "/caixa", icon: Wallet, perm: "view_caixa" },
  { title: "Comandas", url: "/comandas", icon: ClipboardList, perm: "view_comandas" },
  { title: "Cozinha", url: "/kds", icon: ChefHat, perm: "view_kds" },
];

const management: NavItem[] = [
  { title: "Produtos", url: "/produtos", icon: Package, perm: "view_produtos" },
  { title: "Estoque", url: "/estoque", icon: Boxes, perm: "view_estoque" },
  { title: "Balança", url: "/balanca", icon: Scale, perm: "view_balanca" },
  { title: "Fornecedores", url: "/fornecedores", icon: Truck, perm: "view_fornecedores" },
  { title: "Clientes", url: "/clientes", icon: Users, perm: "view_clientes" },
  { title: "Crediário", url: "/crediario", icon: BookOpen, perm: "view_crediario" },
  { title: "Vendas", url: "/vendas", icon: ShoppingBag, perm: "view_vendas" },
  { title: "Promoções", url: "/promocoes", icon: Tag, perm: "view_promocoes" },
  { title: "Financeiro", url: "/financeiro", icon: Landmark, perm: "view_financeiro" },
  { title: "Contas", url: "/contas", icon: FileText, perm: "view_contas" },
  { title: "Relatórios", url: "/relatorios", icon: BarChart3, perm: "view_relatorios" },
  { title: "Auditoria", url: "/auditoria", icon: ScrollText, perm: "view_auditoria" },
];

const settings: NavItem[] = [
  { title: "Plano", url: "/planos", icon: Crown, perm: "manage_billing" },
  { title: "Faturas", url: "/faturas", icon: Receipt, perm: "view_billing" },
  { title: "Configurações", url: "/configuracoes", icon: Settings, perm: "view_configuracoes" },
];

const extras = [
  { title: "Suporte", url: "/suporte", icon: LifeBuoy },
  { title: "Roadmap", url: "/roadmap", icon: Map },
] as const;

export function AppSidebar() {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const location = useLocation();
  const { can } = usePermissions();
  const { planId } = usePlanLimits();

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const handleNavClick = () => {
    if (isMobile) setOpenMobile(false);
    scrollAppToTop();
  };

  const renderItem = (item: NavItem) => {
    const planLocked = !isRoutePlanAllowed(planId, item.url);
    return (
      <SidebarMenuItem key={item.url} className={collapsed ? "flex justify-center" : ""}>
        <SidebarMenuButton
          asChild
          className={cn(
            isActive(item.url) ? "bg-sidebar-accent font-medium text-sidebar-primary" : "",
            collapsed && "justify-center",
            planLocked && "text-muted-foreground/70",
          )}
          tooltip={planLocked ? `${item.title} — exige plano superior` : undefined}
        >
          <NavLink to={item.url} end={item.url === "/"} onClick={handleNavClick}>
            <item.icon className="h-4 w-4" />
            {!collapsed && (
              <span className="flex-1 flex items-center justify-between gap-2">
                <span>{item.title}</span>
                {planLocked && (
                  <Lock
                    className="h-3 w-3 text-muted-foreground/70 shrink-0"
                    data-testid={`lock-${item.url.slice(1) || "dashboard"}`}
                  />
                )}
              </span>
            )}
          </NavLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const visibleOperational = operational.filter((i) => can(i.perm));
  const visibleManagement = management.filter((i) => can(i.perm));
  const visibleSettings = settings.filter((i) => can(i.perm));

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className={cn("flex h-14 items-center", collapsed ? "px-0 justify-center" : "px-2")}>
          <Logo showText={!collapsed} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {visibleOperational.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Operação</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{visibleOperational.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {visibleManagement.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>Gestão</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{visibleManagement.map(renderItem)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <SidebarMenu>
              {extras.map((item) => (
                <SidebarMenuItem key={item.url} className={collapsed ? "flex justify-center" : ""}>
                  <SidebarMenuButton
                    asChild
                    className={cn(
                      isActive(item.url) ? "bg-sidebar-accent font-medium text-sidebar-primary" : "",
                      collapsed && "justify-center",
                    )}
                  >
                    <NavLink to={item.url} onClick={handleNavClick}>
                      <item.icon className="h-4 w-4" />
                      {!collapsed && <span>{item.title}</span>}
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
              {visibleSettings.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
