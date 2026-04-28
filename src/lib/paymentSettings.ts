import { supabase } from "@/integrations/supabase/client";

export type PaymentMethodId =
  | "cash"
  | "credit_card"
  | "debit_card"
  | "pix"
  | "ticket"
  | "mixed"
  | "crediario";

export interface PaymentSettings {
  enabled: PaymentMethodId[];
}

export const ALL_PAYMENT_METHODS: { id: PaymentMethodId; label: string }[] = [
  { id: "cash", label: "Dinheiro" },
  { id: "credit_card", label: "Crédito" },
  { id: "debit_card", label: "Débito" },
  { id: "pix", label: "PIX" },
  { id: "ticket", label: "Ticket" },
  { id: "mixed", label: "Misto" },
  { id: "crediario", label: "Crediário" },
];

export const defaultPaymentSettings: PaymentSettings = {
  enabled: ["cash", "credit_card", "debit_card", "pix", "ticket", "mixed"],
};

const storageKey = (companyId: string) => `payment-settings:${companyId}`;

function readLocal(companyId: string): PaymentSettings {
  try {
    const raw = localStorage.getItem(storageKey(companyId));
    if (!raw) return defaultPaymentSettings;
    const parsed = JSON.parse(raw) as Partial<PaymentSettings>;
    return {
      enabled: Array.isArray(parsed.enabled) && parsed.enabled.length
        ? (parsed.enabled.filter((v) => ALL_PAYMENT_METHODS.some((m) => m.id === v)) as PaymentMethodId[])
        : defaultPaymentSettings.enabled,
    };
  } catch {
    return defaultPaymentSettings;
  }
}

function writeLocal(companyId: string, s: PaymentSettings) {
  try {
    localStorage.setItem(storageKey(companyId), JSON.stringify(s));
  } catch { /* ignore */ }
}

export async function loadPaymentSettings(companyId: string): Promise<PaymentSettings> {
  const local = readLocal(companyId);
  try {
    const { data, error } = await (supabase as any)
      .from("companies")
      .select("payment_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data?.payment_settings) return local;
    const remote = data.payment_settings as Partial<PaymentSettings>;
    const merged: PaymentSettings = {
      enabled: Array.isArray(remote.enabled) && remote.enabled.length
        ? (remote.enabled.filter((v: string) => ALL_PAYMENT_METHODS.some((m) => m.id === v)) as PaymentMethodId[])
        : local.enabled,
    };
    writeLocal(companyId, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function savePaymentSettings(companyId: string, s: PaymentSettings): Promise<void> {
  writeLocal(companyId, s);
  try {
    await (supabase as any)
      .from("companies")
      .update({ payment_settings: s })
      .eq("id", companyId);
  } catch {
    // ignore — local cache holds latest until column exists
  }
}

/** Synchronous read of cached settings (used by PDV/Comandas to filter UI). */
export function getCachedPaymentSettings(companyId: string | null | undefined): PaymentSettings {
  if (!companyId) return defaultPaymentSettings;
  return readLocal(companyId);
}
