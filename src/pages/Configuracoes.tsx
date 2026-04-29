import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Building2, User, Users, Loader2, Save, Crown, ShieldCheck, CreditCard, UtensilsCrossed, ChefHat, Search, Printer, Usb, Bluetooth, Cable, Monitor, CheckCircle2, XCircle, TestTube2, Inbox, Plus, Trash2, Pencil, ScanLine, KeyRound, Download, Landmark, ChevronsUpDown, Wallet, Banknote, QrCode, Ticket } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { fetchBanks, type BrasilApiBank } from "@/lib/brasilApiBanks";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Barcode } from "@/components/Barcode";
import logoPdvio from "@assets/PDVIO2_1776817647719.png";
import { maskPhone, maskDocument, maskCpf, maskCnpj, maskRandomPixKey } from "@/lib/masks";
import { isValidCPF } from "@/lib/document";
import { toast } from "sonner";
import {
  autoReconnect as autoReconnectPrinter,
  capabilities as printerCaps,
  connectBluetooth,
  connectSerial,
  connectUSB,
  defaultSettings as defaultPrinterSettings,
  getSettings as getPrinterSettings,
  isConnected as isPrinterConnected,
  openCashDrawer,
  printTest,
  saveSettings as savePrinterSettings,
  saveSettingsToDB as savePrinterSettingsToDB,
  hydrateSettingsFromDB as hydratePrinterSettings,
  type PaperWidth,
  type PrinterMode,
  type PrinterSettings,
} from "@/lib/printer";
import { CUSTOM_PRESET_ID, PRESET_BRANDS, PRINTER_PRESETS, findPreset } from "@/lib/printerPresets";
import {
  ALL_PAYMENT_METHODS,
  defaultPaymentSettings,
  loadPaymentSettings,
  savePaymentSettings,
  type PaymentMethodId,
  type PaymentSettings,
} from "@/lib/paymentSettings";
import { emitPaymentSettingsChanged } from "@/hooks/usePaymentSettings";

function generateBadgeCode(): string {
  // 12 dígitos: timestamp curto + random — fácil de gerar barcode CODE128
  const ts = Date.now().toString().slice(-8);
  const rnd = Math.floor(Math.random() * 10000).toString().padStart(4, "0");
  return ts + rnd;
}

function maskCep(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

interface AddressFields {
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  cidade: string;
  estado: string;
}

const emptyAddress: AddressFields = {
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", estado: "",
};

function parseAddress(raw: string | null): AddressFields {
  if (!raw) return emptyAddress;
  try { return { ...emptyAddress, ...JSON.parse(raw) }; } catch { return { ...emptyAddress, logradouro: raw }; }
}

function serializeAddress(a: AddressFields): string {
  return JSON.stringify(a);
}

const BUSINESS_TYPES = [
  { value: "restaurant", label: "Restaurante" },
  { value: "snack_bar", label: "Lanchonete" },
  { value: "market", label: "Mercado" },
  { value: "distributor", label: "Distribuidora" },
  { value: "delivery", label: "Delivery" },
  { value: "retail", label: "Loja física" },
  { value: "other", label: "Outro" },
];

const ROLE_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  owner: { label: "Dono", icon: Crown, color: "text-primary" },
  manager: { label: "Gerente", icon: ShieldCheck, color: "text-primary" },
  cashier: { label: "Caixa", icon: CreditCard, color: "text-muted-foreground" },
  waiter: { label: "Garçom", icon: UtensilsCrossed, color: "text-muted-foreground" },
  kitchen: { label: "Cozinha", icon: ChefHat, color: "text-muted-foreground" },
};

export default function Configuracoes() {
  const { user } = useAuth();
  const { activeCompany, refresh: refreshCompany } = useCompany();
  const queryClient = useQueryClient();

  // ── Company form state ─────────────────────────────────────────────────────
  const [companyName, setCompanyName] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [document, setDocument] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [addr, setAddr] = useState<AddressFields>(emptyAddress);
  const [cepLoading, setCepLoading] = useState(false);
  const [companyLoaded, setCompanyLoaded] = useState(false);

  // ── Profile form state ─────────────────────────────────────────────────────
  const [fullName, setFullName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileAvatar, setProfileAvatar] = useState<string | null>(null);
  const [profileCpf, setProfileCpf] = useState("");
  const [profileBirthDate, setProfileBirthDate] = useState("");
  const [profileCompletedLocked, setProfileCompletedLocked] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch company ──────────────────────────────────────────────────────────
  const { isLoading: loadingCompany } = useQuery({
    queryKey: ["/config/company", activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", activeCompany!.id)
        .single();
      if (error) throw error;
      if (!companyLoaded) {
        setCompanyName(data.name ?? "");
        setBusinessType(data.business_type ?? "");
        setDocument(data.document ?? "");
        setPhone(data.phone ?? "");
        setEmail(data.email ?? "");
        setAddr(parseAddress(data.address));
        setCompanyLoaded(true);
      }
      return data;
    },
  });

  // ── Fetch profile ──────────────────────────────────────────────────────────
  const { isLoading: loadingProfile } = useQuery({
    queryKey: ["/config/profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user!.id)
        .single();
      if (error && error.code !== "PGRST116") throw error;
      if (!profileLoaded) {
        const d: any = data || {};
        setFullName(d.full_name ?? user?.user_metadata?.full_name ?? "");
        setProfilePhone(d.phone ? maskPhone(String(d.phone)) : "");
        setProfileAvatar(d.avatar_url ?? null);
        setProfileCpf(d.cpf ? maskCpf(String(d.cpf)) : "");
        setProfileBirthDate(d.birth_date ? String(d.birth_date).slice(0, 10) : "");
        // CPF fica bloqueado pra edição se o perfil já estiver marcado como completo.
        setProfileCompletedLocked(!!d.profile_completed && !!d.cpf);
        setProfileLoaded(true);
      }
      return data;
    },
  });

  // ── Fetch team members ─────────────────────────────────────────────────────
  const { data: members = [], isLoading: loadingMembers } = useQuery({
    queryKey: ["/config/members", activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_members")
        .select("role, user_id, profiles:user_id (full_name, email, avatar_url)")
        .eq("company_id", activeCompany!.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  // ── Staff (operadores com cartão+PIN) ──────────────────────────────────────
  const { data: staff = [], isLoading: loadingStaff } = useQuery({
    queryKey: ["/config/staff", activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("staff_members")
        .select("id, name, role, badge_code, active, created_at")
        .eq("company_id", activeCompany!.id)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        name: string;
        role: string;
        badge_code: string;
        active: boolean;
        created_at: string;
      }>;
    },
  });

  // Staff dialog state
  const [staffDialog, setStaffDialog] = useState(false);
  const [editingStaff, setEditingStaff] = useState<any>(null);
  const [sName, setSName] = useState("");
  const [sRole, setSRole] = useState<"manager" | "cashier" | "waiter" | "kitchen">("cashier");
  const [sBadge, setSBadge] = useState("");
  const [sPin, setSPin] = useState("");
  const [sActive, setSActive] = useState(true);
  const [sBarcodeDialog, setSBarcodeDialog] = useState<{ name: string; code: string; role: string } | null>(null);
  const staffCardRef = useRef<HTMLDivElement>(null);

  function openCreateStaff() {
    setEditingStaff(null);
    setSName("");
    setSRole("cashier");
    setSBadge(generateBadgeCode());
    setSPin("");
    setSActive(true);
    setStaffDialog(true);
  }

  function openEditStaff(s: any) {
    setEditingStaff(s);
    setSName(s.name);
    setSRole(s.role);
    setSBadge(s.badge_code);
    setSPin("");
    setSActive(s.active);
    setStaffDialog(true);
  }

  const saveStaff = useMutation({
    mutationFn: async () => {
      if (!sName.trim()) throw new Error("Informe o nome");
      if (!sBadge.trim()) throw new Error("Informe o código do cartão");
      if (!editingStaff && (!sPin || sPin.length < 4))
        throw new Error("Senha precisa ter no mínimo 4 dígitos");

      if (editingStaff) {
        const { error } = await (supabase as any).rpc("update_staff_member", {
          _id: editingStaff.id,
          _name: sName.trim(),
          _role: sRole,
          _badge_code: sBadge.trim(),
          _active: sActive,
          _pin: sPin || null,
        });
        if (error) throw error;
        return null;
      } else {
        const { error } = await (supabase as any).rpc("create_staff_member", {
          _company_id: activeCompany!.id,
          _name: sName.trim(),
          _role: sRole,
          _badge_code: sBadge.trim(),
          _pin: sPin,
        });
        if (error) throw error;
        return { name: sName.trim(), code: sBadge.trim(), role: sRole };
      }
    },
    onSuccess: (created) => {
      toast.success(editingStaff ? "Operador atualizado" : "Operador cadastrado");
      queryClient.invalidateQueries({ queryKey: ["/config/staff"] });
      setStaffDialog(false);
      if (created) setSBarcodeDialog(created); // mostra cartão pra impressão
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao salvar operador"),
  });

  const deleteStaff = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("staff_members").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Operador removido");
      queryClient.invalidateQueries({ queryKey: ["/config/staff"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  // ── Bank accounts ──────────────────────────────────────────────────────────
  type BankAccount = {
    id: string;
    company_id: string;
    bank_code: string;
    bank_name: string;
    bank_ispb: string | null;
    holder_type: "pj" | "pf";
    holder_name: string | null;
    holder_document: string | null;
    account_type: "corrente" | "poupanca" | "pagamento" | "salario";
    agency: string;
    agency_digit: string | null;
    account: string;
    account_digit: string | null;
    pix_key: string | null;
    pix_key_type: "cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | null;
    is_default: boolean;
  };

  const { data: bankAccounts = [], isLoading: loadingBankAccounts } = useQuery<BankAccount[]>({
    queryKey: ["/config/bank_accounts", activeCompany?.id],
    enabled: !!activeCompany,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("company_bank_accounts")
        .select("*")
        .eq("company_id", activeCompany!.id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as BankAccount[];
    },
  });

  const { data: banks = [], isLoading: loadingBanks } = useQuery<BrasilApiBank[]>({
    queryKey: ["/brasilapi/banks"],
    queryFn: fetchBanks,
    staleTime: 1000 * 60 * 60 * 24, // 24h
  });

  const [bankDialog, setBankDialog] = useState(false);
  const [editingBank, setEditingBank] = useState<BankAccount | null>(null);
  const [bankPickerOpen, setBankPickerOpen] = useState(false);
  const [bSelected, setBSelected] = useState<{ code: string; name: string; ispb: string | null } | null>(null);
  const [bHolderType, setBHolderType] = useState<"pj" | "pf">("pj");
  const [bHolderName, setBHolderName] = useState("");
  const [bHolderDoc, setBHolderDoc] = useState("");
  const [bAccountType, setBAccountType] = useState<"corrente" | "poupanca" | "pagamento" | "salario">("corrente");
  const [bAgency, setBAgency] = useState("");
  const [bAgencyDigit, setBAgencyDigit] = useState("");
  const [bAccount, setBAccount] = useState("");
  const [bAccountDigit, setBAccountDigit] = useState("");
  const [bPixKey, setBPixKey] = useState("");
  const [bPixKeyType, setBPixKeyType] = useState<"cpf" | "cnpj" | "email" | "telefone" | "aleatoria" | "">("");
  const [bankToDelete, setBankToDelete] = useState<BankAccount | null>(null);

  function openCreateBank() {
    setEditingBank(null);
    setBSelected(null);
    setBHolderType("pj");
    setBHolderName(companyName ?? "");
    setBHolderDoc(document ?? "");
    setBAccountType("corrente");
    setBAgency("");
    setBAgencyDigit("");
    setBAccount("");
    setBAccountDigit("");
    setBPixKey("");
    setBPixKeyType("");
    setBankDialog(true);
  }

  function openEditBank(b: BankAccount) {
    setEditingBank(b);
    setBSelected({ code: b.bank_code, name: b.bank_name, ispb: b.bank_ispb });
    setBHolderType(b.holder_type);
    setBHolderName(b.holder_name ?? "");
    setBHolderDoc(b.holder_document ?? "");
    setBAccountType(b.account_type);
    setBAgency(b.agency);
    setBAgencyDigit(b.agency_digit ?? "");
    setBAccount(b.account);
    setBAccountDigit(b.account_digit ?? "");
    setBPixKey(b.pix_key ?? "");
    setBPixKeyType(b.pix_key_type ?? "");
    setBankDialog(true);
  }

  const saveBank = useMutation({
    mutationFn: async () => {
      if (!bSelected) throw new Error("Selecione o banco");
      if (!bAgency.trim()) throw new Error("Informe a agência");
      if (!bAccount.trim()) throw new Error("Informe o número da conta");

      const payload: any = {
        company_id: activeCompany!.id,
        bank_code: bSelected.code,
        bank_name: bSelected.name,
        bank_ispb: bSelected.ispb,
        holder_type: bHolderType,
        holder_name: bHolderName.trim() || null,
        holder_document: bHolderDoc.trim() || null,
        account_type: bAccountType,
        agency: bAgency.trim(),
        agency_digit: bAgencyDigit.trim() || null,
        account: bAccount.trim(),
        account_digit: bAccountDigit.trim() || null,
        pix_key: bPixKey.trim() || null,
        pix_key_type: bPixKey.trim() ? (bPixKeyType || null) : null,
        is_default: true,
      };

      if (editingBank) {
        const { error } = await (supabase as any)
          .from("company_bank_accounts")
          .update(payload)
          .eq("id", editingBank.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any)
          .from("company_bank_accounts")
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editingBank ? "Conta bancária atualizada" : "Conta bancária cadastrada");
      queryClient.invalidateQueries({ queryKey: ["/config/bank_accounts"] });
      setBankDialog(false);
    },
    onError: (e: any) => {
      console.error("saveBank:", e);
      const detail = e?.message || e?.hint || e?.details || "";
      toast.error(`Erro ao salvar conta bancária${detail ? `: ${detail}` : ""}`);
    },
  });

  const deleteBank = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("company_bank_accounts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Conta bancária removida");
      queryClient.invalidateQueries({ queryKey: ["/config/bank_accounts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao remover"),
  });

  // ── Save company ───────────────────────────────────────────────────────────
  const saveCompany = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("companies")
        .update({
          name: companyName.trim(),
          business_type: businessType as any,
          document: document.trim() || null,
          phone: phone.trim() || null,
          email: email.trim() || null,
          address: serializeAddress(addr),
        })
        .eq("id", activeCompany!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Empresa atualizada com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["/config/company"] });
      refreshCompany();
    },
    onError: () => toast.error("Erro ao salvar empresa"),
  });

  // ── ViaCEP lookup ──────────────────────────────────────────────────────────
  async function lookupCep(rawCep: string) {
    const digits = rawCep.replace(/\D/g, "");
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error("CEP não encontrado"); return; }
      setAddr(prev => ({
        ...prev,
        logradouro: data.logradouro ?? "",
        complemento: data.complemento ?? "",
        bairro: data.bairro ?? "",
        cidade: data.localidade ?? "",
        estado: data.uf ?? "",
      }));
    } catch {
      toast.error("Erro ao consultar CEP");
    } finally {
      setCepLoading(false);
    }
  }

  // ── Avatar upload (resize to max 500x500, base64) ──────────────────────────
  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx. 5MB).");
      return;
    }
    setAvatarUploading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => reject(new Error("Imagem inválida"));
        i.src = dataUrl;
      });
      const MAX = 500;
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = window.document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponível");
      ctx.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL("image/jpeg", 0.85);
      setProfileAvatar(base64);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao processar imagem");
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = "";
    }
  }

  // ── Save profile ───────────────────────────────────────────────────────────
  const saveProfile = useMutation({
    mutationFn: async () => {
      const trimmedName = fullName.trim();
      if (!trimmedName) throw new Error("Nome obrigatório");
      if (!profileAvatar) throw new Error("Foto de perfil obrigatória");

      const cpfDigits = profileCpf.replace(/\D/g, "");
      if (cpfDigits.length !== 11 || !isValidCPF(cpfDigits)) {
        throw new Error("CPF inválido");
      }
      if (!profileBirthDate) throw new Error("Data de nascimento obrigatória");
      const phoneDigits = profilePhone.replace(/\D/g, "");
      if (phoneDigits.length < 10) throw new Error("Telefone inválido");

      // Só checa unicidade do CPF se ele for novo/diferente do banco — depois
      // que profile_completed=true ele é imutável e nem é enviado no upsert.
      if (!profileCompletedLocked) {
        const { data: existing, error: checkErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("cpf", cpfDigits)
          .neq("id", user!.id)
          .maybeSingle();
        if (checkErr) throw new Error(checkErr.message);
        if (existing) throw new Error("Este CPF já está vinculado a outra conta");
      }

      const payload: any = {
        id: user!.id,
        full_name: trimmedName,
        phone: phoneDigits,
        email: user!.email ?? null,
        avatar_url: profileAvatar,
        profile_completed: true,
      };
      // CPF e Data de nascimento só são gravados quando o perfil ainda não foi
      // marcado como completo. Após profile_completed=true, ambos se tornam
      // imutáveis.
      if (!profileCompletedLocked) {
        payload.cpf = cpfDigits;
        payload.birth_date = profileBirthDate;
      }
      const { error } = await supabase.from("profiles").upsert(payload);
      if (error) {
        if ((error as any).code === "23505") {
          throw new Error("Este CPF já está vinculado a outra conta");
        }
        throw error;
      }
    },
    onSuccess: () => {
      toast.success("Perfil atualizado com sucesso!");
      queryClient.invalidateQueries({ queryKey: ["/config/profile"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar perfil"),
  });

  const isOwner = activeCompany?.role === "owner";

  // ── Payment settings ──────────────────────────────────────────────────────
  const [paymentSettings, setPaymentSettingsState] = useState<PaymentSettings>(defaultPaymentSettings);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentDirty, setPaymentDirty] = useState(false);

  useEffect(() => {
    if (!activeCompany?.id) return;
    let cancelled = false;
    loadPaymentSettings(activeCompany.id).then((s) => {
      if (!cancelled) { setPaymentSettingsState(s); setPaymentDirty(false); }
    });
    return () => { cancelled = true; };
  }, [activeCompany?.id]);

  const togglePaymentMethod = (id: PaymentMethodId) => {
    setPaymentSettingsState((prev) => {
      const has = prev.enabled.includes(id);
      const enabled = has ? prev.enabled.filter((v) => v !== id) : [...prev.enabled, id];
      // Garante pelo menos uma forma de pagamento.
      if (enabled.length === 0) return prev;
      return { ...prev, enabled };
    });
    setPaymentDirty(true);
  };

  const handleSavePayment = async () => {
    if (!activeCompany?.id) return;
    setSavingPayment(true);
    try {
      await savePaymentSettings(activeCompany.id, paymentSettings);
      emitPaymentSettingsChanged(activeCompany.id, paymentSettings);
      setPaymentDirty(false);
      toast.success("Formas de pagamento salvas");
    } finally {
      setSavingPayment(false);
    }
  };

  const hasPixKeyConfigured = bankAccounts.some((b) => b.pix_key && b.pix_key_type);

  // ── Printer settings ───────────────────────────────────────────────────────
  const [printer, setPrinter] = useState<PrinterSettings>(() => getPrinterSettings());
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [savingPrinter, setSavingPrinter] = useState(false);
  const [printerDirty, setPrinterDirty] = useState(false);
  const [printerConnected, setPrinterConnected] = useState(() => isPrinterConnected(getPrinterSettings().mode));

  // Auto-fill receipt header from company data (name, doc, phone).
  // Depende também de `printer.header` para que, quando o cabeçalho carregar
  // do banco em formato antigo (sem ":"), a normalização rode e atualize.
  useEffect(() => {
    const lines: string[] = [];
    if (companyName.trim()) lines.push(companyName.trim());
    if (document.trim()) {
      const digits = document.replace(/\D/g, "");
      const label = digits.length === 14 ? "CNPJ" : digits.length === 11 ? "CPF" : "Documento";
      lines.push(`${label}: ${document.trim()}`);
    }
    if (phone.trim()) lines.push(`Tel: ${phone.trim()}`);
    const header = lines.join("\n");
    if (header && header !== printer.header) {
      setPrinter((prev) => {
        const next = { ...prev, header };
        savePrinterSettings(next);
        return next;
      });
      setPrinterDirty(true);
    }
  }, [companyName, document, phone, printer.header]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pull latest printer settings from DB whenever the active company changes
  useEffect(() => {
    if (!activeCompany) return;
    let cancelled = false;
    (async () => {
      const next = await hydratePrinterSettings(activeCompany.id);
      if (!cancelled) {
        setPrinter(next);
        setPrinterDirty(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeCompany?.id]);

  // Re-acquire previously-authorized device handle on page load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const current = getPrinterSettings();
      if (current.mode === "browser") return;
      if (isPrinterConnected(current.mode)) {
        setPrinterConnected(true);
        return;
      }
      const label = await autoReconnectPrinter(current.mode);
      if (cancelled) return;
      if (label) {
        setPrinterConnected(true);
        setPrinter((p) => {
          const next = { ...p, deviceLabel: label };
          savePrinterSettings(next);
          return next;
        });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function updatePrinter(patch: Partial<PrinterSettings>) {
    setPrinter((prev) => {
      const next = { ...prev, ...patch };
      savePrinterSettings(next);
      return next;
    });
    setPrinterDirty(true);
  }

  async function handleSavePrinter() {
    if (!activeCompany) {
      toast.error("Selecione uma empresa antes de salvar.");
      return;
    }
    setSavingPrinter(true);
    try {
      savePrinterSettings(printer);
      await savePrinterSettingsToDB(activeCompany.id, printer);
      setPrinterDirty(false);
      toast.success("Configurações da impressora salvas");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar configurações");
    } finally {
      setSavingPrinter(false);
    }
  }

  async function handleConnect() {
    setConnecting(true);
    try {
      let label = "";
      if (printer.mode === "serial") label = await connectSerial();
      else if (printer.mode === "usb") label = await connectUSB();
      else if (printer.mode === "bluetooth") label = await connectBluetooth();
      else label = "Impressora padrão do navegador";
      updatePrinter({ deviceLabel: label });
      setPrinterConnected(true);
      toast.success(`Conectado: ${label}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao conectar impressora");
    } finally {
      setConnecting(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      await printTest(printer, activeCompany ?? null);
      toast.success("Cupom de teste enviado");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha na impressão de teste");
    } finally {
      setTesting(false);
    }
  }

  async function handleOpenDrawer() {
    try {
      await openCashDrawer(printer);
      toast.success("Comando enviado à gaveta");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao abrir gaveta");
    }
  }

  function handleResetPrinter() {
    const fresh = { ...defaultPrinterSettings };
    setPrinter(fresh);
    savePrinterSettings(fresh);
    setPrinterConnected(isPrinterConnected(fresh.mode));
    setPrinterDirty(true);
    toast.success("Padrões restaurados — clique em Salvar para confirmar");
  }

  return (
    <div className="space-y-6 p-6 md:p-8 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Configurações</h1>
        <p className="text-sm text-muted-foreground mt-1">Gerencie sua empresa, perfil e equipe.</p>
      </div>

      <Tabs defaultValue="empresa">
        <TabsList className="mb-6 grid h-auto w-full grid-cols-2 gap-1 sm:inline-flex sm:w-auto sm:h-10 sm:gap-0 sm:flex-wrap">
          <TabsTrigger value="empresa" className="gap-2" data-testid="tab-empresa">
            <Building2 className="h-4 w-4" />
            Empresa
          </TabsTrigger>
          <TabsTrigger value="perfil" className="gap-2" data-testid="tab-perfil">
            <User className="h-4 w-4" />
            Meu perfil
          </TabsTrigger>
          <TabsTrigger value="equipe" className="gap-2" data-testid="tab-equipe">
            <Users className="h-4 w-4" />
            Equipe
          </TabsTrigger>
          <TabsTrigger value="impressora" className="gap-2" data-testid="tab-impressora">
            <Printer className="h-4 w-4" />
            Impressora
          </TabsTrigger>
          <TabsTrigger value="banco" className="gap-2" data-testid="tab-banco">
            <Landmark className="h-4 w-4" />
            Banco
          </TabsTrigger>
          <TabsTrigger value="pagamentos" className="gap-2" data-testid="tab-pagamentos">
            <Wallet className="h-4 w-4" />
            Pagamentos
          </TabsTrigger>
        </TabsList>

        {/* ── Empresa ─────────────────────────────────────────────────── */}
        <TabsContent value="empresa">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Dados da empresa</CardTitle>
              <CardDescription>
                {isOwner
                  ? "Atualize as informações do seu negócio."
                  : "Apenas o dono da empresa pode editar estas informações."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingCompany ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); saveCompany.mutate(); }}
                  className="space-y-5"
                >
                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="company-name">Nome da empresa</Label>
                      <Input
                        id="company-name"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        disabled={!isOwner}
                        required
                        data-testid="input-company-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="business-type">Tipo de negócio</Label>
                      <Select value={businessType} onValueChange={setBusinessType} disabled={!isOwner}>
                        <SelectTrigger id="business-type" data-testid="select-business-type">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BUSINESS_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="document">CNPJ / CPF</Label>
                      <Input
                        id="document"
                        value={document}
                        onChange={(e) => setDocument(maskDocument(e.target.value))}
                        disabled={!isOwner}
                        placeholder="000.000.000-00 ou 00.000.000/0000-00"
                        data-testid="input-document"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-phone">Telefone</Label>
                      <Input
                        id="company-phone"
                        value={phone}
                        onChange={(e) => setPhone(maskPhone(e.target.value))}
                        disabled={!isOwner}
                        placeholder="(11) 99999-9999"
                        data-testid="input-company-phone"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company-email">E-mail</Label>
                      <Input
                        id="company-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={!isOwner}
                        placeholder="contato@empresa.com"
                        data-testid="input-company-email"
                      />
                    </div>
                    {/* ── Endereço (ViaCEP) ──────────────────────────────── */}
                    <div className="space-y-3 rounded-lg border p-4">
                      <p className="text-sm font-medium text-foreground">Endereço</p>

                      {/* CEP */}
                      <div className="space-y-2">
                        <Label htmlFor="cep">CEP</Label>
                        <div className="flex gap-2">
                          <Input
                            id="cep"
                            value={addr.cep}
                            onChange={(e) => setAddr(prev => ({ ...prev, cep: maskCep(e.target.value) }))}
                            onBlur={(e) => lookupCep(e.target.value)}
                            disabled={!isOwner}
                            placeholder="00000-000"
                            className="max-w-[160px]"
                            data-testid="input-cep"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            disabled={!isOwner || cepLoading || addr.cep.replace(/\D/g,"").length !== 8}
                            onClick={() => lookupCep(addr.cep)}
                            data-testid="button-lookup-cep"
                          >
                            {cepLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                          </Button>
                        </div>
                      </div>

                      {/* Logradouro + Número */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
                        <div className="space-y-2">
                          <Label htmlFor="logradouro">Logradouro</Label>
                          <Input
                            id="logradouro"
                            value={addr.logradouro}
                            onChange={(e) => setAddr(prev => ({ ...prev, logradouro: e.target.value }))}
                            disabled={!isOwner}
                            placeholder="Rua, Avenida..."
                            data-testid="input-logradouro"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="numero">Número</Label>
                          <Input
                            id="numero"
                            value={addr.numero}
                            onChange={(e) => setAddr(prev => ({ ...prev, numero: e.target.value }))}
                            disabled={!isOwner}
                            placeholder="123"
                            data-testid="input-numero"
                          />
                        </div>
                      </div>

                      {/* Complemento + Bairro */}
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="complemento">Complemento</Label>
                          <Input
                            id="complemento"
                            value={addr.complemento}
                            onChange={(e) => setAddr(prev => ({ ...prev, complemento: e.target.value }))}
                            disabled={!isOwner}
                            placeholder="Apto, sala..."
                            data-testid="input-complemento"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bairro">Bairro</Label>
                          <Input
                            id="bairro"
                            value={addr.bairro}
                            onChange={(e) => setAddr(prev => ({ ...prev, bairro: e.target.value }))}
                            disabled={!isOwner}
                            placeholder="Bairro"
                            data-testid="input-bairro"
                          />
                        </div>
                      </div>

                      {/* Cidade + Estado */}
                      <div className="grid grid-cols-[1fr_80px] gap-3 sm:grid-cols-[1fr_80px]">
                        <div className="space-y-2">
                          <Label htmlFor="cidade">Cidade</Label>
                          <Input
                            id="cidade"
                            value={addr.cidade}
                            onChange={(e) => setAddr(prev => ({ ...prev, cidade: e.target.value }))}
                            disabled={!isOwner}
                            placeholder="Cidade"
                            data-testid="input-cidade"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="estado">UF</Label>
                          <Input
                            id="estado"
                            value={addr.estado}
                            onChange={(e) => setAddr(prev => ({ ...prev, estado: e.target.value.toUpperCase().slice(0, 2) }))}
                            disabled={!isOwner}
                            placeholder="SP"
                            data-testid="input-estado"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {isOwner && (
                    <div className="flex justify-end pt-2">
                      <Button type="submit" disabled={saveCompany.isPending} data-testid="button-save-company">
                        {saveCompany.isPending ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <Save className="mr-2 h-4 w-4" />
                        )}
                        Salvar empresa
                      </Button>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Perfil ──────────────────────────────────────────────────── */}
        <TabsContent value="perfil">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Meu perfil</CardTitle>
              <CardDescription>Atualize suas informações pessoais.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingProfile ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <form
                  onSubmit={(e) => { e.preventDefault(); saveProfile.mutate(); }}
                  className="space-y-5"
                >
                  <div className="flex flex-wrap items-center gap-4 pb-2">
                    <Avatar className="h-16 w-16">
                      {profileAvatar && <AvatarImage src={profileAvatar} alt="Avatar" />}
                      <AvatarFallback className="bg-gradient-primary text-lg font-bold text-primary-foreground">
                        {(fullName || user?.email || "U").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-semibold">{fullName || "Sem nome"}</p>
                      <p className="text-sm text-muted-foreground">{user?.email}</p>
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleAvatarFile(f);
                      }}
                      data-testid="input-profile-avatar"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={avatarUploading}
                        data-testid="button-upload-avatar"
                      >
                        {avatarUploading ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : null}
                        {profileAvatar ? "Trocar foto" : "Enviar foto"}
                      </Button>
                      {profileAvatar && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setProfileAvatar(null)}
                          data-testid="button-remove-avatar"
                        >
                          Remover
                        </Button>
                      )}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid gap-5 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="full-name">Nome completo *</Label>
                      <Input
                        id="full-name"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="João da Silva"
                        data-testid="input-full-name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-phone">Telefone *</Label>
                      <Input
                        id="profile-phone"
                        value={profilePhone}
                        onChange={(e) => setProfilePhone(maskPhone(e.target.value))}
                        placeholder="(11) 99999-9999"
                        inputMode="numeric"
                        data-testid="input-profile-phone"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-cpf">CPF *</Label>
                      <Input
                        id="profile-cpf"
                        value={profileCpf}
                        onChange={(e) => setProfileCpf(maskCpf(e.target.value))}
                        placeholder="000.000.000-00"
                        inputMode="numeric"
                        autoComplete="off"
                        disabled={profileCompletedLocked}
                        readOnly={profileCompletedLocked}
                        className={profileCompletedLocked ? "opacity-60" : undefined}
                        data-testid="input-profile-cpf"
                      />
                      <p className="text-xs text-muted-foreground">
                        {profileCompletedLocked
                          ? "O CPF não pode ser alterado depois de cadastrado."
                          : "Único por conta. Não poderá ser alterado depois de salvo."}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="profile-birth-date">Data de nascimento *</Label>
                      <Input
                        id="profile-birth-date"
                        type="date"
                        value={profileBirthDate}
                        onChange={(e) => setProfileBirthDate(e.target.value)}
                        max={(() => {
                          const d = new Date();
                          d.setFullYear(d.getFullYear() - 13);
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        })()}
                        min={(() => {
                          const d = new Date();
                          d.setFullYear(d.getFullYear() - 120);
                          return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                        })()}
                        disabled={profileCompletedLocked}
                        readOnly={profileCompletedLocked}
                        className={profileCompletedLocked ? "opacity-60" : undefined}
                        data-testid="input-profile-birth-date"
                      />
                      {profileCompletedLocked && (
                        <p className="text-xs text-muted-foreground">
                          A data de nascimento não pode ser alterada depois de cadastrada.
                        </p>
                      )}
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label htmlFor="profile-email">E-mail</Label>
                      <Input
                        id="profile-email"
                        value={user?.email ?? ""}
                        disabled
                        className="opacity-60"
                        data-testid="input-profile-email"
                      />
                      <p className="text-xs text-muted-foreground">O e-mail não pode ser alterado aqui.</p>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button type="submit" disabled={saveProfile.isPending} data-testid="button-save-profile">
                      {saveProfile.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Salvar perfil
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Equipe ──────────────────────────────────────────────────── */}
        <TabsContent value="equipe" className="space-y-6">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Membros da equipe</CardTitle>
              <CardDescription>Pessoas com acesso de login a esta empresa.</CardDescription>
            </CardHeader>
            <CardContent>
              {loadingMembers ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : members.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <Users className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Nenhum membro encontrado</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {members.map((m: any) => {
                    const role = ROLE_CONFIG[m.role] ?? { label: m.role, icon: User, color: "text-muted-foreground" };
                    const RoleIcon = role.icon;
                    const name = m.profiles?.full_name || m.profiles?.email || "Usuário";
                    const initials = name.split(" ").map((s: string) => s[0]).slice(0, 2).join("").toUpperCase();
                    return (
                      <div key={m.user_id} className="flex items-center justify-between py-3" data-testid={`member-row-${m.user_id}`}>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarFallback className="bg-muted text-sm font-semibold">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{name}</p>
                            <p className="text-xs text-muted-foreground">{m.profiles?.email}</p>
                          </div>
                        </div>
                        <Badge variant="secondary" className="gap-1.5">
                          <RoleIcon className={`h-3 w-3 ${role.color}`} />
                          {role.label}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Operadores (cartão + PIN) ────────────────────────────── */}
          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
              <div>
                <CardTitle className="text-base">Operadores do caixa</CardTitle>
                <CardDescription>
                  Cadastre os operadores que vão liberar sangrias e cancelamentos com cartão e senha.
                </CardDescription>
              </div>
              <Button size="sm" onClick={openCreateStaff} data-testid="button-new-staff" className="gap-1.5">
                <Plus className="h-4 w-4" />
                Novo operador
              </Button>
            </CardHeader>
            <CardContent>
              {loadingStaff ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}
                </div>
              ) : staff.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <ScanLine className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm font-medium">Nenhum operador cadastrado</p>
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Operadores precisam de cartão (código de barras) e senha para autorizar sangrias e cancelamentos no caixa.
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {staff.map((s) => {
                    const role = ROLE_CONFIG[s.role] ?? { label: s.role, icon: User, color: "text-muted-foreground" };
                    const RoleIcon = role.icon;
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-3 py-3"
                        data-testid={`staff-row-${s.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="rounded-lg bg-muted p-2">
                            <ScanLine className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-medium truncate">{s.name}</p>
                              {!s.active && (
                                <Badge variant="outline" className="text-[10px]">Inativo</Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">
                              Cartão: {s.badge_code}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge variant="secondary" className="gap-1">
                            <RoleIcon className={`h-3 w-3 ${role.color}`} />
                            <span className="hidden sm:inline">{role.label}</span>
                          </Badge>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => setSBarcodeDialog({ name: s.name, code: s.badge_code, role: s.role })}
                            data-testid={`button-staff-print-${s.id}`}
                            title="Ver/imprimir cartão"
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => openEditStaff(s)}
                            data-testid={`button-staff-edit-${s.id}`}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              if (confirm(`Remover ${s.name}?`)) deleteStaff.mutate(s.id);
                            }}
                            data-testid={`button-staff-delete-${s.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Impressora ──────────────────────────────────────────────── */}
        <TabsContent value="impressora">
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Impressora térmica</CardTitle>
              <CardDescription>
                Conecte uma impressora ESC/POS via USB, Serial ou Bluetooth, ou use a impressão padrão do navegador.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Modo de impressão */}
              <div className="space-y-3">
                <Label>Modo de conexão</Label>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {([
                    { mode: "serial", label: "USB (Serial)", icon: Cable, supported: printerCaps.serial, hint: "Cabo USB — recomendado" },
                    { mode: "usb", label: "USB (Raw)", icon: Usb, supported: printerCaps.usb, hint: "USB sem driver" },
                    { mode: "bluetooth", label: "Bluetooth", icon: Bluetooth, supported: printerCaps.bluetooth, hint: "Impressora portátil" },
                  ] as { mode: PrinterMode; label: string; icon: any; supported: boolean; hint: string }[]).map((opt) => {
                    const active = printer.mode === opt.mode;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.mode}
                        type="button"
                        disabled={!opt.supported}
                        onClick={() => updatePrinter({ mode: opt.mode, deviceLabel: undefined })}
                        className={`relative rounded-lg border p-4 text-left transition hover-elevate ${
                          active ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                        } ${!opt.supported ? "opacity-50 cursor-not-allowed" : ""}`}
                        data-testid={`printer-mode-${opt.mode}`}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={`h-5 w-5 ${active ? "text-primary" : "text-muted-foreground"}`} />
                          <span className="font-medium text-sm">{opt.label}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{opt.hint}</p>
                        {!opt.supported && (
                          <p className="mt-2 text-xs text-destructive">Não suportado neste navegador</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Status / conectar */}
              <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  {printerConnected ? (
                    <>
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="text-sm font-medium" data-testid="text-printer-status">Impressora conectada</p>
                        <p className="text-xs text-muted-foreground">{printer.deviceLabel ?? "Dispositivo autorizado"}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <XCircle className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">Nenhuma impressora conectada</p>
                        <p className="text-xs text-muted-foreground">Clique em "Conectar" para autorizar.</p>
                      </div>
                    </>
                  )}
                </div>
                <Button onClick={handleConnect} disabled={connecting} data-testid="button-connect-printer">
                  {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Printer className="mr-2 h-4 w-4" />}
                  {printerConnected ? "Reconectar" : "Conectar impressora"}
                </Button>
              </div>

              {/* Marca / modelo + largura do papel */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="printer-preset">Marca e modelo da impressora</Label>
                  <Select
                    value={printer.presetId ?? CUSTOM_PRESET_ID}
                    onValueChange={(v) => {
                      if (v === CUSTOM_PRESET_ID) {
                        updatePrinter({ presetId: undefined });
                        return;
                      }
                      const preset = findPreset(v);
                      if (!preset) return;
                      updatePrinter({
                        presetId: preset.id,
                        paperWidth: preset.paperWidth,
                        cols: preset.cols,
                      });
                    }}
                  >
                    <SelectTrigger id="printer-preset" data-testid="select-printer-preset">
                      <SelectValue placeholder="Selecione a marca e modelo" />
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={CUSTOM_PRESET_ID}>Personalizado (definir manualmente)</SelectItem>
                      {PRESET_BRANDS.map((brand) => (
                        <SelectGroup key={brand}>
                          <SelectLabel>{brand}</SelectLabel>
                          {PRINTER_PRESETS.filter((p) => p.brand === brand).map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.model} — {p.paperWidth} mm / {p.cols} col
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Escolha sua impressora para preencher automaticamente largura do papel e colunas.
                    Se a sua não estiver na lista, escolha "Personalizado".
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paper-width">Largura do papel</Label>
                  <Select
                    value={String(printer.paperWidth)}
                    onValueChange={(v) =>
                      updatePrinter({
                        paperWidth: Number(v) as PaperWidth,
                        presetId: undefined,
                      })
                    }
                  >
                    <SelectTrigger id="paper-width" data-testid="select-paper-width">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="58">58 mm</SelectItem>
                      <SelectItem value="76">76 mm</SelectItem>
                      <SelectItem value="80">80 mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paper-cols">Colunas por linha</Label>
                  <Select
                    value={String(printer.cols ?? (printer.paperWidth === 58 ? 32 : printer.paperWidth === 76 ? 42 : 48))}
                    onValueChange={(v) =>
                      updatePrinter({ cols: Number(v), presetId: undefined })
                    }
                  >
                    <SelectTrigger id="paper-cols" data-testid="select-paper-cols">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="24">24 colunas</SelectItem>
                      <SelectItem value="30">30 colunas</SelectItem>
                      <SelectItem value="32">32 colunas (padrão 58 mm)</SelectItem>
                      <SelectItem value="38">38 colunas</SelectItem>
                      <SelectItem value="40">40 colunas</SelectItem>
                      <SelectItem value="42">42 colunas (padrão 76 mm)</SelectItem>
                      <SelectItem value="44">44 colunas</SelectItem>
                      <SelectItem value="46">46 colunas</SelectItem>
                      <SelectItem value="48">48 colunas (padrão 80 mm)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Diminua se o cupom estiver cortando produtos no canto.
                  </p>
                </div>
              </div>

              {/* Cabeçalho / rodapé */}
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Cabeçalho do cupom</Label>
                  <div
                    className="flex min-h-[88px] w-full whitespace-pre-line rounded-md border border-dashed border-input bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
                    data-testid="text-receipt-header-preview"
                  >
                    {printer.header || "Preencha nome, documento e telefone da empresa na aba Empresa."}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Gerado automaticamente a partir dos dados da empresa.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receipt-footer">Rodapé do cupom</Label>
                  <textarea
                    id="receipt-footer"
                    value={printer.footer}
                    onChange={(e) => updatePrinter({ footer: e.target.value })}
                    rows={3}
                    placeholder="Obrigado pela preferência!"
                    className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    data-testid="input-receipt-footer"
                  />
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-4 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="print-logo">Imprimir logo PDVIO no topo</Label>
                    <p className="text-xs text-muted-foreground">Mostra a logo no início do cupom.</p>
                  </div>
                  <Switch
                    id="print-logo"
                    checked={printer.printLogo}
                    onCheckedChange={(v) => updatePrinter({ printLogo: v })}
                    data-testid="switch-print-logo"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-cut">Cortar papel automaticamente</Label>
                    <p className="text-xs text-muted-foreground">Envia o comando de corte ao final do cupom.</p>
                  </div>
                  <Switch
                    id="auto-cut"
                    checked={printer.autoCut}
                    onCheckedChange={(v) => updatePrinter({ autoCut: v })}
                    data-testid="switch-auto-cut"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto-print-finalize">Imprimir cupom ao finalizar venda</Label>
                    <p className="text-xs text-muted-foreground">Imprime automaticamente ao finalizar uma venda no PDV ou fechar uma comanda.</p>
                  </div>
                  <Switch
                    id="auto-print-finalize"
                    checked={printer.autoPrintOnFinalize}
                    onCheckedChange={(v) => updatePrinter({ autoPrintOnFinalize: v })}
                    data-testid="switch-auto-print-finalize"
                  />
                </div>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="open-drawer">Abrir gaveta após imprimir</Label>
                    <p className="text-xs text-muted-foreground">Apenas se a gaveta estiver ligada à impressora.</p>
                  </div>
                  <Switch
                    id="open-drawer"
                    checked={printer.openDrawer}
                    onCheckedChange={(v) => updatePrinter({ openDrawer: v })}
                    data-testid="switch-open-drawer"
                  />
                </div>
              </div>

              {/* Ações */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <Button variant="ghost" type="button" onClick={handleResetPrinter} data-testid="button-reset-printer">
                  Restaurar padrões
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" type="button" onClick={handleOpenDrawer} data-testid="button-open-drawer">
                    <Inbox className="mr-2 h-4 w-4" />
                    Abrir gaveta
                  </Button>
                  <Button variant="outline" type="button" onClick={handleTest} disabled={testing} data-testid="button-test-print">
                    {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <TestTube2 className="mr-2 h-4 w-4" />}
                    Imprimir cupom de teste
                  </Button>
                  <Button
                    type="button"
                    onClick={handleSavePrinter}
                    disabled={savingPrinter || !printerDirty || !activeCompany}
                    data-testid="button-save-printer"
                  >
                    {savingPrinter ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {printerDirty ? "Salvar alterações" : "Salvo"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Banco ───────────────────────────────────────────────────── */}
        <TabsContent value="banco" className="space-y-6">
          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Contas bancárias</CardTitle>
                <CardDescription>
                  Cadastre as contas bancárias da empresa para usar em contas a pagar/receber e repasses.
                </CardDescription>
              </div>
              {isOwner && bankAccounts.length === 0 && (
                <Button onClick={openCreateBank} data-testid="button-add-bank">
                  <Plus className="mr-2 h-4 w-4" />
                  Cadastrar conta
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {loadingBankAccounts ? (
                <div className="space-y-3">
                  {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                </div>
              ) : bankAccounts.length === 0 ? (
                <div className="rounded-lg border border-dashed py-10 text-center">
                  <Landmark className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Nenhuma conta bancária cadastrada ainda.
                  </p>
                  {isOwner && (
                    <Button
                      variant="outline"
                      className="mt-4"
                      onClick={openCreateBank}
                      data-testid="button-add-bank-empty"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar conta
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {bankAccounts.map((b) => {
                    const accountTypeLabel = {
                      corrente: "Conta corrente",
                      poupanca: "Poupança",
                      pagamento: "Conta pagamento",
                      salario: "Conta salário",
                    }[b.account_type];
                    return (
                      <div
                        key={b.id}
                        className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center"
                        data-testid={`card-bank-${b.id}`}
                      >
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                          <Landmark className="h-6 w-6" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-mono rounded bg-muted px-1.5 py-0.5">
                              {b.bank_code}
                            </span>
                            <span className="font-semibold truncate">{b.bank_name}</span>
                            <Badge variant="outline" className="uppercase">
                              {b.holder_type === "pj" ? "PJ" : "PF"}
                            </Badge>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">
                            {accountTypeLabel} · Ag. {b.agency}
                            {b.agency_digit ? `-${b.agency_digit}` : ""} · Conta {b.account}
                            {b.account_digit ? `-${b.account_digit}` : ""}
                          </p>
                          {b.holder_name && (
                            <p className="text-xs text-muted-foreground truncate">
                              Titular: {b.holder_name}
                              {b.holder_document ? ` · ${b.holder_document}` : ""}
                            </p>
                          )}
                          {b.pix_key && (
                            <p className="text-xs text-muted-foreground truncate">
                              PIX{b.pix_key_type ? ` (${{
                                cpf: "CPF",
                                cnpj: "CNPJ",
                                email: "E-mail",
                                telefone: "Telefone",
                                aleatoria: "Aleatória",
                              }[b.pix_key_type]})` : ""}: {b.pix_key}
                            </p>
                          )}
                        </div>
                        {isOwner && (
                          <div className="flex gap-2">
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => openEditBank(b)}
                              data-testid={`button-edit-bank-${b.id}`}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              onClick={() => setBankToDelete(b)}
                              data-testid={`button-delete-bank-${b.id}`}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Pagamentos ──────────────────────────────────────────────── */}
        <TabsContent value="pagamentos" className="space-y-6">
          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="text-base">Formas de pagamento</CardTitle>
                <CardDescription>
                  Selecione quais formas aparecem ao finalizar vendas no PDV e nas Comandas.
                </CardDescription>
              </div>
              <Button
                onClick={handleSavePayment}
                disabled={!paymentDirty || savingPayment || !isOwner}
                data-testid="button-save-payment-methods"
              >
                {savingPayment ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Salvar
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {ALL_PAYMENT_METHODS.map((m) => {
                const enabled = paymentSettings.enabled.includes(m.id);
                const Icon =
                  m.id === "cash" ? Banknote :
                  m.id === "credit_card" ? CreditCard :
                  m.id === "debit_card" ? CreditCard :
                  m.id === "pix" ? QrCode :
                  m.id === "ticket" ? Ticket :
                  Wallet;
                const isPix = m.id === "pix";
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 rounded-lg border p-3"
                    data-testid={`row-payment-method-${m.id}`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{m.label}</p>
                        {isPix && (
                          <p className="text-xs text-muted-foreground">
                            {hasPixKeyConfigured
                              ? "Chave PIX cadastrada · QR Code estático será gerado automaticamente."
                              : "Cadastre uma chave PIX na aba Banco para gerar o QR Code."}
                          </p>
                        )}
                      </div>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={() => togglePaymentMethod(m.id)}
                      disabled={!isOwner}
                      data-testid={`switch-payment-${m.id}`}
                    />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">
                As formas selecionadas serão exibidas no PDV e no fechamento de Comandas. Pelo menos uma forma deve permanecer ativa.
              </p>
            </CardContent>
          </Card>

          <CrediarioConfigCard />
        </TabsContent>
      </Tabs>

      {/* ── Bank account create/edit dialog ───────────────────────────── */}
      <Dialog open={bankDialog} onOpenChange={setBankDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingBank ? "Editar conta bancária" : "Nova conta bancária"}</DialogTitle>
            <DialogDescription>
              Selecione o banco e preencha os dados da conta. Lista oficial via BrasilAPI.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => { e.preventDefault(); saveBank.mutate(); }}
            className="space-y-4"
          >
            {/* Banco (combobox) */}
            <div className="space-y-2">
              <Label>Banco</Label>
              <Popover open={bankPickerOpen} onOpenChange={setBankPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    data-testid="button-bank-picker"
                  >
                    {bSelected ? (
                      <span className="flex items-center gap-2 truncate">
                        <span className="text-xs font-mono rounded bg-muted px-1.5 py-0.5">
                          {bSelected.code}
                        </span>
                        <span className="truncate">{bSelected.name}</span>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Buscar banco por código ou nome...</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Digite o código ou nome..." />
                    <CommandList>
                      {loadingBanks ? (
                        <div className="py-6 text-center text-sm text-muted-foreground">
                          <Loader2 className="mx-auto mb-2 h-4 w-4 animate-spin" />
                          Carregando bancos...
                        </div>
                      ) : (
                        <>
                          <CommandEmpty>Nenhum banco encontrado.</CommandEmpty>
                          <CommandGroup>
                            {banks.map((bk) => {
                              const code = String(bk.code);
                              return (
                                <CommandItem
                                  key={`${bk.ispb}-${code}`}
                                  value={`${code} ${bk.name} ${bk.fullName}`}
                                  onSelect={() => {
                                    setBSelected({ code, name: bk.name, ispb: bk.ispb });
                                    setBankPickerOpen(false);
                                  }}
                                >
                                  <span className="text-xs font-mono rounded bg-muted px-1.5 py-0.5 mr-2">
                                    {code}
                                  </span>
                                  <span className="truncate">{bk.name}</span>
                                </CommandItem>
                              );
                            })}
                          </CommandGroup>
                        </>
                      )}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Holder type */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="bank-holder-type">Titular</Label>
                <Select value={bHolderType} onValueChange={(v) => setBHolderType(v as "pj" | "pf")}>
                  <SelectTrigger id="bank-holder-type" data-testid="select-bank-holder-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pj">Empresa (PJ)</SelectItem>
                    <SelectItem value="pf">Pessoa física (PF)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-account-type">Tipo de conta</Label>
                <Select value={bAccountType} onValueChange={(v) => setBAccountType(v as any)}>
                  <SelectTrigger id="bank-account-type" data-testid="select-bank-account-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Conta corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="pagamento">Conta pagamento</SelectItem>
                    <SelectItem value="salario">Conta salário</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-holder-name">Nome do titular</Label>
                <Input
                  id="bank-holder-name"
                  value={bHolderName}
                  onChange={(e) => setBHolderName(e.target.value)}
                  placeholder={bHolderType === "pj" ? "Razão social" : "Nome completo"}
                  data-testid="input-bank-holder-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-holder-doc">{bHolderType === "pj" ? "CNPJ" : "CPF"}</Label>
                <Input
                  id="bank-holder-doc"
                  value={bHolderDoc}
                  onChange={(e) => setBHolderDoc(maskDocument(e.target.value))}
                  placeholder={bHolderType === "pj" ? "00.000.000/0000-00" : "000.000.000-00"}
                  data-testid="input-bank-holder-doc"
                />
              </div>
            </div>

            {/* Agência + dígito */}
            <div className="grid gap-4 grid-cols-[1fr_100px]">
              <div className="space-y-2">
                <Label htmlFor="bank-agency">Agência</Label>
                <Input
                  id="bank-agency"
                  value={bAgency}
                  onChange={(e) => setBAgency(e.target.value.replace(/\D/g, ""))}
                  placeholder="0000"
                  required
                  data-testid="input-bank-agency"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-agency-digit">Dígito</Label>
                <Input
                  id="bank-agency-digit"
                  value={bAgencyDigit}
                  onChange={(e) => setBAgencyDigit(e.target.value.replace(/[^0-9Xx]/g, "").slice(0, 2))}
                  placeholder="0"
                  data-testid="input-bank-agency-digit"
                />
              </div>
            </div>

            {/* Conta + dígito */}
            <div className="grid gap-4 grid-cols-[1fr_100px]">
              <div className="space-y-2">
                <Label htmlFor="bank-account">Conta</Label>
                <Input
                  id="bank-account"
                  value={bAccount}
                  onChange={(e) => setBAccount(e.target.value.replace(/\D/g, ""))}
                  placeholder="00000000"
                  required
                  data-testid="input-bank-account"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-account-digit">Dígito</Label>
                <Input
                  id="bank-account-digit"
                  value={bAccountDigit}
                  onChange={(e) => setBAccountDigit(e.target.value.replace(/[^0-9Xx]/g, "").slice(0, 2))}
                  placeholder="0"
                  data-testid="input-bank-account-digit"
                />
              </div>
            </div>

            {/* PIX */}
            <div className="grid gap-4 grid-cols-[180px_1fr]">
              <div className="space-y-2">
                <Label htmlFor="bank-pix-type">Tipo da chave PIX</Label>
                <Select
                  value={bPixKeyType || "none"}
                  onValueChange={(v) => {
                    const next = v === "none" ? "" : (v as typeof bPixKeyType);
                    setBPixKeyType(next);
                    // Reformat existing key value to fit the new type in real time.
                    setBPixKey((prev) => {
                      if (!prev) return prev;
                      if (next === "cpf") return maskCpf(prev);
                      if (next === "cnpj") return maskCnpj(prev);
                      if (next === "telefone") return maskPhone(prev);
                      if (next === "aleatoria") return maskRandomPixKey(prev);
                      if (next === "email") return prev.replace(/\s+/g, "").toLowerCase();
                      return prev;
                    });
                  }}
                >
                  <SelectTrigger id="bank-pix-type" data-testid="select-bank-pix-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem chave PIX</SelectItem>
                    <SelectItem value="cpf">CPF</SelectItem>
                    <SelectItem value="cnpj">CNPJ</SelectItem>
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="aleatoria">Chave aleatória</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bank-pix">Chave PIX</Label>
                <Input
                  id="bank-pix"
                  value={bPixKey}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (bPixKeyType === "cpf") setBPixKey(maskCpf(v));
                    else if (bPixKeyType === "cnpj") setBPixKey(maskCnpj(v));
                    else if (bPixKeyType === "telefone") setBPixKey(maskPhone(v));
                    else if (bPixKeyType === "aleatoria") setBPixKey(maskRandomPixKey(v));
                    else if (bPixKeyType === "email") setBPixKey(v.replace(/\s+/g, "").toLowerCase());
                    else setBPixKey(v);
                  }}
                  disabled={!bPixKeyType}
                  placeholder={
                    bPixKeyType === "cpf" ? "000.000.000-00"
                    : bPixKeyType === "cnpj" ? "00.000.000/0000-00"
                    : bPixKeyType === "email" ? "contato@empresa.com"
                    : bPixKeyType === "telefone" ? "(11) 99999-9999"
                    : bPixKeyType === "aleatoria" ? "00000000-0000-0000-0000-000000000000"
                    : "Selecione o tipo da chave"
                  }
                  data-testid="input-bank-pix"
                />
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setBankDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={saveBank.isPending} data-testid="button-save-bank">
                {saveBank.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Bank account delete confirmation ──────────────────────────── */}
      <AlertDialog open={!!bankToDelete} onOpenChange={(v) => !v && setBankToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conta bancária?</AlertDialogTitle>
            <AlertDialogDescription>
              {bankToDelete && (
                <>
                  A conta <strong>{bankToDelete.bank_name}</strong> · Ag.{" "}
                  {bankToDelete.agency}
                  {bankToDelete.agency_digit ? `-${bankToDelete.agency_digit}` : ""} · Conta{" "}
                  {bankToDelete.account}
                  {bankToDelete.account_digit ? `-${bankToDelete.account_digit}` : ""} será excluída
                  permanentemente. Esta ação não pode ser desfeita.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-cancel-delete-bank">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (bankToDelete) {
                  deleteBank.mutate(bankToDelete.id, {
                    onSettled: () => setBankToDelete(null),
                  });
                }
              }}
              data-testid="button-confirm-delete-bank"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Staff create/edit dialog ──────────────────────────────────── */}
      <Dialog open={staffDialog} onOpenChange={setStaffDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Editar operador" : "Novo operador"}</DialogTitle>
            <DialogDescription>
              {editingStaff
                ? "Atualize os dados. Deixe a senha em branco para manter a atual."
                : "Cadastre um operador com cartão (código de barras) e senha numérica."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="staff-name">Nome</Label>
              <Input
                id="staff-name"
                value={sName}
                onChange={(e) => setSName(e.target.value)}
                placeholder="Ex: João Silva"
                data-testid="input-staff-name"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label>Função</Label>
              <Select value={sRole} onValueChange={(v) => setSRole(v as any)}>
                <SelectTrigger data-testid="select-staff-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manager">Gerente (autoriza sangria/cancelamento)</SelectItem>
                  <SelectItem value="cashier">Caixa</SelectItem>
                  <SelectItem value="waiter">Garçom</SelectItem>
                  <SelectItem value="kitchen">Cozinha</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-badge">Código do cartão</Label>
              <div className="flex gap-2">
                <Input
                  id="staff-badge"
                  value={sBadge}
                  onChange={(e) => setSBadge(e.target.value.replace(/\D/g, ""))}
                  placeholder="Bipe um cartão ou gere abaixo"
                  className="font-mono"
                  data-testid="input-staff-badge"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setSBadge(generateBadgeCode())}
                  title="Gerar novo código"
                >
                  <ScanLine className="h-4 w-4" />
                </Button>
              </div>
              {sBadge && (
                <div className="rounded-md bg-white p-2 flex justify-center border border-border">
                  <Barcode value={sBadge} height={50} width={1.6} />
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="staff-pin">
                Senha numérica {editingStaff && <span className="text-xs text-muted-foreground">(opcional)</span>}
              </Label>
              <Input
                id="staff-pin"
                type="password"
                inputMode="numeric"
                maxLength={8}
                value={sPin}
                onChange={(e) => setSPin(e.target.value.replace(/\D/g, ""))}
                placeholder={editingStaff ? "•••• (deixe em branco para manter)" : "Mín. 4 dígitos"}
                data-testid="input-staff-pin"
              />
            </div>

            {editingStaff && (
              <div className="flex items-center justify-between rounded-md border border-border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="staff-active">Ativo</Label>
                  <p className="text-xs text-muted-foreground">
                    Inativos não conseguem autorizar operações.
                  </p>
                </div>
                <Switch id="staff-active" checked={sActive} onCheckedChange={setSActive} />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setStaffDialog(false)}>Cancelar</Button>
            <Button
              onClick={() => saveStaff.mutate()}
              disabled={saveStaff.isPending}
              data-testid="button-save-staff"
            >
              {saveStaff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingStaff ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Barcode card preview / print ──────────────────────────────── */}
      <Dialog open={!!sBarcodeDialog} onOpenChange={(o) => !o && setSBarcodeDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Cartão do {sBarcodeDialog ? (ROLE_CONFIG[sBarcodeDialog.role]?.label ?? "operador").toLowerCase() : "operador"}
            </DialogTitle>
            <DialogDescription>
              Tamanho real de um cartão (85,6 × 54 mm). Imprima e entregue ao colaborador.
            </DialogDescription>
          </DialogHeader>
          {sBarcodeDialog && (
            <div className="flex justify-center py-2">
              <div
                ref={staffCardRef}
                id="staff-card-print"
                className="staff-card relative bg-white text-black rounded-xl border border-black/20 shadow-lg overflow-hidden"
                style={{ width: "340px", height: "214px" }}
              >
                {/* Header with logo */}
                <div className="flex items-center justify-between px-4 pt-3">
                  <img src={logoPdvio} alt="PDVio" className="h-6 w-auto" crossOrigin="anonymous" />
                  <span className="text-[9px] uppercase tracking-[0.2em] text-black/60 font-semibold">
                    {ROLE_CONFIG[sBarcodeDialog.role]?.label ?? sBarcodeDialog.role}
                  </span>
                </div>

                {/* Name */}
                <div className="px-4 mt-2">
                  <p className="text-[10px] uppercase tracking-widest text-black/50">Nome</p>
                  <p className="text-base font-bold leading-tight break-words">{sBarcodeDialog.name}</p>
                </div>

                {/* Barcode */}
                <div className="absolute inset-x-0 bottom-2 flex justify-center">
                  <Barcode
                    value={sBarcodeDialog.code}
                    height={55}
                    width={1.8}
                    displayValue
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" onClick={() => setSBarcodeDialog(null)}>Fechar</Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!sBarcodeDialog) return;
                const el = staffCardRef.current;
                if (!el) return;
                try {
                  const html2canvas = (await import("html2canvas")).default;
                  const canvas = await html2canvas(el, {
                    backgroundColor: "#ffffff",
                    scale: 3,
                    useCORS: true,
                  });
                  const fileName = `cartao-${sBarcodeDialog.name.replace(/\s+/g, "_").toLowerCase()}.png`;
                  canvas.toBlob((blob) => {
                    if (!blob) { toast.error("Erro ao gerar imagem"); return; }
                    const url = URL.createObjectURL(blob);
                    const link = window.document.createElement("a");
                    link.href = url;
                    link.download = fileName;
                    window.document.body.appendChild(link);
                    link.click();
                    window.document.body.removeChild(link);
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  }, "image/png");
                } catch (e: any) {
                  toast.error("Erro ao gerar imagem");
                }
              }}
              className="gap-1.5"
              data-testid="button-download-card"
            >
              <Download className="h-4 w-4" /> Baixar PNG
            </Button>
            <Button onClick={() => window.print()} className="gap-1.5">
              <Printer className="h-4 w-4" /> Imprimir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Crediário config card ───────────────────────────────────────────────────

function CrediarioConfigCard() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const [pctStr, setPctStr] = useState<string>("");
  const [period, setPeriod] = useState<"day" | "month">("month");

  const { data, isLoading } = useQuery({
    queryKey: ["/crediario/cfg", activeCompany?.id],
    enabled: !!activeCompany?.id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("companies")
        .select("crediario_late_fee_percent, crediario_late_fee_period")
        .eq("id", activeCompany!.id)
        .maybeSingle();
      if (error) throw error;
      return data as {
        crediario_late_fee_percent: number;
        crediario_late_fee_period: "day" | "month";
      } | null;
    },
  });

  useEffect(() => {
    if (data) {
      setPctStr(String(data.crediario_late_fee_percent ?? 0).replace(".", ","));
      setPeriod((data.crediario_late_fee_period as any) ?? "month");
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: async (payload: { pct: number; period: "day" | "month" }) => {
      const { error } = await (supabase as any)
        .from("companies")
        .update({
          crediario_late_fee_percent: payload.pct,
          crediario_late_fee_period: payload.period,
        })
        .eq("id", activeCompany!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Configuração salva");
      queryClient.invalidateQueries({ queryKey: ["/crediario/cfg", activeCompany?.id] });
      queryClient.invalidateQueries({ queryKey: ["/crediario/company-cfg", activeCompany?.id] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crediário</CardTitle>
        <CardDescription>
          Defina a multa percentual aplicada sobre o valor em atraso na caderneta dos clientes.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 max-w-xs">
            <Label>Multa por atraso (%)</Label>
            <Input
              value={pctStr}
              onChange={(e) => setPctStr(e.target.value)}
              placeholder="0,00"
              inputMode="decimal"
              className="font-mono"
              disabled={isLoading}
              data-testid="input-late-fee-pct"
            />
          </div>
          <div className="flex-1 max-w-xs">
            <Label>Aplicada por</Label>
            <Select value={period} onValueChange={(v) => setPeriod(v as "day" | "month")} disabled={isLoading}>
              <SelectTrigger data-testid="select-late-fee-period">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Dia</SelectItem>
                <SelectItem value="month">Mês</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => {
              const v = parseFloat(pctStr.replace(",", "."));
              if (!isFinite(v) || v < 0 || v > 100) {
                toast.error("Valor entre 0 e 100");
                return;
              }
              saveMut.mutate({ pct: v, period });
            }}
            disabled={saveMut.isPending}
            data-testid="button-save-late-fee"
          >
            Salvar
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          A multa é lançada automaticamente como um débito separado em cada cobrança vencida e
          é recalculada conforme {period === "day" ? "os dias" : "os meses"} de atraso.
        </p>
      </CardContent>
    </Card>
  );
}
