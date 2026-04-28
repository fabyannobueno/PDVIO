import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  defaultPaymentSettings,
  getCachedPaymentSettings,
  loadPaymentSettings,
  type PaymentSettings,
  ALL_PAYMENT_METHODS,
  type PaymentMethodId,
} from "@/lib/paymentSettings";

const EVENT_NAME = "payment-settings:changed";

export function emitPaymentSettingsChanged(companyId: string, settings: PaymentSettings) {
  try {
    window.dispatchEvent(
      new CustomEvent(EVENT_NAME, { detail: { companyId, settings } }),
    );
  } catch {
    /* ignore */
  }
}

function normalize(remote: any, fallback: PaymentSettings): PaymentSettings {
  if (!remote) return fallback;
  const enabled = Array.isArray(remote.enabled) && remote.enabled.length
    ? (remote.enabled.filter((v: string) =>
        ALL_PAYMENT_METHODS.some((m) => m.id === v),
      ) as PaymentMethodId[])
    : fallback.enabled;
  return { enabled };
}

export function usePaymentSettings(companyId: string | null | undefined): PaymentSettings {
  const [settings, setSettings] = useState<PaymentSettings>(() =>
    getCachedPaymentSettings(companyId),
  );

  useEffect(() => {
    if (!companyId) {
      setSettings(defaultPaymentSettings);
      return;
    }

    let cancelled = false;
    setSettings(getCachedPaymentSettings(companyId));

    loadPaymentSettings(companyId).then((s) => {
      if (!cancelled) setSettings(s);
    });

    const onLocal = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { companyId: string; settings: PaymentSettings }
        | undefined;
      if (detail?.companyId === companyId && detail.settings) {
        setSettings(detail.settings);
      }
    };
    window.addEventListener(EVENT_NAME, onLocal as EventListener);

    const onStorage = (e: StorageEvent) => {
      if (e.key === `payment-settings:${companyId}`) {
        setSettings(getCachedPaymentSettings(companyId));
      }
    };
    window.addEventListener("storage", onStorage);

    const channel = (supabase as any)
      .channel(`payment-settings:${companyId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "companies",
          filter: `id=eq.${companyId}`,
        },
        (payload: any) => {
          const next = normalize(payload?.new?.payment_settings, defaultPaymentSettings);
          setSettings(next);
          try {
            localStorage.setItem(
              `payment-settings:${companyId}`,
              JSON.stringify(next),
            );
          } catch {
            /* ignore */
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      window.removeEventListener(EVENT_NAME, onLocal as EventListener);
      window.removeEventListener("storage", onStorage);
      try {
        (supabase as any).removeChannel(channel);
      } catch {
        /* ignore */
      }
    };
  }, [companyId]);

  return settings;
}
