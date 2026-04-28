import * as React from "react";
import { cn } from "@/lib/utils";

export function fromCents(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const str = String(abs).padStart(3, "0");
  const intPart = str.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const decPart = str.slice(-2);
  return `${intPart || "0"},${decPart}`;
}

export function parseMoney(str: string): number {
  const cents = parseInt((str || "").replace(/\D/g, "") || "0", 10);
  return cents / 100;
}

export function formatMoneyInput(raw: number | string | null | undefined): string {
  if (raw == null || raw === "") return "0,00";
  const num = typeof raw === "string" ? Number(raw.replace(",", ".")) : raw;
  if (!Number.isFinite(num)) return "0,00";
  return fromCents(Math.round(num * 100));
}

interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  value: string;
  onChange: (v: string) => void;
  onConfirm?: () => void;
  onCancel?: () => void;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
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
        const baseCents = hasSelection ? 0 : parseInt((value || "").replace(/\D/g, "") || "0", 10);
        onChange(fromCents(baseCents * 10 + parseInt(e.key, 10)));
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (hasSelection) {
          onChange("0,00");
        } else {
          const cents = parseInt((value || "").replace(/\D/g, "") || "0", 10);
          onChange(fromCents(Math.floor(cents / 10)));
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
      onChange(fromCents(parseInt(pasted, 10)));
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
MoneyInput.displayName = "MoneyInput";
