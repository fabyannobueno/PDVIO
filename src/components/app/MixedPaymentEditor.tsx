import { useEffect, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type MixedSplit = { method: string; amountStr: string };

const METHOD_OPTIONS = [
  { value: "cash", label: "Dinheiro" },
  { value: "credit_card", label: "Crédito" },
  { value: "debit_card", label: "Débito" },
  { value: "pix", label: "PIX" },
  { value: "ticket", label: "Ticket" },
];

export const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  METHOD_OPTIONS.map((m) => [m.value, m.label]),
);

function fmtBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function maskFromDigits(digits: string): string {
  const cents = parseInt(digits.replace(/\D/g, "") || "0", 10);
  const str = String(Math.abs(cents)).padStart(3, "0");
  const intPart = str.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const dec = str.slice(-2);
  return `${intPart || "0"},${dec}`;
}

export function parseSplitAmount(s: string): number {
  if (!s) return 0;
  const n = parseFloat(s.replace(/\./g, "").replace(",", "."));
  return isNaN(n) ? 0 : n;
}

export function splitsTotal(splits: MixedSplit[]): number {
  return splits.reduce((s, x) => s + parseSplitAmount(x.amountStr), 0);
}

export function describeSplits(splits: MixedSplit[]): string {
  return splits
    .filter((s) => parseSplitAmount(s.amountStr) > 0)
    .map(
      (s) =>
        `${METHOD_LABELS[s.method] ?? s.method} ${fmtBRL(parseSplitAmount(s.amountStr))}`,
    )
    .join(" + ");
}

interface Props {
  splits: MixedSplit[];
  setSplits: (s: MixedSplit[]) => void;
  total: number;
  openSession: boolean;
}

export function MixedPaymentEditor({
  splits,
  setSplits,
  total,
  openSession,
}: Props) {
  const paid = useMemo(() => splitsTotal(splits), [splits]);
  const remaining = Math.max(0, total - paid);
  const exceeds = paid > total + 0.001;

  // If cash isn't allowed (caixa fechado), swap any cash splits to PIX
  useEffect(() => {
    if (!openSession && splits.some((s) => s.method === "cash")) {
      setSplits(
        splits.map((s) => (s.method === "cash" ? { ...s, method: "pix" } : s)),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openSession]);

  function update(idx: number, patch: Partial<MixedSplit>) {
    setSplits(splits.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function remove(idx: number) {
    if (splits.length <= 1) return;
    setSplits(splits.filter((_, i) => i !== idx));
  }

  const hasEmptyPrev = splits.some(
    (s) => parseSplitAmount(s.amountStr) === 0,
  );
  const fullyPaid = remaining <= 0.001;

  function add() {
    if (hasEmptyPrev || fullyPaid) return;
    const used = new Set(splits.map((s) => s.method));
    const next =
      METHOD_OPTIONS.find((m) => !used.has(m.value) && (m.value !== "cash" || openSession))
        ?.value ?? "pix";
    setSplits([...splits, { method: next, amountStr: "" }]);
  }

  function fillRemaining(idx: number) {
    const current = parseSplitAmount(splits[idx].amountStr);
    const totalCents = Math.round((current + remaining) * 100);
    update(idx, { amountStr: maskFromDigits(String(totalCents)) });
  }

  return (
    <div
      className="mt-3 space-y-2 rounded-xl border border-border bg-muted/20 p-3"
      data-testid="mixed-editor"
    >
      <div className="space-y-2">
        {splits.map((s, idx) => {
          const usedByOthers = new Set(
            splits.filter((_, i) => i !== idx).map((x) => x.method),
          );
          return (
          <div key={idx} className="flex items-center gap-2">
            <Select
              value={s.method}
              onValueChange={(v) => update(idx, { method: v })}
            >
              <SelectTrigger
                className="h-9 w-[110px] text-xs"
                data-testid={`mixed-method-${idx}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {METHOD_OPTIONS.filter(
                  (m) =>
                    (m.value !== "cash" || openSession) &&
                    !usedByOthers.has(m.value),
                ).map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="numeric"
              placeholder="R$ 0,00"
              value={s.amountStr ? `R$ ${s.amountStr}` : ""}
              onChange={(e) =>
                update(idx, { amountStr: maskFromDigits(e.target.value) })
              }
              className="h-9 flex-1 text-right font-mono text-sm"
              data-testid={`mixed-amount-${idx}`}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => remove(idx)}
              disabled={splits.length <= 1}
              data-testid={`mixed-remove-${idx}`}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={add}
          disabled={
            hasEmptyPrev ||
            fullyPaid ||
            splits.length >=
              METHOD_OPTIONS.filter((m) => m.value !== "cash" || openSession).length
          }
          title={
            hasEmptyPrev
              ? "Informe o valor do pagamento anterior"
              : fullyPaid
              ? "Total já quitado"
              : undefined
          }
          data-testid="mixed-add"
        >
          <Plus className="mr-1 h-3 w-3" /> Adicionar pagamento
        </Button>
        {remaining > 0 && splits.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            onClick={() => fillRemaining(splits.length - 1)}
            data-testid="mixed-fill"
          >
            Completar último
          </Button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 pt-1 text-xs">
        <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Pago</div>
          <div className="font-mono font-bold" data-testid="mixed-paid">
            {fmtBRL(paid)}
          </div>
        </div>
        <div className="rounded-lg bg-muted/40 px-2 py-1.5 text-center">
          <div className="text-[10px] uppercase text-muted-foreground">Total</div>
          <div className="font-mono font-bold">{fmtBRL(total)}</div>
        </div>
        <div
          className={`rounded-lg px-2 py-1.5 text-center ${
            exceeds
              ? "bg-warning/10 text-warning"
              : remaining > 0
              ? "bg-destructive/10 text-destructive"
              : "bg-success/10 text-success"
          }`}
        >
          <div className="text-[10px] uppercase opacity-80">
            {exceeds ? "Excedente" : remaining > 0 ? "Falta" : "Quitado"}
          </div>
          <div className="font-mono font-bold" data-testid="mixed-remaining">
            {fmtBRL(exceeds ? paid - total : remaining)}
          </div>
        </div>
      </div>
    </div>
  );
}
