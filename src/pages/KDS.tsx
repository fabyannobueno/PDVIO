import { useEffect, useMemo, useRef, useState } from "react";
import notificationSoundUrl from "@assets/notification-pdvio_1776868318337.mp3";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import {
  ChefHat,
  Clock,
  Play,
  CheckCircle2,
  Undo2,
  RotateCcw,
  Utensils,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

type KdsStatus = "pending" | "preparing" | "ready" | "done";

interface KdsAddon {
  name: string;
  price: number;
}

interface KdsItem {
  id: string;
  comanda_id: string;
  product_name: string;
  quantity: number;
  notes: string | null;
  addons: KdsAddon[] | null;
  kds_status: KdsStatus;
  kds_started_at: string | null;
  kds_ready_at: string | null;
  created_at: string;
  comandas: {
    id: string;
    identifier: string;
    company_id: string;
    status: string;
  } | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toLocaleString("pt-BR");
}

function elapsedText(fromIso: string, now: number) {
  const diff = Math.max(0, Math.floor((now - new Date(fromIso).getTime()) / 1000));
  if (diff < 60) return `${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h${r}min` : `${h}h`;
}

function urgencyClass(seconds: number) {
  if (seconds >= 15 * 60) return "border-destructive bg-destructive/5";
  if (seconds >= 8 * 60) return "border-warning bg-warning/5";
  return "border-border bg-card";
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function KDS() {
  const { activeCompany } = useCompany();
  const queryClient = useQueryClient();
  const cid = activeCompany?.id;

  // Tick every 5s so timers stay live
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(t);
  }, []);

  const { data: items, isFetching: isLoading, refetch } = useQuery<KdsItem[]>({
    queryKey: ["/kds-items", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comanda_items" as never)
        .select(
          "id, comanda_id, product_name, quantity, notes, addons, kds_status, kds_started_at, kds_ready_at, created_at, comandas!inner(id, identifier, company_id, status), products!inner(is_prepared)"
        )
        .eq("comandas.company_id", cid!)
        .eq("comandas.status", "open")
        .eq("products.is_prepared", true)
        .neq("kds_status", "done")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as KdsItem[];
    },
  });

  // Realtime subscription — refresh on any change in comanda_items for this company
  useEffect(() => {
    if (!cid) return;
    const channel = supabase
      .channel(`kds-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comanda_items" }, () => {
        queryClient.invalidateQueries({ queryKey: ["/kds-items", cid] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comandas" }, () => {
        queryClient.invalidateQueries({ queryKey: ["/kds-items", cid] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [cid, queryClient]);

  const setStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: KdsStatus }) => {
      const patch: Record<string, unknown> = { kds_status: status };
      if (status === "preparing") patch.kds_started_at = new Date().toISOString();
      if (status === "ready") patch.kds_ready_at = new Date().toISOString();
      if (status === "done") patch.kds_done_at = new Date().toISOString();
      if (status === "pending") {
        patch.kds_started_at = null;
        patch.kds_ready_at = null;
      }
      const { error } = await supabase
        .from("comanda_items" as never)
        .update(patch)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/kds-items", cid] });
    },
    onError: (e: any) => toast.error(e.message ?? "Erro ao atualizar item"),
  });

  const grouped = useMemo(() => {
    const all = items ?? [];
    return {
      pending: all.filter((i) => i.kds_status === "pending"),
      preparing: all.filter((i) => i.kds_status === "preparing"),
      ready: all.filter((i) => i.kds_status === "ready"),
    };
  }, [items]);

  // ── Notification sound for new pending items ───────────────────────────────
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownIdsRef = useRef<Set<string> | null>(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(notificationSoundUrl);
      audioRef.current.preload = "auto";
    }
    // Unlock audio playback on the first user interaction (browsers block autoplay)
    const unlock = () => {
      if (!audioRef.current) return;
      const a = audioRef.current;
      const prevVol = a.volume;
      a.volume = 0;
      a.play().then(() => {
        a.pause();
        a.currentTime = 0;
        a.volume = prevVol;
      }).catch(() => {});
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  const playBeep = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  };

  // Pending items the user has already "acknowledged" by acting on the queue
  const [ackedPending, setAckedPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!items) return;
    const currentIds = new Set(items.filter((i) => i.kds_status === "pending").map((i) => i.id));
    // Clean up acknowledged ids that have left the pending queue
    setAckedPending((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
    // First load: just record, don't play
    if (knownIdsRef.current === null) {
      knownIdsRef.current = currentIds;
      return;
    }
    const prev = knownIdsRef.current;
    let hasNew = false;
    for (const id of currentIds) {
      if (!prev.has(id)) { hasNew = true; break; }
    }
    knownIdsRef.current = currentIds;
    if (hasNew) playBeep();
  }, [items]);

  // Repeat the beep every 8s while there are pending items not yet acknowledged
  const unackPendingCount = useMemo(
    () => grouped.pending.filter((i) => !ackedPending.has(i.id)).length,
    [grouped.pending, ackedPending],
  );
  useEffect(() => {
    if (unackPendingCount === 0) return;
    const t = setInterval(() => playBeep(), 8000);
    return () => clearInterval(t);
  }, [unackPendingCount]);

  function changeStatus(id: string, status: KdsStatus) {
    // Any user action on the queue silences the alarm for the items currently pending
    setAckedPending(new Set(grouped.pending.map((p) => p.id)));
    setStatusMutation.mutate({ id, status });
  }

  if (!cid) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Selecione uma empresa para visualizar a cozinha.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Header */}
      <div className="flex flex-col gap-3 border-b border-border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <ChefHat className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold leading-tight">Cozinha — KDS</h1>
            <p className="text-xs text-muted-foreground">
              Pedidos abertos das comandas em tempo real
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" data-testid="kds-count-pending">
            {grouped.pending.length} pendentes
          </Badge>
          <Badge variant="outline" data-testid="kds-count-preparing">
            {grouped.preparing.length} em preparo
          </Badge>
          <Badge variant="outline" data-testid="kds-count-ready">
            {grouped.ready.length} prontos
          </Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="ml-auto sm:ml-0"
            data-testid="button-kds-refresh"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>
      </div>

      {/* Columns */}
      <div className="grid flex-1 grid-cols-1 gap-3 overflow-hidden p-3 sm:gap-4 sm:p-4 lg:grid-cols-3">
        <Column
          title="Pendentes"
          accent="bg-muted"
          icon={<Clock className="h-4 w-4" />}
          isLoading={isLoading}
          items={grouped.pending}
          now={now}
          renderActions={(item) => (
            <Button
              size="sm"
              className="w-full"
              onClick={() => changeStatus(item.id, "preparing")}
              data-testid={`button-start-${item.id}`}
            >
              <Play className="mr-1.5 h-3.5 w-3.5" />
              Iniciar preparo
            </Button>
          )}
        />

        <Column
          title="Em preparo"
          accent="bg-warning/10"
          icon={<Utensils className="h-4 w-4" />}
          isLoading={isLoading}
          items={grouped.preparing}
          now={now}
          renderActions={(item) => (
            <div className="flex w-full gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => changeStatus(item.id, "pending")}
                data-testid={`button-undo-prep-${item.id}`}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => changeStatus(item.id, "ready")}
                data-testid={`button-ready-${item.id}`}
              >
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                Pronto
              </Button>
            </div>
          )}
        />

        <Column
          title="Prontos"
          accent="bg-success/10"
          icon={<CheckCircle2 className="h-4 w-4" />}
          isLoading={isLoading}
          items={grouped.ready}
          now={now}
          renderActions={(item) => (
            <div className="flex w-full gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => changeStatus(item.id, "preparing")}
                data-testid={`button-undo-ready-${item.id}`}
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                className="flex-1"
                onClick={() => changeStatus(item.id, "done")}
                data-testid={`button-done-${item.id}`}
              >
                Entregar
              </Button>
            </div>
          )}
        />
      </div>
    </div>
  );
}

// ── Column ────────────────────────────────────────────────────────────────────

function Column({
  title,
  accent,
  icon,
  isLoading,
  items,
  now,
  renderActions,
}: {
  title: string;
  accent: string;
  icon: React.ReactNode;
  isLoading: boolean;
  items: KdsItem[];
  now: number;
  renderActions: (item: KdsItem) => React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-col rounded-xl border border-border bg-card">
      <div className={`flex items-center justify-between rounded-t-xl px-4 py-2.5 ${accent}`}>
        <div className="flex items-center gap-2 text-sm font-bold">
          {icon}
          {title}
        </div>
        <span className="text-xs font-semibold text-muted-foreground" data-testid={`kds-col-count-${title}`}>
          {items.length}
        </span>
      </div>
      {!isLoading && items.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
            <span className="[&>svg]:h-6 [&>svg]:w-6">{icon}</span>
          </div>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Nenhum item</p>
            <p className="text-xs opacity-70">Os pedidos aparecerão aqui</p>
          </div>
        </div>
      ) : (
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {isLoading ? (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          ) : (
            items.map((item) => {
              const fromIso =
                item.kds_status === "preparing" && item.kds_started_at
                  ? item.kds_started_at
                  : item.kds_status === "ready" && item.kds_ready_at
                  ? item.kds_ready_at
                  : item.created_at;
              const seconds = Math.max(
                0,
                Math.floor((now - new Date(fromIso).getTime()) / 1000)
              );
              return (
                <div
                  key={item.id}
                  className={`rounded-lg border p-3 transition-colors ${urgencyClass(seconds)}`}
                  data-testid={`kds-item-${item.id}`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <Badge variant="secondary" className="font-bold" data-testid={`kds-comanda-${item.id}`}>
                      {item.comandas?.identifier ?? "—"}
                    </Badge>
                    <span className="flex items-center gap-1 text-xs font-mono font-semibold text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {elapsedText(fromIso, now)}
                    </span>
                  </div>
                  <div className="mb-1 flex items-baseline gap-2">
                    <span className="font-mono text-base font-bold text-primary">
                      {fmtQty(Number(item.quantity))}×
                    </span>
                    <span className="flex-1 text-sm font-semibold leading-tight" data-testid={`kds-name-${item.id}`}>
                      {item.product_name}
                    </span>
                  </div>
                  {item.addons && item.addons.length > 0 && (
                    <ul className="mb-2 space-y-0.5 rounded bg-primary/5 px-2 py-1 text-xs">
                      {item.addons.map((a, i) => (
                        <li
                          key={i}
                          className="font-medium text-primary"
                          data-testid={`kds-addon-${item.id}-${i}`}
                        >
                          + {a.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.notes && (
                    <p className="mb-2 rounded bg-amber-500/10 px-2 py-1 text-xs font-semibold text-amber-700 dark:text-amber-400">
                      Obs: {item.notes}
                    </p>
                  )}
                  <div className="mt-2">{renderActions(item)}</div>
                </div>
              );
            })
          )}
        </div>
      </ScrollArea>
      )}
    </div>
  );
}
