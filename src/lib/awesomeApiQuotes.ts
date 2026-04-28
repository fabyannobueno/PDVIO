export interface CurrencyQuote {
  code: string; // USD, EUR
  name: string;
  bid: number;
  pctChange: number;
  updatedAt: string;
}

const STORAGE_KEY = "awesomeapi:quotes:v1";
const TTL = 5 * 60 * 1000; // 5 min

let cache: { ts: number; data: CurrencyQuote[] } | null = (() => {
  try {
    const raw = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return raw ? (JSON.parse(raw) as { ts: number; data: CurrencyQuote[] }) : null;
  } catch { return null; }
})();

export function getCachedQuotes(): CurrencyQuote[] | null {
  return cache?.data ?? null;
}

export async function fetchQuotes(): Promise<CurrencyQuote[]> {
  if (cache && Date.now() - cache.ts < TTL) return cache.data;
  const res = await fetch("https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL");
  if (!res.ok) throw new Error(`Quotes HTTP ${res.status}`);
  const j = (await res.json()) as Record<string, {
    code: string;
    name: string;
    bid: string;
    pctChange: string;
    create_date: string;
  }>;
  const data: CurrencyQuote[] = Object.values(j).map((q) => ({
    code: q.code,
    name: q.name.split("/")[0].trim(),
    bid: parseFloat(q.bid),
    pctChange: parseFloat(q.pctChange),
    updatedAt: q.create_date,
  }));
  cache = { ts: Date.now(), data };
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch { /* ignore quota errors */ }
  return data;
}
