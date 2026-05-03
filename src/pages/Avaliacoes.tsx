import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompany } from "@/contexts/CompanyContext";
import { toast } from "sonner";
import {
  Star,
  Trash2,
  Loader2,
  MessageSquare,
  TrendingUp,
  ThumbsUp,
  ThumbsDown,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
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

// ── Helpers ───────────────────────────────────────────────────────────────────
function Stars({ value, size = 4 }: { value: number; size?: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((s) => (
        <Star
          key={s}
          className={`h-${size} w-${size}`}
          fill={s <= value ? "#f59e0b" : "transparent"}
          stroke={s <= value ? "#f59e0b" : "rgba(255,255,255,0.15)"}
        />
      ))}
    </span>
  );
}

function DeliveryTypeBadge({ type, table }: { type: string | null; table: string | null }) {
  if (type === "dine_in") return <Badge variant="outline" className="text-violet-400 border-violet-400/30">{table || "Mesa"}</Badge>;
  if (type === "pickup")  return <Badge variant="outline" className="text-blue-400 border-blue-400/30">Retirada</Badge>;
  return <Badge variant="outline" className="text-emerald-400 border-emerald-400/30">Delivery</Badge>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Avaliacoes() {
  const { activeCompany } = useCompany();
  const cid = activeCompany?.id;
  const qc  = useQueryClient();

  const [filterRating, setFilterRating] = useState<number | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);

  // ── Query ──────────────────────────────────────────────────────────────────
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

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("order_reviews" as never)
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Avaliação removida");
      qc.invalidateQueries({ queryKey: ["/avaliacoes", cid] });
    },
    onError: () => toast.error("Erro ao remover avaliação"),
  });

  // ── Stats ──────────────────────────────────────────────────────────────────
  const total    = reviews.length;
  const avgRaw   = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
  const avg      = avgRaw.toFixed(1);
  const five     = reviews.filter((r) => r.rating === 5).length;
  const oneLow   = reviews.filter((r) => r.rating <= 2).length;
  const pctFive  = total ? Math.round((five / total) * 100) : 0;
  const pctLow   = total ? Math.round((oneLow / total) * 100) : 0;

  // ── Filtered list ──────────────────────────────────────────────────────────
  const visible = filterRating
    ? reviews.filter((r) => r.rating === filterRating)
    : reviews;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <MessageSquare className="h-6 w-6 text-violet-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Avaliações</h1>
            <p className="text-sm text-muted-foreground">Feedback dos clientes do cardápio digital</p>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Total</p>
            <p className="text-3xl font-bold text-white">{total}</p>
            <p className="text-xs text-muted-foreground">avaliações</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Média</p>
            <div className="flex items-end gap-2">
              <p className="text-3xl font-bold text-amber-400">{total ? avg : "—"}</p>
              {total > 0 && <Star className="h-5 w-5 mb-1 fill-amber-400 stroke-amber-400" />}
            </div>
            <Stars value={Math.round(avgRaw)} size={3} />
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" /> 5 estrelas
            </p>
            <p className="text-3xl font-bold text-emerald-400">{pctFive}%</p>
            <p className="text-xs text-muted-foreground">{five} avaliações</p>
          </div>
          <div className="rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col gap-1">
            <p className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <ThumbsDown className="h-3 w-3" /> Ruins (1–2)
            </p>
            <p className="text-3xl font-bold text-red-400">{pctLow}%</p>
            <p className="text-xs text-muted-foreground">{oneLow} avaliações</p>
          </div>
        </div>
      )}

      {/* Filter by rating */}
      {!isLoading && total > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Button
            size="sm" variant={filterRating === null ? "default" : "outline"}
            onClick={() => setFilterRating(null)}
            className="h-7 px-3 text-xs"
          >
            Todas
          </Button>
          {[5, 4, 3, 2, 1].map((n) => {
            const count = reviews.filter((r) => r.rating === n).length;
            if (!count) return null;
            return (
              <Button
                key={n}
                size="sm"
                variant={filterRating === n ? "default" : "outline"}
                onClick={() => setFilterRating(filterRating === n ? null : n)}
                className="h-7 px-3 text-xs gap-1"
              >
                <Star className="h-3 w-3 fill-amber-400 stroke-amber-400" />
                {n} <span className="text-muted-foreground">({count})</span>
              </Button>
            );
          })}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <TrendingUp className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            {total === 0
              ? "Nenhuma avaliação recebida ainda. Elas aparecerão aqui quando clientes avaliarem pelo cardápio digital."
              : "Nenhuma avaliação com esse filtro."}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-white/8 overflow-hidden">
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
              {visible.map((r) => (
                <TableRow key={r.id} className="border-white/8 hover:bg-white/3">
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {fmtDate(r.created_at)}
                  </TableCell>
                  <TableCell className="text-white font-medium text-sm">
                    {r.customer_name || "—"}
                    {r.order_numeric_id && (
                      <span className="text-muted-foreground font-normal ml-1 text-xs">#{r.order_numeric_id}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <DeliveryTypeBadge type={r.delivery_type} table={r.table_identifier} />
                  </TableCell>
                  <TableCell>
                    <Stars value={r.rating} size={4} />
                  </TableCell>
                  <TableCell className="text-white/70 text-sm max-w-xs">
                    {r.comment
                      ? <span className="line-clamp-2">{r.comment}</span>
                      : <span className="text-muted-foreground/40 text-xs italic">sem comentário</span>
                    }
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon" variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      onClick={() => setDeleteId(r.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover avaliação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { if (deleteId) { deleteMutation.mutate(deleteId); setDeleteId(null); } }}
            >
              {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
