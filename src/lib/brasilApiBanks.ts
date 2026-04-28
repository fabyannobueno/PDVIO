export interface BrasilApiBank {
  ispb: string;
  name: string;
  code: number | null;
  fullName: string;
}

let cache: BrasilApiBank[] | null = null;
let inflight: Promise<BrasilApiBank[]> | null = null;

export async function fetchBanks(): Promise<BrasilApiBank[]> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await fetch("https://brasilapi.com.br/api/banks/v1");
      if (!res.ok) throw new Error("Falha ao consultar bancos");
      const data = (await res.json()) as BrasilApiBank[];
      const sorted = data
        .filter((b) => b.code != null)
        .sort((a, b) => (a.code ?? 0) - (b.code ?? 0));
      cache = sorted;
      return sorted;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
