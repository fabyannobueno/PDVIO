/**
 * Página pública de avaliação de pedido — mobile-first.
 * Rota: /avaliacao/:companyId/:orderId
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Star, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  return `${parseInt(h.slice(0,2),16)}, ${parseInt(h.slice(2,4),16)}, ${parseInt(h.slice(4,6),16)}`;
}
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0,2),16), g = parseInt(h.slice(2,4),16), b = parseInt(h.slice(4,6),16);
  return (r*299 + g*587 + b*114) / 1000 > 128;
}

type Step = "loading" | "form" | "already_reviewed" | "success" | "not_found";

interface Company {
  id: string; name: string;
  logo_url: string | null; delivery_logo_url: string | null;
  delivery_primary_color: string | null;
}
interface Order {
  id: string; numeric_id: number; customer_name: string;
  delivery_type: string; table_identifier: string | null;
  items: { name: string; quantity: number }[];
}

const LABELS = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente"];

export default function AvaliacaoPedido() {
  const { companyId, orderId } = useParams<{ companyId: string; orderId: string }>();
  const [step, setStep]       = useState<Step>("loading");
  const [company, setCompany] = useState<Company | null>(null);
  const [order, setOrder]     = useState<Order | null>(null);
  const [rating, setRating]   = useState(0);
  const [hovered, setHovered] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy]       = useState(false);
  const [err, setErr]         = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !orderId) { setStep("not_found"); return; }
    Promise.all([
      supabase.from("companies")
        .select("id,name,logo_url,delivery_logo_url,delivery_primary_color")
        .eq("id", companyId).maybeSingle(),
      supabase.from("delivery_orders")
        .select("id,numeric_id,customer_name,delivery_type,table_identifier,items")
        .eq("id", orderId).eq("company_id", companyId).maybeSingle(),
      supabase.from("order_reviews" as never)
        .select("id").eq("order_id", orderId).maybeSingle(),
    ]).then(([{ data: co }, { data: ord }, { data: ex }]) => {
      if (!co || !ord) { setStep("not_found"); return; }
      setCompany(co as Company);
      setOrder(ord as Order);
      setStep(ex ? "already_reviewed" : "form");
    });
  }, [companyId, orderId]);

  async function submit() {
    if (!rating || !order || !company) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.from("order_reviews" as never).insert({
      company_id: company.id, order_id: order.id,
      order_numeric_id: order.numeric_id, customer_name: order.customer_name,
      delivery_type: order.delivery_type, table_identifier: order.table_identifier,
      rating, comment: comment.trim() || null,
    } as never);
    setBusy(false);
    if (error) { setErr("Não foi possível enviar. Tente novamente."); return; }
    setStep("success");
  }

  const brand   = company?.delivery_primary_color || "#6d28d9";
  const logo    = company?.delivery_logo_url || company?.logo_url || null;
  const onBrand = isLight(brand) ? "#1a1a1a" : "#ffffff";
  const rgb     = hexToRgb(brand);
  const active  = hovered || rating;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (step === "loading") return (
    <div style={{ minHeight:"100dvh", background:"#0f0f0f" }}
      className="flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin" style={{ color: brand }} />
    </div>
  );

  // ── Not found ──────────────────────────────────────────────────────────────
  if (step === "not_found") return (
    <div style={{ minHeight:"100dvh", background:"#0f0f0f" }}
      className="flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="h-16 w-16 rounded-full bg-red-500/10 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-red-400" />
      </div>
      <p className="text-white font-semibold text-lg">Pedido não encontrado</p>
      <p className="text-white/40 text-sm max-w-xs">O link de avaliação é inválido ou expirou.</p>
    </div>
  );

  return (
    <div
      style={{ minHeight:"100dvh", background:"#0f0f0f", fontFamily:"system-ui,sans-serif" }}
      className="flex flex-col"
    >
      {/* ── Brand header ──────────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center gap-3 px-6 pt-12 pb-8 shrink-0"
        style={{ background:`rgba(${rgb},0.10)`, borderBottom:`1px solid rgba(${rgb},0.20)` }}
      >
        {logo && (
          <div className="h-16 w-16 rounded-2xl bg-white overflow-hidden flex items-center justify-center shadow-lg">
            <img src={logo} alt={company?.name} className="h-14 w-14 object-contain" />
          </div>
        )}
        {!logo && (
          <div
            className="h-16 w-16 rounded-2xl flex items-center justify-center text-2xl font-bold"
            style={{ background:`rgba(${rgb},0.25)`, color: brand }}
          >
            {company?.name?.[0]?.toUpperCase()}
          </div>
        )}
        <p className="text-white/70 text-sm font-medium">{company?.name}</p>
      </div>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center px-5 pt-8 pb-36">
        <div className="w-full max-w-sm flex flex-col gap-8">

          {/* Already reviewed */}
          {step === "already_reviewed" && (
            <div className="flex flex-col items-center gap-5 text-center pt-4">
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center"
                style={{ background:`rgba(${rgb},0.15)` }}
              >
                <CheckCircle2 className="h-10 w-10" style={{ color: brand }} />
              </div>
              <div>
                <p className="text-white text-xl font-semibold">Avaliação já enviada</p>
                <p className="text-white/40 text-sm mt-2">Você já avaliou este pedido. Obrigado!</p>
              </div>
            </div>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="flex flex-col items-center gap-6 text-center pt-4">
              <div
                className="h-24 w-24 rounded-full flex items-center justify-center"
                style={{ background:`rgba(${rgb},0.15)` }}
              >
                <CheckCircle2 className="h-12 w-12" style={{ color: brand }} />
              </div>
              <div>
                <p className="text-white text-xl font-bold">Obrigado pelo feedback!</p>
                <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto">
                  Sua avaliação ajuda a melhorar nosso atendimento.
                </p>
              </div>
              <div className="flex gap-2">
                {[1,2,3,4,5].map((s) => (
                  <Star key={s} className="h-8 w-8"
                    fill={s<=rating ? brand : "transparent"}
                    stroke={s<=rating ? brand : "rgba(255,255,255,0.15)"}
                  />
                ))}
              </div>
              {comment && (
                <p className="text-white/50 text-sm italic max-w-xs">"{comment}"</p>
              )}
            </div>
          )}

          {/* Form */}
          {step === "form" && order && (<>
            {/* Title */}
            <div className="text-center">
              <p className="text-white text-xl font-bold">Como foi seu pedido?</p>
              <p className="text-white/40 text-sm mt-1.5">
                Pedido #{order.numeric_id}
                {order.table_identifier && ` · ${order.table_identifier}`}
                {order.customer_name && ` · ${order.customer_name}`}
              </p>
            </div>

            {/* Stars */}
            <div className="flex flex-col items-center gap-3">
              <div
                className="flex gap-3"
                onMouseLeave={() => setHovered(0)}
                onTouchEnd={() => setHovered(0)}
              >
                {[1,2,3,4,5].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setRating(s)}
                    onMouseEnter={() => setHovered(s)}
                    className="focus:outline-none select-none"
                    style={{ WebkitTapHighlightColor:"transparent", touchAction:"manipulation" }}
                  >
                    <Star
                      className={cn(
                        "transition-all duration-100 active:scale-110",
                        "h-12 w-12 sm:h-11 sm:w-11"
                      )}
                      fill={s<=active ? brand : "transparent"}
                      stroke={s<=active ? brand : "rgba(255,255,255,0.20)"}
                    />
                  </button>
                ))}
              </div>
              <p
                className="text-sm font-semibold h-5 transition-opacity duration-150"
                style={{ color: active ? brand : "transparent" }}
              >
                {LABELS[active]}
              </p>
            </div>

            {/* Comment */}
            <div className="flex flex-col gap-2.5">
              <label className="text-white/50 text-xs font-medium uppercase tracking-wider">
                Comentário <span className="normal-case font-normal">(opcional)</span>
              </label>
              <Textarea
                placeholder="Conte mais sobre a sua experiência..."
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={4}
                className="bg-white/5 border-white/10 text-white placeholder:text-white/20 resize-none text-base"
                style={{ fontSize:"16px" /* prevents iOS zoom */ }}
              />
            </div>

            {err && (
              <p className="text-red-400 text-sm text-center -mt-2">{err}</p>
            )}
          </>)}
        </div>
      </div>

      {/* ── Sticky bottom button (only on form) ───────────────────────────── */}
      {step === "form" && (
        <div
          className="fixed bottom-0 left-0 right-0 px-5 pb-[env(safe-area-inset-bottom)] pt-4"
          style={{ background:`linear-gradient(to top, #0f0f0f 70%, transparent)` }}
        >
          <button
            disabled={!rating || busy}
            onClick={submit}
            className={cn(
              "w-full h-14 rounded-2xl text-base font-bold transition-all duration-200",
              "flex items-center justify-center gap-2",
              !rating ? "opacity-30 cursor-not-allowed" : "active:scale-[0.98]"
            )}
            style={{
              background: rating ? brand : "#333",
              color: rating ? onBrand : "#888",
            }}
          >
            {busy
              ? <Loader2 className="h-5 w-5 animate-spin" />
              : "Enviar avaliação"
            }
          </button>
          <div className="h-safe pb-2" />
        </div>
      )}
    </div>
  );
}
