import * as React from "react";
import { cn } from "@/lib/utils";

const MAX_HUNDREDTHS = 10000;

function fromHundredths(h: number): string {
  const clamped = Math.max(0, Math.min(MAX_HUNDREDTHS, Math.round(h)));
  const str = String(clamped).padStart(3, "0");
  const intPart = str.slice(0, -2);
  const decPart = str.slice(-2);
  return `${intPart || "0"},${decPart}`;
}

export function parsePercent(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/\./g, "").replace(",", ".");
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

export function formatPercentInput(raw: number | string | null | undefined): string {
  if (raw == null || raw === "") return "0,00";
  const num = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
  if (!Number.isFinite(num)) return "0,00";
  return fromHundredths(Math.round(num * 100));
}

interface PercentInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (v: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const PercentInput = React.forwardRef<HTMLInputElement, PercentInputProps>(
  ({ value, onChange, onConfirm, onCancel, className, ...props }, ref) => {
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const target = e.currentTarget;
      const hasSelection =
        target.selectionStart != null &&
        target.selectionEnd != null &&
        target.selectionStart !== target.selectionEnd;
      if ((e.metaKey || e.ctrlKey) && ["a", "c", "x", "v"].includes(e.key.toLowerCase())) {
        return;
      }
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const baseHundredths = hasSelection
          ? 0
          : parseInt((value || "").replace(/\D/g, "") || "0", 10);
        const next = baseHundredths * 10 + parseInt(e.key, 10);
        if (next > MAX_HUNDREDTHS) {
          onChange(fromHundredths(MAX_HUNDREDTHS));
        } else {
          onChange(fromHundredths(next));
        }
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (hasSelection) {
          onChange("0,00");
        } else {
          const h = parseInt((value || "").replace(/\D/g, "") || "0", 10);
          onChange(fromHundredths(Math.floor(h / 10)));
        }
      } else if (e.key === "Delete") {
        e.preventDefault();
        onChange("0,00");
      } else if (e.key === "Enter") {
        onConfirm?.();
      } else if (e.key === "Escape") {
        onCancel?.();
      }
    };
    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData("text").replace(/\D/g, "");
      if (!pasted) return;
      const h = Math.min(MAX_HUNDREDTHS, parseInt(pasted, 10));
      onChange(fromHundredths(h));
    };
    return (
      <input
        ref={ref}
        {...props}
        value={value || "0,00"}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={() => {}}
        inputMode="numeric"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
      />
    );
  },
);
PercentInput.displayName = "PercentInput";
