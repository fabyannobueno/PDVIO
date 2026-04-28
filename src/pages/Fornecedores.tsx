import { scrollAppToTop } from "@/lib/scrollToTop";
import { useState, useMemo, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { maskPhone, maskDocument } from "@/lib/masks";
import { onlyDigits, isValidDocument, isValidCNPJ, fetchCnpjBrasilAPI, type CnpjData } from "@/lib/document";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Search, Plus, Pencil, Trash2, Truck, Loader2, Phone, Mail, IdCard, User } from "lucide-react";

interface Supplier {
  id: string;
  company_id: string;
  name: string;
  document: string | null;
  phone: string | null;
  email: string | null;
  contact_name: string | null;
  notes: string | null;
  created_at: string;
}

interface SupplierForm {
  name: string;
  document: string;
  phone: string;
  email: string;
  contact_name: string;
  notes: string;
}

const EMPTY_FORM: SupplierForm = {
  name: "",
  document: "",
  phone: "",
  email: "",
  contact_name: "",
  notes: "",
};

const PAGE_SIZE = 10;

export default function Fornecedores() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [form, setForm] = useState<SupplierForm>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Partial<SupplierForm>>({});
  const [docLoading, setDocLoading] = useState(false);
  const [cnpjData, setCnpjData] = useState<CnpjData | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const lookupAbort = useRef<AbortController | null>(null);

  const docDigits = onlyDigits(form.document);
  const docValid = docDigits.length === 0 ? null : isValidDocument(form.document);

  useEffect(() => {
    if (!dialogOpen) return;
    setCnpjData(null);
    setDocError(null);
    if (lookupAbort.current) {
      lookupAbort.current.abort();
      lookupAbort.current = null;
    }
    if (docDigits.length === 0) return;
    if (docDigits.length === 11) {
      if (!docValid) setDocError("CPF inválido");
      return;
    }
    if (docDigits.length === 14) {
      if (!isValidCNPJ(docDigits)) {
        setDocError("CNPJ inválido");
        return;
      }
      const ctrl = new AbortController();
      lookupAbort.current = ctrl;
      setDocLoading(true);
      fetchCnpjBrasilAPI(docDigits, ctrl.signal)
        .then((data) => {
          if (ctrl.signal.aborted) return;
          if (!data) {
            setDocError("CNPJ não encontrado na Receita Federal");
            return;
          }
          setCnpjData(data);
          setDocError(null);
          setForm((f) => ({
            ...f,
            name: f.name.trim() ? f.name : (data.nome_fantasia || data.razao_social || ""),
            phone: f.phone.trim() ? f.phone : (data.ddd_telefone_1 ? maskPhone(data.ddd_telefone_1) : ""),
            email: f.email.trim() ? f.email : (data.email || ""),
            notes: f.notes.trim()
              ? f.notes
              : [
                  data.razao_social && `Razão social: ${data.razao_social}`,
                  data.cnae_fiscal_descricao && `Atividade: ${data.cnae_fiscal_descricao}`,
                  (data.logradouro || data.municipio) &&
                    `Endereço: ${[data.logradouro, data.numero, data.bairro, data.municipio && data.uf ? `${data.municipio}/${data.uf}` : data.municipio || data.uf, data.cep].filter(Boolean).join(", ")}`,
                ]
                  .filter(Boolean)
                  .join("\n"),
          }));
        })
        .finally(() => {
          if (!ctrl.signal.aborted) setDocLoading(false);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docDigits, dialogOpen]);

  const { data: suppliers = [], isLoading } = useQuery<Supplier[]>({
    queryKey: ["/api/suppliers", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("suppliers")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (values: SupplierForm) => {
      const payload = {
        company_id: activeCompany!.id,
        name: values.name.trim(),
        document: values.document.trim() || null,
        phone: values.phone.trim() || null,
        email: values.email.trim() || null,
        contact_name: values.contact_name.trim() || null,
        notes: values.notes.trim() || null,
      };
      if (editing) {
        const { error } = await (supabase as any).from("suppliers").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("suppliers").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", activeCompany?.id] });
      toast.success(editing ? "Fornecedor atualizado!" : "Fornecedor criado!");
      setDialogOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar fornecedor"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("suppliers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/suppliers", activeCompany?.id] });
      toast.success("Fornecedor removido");
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover fornecedor"),
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.document?.toLowerCase().includes(q) ||
        s.phone?.includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.contact_name?.toLowerCase().includes(q),
    );
  }, [suppliers, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setDialogOpen(true);
  }

  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      document: s.document ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      contact_name: s.contact_name ?? "",
      notes: s.notes ?? "",
    });
    setFormErrors({});
    setDialogOpen(true);
  }

  function validate(): boolean {
    const errors: Partial<SupplierForm> = {};
    if (!form.name.trim()) errors.name = "Nome é obrigatório";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      errors.email = "E-mail inválido";
    if (docDigits.length > 0 && !isValidDocument(form.document)) {
      errors.document = docDigits.length === 11 ? "CPF inválido" : "CNPJ inválido";
    } else if (docDigits.length === 14) {
      if (docLoading) {
        errors.document = "Aguarde a verificação do CNPJ";
      } else if (!cnpjData) {
        errors.document = "CNPJ não encontrado na Receita Federal";
      } else if ((cnpjData.situacao_cadastral || "").toUpperCase().trim() !== "ATIVA") {
        errors.document = `CNPJ ${cnpjData.situacao_cadastral || "inativo"} — não é permitido cadastrar`;
      }
    }
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    saveMutation.mutate(form);
  }

  return (
    <div className="space-y-6 p-4 md:p-8 animate-fade-in">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fornecedores</h1>
          <p className="text-sm text-muted-foreground">
            {suppliers.length} {suppliers.length === 1 ? "fornecedor cadastrado" : "fornecedores cadastrados"}
          </p>
        </div>
        <Button data-testid="btn-add-supplier" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Novo Fornecedor
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          data-testid="input-search-supplier"
          placeholder="Buscar por nome, CNPJ, contato..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Mobile cards */}
      <div className="space-y-2 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-3">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
            </div>
          ))
        ) : paginated.length === 0 ? (
          <div className="rounded-lg border border-border bg-card py-12">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Truck className="h-10 w-10 opacity-30" />
              <p className="text-sm">{search ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}</p>
              {!search && (
                <Button size="sm" variant="outline" onClick={openCreate}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar primeiro fornecedor
                </Button>
              )}
            </div>
          </div>
        ) : (
          paginated.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-border bg-card p-3"
              data-testid={`card-supplier-${s.id}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  {s.document && (
                    <p className="mt-0.5 flex items-center gap-1 font-mono text-xs text-muted-foreground">
                      <IdCard className="h-3 w-3" />
                      {s.document}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    data-testid={`btn-edit-supplier-${s.id}`}
                    onClick={() => openEdit(s)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    data-testid={`btn-delete-supplier-${s.id}`}
                    onClick={() => setDeleteId(s.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {(s.contact_name || s.phone || s.email) && (
                <div className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
                  {s.contact_name && (
                    <p className="flex items-center gap-1.5">
                      <User className="h-3 w-3" /> {s.contact_name}
                    </p>
                  )}
                  {s.phone && (
                    <p className="flex items-center gap-1.5">
                      <Phone className="h-3 w-3" /> {s.phone}
                    </p>
                  )}
                  {s.email && (
                    <p className="flex items-center gap-1.5 break-all">
                      <Mail className="h-3 w-3 shrink-0" /> {s.email}
                    </p>
                  )}
                </div>
              )}
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
              <TableHead>CNPJ/CPF</TableHead>
              <TableHead>Contato</TableHead>
              <TableHead>Telefone</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead className="w-24 text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}><Skeleton className="h-4 w-full" /></TableCell>
                </TableRow>
              ))
            ) : paginated.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-12">
                  <div className="flex flex-col items-center gap-3 text-muted-foreground">
                    <Truck className="h-10 w-10 opacity-30" />
                    <p className="text-sm">{search ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}</p>
                    {!search && (
                      <Button size="sm" variant="outline" onClick={openCreate}>
                        <Plus className="mr-2 h-4 w-4" />
                        Adicionar primeiro fornecedor
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              paginated.map((s) => (
                <TableRow key={s.id} data-testid={`row-supplier-${s.id}`}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.document ?? "—"}</TableCell>
                  <TableCell>{s.contact_name ?? "—"}</TableCell>
                  <TableCell>{s.phone ?? "—"}</TableCell>
                  <TableCell className="text-xs">{s.email ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      data-testid={`btn-edit-supplier-${s.id}`}
                      onClick={() => openEdit(s)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      data-testid={`btn-delete-supplier-${s.id}`}
                      onClick={() => setDeleteId(s.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-center text-xs text-muted-foreground sm:text-left">
            Página {safePage} de {totalPages}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safePage <= 1} onClick={() => { setPage((p) => p - 1); scrollAppToTop(); }}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" className="flex-1 sm:flex-none" disabled={safePage >= totalPages} onClick={() => { setPage((p) => p + 1); scrollAppToTop(); }}>
              Próxima
            </Button>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Nome / Razão social *</Label>
              <Input
                id="name"
                data-testid="input-supplier-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {formErrors.name && <p className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="document">CNPJ / CPF</Label>
                <div className="relative">
                  <Input
                    id="document"
                    data-testid="input-supplier-document"
                    value={form.document}
                    onChange={(e) => setForm({ ...form, document: maskDocument(e.target.value) })}
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                    className={
                      docError || formErrors.document
                        ? "border-destructive pr-10"
                        : docValid && !docLoading
                        ? "border-emerald-500/60 pr-10"
                        : "pr-10"
                    }
                  />
                  <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2">
                    {docLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                    ) : docError || formErrors.document ? (
                      <AlertCircle className="h-4 w-4 text-destructive" />
                    ) : docValid ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    ) : null}
                  </div>
                </div>
                {(docError || formErrors.document) && (
                  <p className="mt-1 text-xs text-destructive">{docError || formErrors.document}</p>
                )}
                {cnpjData && !docError && (
                  <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    {(cnpjData.situacao_cadastral || "").toUpperCase().trim() === "ATIVA"
                      ? "Dados preenchidos da Receita Federal"
                      : `Receita: ${cnpjData.situacao_cadastral}`}
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="contact_name">Contato</Label>
                <Input
                  id="contact_name"
                  data-testid="input-supplier-contact"
                  value={form.contact_name}
                  onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  data-testid="input-supplier-phone"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: maskPhone(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="email">E-mail</Label>
                <Input
                  id="email"
                  data-testid="input-supplier-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                {formErrors.email && <p className="mt-1 text-xs text-destructive">{formErrors.email}</p>}
              </div>
            </div>
            <div>
              <Label htmlFor="notes">Observações</Label>
              <Textarea
                id="notes"
                data-testid="input-supplier-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveMutation.isPending} data-testid="btn-save-supplier">
                {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Movimentações de estoque vinculadas permanecerão, sem o vínculo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              data-testid="btn-confirm-delete-supplier"
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
