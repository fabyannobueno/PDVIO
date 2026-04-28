import { scrollAppToTop } from "@/lib/scrollToTop";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText, Search, Filter, User, Clock, ShieldAlert } from "lucide-react";
import { AUDIT_ACTION_LABEL, type AuditAction } from "@/lib/auditLog";
import { ROLE_LABEL } from "@/lib/permissions";

interface AuditRow {
  id: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  metadata: Record<string, any> | null;
  user_id: string | null;
  user_name: string | null;
  user_role: string | null;
  staff_id: string | null;
  staff_name: string | null;
  staff_role: string | null;
  created_at: string;
}

const ACTION_GROUPS: Record<string, string> = {
  "sale.cancelled": "destructive",
  "sale.refunded": "warning",
  "sale.discount_applied": "default",
  "cash.opened": "secondary",
  "cash.closed": "secondary",
  "cash.movement": "secondary",
  "staff.created": "default",
  "staff.updated": "default",
  "staff.deleted": "destructive",
  "company.updated": "default",
  "product.deleted": "destructive",
};

const META_KEY_LABEL: Record<string, string> = {
  amount: "Valor",
  declared: "Declarado",
  expected: "Esperado",
  difference: "Diferença",
  total: "Total",
  subtotal: "Subtotal",
  discount: "Desconto",
  discount_amount: "Desconto",
  order_discount: "Desc. pedido",
  item_discount: "Desc. itens",
  payment: "Pagamento",
  payment_method: "Pagamento",
  reason: "Motivo",
  notes: "Observação",
  type: "Tipo",
  items: "Itens",
  quantity: "Qtd",
  refund_type: "Tipo",
  opening_amount: "Abertura",
  closing_amount: "Fechamento",
  cash_in: "Entradas",
  cash_out: "Saídas",
  sangria: "Sangria",
  suprimento: "Suprimento",
};

const MONEY_KEYS = new Set([
  "amount",
  "declared",
  "expected",
  "difference",
  "total",
  "subtotal",
  "discount",
  "discount_amount",
  "order_discount",
  "item_discount",
  "value",
  "price",
  "opening_amount",
  "closing_amount",
  "cash_in",
  "cash_out",
  "sangria",
  "suprimento",
]);

const ENTITY_LABEL: Record<string, string> = {
  cash_session: "Caixa",
  cash_movement: "Movimentação",
  sale: "Venda",
  product: "Produto",
  staff: "Funcionário",
  company: "Empresa",
  customer: "Cliente",
};

const TYPE_LABEL: Record<string, string> = {
  sangria: "Sangria",
  suprimento: "Suprimento",
  total: "Total",
  partial: "Parcial",
  cash: "Dinheiro",
  credit: "Crédito",
  debit: "Débito",
  pix: "PIX",
};

function fmtBRL(v: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(v);
}

function formatMetaValue(key: string, v: unknown): string {
  if (v == null || v === "") return "";
  if (MONEY_KEYS.has(key) && typeof v === "number") return fmtBRL(v);
  if (typeof v === "string" && TYPE_LABEL[v]) return TYPE_LABEL[v];
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Auditoria() {
  const { activeCompany } = useCompany();
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [period, setPeriod] = useState<"7" | "30" | "90" | "all">("30");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["/auditoria", activeCompany?.id, period],
    enabled: !!activeCompany,
    queryFn: async () => {
      let q = (supabase as any)
        .from("audit_logs")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (period !== "all") {
        const days = parseInt(period, 10);
        const since = new Date();
        since.setDate(since.getDate() - days);
        q = q.gte("created_at", since.toISOString());
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  // Fallback: lookup staff role for older logs that don't have staff_role saved.
  const { data: staffMap = {} } = useQuery({
    queryKey: ["/auditoria/staff-roles", activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_members")
        .select("id, role")
        .eq("company_id", activeCompany!.id);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const s of data ?? []) map[s.id] = s.role;
      return map;
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return logs.filter((l) => {
      if (actionFilter !== "all" && l.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (l.user_name ?? "").toLowerCase().includes(q) ||
        (l.staff_name ?? "").toLowerCase().includes(q) ||
        (l.description ?? "").toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q)
      );
    });
  }, [logs, search, actionFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, actionFilter, period]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageItems = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 sm:p-6 md:p-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Auditoria</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Histórico de ações sensíveis: cancelamentos, descontos, movimentações de caixa.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por usuário, descrição..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-audit-search"
          />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-full sm:w-56" data-testid="select-audit-action">
            <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue placeholder="Ação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as ações</SelectItem>
            {uniqueActions.map((a) => (
              <SelectItem key={a} value={a}>
                {AUDIT_ACTION_LABEL[a as AuditAction] ?? a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as any)}>
          <SelectTrigger className="w-full sm:w-44" data-testid="select-audit-period">
            <Clock className="mr-2 h-4 w-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Últimos 7 dias</SelectItem>
            <SelectItem value="30">Últimos 30 dias</SelectItem>
            <SelectItem value="90">Últimos 90 dias</SelectItem>
            <SelectItem value="all">Tudo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/60">
        <CardHeader>
          <CardTitle className="text-base">Eventos</CardTitle>
          <CardDescription>
            {isLoading
            ? "Carregando..."
            : filtered.length === 0
              ? "Nenhum evento"
              : `${filtered.length} ${filtered.length === 1 ? "evento" : "eventos"} • Página ${currentPage} de ${totalPages}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="space-y-3 p-4">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
              <div className="rounded-full bg-muted p-4">
                <ScrollText className="h-8 w-8 text-muted-foreground opacity-40" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Nenhum evento registrado
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {pageItems.map((l) => {
                const variant = (ACTION_GROUPS[l.action] ?? "secondary") as
                  | "default"
                  | "secondary"
                  | "destructive"
                  | "warning";
                return (
                  <div
                    key={l.id}
                    className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                    data-testid={`audit-row-${l.id}`}
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            variant === "warning" ? "secondary" : variant
                          }
                          className={
                            variant === "warning"
                              ? "bg-warning/15 text-warning border-warning/30"
                              : ""
                          }
                        >
                          {AUDIT_ACTION_LABEL[l.action as AuditAction] ?? l.action}
                        </Badge>
                        {l.description && (
                          <span className="text-sm text-foreground truncate">
                            {l.description}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {l.staff_name ? (
                            <>
                              {l.staff_name}
                              {(() => {
                                const role =
                                  l.staff_role ??
                                  (l.staff_id ? staffMap[l.staff_id] : null);
                                if (!role) return null;
                                return (
                                  <span className="ml-1 text-muted-foreground/70">
                                    ({ROLE_LABEL[role as keyof typeof ROLE_LABEL] ?? role})
                                  </span>
                                );
                              })()}
                            </>
                          ) : (
                            <>
                              {l.user_name ?? "—"}
                              {l.user_role && (
                                <span className="ml-1 text-muted-foreground/70">
                                  ({ROLE_LABEL[l.user_role as keyof typeof ROLE_LABEL] ?? l.user_role})
                                </span>
                              )}
                            </>
                          )}
                        </span>
                        {l.entity_type && l.entity_id && (
                          <span className="text-[11px]">
                            {ENTITY_LABEL[l.entity_type] ?? l.entity_type}
                            <span className="ml-1 font-mono text-muted-foreground/60">
                              #{l.entity_id.slice(0, 8)}
                            </span>
                          </span>
                        )}
                      </div>
                      {l.metadata && (() => {
                        const entries = Object.entries(l.metadata).filter(
                          ([, v]) => v != null && v !== "" && !(typeof v === "object" && v !== null && Object.keys(v as object).length === 0),
                        );
                        if (entries.length === 0) return null;
                        return (
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            {entries.slice(0, 6).map(([k, v]) => {
                              const label = META_KEY_LABEL[k] ?? k;
                              const value = formatMetaValue(k, v);
                              if (!value) return null;
                              return (
                                <span key={k}>
                                  <span className="text-muted-foreground/70">{label}:</span>{" "}
                                  <span className="font-medium text-foreground/80">{value}</span>
                                </span>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground sm:text-right shrink-0">
                      {formatDate(l.created_at)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {!isLoading && filtered.length > 0 && totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3">
              <span className="text-xs text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage((p) => Math.max(1, p - 1)); scrollAppToTop(); }}
                  disabled={currentPage <= 1}
                  data-testid="button-audit-prev"
                >
                  <ChevronLeft className="h-4 w-4" />
                  <span className="hidden sm:ml-1 sm:inline">Anterior</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); scrollAppToTop(); }}
                  disabled={currentPage >= totalPages}
                  data-testid="button-audit-next"
                >
                  <span className="hidden sm:mr-1 sm:inline">Próxima</span>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
