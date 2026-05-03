/**
 * Página pública de avaliação de pedido.
 * Acessada pelo cliente via link enviado pelo cardápio digital após o pedido.
 * Rota: /avaliacao/:companyId/:orderId
 */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Star, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

// ── Color utilities (same pattern as MesaCliente) ────────────────────────────
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
function isLight(hex: string): boolean {
  const h = hex.replace("#", "");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 128;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type Step = "loading" | "form" | "already_reviewed" | "success" | "not_found";

interface Company {
  id: string;
  name: string;
  logo_url: string | null;
  delivery_logo_url: string | null;
  delivery_primary_color: string | null;
}

interface Order {
  id: string;
  numeric_id: number;
  customer_name: string;
  delivery_type: string;
  table_identifier: string | null;
  items: { name: string; quantity: number }[];
}

const STAR_LABELS = ["", "Muito ruim", "Ruim", "Regular", "Bom", "Excelente"];

// ── Component ─────────────────────────────────────────────────────────────────
export default function AvaliacaoPedido() {
  const { companyId, orderId } = useParams<{ companyId: string; orderId: string }>();
  const [step, setStep]         = useState<Step>("loading");
  const [company, setCompany]   = useState<Company | null>(null);
  const [order, setOrder]       = useState<Order | null>(null);
  const [rating, setRating]     = useState(0);
  const [hovered, setHovered]   = useState(0);
  const [comment, setComment]   = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId || !orderId) { setStep("not_found"); return; }
    Promise.all([
      supabase
        .from("companies")
        .select("id, name, logo_url, delivery_logo_url, delivery_primary_color")
        .eq("id", companyId)
        .maybeSingle(),
      supabase
        .from("delivery_orders")
        .select("id, numeric_id, customer_name, delivery_type, table_identifier, items")
        .eq("id", orderId)
        .eq("company_id", companyId)
        .maybeSingle(),
      supabase
        .from("order_reviews" as never)
        .select("id")
        .eq("order_id", orderId)
        .maybeSingle(),
    ]).then(([{ data: co }, { data: ord }, { data: existing }]) => {
      if (!co || !ord) { setStep("not_found"); return; }
      setCompany(co as Company);
      setOrder(ord as Order);
      if (existing) { setStep("already_reviewed"); return; }
      setStep("form");
    });
  }, [companyId, orderId]);

  async function handleSubmit() {
    if (!rating || !order || !company) return;
    setSubmitting(true);
    setSubmitError(null);
    const { error } = await supabase
      .from("order_reviews" as never)
      .insert({
        company_id:       company.id,
        order_id:         order.id,
        order_numeric_id: order.numeric_id,
        customer_name:    order.customer_name,
        delivery_type:    order.delivery_type,
        table_identifier: order.table_identifier,
        rating,
        comment:          comment.trim() || null,
      } as never);
    setSubmitting(false);
    if (error) {
      setSubmitError("Não foi possível enviar a avaliação. Tente novamente.");
      return;
    }
    setStep("success");
  }

  // ── Derived branding ─────────────────────────────────────────────────────
  const brandColor = company?.delivery_primary_color || "#6d28d9";
  const logoUrl    = company?.delivery_logo_url || company?.logo_url || null;
  const onBrand    = isLight(brandColor) ? "#1a1a1a" : "#ffffff";
  const brandRgb   = hexToRgb(brandColor);

  const activeStars = hovered || rating;

  // ── Loading ───────────────────────────────────────────────────────────────
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-[#111] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-violet-400" />
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (step === "not_found") {
    return (
      <div className="min-h-screen bg-[#111] flex flex-col items-center justify-center gap-4 text-white p-6">
        <AlertCircle className="h-12 w-12 text-red-400" />
        <p className="text-lg font-medium">Pedido não encontrado</p>
        <p className="text-sm text-white/50 text-center">O link de avaliação é inválido ou expirou.</p>
      </div>
    );
  }

  // ── Wrapper layout ────────────────────────────────────────────────────────
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "#111", fontFamily: "system-ui, sans-serif" }}
    >
      {/* Header */}
      <header
        className="flex flex-col items-center gap-3 px-6 pt-10 pb-8"
        style={{ background: `rgba(${brandRgb}, 0.12)`, borderBottom: `1px solid rgba(${brandRgb}, 0.25)` }}
      >
        {logoUrl && (
          <div
            className="h-16 w-16 rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ background: "#fff" }}
          >
            <img src={logoUrl} alt={company?.name} className="h-14 w-14 object-contain" />
          </div>
        )}
        <p className="text-white/80 text-sm font-medium tracking-wide">{company?.name}</p>
      </header>

      <main className="flex-1 flex flex-col items-center px-4 py-10">
        <div className="w-full max-w-sm">

          {/* ── Already reviewed ── */}
          {step === "already_reviewed" && (
            <div className="flex flex-col items-center gap-4 text-center">
              <CheckCircle2 className="h-14 w-14" style={{ color: brandColor }} />
              <h1 className="text-white text-xl font-semibold">Avaliação já enviada</h1>
              <p className="text-white/50 text-sm">
                Você já avaliou este pedido. Obrigado pelo feedback!
              </p>
            </div>
          )}

          {/* ── Success ── */}
          {step === "success" && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div
                className="h-20 w-20 rounded-full flex items-center justify-center"
                style={{ background: `rgba(${brandRgb}, 0.15)` }}
              >
                <CheckCircle2 className="h-10 w-10" style={{ color: brandColor }} />
              </div>
              <div>
                <h1 className="text-white text-xl font-semibold">Obrigado pela avaliação!</h1>
                <p className="text-white/50 text-sm mt-2">
                  Seu feedback ajuda a melhorar o nosso atendimento.
                </p>
              </div>
              {rating > 0 && (
                <div className="flex gap-1">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      className="h-7 w-7"
                      fill={s <= rating ? brandColor : "transparent"}
                      stroke={s <= rating ? brandColor : "rgba(255,255,255,0.2)"}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Form ── */}
          {step === "form" && order && (
            <div className="flex flex-col gap-7">
              <div className="text-center">
                <h1 className="text-white text-xl font-semibold">Como foi seu pedido?</h1>
                <p className="text-white/50 text-sm mt-1">
                  Pedido #{order.numeric_id}
                  {order.table_identifier && ` · ${order.table_identifier}`}
                  {order.customer_name && ` · ${order.customer_name}`}
                </p>
              </div>

              {/* Stars */}
              <div className="flex flex-col items-center gap-3">
                <div
                  className="flex gap-2"
                  onMouseLeave={() => setHovered(0)}
                >
                  {[1, 2, 3, 4, 5].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setRating(s)}
                      onMouseEnter={() => setHovered(s)}
                      className="focus:outline-none transition-transform active:scale-90"
                      style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                      <Star
                        className="h-10 w-10 transition-all duration-100"
                        fill={s <= activeStars ? brandColor : "transparent"}
                        stroke={s <= activeStars ? brandColor : "rgba(255,255,255,0.25)"}
                      />
                    </button>
                  ))}
                </div>
                <p
                  className="text-sm font-medium h-5 transition-all"
                  style={{ color: activeStars ? brandColor : "transparent" }}
                >
                  {STAR_LABELS[activeStars]}
                </p>
              </div>

              {/* Comment */}
              <div className="flex flex-col gap-2">
                <label className="text-white/60 text-xs uppercase tracking-wider">
                  Comentário <span className="normal-case">(opcional)</span>
                </label>
                <Textarea
                  placeholder="Conte mais sobre a sua experiência..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/25 resize-none focus-visible:ring-1"
                  style={{ "--tw-ring-color": brandColor } as React.CSSProperties}
                />
              </div>

              {submitError && (
                <p className="text-sm text-red-400 text-center">{submitError}</p>
              )}

              <Button
                disabled={!rating || submitting}
                onClick={handleSubmit}
                className={cn("w-full h-12 text-base font-semibold rounded-xl", !rating && "opacity-40")}
                style={{
                  background: rating ? brandColor : undefined,
                  color: rating ? onBrand : undefined,
                  border: "none",
                }}
              >
                {submitting
                  ? <Loader2 className="h-5 w-5 animate-spin" />
                  : "Enviar avaliação"
                }
              </Button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
