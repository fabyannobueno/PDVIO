export interface BrasilApiNcm {
  codigo: string;
  descricao: string;
  data_inicio?: string;
  data_fim?: string;
  tipo_ato?: string;
  numero_ato?: string;
  ano_ato?: string;
}

const BASE = "https://brasilapi.com.br/api/ncm/v1";

const cache = new Map<string, { ts: number; data: BrasilApiNcm[] }>();
const TTL = 60 * 60 * 1000; // 1h

export async function searchNcm(query: string): Promise<BrasilApiNcm[]> {
  const q = query.trim();
  if (!q) return [];
  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  const res = await fetch(`${BASE}?search=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error(`BrasilAPI NCM HTTP ${res.status}`);
  const data = (await res.json()) as BrasilApiNcm[];
  const list = Array.isArray(data) ? data.slice(0, 50) : [];
  cache.set(key, { ts: Date.now(), data: list });
  return list;
}

export async function getNcm(code: string): Promise<BrasilApiNcm | null> {
  const c = code.replace(/\D/g, "");
  if (!c) return null;
  const res = await fetch(`${BASE}/${c}`);
  if (!res.ok) return null;
  return (await res.json()) as BrasilApiNcm;
}

export function formatNcm(code: string) {
  const d = code.replace(/\D/g, "").slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}.${d.slice(4)}`;
  return `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}`;
}
