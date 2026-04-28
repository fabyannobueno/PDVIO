import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { toast } from "sonner";
import {
  Plus, Loader2, FileText, CheckCircle2, XCircle, AlertCircle, Clock,
  ArrowUpRight, ArrowDownRight, TrendingUp, Pencil, Trash2,
} from "lucide-react";

type AccountKind = "payable" | "receivable";
type AccountStatus = "open" | "paid" | "cancelled";

interface Account {
  id: string;
  company_id: string;
  kind: AccountKind;
  description: string;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: AccountStatus;
  category: string | null;
  supplier_id: string | null;
  customer_id: string | null;
  installment_number: number | null;
  installment_total: number | null;
  installment_group: string | null;
  notes: string | null;
  created_at: string;
  suppliers?: { name: string } | null;
  customers?: { name: string } | null;
}

interface Supplier { id: string; name: string }
interface Customer { id: string; name: string }

interface FormState {
  kind: AccountKind;
  description: string;
  amount: string;
  due_date: string;
  category: string;
  supplier_id: string;
  customer_id: string;
  installments: string; // 1 = no parcels
  interval_days: string; // typically 30
  notes: string;
}

const TODAY_ISO = () => {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = brt.getUTCFullYear();
  const m = String(brt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(brt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const EMPTY_FORM = (kind: AccountKind): FormState => ({
  kind,
  description: "",
  amount: "",
  due_date: TODAY_ISO(),
  category: "",
  supplier_id: "",
  customer_id: "",
  installments: "1",
  interval_days: "30",
  notes: "",
});

function maskCurrencyFromDigits(digits: string): string {
  const cents = parseInt(digits.replace(/\D/g, "") || "0", 10);
  const str = String(Math.abs(cents)).padStart(3, "0");
  const intPart = str.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = str.slice(-2);
  return `${intPart || "0"},${dec}`;
}

function parseCurrencyMask(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

function numberToMask(n: number): string {
  if (!n || isNaN(n)) return "";
  return maskCurrencyFromDigits(String(Math.round(n * 100)));
}

function fmtBRL(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

function isOverdue(account: Account): boolean {
  if (account.status !== "open") return false;
  return account.due_date < TODAY_ISO();
}

function statusOf(account: Account): "paid" | "overdue" | "open" | "cancelled" {
  if (account.status === "paid") return "paid";
  if (account.status === "cancelled") return "cancelled";
  return isOverdue(account) ? "overdue" : "open";
}

const STATUS_LABEL = {
  paid: "Pago",
  overdue: "Atrasado",
  open: "Em aberto",
  cancelled: "Cancelado",
} as const;

const STATUS_COLOR = {
  paid: "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
  overdue: "bg-red-500/15 text-red-700 border-red-500/30",
  open: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  cancelled: "bg-muted text-muted-foreground border-border",
} as const;

export default function Contas() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<AccountKind>("payable");
  const [statusFilter, setStatusFilter] = useState<"all" | "open" | "overdue" | "paid">("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM("payable"));
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [payDialogId, setPayDialogId] = useState<string | null>(null);
  const [payDate, setPayDate] = useState(TODAY_ISO());
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 8;

  const { data: accounts = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("accounts")
        .select("*, suppliers(name), customers(name)")
        .eq("company_id", activeCompany!.id)
        .order("due_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Account[];
    },
  });

  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", activeCompany?.id, "select"],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("suppliers").select("id, name")
        .eq("company_id", activeCompany!.id).order("name");
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers", activeCompany?.id, "select"],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("customers").select("id, name")
        .eq("company_id", activeCompany!.id).order("name");
      if (error) throw error;
      return (data ?? []) as Customer[];
    },
  });

  const filtered = useMemo(() => {
    return accounts
      .filter((a) => a.kind === activeTab)
      .filter((a) => {
        if (statusFilter === "all") return true;
        const s = statusOf(a);
        return s === statusFilter;
      });
  }, [accounts, activeTab, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated = useMemo(
    () => filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [filtered, currentPage],
  );

  // Reset to first page on filter changes
  useEffect(() => { setPage(1); }, [activeTab, statusFilter]);

  // ── KPIs for current tab ────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const list = accounts.filter((a) => a.kind === activeTab);
    const open = list.filter((a) => a.status === "open");
    const overdue = open.filter(isOverdue);
    const paid = list.filter((a) => a.status === "paid");
    return {
      openTotal: open.reduce((s, a) => s + Number(a.amount), 0),
      overdueTotal: overdue.reduce((s, a) => s + Number(a.amount), 0),
      paidTotal: paid.reduce((s, a) => s + Number(a.amount), 0),
      openCount: open.length,
      overdueCount: overdue.length,
    };
  }, [accounts, activeTab]);

  // ── Cash flow projection: next 30 days ──────────────────────────────────
  const cashFlow = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { date: string; label: string; in: number; out: number; net: number; cum: number }[] = [];
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      const iso = d.toISOString().slice(0, 10);
      days.push({
        date: iso,
        label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
        in: 0,
        out: 0,
        net: 0,
        cum: 0,
      });
    }
    const idx = new Map(days.map((d, i) => [d.date, i]));
    accounts.forEach((a) => {
      if (a.status !== "open") return;
      const i = idx.get(a.due_date);
      if (i == null) return;
      if (a.kind === "receivable") days[i].in += Number(a.amount);
      else days[i].out += Number(a.amount);
    });
    let cum = 0;
    days.forEach((d) => {
      d.net = d.in - d.out;
      cum += d.net;
      d.cum = cum;
    });
    return days;
  }, [accounts]);

  const saveMutation = useMutation({
    mutationFn: async (values: FormState) => {
      const amount = parseCurrencyMask(values.amount);
      if (!values.description.trim()) throw new Error("Descrição é obrigatória");
      if (!amount || amount <= 0) throw new Error("Valor inválido");
      if (!values.due_date) throw new Error("Data de vencimento obrigatória");
      if (!editing && values.due_date < TODAY_ISO()) throw new Error("A data de vencimento não pode ser anterior à data atual");

      if (editing) {
        const { error } = await (supabase as any).from("accounts").update({
          description: values.description.trim(),
          amount,
          due_date: values.due_date,
          category: values.category.trim() || null,
          supplier_id: values.supplier_id || null,
          customer_id: values.customer_id || null,
          notes: values.notes.trim() || null,
        }).eq("id", editing.id);
        if (error) throw error;
        return;
      }

      const installments = Math.max(1, parseInt(values.installments) || 1);
      const intervalDays = Math.max(1, parseInt(values.interval_days) || 30);
      const groupId = installments > 1 ? crypto.randomUUID() : null;
      const installmentAmount = Math.round((amount / installments) * 100) / 100;
      const baseDate = new Date(values.due_date + "T00:00:00");

      const rows = [];
      for (let i = 0; i < installments; i++) {
        const d = new Date(baseDate);
        d.setDate(baseDate.getDate() + i * intervalDays);
        const due = d.toISOString().slice(0, 10);
        // Last installment absorbs the rounding diff
        const amt = i === installments - 1
          ? Math.round((amount - installmentAmount * (installments - 1)) * 100) / 100
          : installmentAmount;
        rows.push({
          company_id: activeCompany!.id,
          kind: values.kind,
          description: installments > 1
            ? `${values.description.trim()} (${i + 1}/${installments})`
            : values.description.trim(),
          amount: amt,
          due_date: due,
          category: values.category.trim() || null,
          supplier_id: values.kind === "payable" ? (values.supplier_id || null) : null,
          customer_id: values.kind === "receivable" ? (values.customer_id || null) : null,
          installment_number: installments > 1 ? i + 1 : null,
          installment_total: installments > 1 ? installments : null,
          installment_group: groupId,
          notes: values.notes.trim() || null,
        });
      }
      const { error } = await (supabase as any).from("accounts").insert(rows);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", activeCompany?.id] });
      toast.success(editing ? "Conta atualizada" : "Conta(s) criada(s)");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar"),
  });

  const payMutation = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      const { error } = await (supabase as any).from("accounts")
        .update({ status: "paid", paid_date: date })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", activeCompany?.id] });
      toast.success("Pagamento registrado");
      setPayDialogId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const reopenMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("accounts")
        .update({ status: "open", paid_date: null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", activeCompany?.id] });
      toast.success("Conta reaberta");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("accounts")
        .update({ status: "cancelled" }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", activeCompany?.id] });
      toast.success("Conta cancelada");
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts", activeCompany?.id] });
      toast.success("Conta removida");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro"),
  });

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM(activeTab));
    setDialogOpen(true);
  }

  function openEdit(a: Account) {
    setEditing(a);
    setForm({
      kind: a.kind,
      description: a.description.replace(/\s\(\d+\/\d+\)$/, ""),
      amount: numberToMask(Number(a.amount)),
      due_date: a.due_date.slice(0, 10),
      category: a.category ?? "",
      supplier_id: a.supplier_id ?? "",
      customer_id: a.customer_id ?? "",
      installments: "1",
      interval_days: "30",
      notes: a.notes ?? "",
    });
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6 md:p-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contas a Pagar e Receber</h1>
          <p className="text-sm text-muted-foreground">
            Vencimentos, parcelamentos e fluxo de caixa projetado
          </p>
        </div>
        <Button onClick={openCreate} data-testid="btn-new-account">
          <Plus className="mr-2 h-4 w-4" />
          Nova conta
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AccountKind)}>
        <TabsList>
          <TabsTrigger value="payable" data-testid="tab-payable">
            <ArrowUpRight className="mr-2 h-4 w-4" /> A Pagar
          </TabsTrigger>
          <TabsTrigger value="receivable" data-testid="tab-receivable">
            <ArrowDownRight className="mr-2 h-4 w-4" /> A Receber
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {/* KPIs */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <Clock className="h-4 w-4" /> Em aberto
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold" data-testid="text-open-total">{fmtBRL(kpis.openTotal)}</p>
                <p className="text-xs text-muted-foreground">{kpis.openCount} conta(s)</p>
              </CardContent>
            </Card>
            <Card className={kpis.overdueCount > 0 ? "border-red-500/40" : ""}>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <AlertCircle className="h-4 w-4" /> Atrasado
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-red-600" data-testid="text-overdue-total">{fmtBRL(kpis.overdueTotal)}</p>
                <p className="text-xs text-muted-foreground">{kpis.overdueCount} conta(s)</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4" /> Pago (histórico)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold text-emerald-600" data-testid="text-paid-total">{fmtBRL(kpis.paidTotal)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Cash flow chart */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="h-4 w-4" /> Fluxo de caixa projetado (próximos 30 dias)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                {cashFlow.every((d) => d.in === 0 && d.out === 0) ? (
                  <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-muted-foreground">
                    <TrendingUp className="h-10 w-10 opacity-40" />
                    <p className="text-sm font-medium">Sem dados para exibir</p>
                    <p className="text-xs">
                      Cadastre contas com vencimento nos próximos 30 dias para visualizar a projeção do fluxo de caixa.
                    </p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={cashFlow} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `R$${(v / 1000).toFixed(0)}k`} />
                      <Tooltip
                        formatter={(v: any) => fmtBRL(Number(v))}
                        labelFormatter={(l) => `Dia ${l}`}
                        contentStyle={{ fontSize: 12 }}
                      />
                      <ReferenceLine y={0} stroke="hsl(var(--border))" />
                      <Line type="monotone" dataKey="cum" name="Saldo acumulado" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Filter */}
          <div className="flex items-center gap-2">
            <Label className="text-sm">Status:</Label>
            <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
              <SelectTrigger className="w-40" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Em aberto</SelectItem>
                <SelectItem value="overdue">Atrasados</SelectItem>
                <SelectItem value="paid">Pagos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-28 w-full rounded-lg" />
              ))
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card py-12 text-muted-foreground">
                <FileText className="h-10 w-10 opacity-30" />
                <p className="text-sm">Nenhuma conta {statusFilter !== "all" ? `(${statusFilter})` : ""} cadastrada</p>
              </div>
            ) : (
              paginated.map((a) => {
                const s = statusOf(a);
                return (
                  <div
                    key={a.id}
                    data-testid={`card-account-${a.id}`}
                    className="rounded-lg border border-border bg-card p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {a.description}
                          {a.installment_total && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              · {a.installment_number}/{a.installment_total}
                            </span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Vence {fmtDate(a.due_date)}
                        </p>
                      </div>
                      <p className="font-mono text-base font-semibold whitespace-nowrap">
                        {fmtBRL(Number(a.amount))}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge variant="outline" className={STATUS_COLOR[s]}>
                        {STATUS_LABEL[s]}
                      </Badge>
                      {a.category && (
                        <Badge variant="secondary" className="font-normal">{a.category}</Badge>
                      )}
                      {(activeTab === "payable" ? a.suppliers?.name : a.customers?.name) && (
                        <span className="text-muted-foreground">
                          · {activeTab === "payable" ? a.suppliers?.name : a.customers?.name}
                        </span>
                      )}
                      {a.paid_date && (
                        <span className="text-muted-foreground">· pago em {fmtDate(a.paid_date)}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {a.status === "open" && (
                        <Button
                          size="sm"
                          variant="default"
                          className="h-8 flex-1"
                          data-testid={`btn-pay-mobile-${a.id}`}
                          onClick={() => {
                            setPayDialogId(a.id);
                            setPayDate(TODAY_ISO());
                          }}
                        >
                          <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                          {activeTab === "payable" ? "Pagar" : "Receber"}
                        </Button>
                      )}
                      {a.status === "paid" && (
                        <Button size="sm" variant="outline" className="h-8 flex-1" onClick={() => reopenMutation.mutate(a.id)}>
                          Reabrir
                        </Button>
                      )}
                      <Button size="icon" variant="outline" className="h-8 w-8" title="Editar" onClick={() => openEdit(a)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {a.status !== "cancelled" && a.status !== "paid" && (
                        <Button size="icon" variant="outline" className="h-8 w-8" title="Cancelar" onClick={() => cancelMutation.mutate(a.id)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="outline" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Excluir" onClick={() => setDeleteId(a.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop table */}
          <div className="hidden rounded-lg border border-border bg-card md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead>{activeTab === "payable" ? "Fornecedor" : "Cliente"}</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-40 text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}><TableCell colSpan={7}><Skeleton className="h-4 w-full" /></TableCell></TableRow>
                  ))
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-10 w-10 opacity-30" />
                        <p className="text-sm">Nenhuma conta {statusFilter !== "all" ? `(${statusFilter})` : ""} cadastrada</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  paginated.map((a) => {
                    const s = statusOf(a);
                    return (
                      <TableRow key={a.id} data-testid={`row-account-${a.id}`}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDate(a.due_date)}</TableCell>
                        <TableCell className="font-medium">
                          {a.description}
                          {a.installment_total && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              · parc. {a.installment_number}/{a.installment_total}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {activeTab === "payable" ? a.suppliers?.name : a.customers?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-xs">{a.category ?? "—"}</TableCell>
                        <TableCell className="text-right font-mono font-medium">{fmtBRL(Number(a.amount))}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_COLOR[s]}>
                            {STATUS_LABEL[s]}
                          </Badge>
                          {a.paid_date && (
                            <p className="mt-0.5 text-[10px] text-muted-foreground">em {fmtDate(a.paid_date)}</p>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {a.status === "open" && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-8"
                                data-testid={`btn-pay-${a.id}`}
                                onClick={() => {
                                  setPayDialogId(a.id);
                                  setPayDate(TODAY_ISO());
                                }}
                              >
                                <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                                {activeTab === "payable" ? "Pagar" : "Receber"}
                              </Button>
                            )}
                            {a.status === "paid" && (
                              <Button size="sm" variant="outline" className="h-8" onClick={() => reopenMutation.mutate(a.id)} data-testid={`btn-reopen-${a.id}`}>
                                Reabrir
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8" title="Editar" onClick={() => openEdit(a)} data-testid={`btn-edit-account-${a.id}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            {a.status !== "cancelled" && a.status !== "paid" && (
                              <Button size="icon" variant="ghost" className="h-8 w-8" title="Cancelar" onClick={() => cancelMutation.mutate(a.id)} data-testid={`btn-cancel-${a.id}`}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" title="Excluir" onClick={() => setDeleteId(a.id)} data-testid={`btn-delete-account-${a.id}`}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
              <p className="text-xs text-muted-foreground" data-testid="text-pagination-info">
                Mostrando {(currentPage - 1) * PAGE_SIZE + 1}–
                {Math.min(currentPage * PAGE_SIZE, filtered.length)} de {filtered.length}
              </p>
              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={currentPage <= 1}
                  onClick={() => { setPage((p) => Math.max(1, p - 1)); scrollAppToTop(); }}
                  data-testid="btn-page-prev"
                >
                  Anterior
                </Button>
                <span className="px-2 text-xs text-muted-foreground" data-testid="text-page-current">
                  Página {currentPage} de {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8"
                  disabled={currentPage >= totalPages}
                  onClick={() => { setPage((p) => Math.min(totalPages, p + 1)); scrollAppToTop(); }}
                  data-testid="btn-page-next"
                >
                  Próxima
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Create/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar conta" : `Nova conta a ${form.kind === "payable" ? "pagar" : "receber"}`}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Edita uma única parcela. Para alterar todas, exclua e recadastre."
                : "Para parcelar, defina o número de parcelas e o intervalo entre vencimentos."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveMutation.mutate(form);
            }}
            className="space-y-4"
          >
            {!editing && (
              <div>
                <Label>Tipo *</Label>
                <Select value={form.kind} onValueChange={(v: AccountKind) => setForm({ ...form, kind: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="payable">A Pagar</SelectItem>
                    <SelectItem value="receivable">A Receber</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Descrição *</Label>
              {(() => {
                const descPresets = form.kind === "payable"
                  ? [
                      "Aluguel",
                      "Energia elétrica",
                      "Água",
                      "Internet",
                      "Telefone",
                      "Compra de insumos",
                      "Compra de mercadorias",
                      "Pagamento a fornecedor",
                      "Salários",
                      "Pró-labore",
                      "Impostos",
                      "Manutenção",
                      "Material de limpeza",
                      "Material de escritório",
                      "Marketing / publicidade",
                      "Combustível",
                      "Frete / transporte",
                      "Assinatura / software",
                    ]
                  : [
                      "Venda à vista",
                      "Venda a prazo",
                      "Prestação de serviço",
                      "Recebimento de cliente",
                      "Comissão",
                      "Aluguel recebido",
                      "Reembolso",
                      "Juros recebidos",
                    ];
                const isCustomDesc = form.description !== "" && !descPresets.includes(form.description);
                const selectVal = isCustomDesc ? "__custom__" : (form.description || "");
                return (
                  <div className="space-y-2">
                    <Select
                      value={selectVal}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          description: v === "__custom__" ? (isCustomDesc ? form.description : "") : v,
                        })
                      }
                    >
                      <SelectTrigger data-testid="select-account-desc">
                        <SelectValue placeholder="Selecione uma descrição" />
                      </SelectTrigger>
                      <SelectContent>
                        {descPresets.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">Outra (preencher manualmente)...</SelectItem>
                      </SelectContent>
                    </Select>
                    {(isCustomDesc || selectVal === "__custom__") && (
                      <Input
                        data-testid="input-account-desc"
                        value={form.description}
                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                        placeholder="Ex: Aluguel de junho, Energia elétrica..."
                      />
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Valor total (R$) *</Label>
                <Input
                  data-testid="input-account-amount"
                  inputMode="numeric"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: maskCurrencyFromDigits(e.target.value) })}
                  placeholder="0,00"
                />
              </div>
              <div>
                <Label>{editing ? "Vencimento" : "1º vencimento"} *</Label>
                <Input
                  data-testid="input-account-due"
                  type="date"
                  min={TODAY_ISO()}
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
            </div>

            {!editing && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Parcelas</Label>
                  <Input
                    data-testid="input-installments"
                    type="number"
                    min="1"
                    max="60"
                    value={form.installments}
                    onChange={(e) => setForm({ ...form, installments: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Intervalo (dias)</Label>
                  <Input
                    data-testid="input-interval"
                    type="number"
                    min="1"
                    value={form.interval_days}
                    onChange={(e) => setForm({ ...form, interval_days: e.target.value })}
                    disabled={parseInt(form.installments) <= 1}
                  />
                </div>
              </div>
            )}

            {form.kind === "payable" ? (
              <div>
                <Label>Fornecedor</Label>
                <Select value={form.supplier_id || "none"} onValueChange={(v) => setForm({ ...form, supplier_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-account-supplier"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div>
                <Label>Cliente</Label>
                <Select value={form.customer_id || "none"} onValueChange={(v) => setForm({ ...form, customer_id: v === "none" ? "" : v })}>
                  <SelectTrigger data-testid="select-account-customer"><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Nenhum</SelectItem>
                    {customers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Categoria</Label>
              {(() => {
                const presets = form.type === "payable"
                  ? ["Aluguel", "Insumos", "Salários", "Energia", "Água", "Internet", "Telefone", "Manutenção", "Marketing", "Impostos", "Fornecedores", "Transporte", "Limpeza", "Equipamentos", "Outros"]
                  : ["Vendas", "Serviços", "Comissões", "Juros", "Aluguel Recebido", "Reembolsos", "Outros"];
                const isCustom = form.category !== "" && !presets.includes(form.category);
                const selectValue = isCustom ? "__custom__" : (form.category || "");
                return (
                  <div className="space-y-2">
                    <Select
                      value={selectValue}
                      onValueChange={(v) => setForm({ ...form, category: v === "__custom__" ? (isCustom ? form.category : " ") : v })}
                    >
                      <SelectTrigger data-testid="select-account-category">
                        <SelectValue placeholder="Selecione uma categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {presets.map((p) => (
                          <SelectItem key={p} value={p}>{p}</SelectItem>
                        ))}
                        <SelectItem value="__custom__">Outra (personalizada)...</SelectItem>
                      </SelectContent>
                    </Select>
                    {(isCustom || selectValue === "__custom__") && (
                      <Input
                        data-testid="input-account-category"
                        value={form.category.trim()}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                        placeholder="Digite a categoria personalizada"
                      />
                    )}
                  </div>
                );
              })()}
            </div>

            <div>
              <Label>Observações</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="btn-save-account">
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Pay dialog */}
      <Dialog open={!!payDialogId} onOpenChange={(o) => !o && setPayDialogId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Registrar pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Data de pagamento</Label>
              <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} data-testid="input-pay-date" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialogId(null)}>Cancelar</Button>
            <Button
              data-testid="btn-confirm-pay"
              onClick={() => payDialogId && payMutation.mutate({ id: payDialogId, date: payDate })}
              disabled={payMutation.isPending}
            >
              {payMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conta?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-testid="btn-confirm-delete-account"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
