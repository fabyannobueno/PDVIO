import { useMemo, useState, useEffect } from "react";
import { scrollAppToTop } from "@/lib/scrollToTop";
import { fmtPct } from "@/lib/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { maskMoneyBR, parseMoneyBR } from "@/lib/masks";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Wallet,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type EntryKind = "charge" | "payment";

interface Customer {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  document: string | null;
  credit_limit: number | null;
}

interface CrediarioEntry {
  id: string;
  company_id: string;
  customer_id: string;
  sale_id: string | null;
  kind: EntryKind;
  description: string;
  amount: number;
  reference_date: string; // YYYY-MM-DD
  due_date: string | null;
  notes: string | null;
  created_at: string;
  is_late_fee?: boolean;
  parent_entry_id?: string | null;
}

interface CompanySettings {
  crediario_late_fee_percent: number;
  crediario_late_fee_period: "day" | "month";
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const todayISO = () => new Date().toISOString().slice(0, 10);

const parseMoney = parseMoneyBR;

function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
}

function fmtDateBR(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface CustomerSummary {
  charges: number;
  payments: number;
  balance: number;
  overdueOpen: number; // FIFO unpaid overdue
  lastEntryAt: string | null;
}

function summarize(entries: CrediarioEntry[], today: string): CustomerSummary {
  const sorted = [...entries].sort((a, b) =>
    a.reference_date.localeCompare(b.reference_date) ||
    a.created_at.localeCompare(b.created_at),
  );
  let charges = 0;
  let payments = 0;
  // FIFO settlement: track outstanding charges queue
  const outstandingCharges: { amount: number; due: string | null }[] = [];
  let last: string | null = null;
  for (const e of sorted) {
    last = e.created_at;
    if (e.kind === "charge") {
      charges += Number(e.amount);
      outstandingCharges.push({ amount: Number(e.amount), due: e.due_date });
    } else {
      let remaining = Number(e.amount);
      payments += Number(e.amount);
      while (remaining > 0 && outstandingCharges.length > 0) {
        const head = outstandingCharges[0];
        if (head.amount <= remaining + 1e-9) {
          remaining -= head.amount;
          outstandingCharges.shift();
        } else {
          head.amount -= remaining;
          remaining = 0;
        }
      }
    }
  }
  const balance = charges - payments;
  const overdueOpen = outstandingCharges
    .filter((c) => c.due && c.due < today)
    .reduce((s, c) => s + c.amount, 0);
  return { charges, payments, balance, overdueOpen, lastEntryAt: last };
}

function groupByMonth(entries: CrediarioEntry[]): Record<string, CrediarioEntry[]> {
  const groups: Record<string, CrediarioEntry[]> = {};
  for (const e of entries) {
    const key = e.reference_date.slice(0, 7); // YYYY-MM
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  }
  return groups;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Crediario() {
  const { activeCompany } = useCompany();
  const { user } = useAuth();
  const qc = useQueryClient();

  const today = useMemo(() => todayISO(), []);
  const [search, setSearch] = useState("");
  const [openCustomer, setOpenCustomer] = useState<Customer | null>(null);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 15;

  // Company crediário config (late fee %)
  const { data: companyCfg } = useQuery<CompanySettings | null>({
    queryKey: ["/crediario/company-cfg", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("crediario_late_fee_percent, crediario_late_fee_period")
        .eq("id", activeCompany!.id)
        .maybeSingle();
      if (error) throw error;
      return (data as CompanySettings) ?? null;
    },
  });
  const lateFeePct = Number(companyCfg?.crediario_late_fee_percent ?? 0);
  const lateFeePeriod: "day" | "month" =
    (companyCfg?.crediario_late_fee_period as any) ?? "month";

  // Customers
  const customersQ = useQuery<Customer[]>({
    queryKey: ["/crediario/customers", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, company_id, name, phone, document, credit_limit" as any)
        .eq("company_id", activeCompany!.id)
        .order("name");
      if (error) throw error;
      return (data as any[]) as Customer[];
    },
  });

  // All entries for the company (so list view can show balances)
  const entriesQ = useQuery<CrediarioEntry[]>({
    queryKey: ["/crediario/entries", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("crediario_entries")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .order("reference_date", { ascending: false });
      if (error) throw error;
      return (data as CrediarioEntry[]) ?? [];
    },
  });

  // ── Auto-reconcile late fees ───────────────────────────────────────────────
  // For each overdue original charge, ensure there's a "late fee" charge entry
  // tied to it via parent_entry_id, with amount = original * pct% * periods.
  useEffect(() => {
    if (!activeCompany?.id) return;
    if (!entriesQ.data || lateFeePct <= 0) return;

    const todayStr = todayISO();
    const todayDate = new Date(todayStr + "T00:00:00");

    // Group entries per customer and run FIFO to know remaining outstanding
    // per original (non-fee) charge.
    const byCustomer = new Map<string, CrediarioEntry[]>();
    for (const e of entriesQ.data) {
      const arr = byCustomer.get(e.customer_id) ?? [];
      arr.push(e);
      byCustomer.set(e.customer_id, arr);
    }

    type Op =
      | { kind: "insert"; row: any }
      | { kind: "update"; id: string; amount: number; description: string };
    const ops: Op[] = [];

    for (const [, list] of byCustomer) {
      const sorted = [...list].sort((a, b) =>
        a.reference_date.localeCompare(b.reference_date) ||
        a.created_at.localeCompare(b.created_at),
      );
      // FIFO over all charges (incl. fees) using all payments.
      const queue: { id: string; amount: number; due: string | null; isLateFee: boolean }[] = [];
      for (const e of sorted) {
        if (e.kind === "charge") {
          queue.push({
            id: e.id,
            amount: Number(e.amount),
            due: e.due_date,
            isLateFee: !!e.is_late_fee,
          });
        } else {
          let remaining = Number(e.amount);
          while (remaining > 0 && queue.length > 0) {
            const head = queue[0];
            if (head.amount <= remaining + 1e-9) {
              remaining -= head.amount;
              head.amount = 0;
              queue.shift();
            } else {
              head.amount -= remaining;
              remaining = 0;
            }
          }
        }
      }

      // Build a quick lookup of remaining outstanding per charge id.
      const remainingByChargeId = new Map<string, number>();
      for (const item of queue) remainingByChargeId.set(item.id, item.amount);

      // Existing fee entries by parent_entry_id
      const feeByParent = new Map<string, CrediarioEntry>();
      for (const e of list) {
        if (e.is_late_fee && e.parent_entry_id) {
          feeByParent.set(e.parent_entry_id, e);
        }
      }

      // For each overdue original charge with outstanding > 0, compute fee.
      for (const e of list) {
        if (e.is_late_fee) continue;
        if (e.kind !== "charge") continue;
        if (!e.due_date || e.due_date >= todayStr) continue;
        const outstanding = remainingByChargeId.get(e.id) ?? 0;
        if (outstanding <= 0.0001) continue;

        const dueDate = new Date(e.due_date + "T00:00:00");
        const days = Math.max(
          0,
          Math.floor((todayDate.getTime() - dueDate.getTime()) / 86400000),
        );
        if (days <= 0) continue;
        const periods = lateFeePeriod === "day" ? days : days / 30;
        const fee = Math.round(Number(e.amount) * (lateFeePct / 100) * periods * 100) / 100;
        if (fee <= 0) continue;

        const desc = `Multa por atraso (${days} dia${days > 1 ? "s" : ""}) · ${e.description || "venda"}`;
        const existing = feeByParent.get(e.id);
        if (!existing) {
          ops.push({
            kind: "insert",
            row: {
              company_id: activeCompany!.id,
              customer_id: e.customer_id,
              sale_id: e.sale_id ?? null,
              kind: "charge",
              description: desc,
              amount: fee,
              reference_date: todayStr,
              due_date: todayStr,
              notes: "Lançamento automático",
              created_by: user?.id ?? null,
              is_late_fee: true,
              parent_entry_id: e.id,
            },
          });
        } else if (Math.abs(Number(existing.amount) - fee) > 0.005) {
          ops.push({
            kind: "update",
            id: existing.id,
            amount: fee,
            description: desc,
          });
        }
      }
    }

    if (ops.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const op of ops) {
        if (cancelled) return;
        if (op.kind === "insert") {
          await (supabase as any).from("crediario_entries").insert(op.row);
        } else {
          await (supabase as any)
            .from("crediario_entries")
            .update({ amount: op.amount, description: op.description })
            .eq("id", op.id);
        }
      }
      qc.invalidateQueries({ queryKey: ["/crediario/entries", activeCompany!.id] });
    })();
    return () => { cancelled = true; };
  }, [entriesQ.data, activeCompany?.id, lateFeePct, lateFeePeriod, qc, user?.id]);

  // Realtime
  useEffect(() => {
    if (!activeCompany?.id) return;
    const channel = (supabase as any)
      .channel(`crediario:${activeCompany.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "crediario_entries" },
        () => qc.invalidateQueries({ queryKey: ["/crediario/entries", activeCompany.id] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "customers", filter: `company_id=eq.${activeCompany.id}` },
        () => qc.invalidateQueries({ queryKey: ["/crediario/customers", activeCompany.id] }),
      )
      .subscribe();
    return () => { (supabase as any).removeChannel(channel); };
  }, [activeCompany?.id, qc]);

  // Per-customer summaries
  const summariesByCustomer = useMemo(() => {
    const map = new Map<string, CustomerSummary>();
    const byCustomer = new Map<string, CrediarioEntry[]>();
    for (const e of entriesQ.data ?? []) {
      const arr = byCustomer.get(e.customer_id) ?? [];
      arr.push(e);
      byCustomer.set(e.customer_id, arr);
    }
    for (const [cid, list] of byCustomer) map.set(cid, summarize(list, today));
    return map;
  }, [entriesQ.data, today]);

  // Filter customers by search and only show ones with movement (or all when empty search)
  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    const all = customersQ.data ?? [];
    return all.filter((c) =>
      !term ||
      c.name.toLowerCase().includes(term) ||
      (c.phone ?? "").toLowerCase().includes(term) ||
      (c.document ?? "").toLowerCase().includes(term),
    );
  }, [customersQ.data, search]);

  // Reset to first page when filter changes
  useEffect(() => { setPage(1); }, [search]);

  const totalPages = Math.max(1, Math.ceil(filteredCustomers.length / PAGE_SIZE));
  const paginatedCustomers = filteredCustomers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Stats for header
  const totals = useMemo(() => {
    let balance = 0;
    let overdue = 0;
    let overdueCustomers = 0;
    for (const [, s] of summariesByCustomer) {
      balance += s.balance;
      overdue += s.overdueOpen;
      if (s.overdueOpen > 0) overdueCustomers += 1;
    }
    // Actual accumulated fees = sum of is_late_fee charges still outstanding.
    let lateFee = 0;
    for (const e of entriesQ.data ?? []) {
      if (e.is_late_fee && e.kind === "charge") lateFee += Number(e.amount);
    }
    return { balance, overdue, overdueCustomers, lateFee };
  }, [summariesByCustomer, entriesQ.data]);

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateLimitMut = useMutation({
    mutationFn: async ({ customerId, limit }: { customerId: string; limit: number | null }) => {
      const { error } = await (supabase as any)
        .from("customers")
        .update({ credit_limit: limit })
        .eq("id", customerId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/crediario/customers", activeCompany?.id] });
      toast.success("Limite atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar limite"),
  });

  const upsertEntryMut = useMutation({
    mutationFn: async (input: {
      id?: string;
      customer_id: string;
      kind: EntryKind;
      description: string;
      amount: number;
      reference_date: string;
      due_date: string | null;
      notes: string | null;
    }) => {
      // Limit check on charges (only for new entries; updating reuses existing logic)
      if (input.kind === "charge") {
        const customer = (customersQ.data ?? []).find((c) => c.id === input.customer_id);
        const limit = customer?.credit_limit;
        if (limit != null) {
          const summary = summariesByCustomer.get(input.customer_id) ?? {
            charges: 0, payments: 0, balance: 0, overdueOpen: 0, lastEntryAt: null,
          } as CustomerSummary;
          // If editing an existing charge, subtract its previous amount
          let projected = summary.balance + input.amount;
          if (input.id) {
            const prev = (entriesQ.data ?? []).find((e) => e.id === input.id);
            if (prev && prev.kind === "charge") projected -= Number(prev.amount);
          }
          if (projected > limit + 1e-6) {
            throw new Error(
              `Limite do cliente excedido. Saldo ficaria em ${fmtBRL(projected)} e o limite é ${fmtBRL(limit)}.`,
            );
          }
        }
      }

      if (input.id) {
        const { error } = await (supabase as any)
          .from("crediario_entries")
          .update({
            kind: input.kind,
            description: input.description,
            amount: input.amount,
            reference_date: input.reference_date,
            due_date: input.kind === "charge" ? input.due_date : null,
            notes: input.notes,
          })
          .eq("id", input.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("crediario_entries")
          .insert({
            company_id: activeCompany!.id,
            customer_id: input.customer_id,
            kind: input.kind,
            description: input.description,
            amount: input.amount,
            reference_date: input.reference_date,
            due_date: input.kind === "charge" ? input.due_date : null,
            notes: input.notes,
            created_by: user?.id ?? null,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/crediario/entries", activeCompany?.id] });
      toast.success("Lançamento salvo");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar lançamento"),
  });

  const deleteEntryMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("crediario_entries")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/crediario/entries", activeCompany?.id] });
      toast.success("Lançamento excluído");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-primary" />
          <h1 className="text-2xl font-bold">Crediário</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Caderneta mensal por cliente. A cada compra a fiado, lance um débito.
          Quando o cliente pagar, lance um pagamento. O saldo é somado automaticamente.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo total a receber</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold" data-testid="text-total-balance">
              {fmtBRL(totals.balance)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Vencido</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold text-destructive" data-testid="text-total-overdue">
              {fmtBRL(totals.overdue)}
            </p>
            <p className="text-xs text-muted-foreground">
              {totals.overdueCustomers} cliente(s) com atraso
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Multa acumulada ({fmtPct(lateFeePct, 2)} / {lateFeePeriod === "day" ? "dia" : "mês"})</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-2xl font-bold" data-testid="text-total-latefee">
              {fmtBRL(totals.lateFee)}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-base">Clientes com crediário</CardTitle>
              <CardDescription>Clique em um cliente para ver a caderneta.</CardDescription>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar cliente..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-customer"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {customersQ.isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredCustomers.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado. Cadastre clientes em <strong>Clientes</strong> para
              começar a usar o crediário.
            </div>
          ) : (
            <>
              {/* Mobile cards */}
              <div className="divide-y sm:hidden">
                {paginatedCustomers.map((c) => {
                  const s = summariesByCustomer.get(c.id) ?? {
                    charges: 0, payments: 0, balance: 0, overdueOpen: 0, lastEntryAt: null,
                  } as CustomerSummary;
                  const overLimit =
                    c.credit_limit != null && s.balance > Number(c.credit_limit) + 1e-6;
                  return (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => setOpenCustomer(c)}
                      className="w-full p-3 text-left hover:bg-muted/40 transition-colors"
                      data-testid={`row-customer-${c.id}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          {c.phone && (
                            <div className="text-xs text-muted-foreground truncate">{c.phone}</div>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className={`font-mono text-sm font-semibold ${overLimit ? "text-destructive" : ""}`}>
                            {fmtBRL(s.balance)}
                          </div>
                          <div className="text-[11px] text-muted-foreground font-mono">
                            {c.credit_limit == null ? "sem limite" : `lim. ${fmtBRL(Number(c.credit_limit))}`}
                          </div>
                        </div>
                      </div>
                      {s.overdueOpen > 0 && (
                        <div className="mt-2">
                          <Badge variant="destructive" className="font-mono text-[11px]">
                            Vencido {fmtBRL(s.overdueOpen)}
                          </Badge>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto sm:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cliente</TableHead>
                      <TableHead className="text-right">Limite</TableHead>
                      <TableHead className="text-right">Saldo</TableHead>
                      <TableHead className="text-right">Vencido</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedCustomers.map((c) => {
                      const s = summariesByCustomer.get(c.id) ?? {
                        charges: 0, payments: 0, balance: 0, overdueOpen: 0, lastEntryAt: null,
                      } as CustomerSummary;
                      const overLimit =
                        c.credit_limit != null && s.balance > Number(c.credit_limit) + 1e-6;
                      return (
                        <TableRow
                          key={c.id}
                          className="cursor-pointer hover:bg-muted/40"
                          onClick={() => setOpenCustomer(c)}
                        >
                          <TableCell>
                            <div className="font-medium">{c.name}</div>
                            {c.phone && (
                              <div className="text-xs text-muted-foreground">{c.phone}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {c.credit_limit == null ? (
                              <span className="text-xs text-muted-foreground">sem limite</span>
                            ) : (
                              fmtBRL(Number(c.credit_limit))
                            )}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            <span className={overLimit ? "text-destructive font-bold" : ""}>
                              {fmtBRL(s.balance)}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {s.overdueOpen > 0 ? (
                              <Badge variant="destructive" className="font-mono">
                                {fmtBRL(s.overdueOpen)}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenCustomer(c); }}>
                              Abrir
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-border pt-3 mt-3">
                  <p className="text-xs text-muted-foreground">
                    {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredCustomers.length)} de{" "}
                    {filteredCustomers.length}
                  </p>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === 1}
                      onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}
                      data-testid="button-prev-page"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      disabled={page === totalPages}
                      onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}
                      data-testid="button-next-page"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {openCustomer && (
        <CadernetaDialog
          customer={openCustomer}
          entries={(entriesQ.data ?? []).filter((e) => e.customer_id === openCustomer.id)}
          summary={summariesByCustomer.get(openCustomer.id) ?? {
            charges: 0, payments: 0, balance: 0, overdueOpen: 0, lastEntryAt: null,
          }}
          lateFeePct={lateFeePct}
          lateFeePeriod={lateFeePeriod}
          onClose={() => setOpenCustomer(null)}
          onSaveEntry={(payload) => upsertEntryMut.mutateAsync(payload)}
          onDeleteEntry={(id) => deleteEntryMut.mutateAsync(id)}
          onSaveLimit={(limit) => updateLimitMut.mutateAsync({ customerId: openCustomer.id, limit })}
          isSaving={upsertEntryMut.isPending}
        />
      )}
    </div>
  );
}

// ── Caderneta Dialog ─────────────────────────────────────────────────────────

interface CadernetaProps {
  customer: Customer;
  entries: CrediarioEntry[];
  summary: CustomerSummary;
  lateFeePct: number;
  lateFeePeriod: "day" | "month";
  onClose: () => void;
  onSaveEntry: (input: {
    id?: string;
    customer_id: string;
    kind: EntryKind;
    description: string;
    amount: number;
    reference_date: string;
    due_date: string | null;
    notes: string | null;
  }) => Promise<unknown>;
  onDeleteEntry: (id: string) => Promise<unknown>;
  onSaveLimit: (limit: number | null) => Promise<unknown>;
  isSaving: boolean;
}

function CadernetaDialog({
  customer,
  entries,
  summary,
  lateFeePct,
  lateFeePeriod,
  onClose,
  onSaveEntry,
  onDeleteEntry,
  onSaveLimit,
  isSaving,
}: CadernetaProps) {
  const [editEntry, setEditEntry] = useState<CrediarioEntry | null>(null);
  const [creating, setCreating] = useState<EntryKind | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<CrediarioEntry | null>(null);
  const [limitStr, setLimitStr] = useState<string>(
    customer.credit_limit != null
      ? maskMoneyBR(Math.round(Number(customer.credit_limit) * 100).toString())
      : "",
  );
  const [savingLimit, setSavingLimit] = useState(false);

  useEffect(() => {
    setLimitStr(
      customer.credit_limit != null
        ? maskMoneyBR(Math.round(Number(customer.credit_limit) * 100).toString())
        : "",
    );
  }, [customer.credit_limit]);

  const grouped = useMemo(() => groupByMonth(entries), [entries]);
  const months = useMemo(() => Object.keys(grouped).sort((a, b) => b.localeCompare(a)), [grouped]);

  // Sum of outstanding accumulated late-fee charges for this customer.
  const accumulatedFee = useMemo(
    () => entries
      .filter((e) => e.is_late_fee && e.kind === "charge")
      .reduce((s, e) => s + Number(e.amount), 0),
    [entries],
  );

  const limitNum = parseMoney(limitStr);
  const usagePct = customer.credit_limit && customer.credit_limit > 0
    ? Math.min(100, (summary.balance / Number(customer.credit_limit)) * 100)
    : null;

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer.name}</DialogTitle>
          <DialogDescription>
            {customer.phone ?? "Sem telefone"}{customer.document ? ` · ${customer.document}` : ""}
          </DialogDescription>
        </DialogHeader>

        {/* Summary */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Saldo a pagar</p>
            <p className="font-mono text-xl font-bold" data-testid="text-customer-balance">
              {fmtBRL(summary.balance)}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Vencido</p>
            <p className={`font-mono text-xl font-bold ${summary.overdueOpen > 0 ? "text-destructive" : ""}`}>
              {fmtBRL(summary.overdueOpen)}
            </p>
            {accumulatedFee > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Inclui multa {fmtBRL(accumulatedFee)} ({fmtPct(lateFeePct, 2)}/{lateFeePeriod === "day" ? "dia" : "mês"})
              </p>
            )}
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Limite de crédito</p>
            <div className="flex items-center gap-2">
              <Input
                value={limitStr}
                onChange={(e) => setLimitStr(maskMoneyBR(e.target.value))}
                placeholder="Sem limite"
                className="h-8 font-mono"
                data-testid="input-credit-limit"
              />
              <Button
                size="sm"
                disabled={savingLimit}
                onClick={async () => {
                  setSavingLimit(true);
                  try {
                    const v = limitStr.trim() === "" ? null : parseMoney(limitStr);
                    await onSaveLimit(v != null && v >= 0 ? v : null);
                  } finally {
                    setSavingLimit(false);
                  }
                }}
                data-testid="button-save-limit"
              >
                {savingLimit ? <Loader2 className="h-3 w-3 animate-spin" /> : "Salvar"}
              </Button>
            </div>
            {usagePct != null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full ${usagePct >= 100 ? "bg-destructive" : usagePct >= 80 ? "bg-warning" : "bg-primary"}`}
                  style={{ width: `${usagePct}%` }}
                />
              </div>
            )}
            {customer.credit_limit != null && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {usagePct != null
                  ? `${fmtPct(Math.floor(usagePct * 100) / 100, 2)} usado · `
                  : ""}
                Disponível {fmtBRL(Math.max(0, Number(customer.credit_limit) - summary.balance))}
              </p>
            )}
          </div>
        </div>

        {customer.credit_limit != null && summary.balance > Number(customer.credit_limit) + 1e-6 && (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="text-xs">
              Cliente está acima do limite. Novos débitos só podem ser lançados se o saldo
              voltar abaixo de {fmtBRL(Number(customer.credit_limit))}.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreating("charge")} data-testid="button-add-charge">
            <Plus className="mr-1 h-4 w-4" />
            Lançar débito
          </Button>
          <Button variant="outline" onClick={() => setCreating("payment")} data-testid="button-add-payment">
            <CheckCircle2 className="mr-1 h-4 w-4" />
            Lançar pagamento
          </Button>
        </div>

        {/* Caderneta */}
        {months.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum lançamento ainda. Comece registrando uma compra ou pagamento.
          </div>
        ) : (
          <div className="space-y-4">
            {months.map((m) => {
              const list = [...grouped[m]].sort((a, b) =>
                a.reference_date.localeCompare(b.reference_date) ||
                a.created_at.localeCompare(b.created_at),
              );
              const monthCharges = list.filter((e) => e.kind === "charge").reduce((s, e) => s + Number(e.amount), 0);
              const monthPayments = list.filter((e) => e.kind === "payment").reduce((s, e) => s + Number(e.amount), 0);
              return (
                <div key={m} className="rounded-lg border">
                  <div className="flex flex-col gap-1 border-b bg-muted/30 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold capitalize">{monthLabel(m)}</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                      <span className="text-muted-foreground">Débitos: <span className="font-mono font-medium text-foreground">{fmtBRL(monthCharges)}</span></span>
                      <span className="text-muted-foreground">Pagamentos: <span className="font-mono font-medium text-success">{fmtBRL(monthPayments)}</span></span>
                      <span className="text-muted-foreground">Saldo: <span className="font-mono font-bold text-foreground">{fmtBRL(monthCharges - monthPayments)}</span></span>
                    </div>
                  </div>

                  {/* Mobile: card list */}
                  <div className="divide-y sm:hidden">
                    {list.map((e) => (
                      <div key={e.id} className="p-3 space-y-1.5" data-testid={`row-entry-${e.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2 min-w-0">
                            <Badge variant={e.kind === "charge" ? "default" : "secondary"}>
                              {e.kind === "charge" ? "Débito" : "Pagamento"}
                            </Badge>
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {fmtDateBR(e.reference_date)}
                            </span>
                          </div>
                          <span className={`font-mono text-sm font-semibold whitespace-nowrap ${e.kind === "charge" ? "" : "text-success"}`}>
                            {e.kind === "charge" ? "" : "− "}{fmtBRL(Number(e.amount))}
                          </span>
                        </div>
                        <p className="text-sm break-words">{e.description || "—"}</p>
                        {e.kind === "charge" && e.due_date && (
                          <p className="text-[11px] text-muted-foreground">
                            Vencimento:{" "}
                            <span className={`font-mono ${e.due_date < todayISO() ? "text-destructive" : ""}`}>
                              {fmtDateBR(e.due_date)}
                            </span>
                          </p>
                        )}
                        {e.notes && (
                          <p className="text-[11px] text-muted-foreground break-words">{e.notes}</p>
                        )}
                        <div className="flex justify-end gap-1 pt-1">
                          <Button size="icon" variant="ghost" onClick={() => setEditEntry(e)} data-testid={`button-edit-${e.id}`}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(e)} data-testid={`button-delete-${e.id}`}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: table */}
                  <div className="hidden overflow-x-auto sm:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-24">Data</TableHead>
                          <TableHead>Descrição</TableHead>
                          <TableHead className="w-28">Vencimento</TableHead>
                          <TableHead className="w-32 text-right">Valor</TableHead>
                          <TableHead className="w-24"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.map((e) => (
                          <TableRow key={e.id}>
                            <TableCell className="font-mono text-xs">{fmtDateBR(e.reference_date)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Badge variant={e.kind === "charge" ? "default" : "secondary"}>
                                  {e.kind === "charge" ? "Débito" : "Pagamento"}
                                </Badge>
                                <span className="text-sm">{e.description || "—"}</span>
                              </div>
                              {e.notes && (
                                <p className="mt-0.5 text-[11px] text-muted-foreground">{e.notes}</p>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {e.kind === "charge" && e.due_date ? (
                                <span className={e.due_date < todayISO() ? "text-destructive" : ""}>
                                  {fmtDateBR(e.due_date)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <span className={`font-mono font-medium ${e.kind === "charge" ? "" : "text-success"}`}>
                                {e.kind === "charge" ? "" : "− "}{fmtBRL(Number(e.amount))}
                              </span>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button size="icon" variant="ghost" onClick={() => setEditEntry(e)} data-testid={`button-edit-${e.id}`}>
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(e)} data-testid={`button-delete-${e.id}`}>
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {(creating || editEntry) && (
          <EntryFormDialog
            customer={customer}
            initial={editEntry ?? undefined}
            kind={editEntry?.kind ?? creating!}
            onClose={() => { setCreating(null); setEditEntry(null); }}
            onSubmit={async (payload) => {
              await onSaveEntry({
                id: editEntry?.id,
                customer_id: customer.id,
                ...payload,
              });
              setCreating(null);
              setEditEntry(null);
            }}
            isSaving={isSaving}
          />
        )}

        <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação não pode ser desfeita. O saldo do cliente será recalculado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  if (confirmDelete) await onDeleteEntry(confirmDelete.id);
                  setConfirmDelete(null);
                }}
              >
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

// ── Entry form ───────────────────────────────────────────────────────────────

interface EntryFormProps {
  customer: Customer;
  kind: EntryKind;
  initial?: CrediarioEntry;
  onClose: () => void;
  onSubmit: (payload: {
    kind: EntryKind;
    description: string;
    amount: number;
    reference_date: string;
    due_date: string | null;
    notes: string | null;
  }) => Promise<void>;
  isSaving: boolean;
}

function EntryFormDialog({ customer, kind, initial, onClose, onSubmit, isSaving }: EntryFormProps) {
  const [k, setK] = useState<EntryKind>(initial?.kind ?? kind);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amountStr, setAmountStr] = useState(
    initial ? maskMoneyBR(Math.round(Number(initial.amount) * 100).toString()) : "",
  );
  const [refDate, setRefDate] = useState(initial?.reference_date ?? todayISO());
  const [dueDate, setDueDate] = useState(initial?.due_date ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  const submit = async () => {
    const amount = parseMoney(amountStr);
    if (amount <= 0) {
      toast.error("Informe um valor maior que zero");
      return;
    }
    if (!description.trim()) {
      toast.error("Informe uma descrição");
      return;
    }
    await onSubmit({
      kind: k,
      description: description.trim(),
      amount,
      reference_date: refDate,
      due_date: k === "charge" && dueDate ? dueDate : null,
      notes: notes.trim() || null,
    });
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? "Editar lançamento" : k === "charge" ? "Lançar débito" : "Lançar pagamento"}</DialogTitle>
          <DialogDescription>{customer.name}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label>Tipo</Label>
            <Select value={k} onValueChange={(v) => setK(v as EntryKind)}>
              <SelectTrigger data-testid="select-entry-kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="charge"><Wallet className="mr-2 inline h-3 w-3" />Débito (compra a fiado)</SelectItem>
                <SelectItem value="payment"><CheckCircle2 className="mr-2 inline h-3 w-3" />Pagamento recebido</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Descrição</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={k === "charge" ? "Ex: Compra de mercadoria" : "Ex: Pagamento parcial"}
              data-testid="input-entry-description"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Valor</Label>
              <Input
                value={amountStr}
                onChange={(e) => setAmountStr(maskMoneyBR(e.target.value))}
                placeholder="0,00"
                inputMode="decimal"
                className="font-mono"
                data-testid="input-entry-amount"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={refDate}
                onChange={(e) => setRefDate(e.target.value)}
                data-testid="input-entry-date"
              />
            </div>
          </div>
          {k === "charge" && (
            <div>
              <Label>Vencimento (opcional)</Label>
              <div className="relative">
                <CalendarIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="date"
                  value={dueDate ?? ""}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="pl-9"
                  data-testid="input-entry-due"
                />
              </div>
            </div>
          )}
          <div>
            <Label>Observação (opcional)</Label>
            <Textarea
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              data-testid="input-entry-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={isSaving} data-testid="button-save-entry">
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
