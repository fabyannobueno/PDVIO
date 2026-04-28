import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a number as a Brazilian percentage (with comma decimal).
 * Pass an already-percentage value (e.g. 12.5 -> "12,5%").
 */
export function fmtPct(value: number | null | undefined, digits = 1): string {
  if (value == null || !isFinite(Number(value))) return "—";
  return `${Number(value).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}
