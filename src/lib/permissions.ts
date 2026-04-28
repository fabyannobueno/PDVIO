import type { CompanyRole } from "@/contexts/CompanyContext";

export type Permission =
  | "view_dashboard"
  | "view_pdv"
  | "view_caixa"
  | "view_comandas"
  | "view_kds"
  | "view_produtos"
  | "view_clientes"
  | "view_crediario"
  | "view_vendas"
  | "view_financeiro"
  | "view_relatorios"
  | "view_configuracoes"
  | "view_auditoria"
  | "view_estoque"
  | "view_fornecedores"
  | "view_contas"
  | "view_balanca"
  | "view_promocoes"
  | "manage_promocoes"
  | "manage_company"
  | "manage_staff"
  | "manage_products"
  | "manage_customers"
  | "cancel_sale"
  | "refund_sale"
  | "apply_discount"
  | "open_close_cash"
  | "cash_movement";

const ROLE_PERMISSIONS: Record<CompanyRole, Permission[]> = {
  owner: [
    "view_dashboard",
    "view_pdv",
    "view_caixa",
    "view_comandas",
    "view_kds",
    "view_produtos",
    "view_clientes",
    "view_crediario",
    "view_vendas",
    "view_financeiro",
    "view_relatorios",
    "view_configuracoes",
    "view_auditoria",
    "view_estoque",
    "view_fornecedores",
    "view_contas",
    "view_balanca",
    "view_promocoes",
    "manage_promocoes",
    "manage_company",
    "manage_staff",
    "manage_products",
    "manage_customers",
    "cancel_sale",
    "refund_sale",
    "apply_discount",
    "open_close_cash",
    "cash_movement",
  ],
  manager: [
    "view_dashboard",
    "view_pdv",
    "view_caixa",
    "view_comandas",
    "view_kds",
    "view_produtos",
    "view_clientes",
    "view_crediario",
    "view_vendas",
    "view_financeiro",
    "view_relatorios",
    "view_configuracoes",
    "view_auditoria",
    "view_estoque",
    "view_fornecedores",
    "view_contas",
    "view_balanca",
    "view_promocoes",
    "manage_promocoes",
    "manage_staff",
    "manage_products",
    "manage_customers",
    "cancel_sale",
    "refund_sale",
    "apply_discount",
    "open_close_cash",
    "cash_movement",
  ],
  cashier: [
    "view_pdv",
    "view_caixa",
    "view_comandas",
    "view_clientes",
    "view_crediario",
    "view_vendas",
    "view_promocoes",
    "manage_customers",
    "apply_discount",
    "open_close_cash",
  ],
  waiter: [
    "view_comandas",
  ],
  kitchen: [
    "view_kds",
  ],
};

export const ROLE_LABEL: Record<CompanyRole, string> = {
  owner: "Proprietário",
  manager: "Gerente",
  cashier: "Caixa",
  waiter: "Garçom",
  kitchen: "Cozinha",
};

export function hasPermission(role: CompanyRole | null | undefined, perm: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(perm) ?? false;
}

export function getRolePermissions(role: CompanyRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export const PERMISSION_TO_ROUTE: Partial<Record<Permission, string>> = {
  view_dashboard: "/",
  view_pdv: "/pdv",
  view_caixa: "/caixa",
  view_comandas: "/comandas",
  view_kds: "/kds",
  view_produtos: "/produtos",
  view_clientes: "/clientes",
  view_crediario: "/crediario",
  view_vendas: "/vendas",
  view_financeiro: "/financeiro",
  view_relatorios: "/relatorios",
  view_configuracoes: "/configuracoes",
  view_auditoria: "/auditoria",
  view_estoque: "/estoque",
  view_fornecedores: "/fornecedores",
  view_contas: "/contas",
  view_balanca: "/balanca",
  view_promocoes: "/promocoes",
};

export function defaultLandingForRole(role: CompanyRole): string {
  const order: Permission[] = [
    "view_dashboard",
    "view_pdv",
    "view_comandas",
    "view_kds",
    "view_caixa",
    "view_clientes",
    "view_crediario",
  ];
  for (const p of order) {
    if (hasPermission(role, p)) return PERMISSION_TO_ROUTE[p] ?? "/";
  }
  return "/";
}
