import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Star, Trash2, Loader2, MessageSquare,
  TrendingUp, ThumbsUp, ThumbsDown, Filter,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell,
  TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 8;

interface Review {
  id: string;
  order_id: string | null;
  order_numeric_id: number | null;
  customer_name: string | null;
  delivery_type: string | null;
  table_identifier: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
}

function Stars({ value, size = 4 }: { value: number; size?: number }) {
  return (
    <span className="flex gap-0.5 shrink-0">
      {[1,2,3,4,5].map((s) => (
        <Star key={s}
          className={`h-${size} w-${size} shrink-0`}
          fill={s <= value ? "#f59e0b" : "transparent"}
          stroke={s <= value ? "#f59e0b" : "rgba(255,255,255,0.15)"}
        />
      ))}
    </span>
  );
}

function TypeBadge({ type, table }: { type: string | null; table: string | null }) {
  if (type === "dine_in") return <Badge variant="outline" className="text-violet-400 border-violet-400/30 shrink-0">{table || "Mesa"}</Badge>;
  if (type === "pickup")  return <Badge variant="outline" className="text-blue-400 border-blue-400/30 shrink-0">Retirada</Badge>;
  return <Badge variant="outline" className="text-emerald-400 border-emerald-400/30 shrink-0">Delivery</Badge>;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day:"2-digit", month:"2-digit", year:"2-digit", hour:"2-digit", minute:"2-digit",
  });
}

export default function Avaliacoes() {
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;
  const qc  = useQueryClient();
  const topRef = useRef<HTMLDivElement>(null);

  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [page, setPage]   = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const { data: reviews = [], isLoading } = useQuery<Review[]>({
    queryKey: ["/avaliacoes", cid],
    enabled: !!cid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_reviews" as never)
        .select("*")
        .eq("company_id", cid)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("order_reviews" as never).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avaliação removida");
      qc.invalidateQueries({ queryKey: ["/avaliacoes", cid] });
    },
    onError: () => toast.error("Erro ao remover avaliação"),
  });

  const total   = reviews.length;
  const avgRaw  = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const five    = reviews.filter((r) => r.rating === 5).length;
  const oneLow  = reviews.filter((r) => r.rating <= 2).length;
  const pctFive = total ? Math.round((five / total) * 100) : 0;
  const pctLow  = total ? Math.round((oneLow / total) * 100) : 0;

  const filtered = filterRating ? reviews.filter((r) => r.rating === filterRating) : reviews;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function goTo(p: number) {
    setPage(p);
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function changeFilter(r: number | null) {
    setFilterRating(r);
    setPage(1);
  }

  return (
    <div ref={topRef} className="flex flex-col gap-6 p-4 sm:p-6">

      {/* Header */}
      <div className="flex items-center gap-3">
        <MessageSquare className="h-6 w-6 text-violet-400 shrink-0" />
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-white">Avaliações</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Feedback dos clientes do cardápio digital</p>
        </div>
      </div>

      {/* Stats */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {[...Array(4)].map((_,i) => <Skeleton key={i} className="h-20 sm:h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          <StatCard label="Total" value={String(total)} sub="avaliações" valueClass="text-white" />
          <StatCard
            label="Média"
            value={total ? avgRaw.toFixed(1) : "—"}
            sub={<Stars value={Math.round(avgRaw)} size={3} />}
            valueClass="text-amber-400"
            icon={total > 0 ? <Star className="h-4 w-4 fill-amber-400 stroke-amber-400" /> : undefined}
          />
          <StatCard
            label={<span className="flex items-center gap-1"><ThumbsUp className="h-3 w-3"/>5 estrelas</span>}
            value={`${pctFive}%`} sub={`${five} aval.`} valueClass="text-emerald-400"
          />
          <StatCard
            label={<span className="flex items-center gap-1"><ThumbsDown className="h-3 w-3"/>Ruins 1–2</span>}
            value={`${pctLow}%`} sub={`${oneLow} aval.`} valueClass="text-red-400"
          />
        </div>
      )}

      {/* Filter */}
      {!isLoading && total > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground shrink-0" />
          <Button size="sm" variant={filterRating === null ? "default" : "outline"}
            onClick={() => changeFilter(null)} className="h-7 px-3 text-xs">
            Todas
          </Button>
          {[5,4,3,2,1].map((n) => {
            const count = reviews.filter((r) => r.rating === n).length;
            if (!count) return null;
            return (
              <Button key={n} size="sm"
                variant={filterRating === n ? "default" : "outline"}
                onClick={() => changeFilter(filterRating === n ? null : n)}
                className="h-7 px-3 text-xs gap-1">
                <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                {n} <span className="text-muted-foreground">({count})</span>
              </Button>
            );
          })}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_,i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm max-w-xs">
            {total === 0
              ? "Nenhuma avaliação ainda. Aparecerão aqui quando clientes avaliarem pelo cardápio."
              : "Nenhuma avaliação com esse filtro."}
          </p>
        </div>
      ) : (<>
        {/* Mobile cards */}
        <div className="flex flex-col gap-3 sm:hidden">
          {pageItems.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-medium text-sm truncate">
                      {r.customer_name || "—"}
                    </span>
                    {r.order_numeric_id && (
                      <span className="text-muted-foreground text-xs">#{r.order_numeric_id}</span>
                    )}
                    <TypeBadge type={r.delivery_type} table={r.table_identifier} />
                  </div>
                  <span className="text-muted-foreground text-xs">{fmt(r.created_at)}</span>
                </div>
                <Button size="icon" variant="ghost"
                  className="h-7 w-7 shrink-0 text-muted-foreground hover:text-red-400"
                  onClick={() => setDeleteId(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <Stars value={r.rating} size={5} />
              {r.comment && (
                <p className="text-white/60 text-sm leading-relaxed">{r.comment}</p>
              )}
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block rounded-xl border border-white/8 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-white/8 hover:bg-transparent">
                <TableHead className="text-muted-foreground">Data</TableHead>
                <TableHead className="text-muted-foreground">Cliente</TableHead>
                <TableHead className="text-muted-foreground">Tipo</TableHead>
                <TableHead className="text-muted-foreground">Nota</TableHead>
                <TableHead className="text-muted-foreground">Comentário</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageItems.map((r) => (
                <TableRow key={r.id} className="border-white/8 hover:bg-white/3">
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">{fmt(r.created_at)}</TableCell>
                  <TableCell className="text-white font-medium text-sm">
                    {r.customer_name || "—"}
                    {r.order_numeric_id && (
                      <span className="text-muted-foreground font-normal ml-1 text-xs">#{r.order_numeric_id}</span>
                    )}
                  </TableCell>
                  <TableCell><TypeBadge type={r.delivery_type} table={r.table_identifier} /></TableCell>
                  <TableCell><Stars value={r.rating} size={4} /></TableCell>
                  <TableCell className="text-white/70 text-sm max-w-xs">
                    {r.comment
                      ? <span className="line-clamp-2">{r.comment}</span>
                      : <span className="text-muted-foreground/40 text-xs italic">sem comentário</span>}
                  </TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={() => setDeleteId(r.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-xs text-muted-foreground">
              {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)} de {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8"
                disabled={safePage <= 1} onClick={() => goTo(safePage - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | "…")[]>((acc, p, idx, arr) => {
                  if (idx > 0 && typeof arr[idx-1] === "number" && (p as number) - (arr[idx-1] as number) > 1) acc.push("…");
                  acc.push(p); return acc;
                }, [])
                .map((p, i) =>
                  p === "…" ? (
                    <span key={`e${i}`} className="text-muted-foreground text-xs px-1">…</span>
                  ) : (
                    <Button key={p} size="icon" variant={p === safePage ? "default" : "outline"}
                      className="h-8 w-8 text-xs" onClick={() => goTo(p as number)}>
                      {p}
                    </Button>
                  )
                )}
              <Button size="icon" variant="outline" className="h-8 w-8"
                disabled={safePage >= totalPages} onClick={() => goTo(safePage + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </>)}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover avaliação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deleteId) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}>
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Stat card ────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, valueClass, icon,
}: {
  label: React.ReactNode; value: string; sub: React.ReactNode;
  valueClass?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/3 p-3 sm:p-4 flex flex-col gap-1">
      <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
      <div className="flex items-end gap-1.5">
        <p className={`text-2xl sm:text-3xl font-bold ${valueClass}`}>{value}</p>
        {icon}
      </div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
