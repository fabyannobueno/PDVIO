import { useState, useMemo } from "react";
import { maskPhone, maskDocument, maskMoneyBR, maskCep } from "@/lib/masks";
import { scrollAppToTop } from "@/lib/scrollToTop";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
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
import { toast } from "sonner";
import {
  Search,
  Plus,
  Pencil,
  Trash2,
  Users,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Phone,
  Mail,
  IdCard,
  MapPin,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  company_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  document: string | null;
  notes: string | null;
  credit_limit: number | null;
  address_cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  created_at: string;
}

interface CustomerForm {
  name: string;
  phone: string;
  email: string;
  document: string;
  notes: string;
  credit_limit: string;
  address_cep: string;
  address_street: string;
  address_number: string;
  address_complement: string;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
}

const EMPTY_FORM: CustomerForm = {
  name: "",
  phone: "",
  email: "",
  document: "",
  notes: "",
  credit_limit: "",
  address_cep: "",
  address_street: "",
  address_number: "",
  address_complement: "",
  address_neighborhood: "",
  address_city: "",
  address_state: "",
};

const PAGE_SIZE = 8;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPhone(value: string) { return maskPhone(value); }
function formatCPF(value: string) { return maskDocument(value); }

// ── Main Component ────────────────────────────────────────────────────────────

export default function Clientes() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<CustomerForm>>({});

  // ── Query ──────────────────────────────────────────────────────────────────

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async (values: CustomerForm) => {
      const phone = values.phone.trim() || null;
      const email = values.email.trim() || null;
      const document = values.document.trim() || null;

      // Duplicate checks — each builds its own fresh query
      const cid = activeCompany!.id;
      const editId = editing?.id;

      if (document) {
        let q = supabase.from("customers").select("id, name").eq("company_id", cid).eq("document", document);
        if (editId) q = q.neq("id", editId);
        const { data } = await q.limit(1);
        if (data && data.length > 0)
          throw new Error(`CPF/CNPJ já cadastrado para "${data[0].name}"`);
      }

      if (phone) {
        let q = supabase.from("customers").select("id, name").eq("company_id", cid).eq("phone", phone);
        if (editId) q = q.neq("id", editId);
        const { data } = await q.limit(1);
        if (data && data.length > 0)
          throw new Error(`Telefone já cadastrado para "${data[0].name}"`);
      }

      if (email) {
        let q = supabase.from("customers").select("id, name").eq("company_id", cid).eq("email", email);
        if (editId) q = q.neq("id", editId);
        const { data } = await q.limit(1);
        if (data && data.length > 0)
          throw new Error(`E-mail já cadastrado para "${data[0].name}"`);
      }

      const limitTrim = values.credit_limit.trim();
      let credit_limit: number | null = null;
      if (limitTrim !== "") {
        const n = parseFloat(limitTrim.replace(/\./g, "").replace(",", "."));
        if (!isFinite(n) || n < 0) throw new Error("Limite de crédito inválido");
        credit_limit = n;
      }
      const payload = {
        company_id: activeCompany!.id,
        name: values.name.trim(),
        phone,
        email,
        document,
        notes: values.notes.trim() || null,
        credit_limit,
        address_cep: values.address_cep.trim() || null,
        address_street: values.address_street.trim() || null,
        address_number: values.address_number.trim() || null,
        address_complement: values.address_complement.trim() || null,
        address_neighborhood: values.address_neighborhood.trim() || null,
        address_city: values.address_city.trim() || null,
        address_state: values.address_state.trim().toUpperCase().slice(0, 2) || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("customers")
          .update(payload)
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("customers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", activeCompany?.id] });
      toast.success(editing ? "Cliente atualizado!" : "Cliente criado!");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar cliente"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", activeCompany?.id] });
      toast.success("Cliente removido");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover cliente"),
  });

  // ── Filter & Pagination ────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.document?.includes(q)
    );
  }, [customers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ── Form helpers ───────────────────────────────────────────────────────────

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setDialogOpen(true);
  }

  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      email: c.email ?? "",
      document: c.document ?? "",
      notes: c.notes ?? "",
      credit_limit: c.credit_limit != null ? Number(c.credit_limit).toFixed(2).replace(".", ",") : "",
      address_cep: c.address_cep ?? "",
      address_street: c.address_street ?? "",
      address_number: c.address_number ?? "",
      address_complement: c.address_complement ?? "",
      address_neighborhood: c.address_neighborhood ?? "",
      address_city: c.address_city ?? "",
      address_state: c.address_state ?? "",
    });
    setFormErrors({});
    setDialogOpen(true);
  }

  function validate(): boolean {
    const errors: Partial<CustomerForm> = {};
    if (!form.name.trim()) errors.name = "Nome é obrigatório";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errors.email = "E-mail inválido";
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    saveMutation.mutate(form);
  }

  function handleSearchChange(val: string) {
    setSearch(val);
    setPage(1);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 p-6 md:p-8 animate-fade-in overflow-y-auto h-full">

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            {customers.length} {customers.length === 1 ? "cliente" : "clientes"} cadastrado
            {customers.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button data-testid="btn-add-customer" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Cliente
        </Button>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="input-search-customer"
          placeholder="Buscar por nome, telefone, e-mail..."
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="mt-2 h-3 w-2/3" />
            </div>
          ))
        ) : paginated.length === 0 ? (
          <div className="rounded-lg border border-border bg-card py-12">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Users className="h-10 w-10 opacity-30" />
              <p className="text-sm">
                {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
              </p>
              {!search && (
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar primeiro cliente
                </Button>
              )}
            </div>
          </div>
        ) : (
          paginated.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-border bg-card p-3"
              data-testid={`card-customer-${c.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{c.name}</p>
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    {c.phone && (
                      <p className="flex items-center gap-1.5">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.phone}</span>
                      </p>
                    )}
                    {c.email && (
                      <p className="flex items-center gap-1.5">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.email}</span>
                      </p>
                    )}
                    {c.document && (
                      <p className="flex items-center gap-1.5">
                        <IdCard className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.document}</span>
                      </p>
                    )}
                    {(c.address_city || c.address_state) && (
                      <p className="flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">
                          {[c.address_city, c.address_state].filter(Boolean).join(" - ")}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    data-testid={`btn-edit-customer-mobile-${c.id}`}
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    data-testid={`btn-delete-customer-mobile-${c.id}`}
                    onClick={() => setDeleteId(c.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden rounded-lg border border-border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>CPF / CNPJ</TableHead>
              <TableHead>Cidade / UF</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Users className="h-10 w-10 opacity-30" />
                    <p className="text-sm">
                      {search ? "Nenhum cliente encontrado" : "Nenhum cliente cadastrado"}
                    </p>
                    {!search && (
                      <Button size="sm" variant="outline" onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar primeiro cliente
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((c) => (
                <TableRow key={c.id} data-testid={`row-customer-${c.id}`}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.phone ? (
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        {c.phone}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.email ? (
                      <span className="flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5" />
                        {c.email}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {c.document ? (
                      <span className="flex items-center gap-1.5">
                        <IdCard className="h-3.5 w-3.5" />
                        {c.document}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {(c.address_city || c.address_state) ? (
                      <span className="flex items-center gap-1.5">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {[c.address_city, c.address_state].filter(Boolean).join(" - ")}
                      </span>
                    ) : (
                      <span className="text-muted-foreground/50">—</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        data-testid={`btn-edit-customer-${c.id}`}
                        onClick={() => openEdit(c)}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        data-testid={`btn-delete-customer-${c.id}`}
                        onClick={() => setDeleteId(c.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span className="text-center sm:text-left">
            Mostrando {(safePage - 1) * PAGE_SIZE + 1}–
            {Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length}
          </span>
          <div className="flex items-center justify-center gap-2 sm:justify-end">
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={safePage <= 1}
              onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}
              data-testid="btn-prev-page"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span>
              {safePage} / {totalPages}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-8 w-8"
              disabled={safePage >= totalPages}
              onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}
              data-testid="btn-next-page"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Cliente" : "Novo Cliente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name */}
            <div className="space-y-1.5">
              <Label htmlFor="name">
                Nome <span className="text-destructive">*</span>
              </Label>
              <Input
                id="name"
                data-testid="input-customer-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Nome completo ou razão social"
              />
              {formErrors.name && (
                <p className="text-xs text-destructive">{formErrors.name}</p>
              )}
            </div>

            {/* Phone + Document */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  data-testid="input-customer-phone"
                  value={form.phone}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, phone: formatPhone(e.target.value) }))
                  }
                  placeholder="(11) 99999-9999"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="document">CPF / CNPJ</Label>
                <Input
                  id="document"
                  data-testid="input-customer-document"
                  value={form.document}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, document: formatCPF(e.target.value) }))
                  }
                  placeholder="000.000.000-00"
                />
              </div>
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                data-testid="input-customer-email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="cliente@exemplo.com"
              />
              {formErrors.email && (
                <p className="text-xs text-destructive">{formErrors.email}</p>
              )}
            </div>

            {/* Credit limit */}
            <div className="space-y-1.5">
              <Label htmlFor="credit_limit">Limite de crédito (Crediário)</Label>
              <Input
                id="credit_limit"
                inputMode="decimal"
                data-testid="input-customer-credit-limit"
                value={form.credit_limit}
                onChange={(e) => setForm((f) => ({ ...f, credit_limit: maskMoneyBR(e.target.value) }))}
                placeholder="Deixe em branco para sem limite"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Saldo aberto do cliente no crediário não poderá ultrapassar este valor.
              </p>
            </div>

            {/* Address */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> Endereço
              </p>

              {/* CEP */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="address_cep">CEP</Label>
                  <Input
                    id="address_cep"
                    value={form.address_cep}
                    onChange={async (e) => {
                      const masked = maskCep(e.target.value);
                      setForm((f) => ({ ...f, address_cep: masked }));
                      const digits = masked.replace(/\D/g, "");
                      if (digits.length === 8) {
                        try {
                          const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
                          const d = await res.json();
                          if (!d.erro) {
                            setForm((f) => ({
                              ...f,
                              address_street: d.logradouro ?? f.address_street,
                              address_neighborhood: d.bairro ?? f.address_neighborhood,
                              address_city: d.localidade ?? f.address_city,
                              address_state: d.uf ?? f.address_state,
                            }));
                          }
                        } catch {/* ignore */}
                      }
                    }}
                    placeholder="00000-000"
                    maxLength={9}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_number">Número</Label>
                  <Input
                    id="address_number"
                    value={form.address_number}
                    onChange={(e) => setForm((f) => ({ ...f, address_number: e.target.value }))}
                    placeholder="Ex: 123"
                  />
                </div>
              </div>

              {/* Street + Complement */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="address_street">Rua / Logradouro</Label>
                  <Input
                    id="address_street"
                    value={form.address_street}
                    onChange={(e) => setForm((f) => ({ ...f, address_street: e.target.value }))}
                    placeholder="Nome da rua"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_complement">Complemento</Label>
                  <Input
                    id="address_complement"
                    value={form.address_complement}
                    onChange={(e) => setForm((f) => ({ ...f, address_complement: e.target.value }))}
                    placeholder="Apto, bloco, etc."
                  />
                </div>
              </div>

              {/* Neighborhood + City + State */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="address_neighborhood">Bairro</Label>
                  <Input
                    id="address_neighborhood"
                    value={form.address_neighborhood}
                    onChange={(e) => setForm((f) => ({ ...f, address_neighborhood: e.target.value }))}
                    placeholder="Bairro"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_city">Cidade</Label>
                  <Input
                    id="address_city"
                    value={form.address_city}
                    onChange={(e) => setForm((f) => ({ ...f, address_city: e.target.value }))}
                    placeholder="Cidade"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="address_state">UF</Label>
                  <Input
                    id="address_state"
                    value={form.address_state}
                    onChange={(e) => setForm((f) => ({ ...f, address_state: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="SP"
                    maxLength={2}
                  />
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                data-testid="input-customer-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Alergias, preferências..."
                rows={3}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                data-testid="btn-cancel-customer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saveMutation.isPending}
                data-testid="btn-save-customer"
              >
                {saveMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {editing ? "Salvar" : "Criar cliente"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              data-testid="btn-confirm-delete-customer"
            >
              {deleteMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
