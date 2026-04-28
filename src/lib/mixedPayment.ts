export type MixedSplitParsed = { method: string; amount: number };

const LABEL_TO_METHOD: Record<string, string> = {
  Dinheiro: "cash",
  "Crédito": "credit_card",
  "Credito": "credit_card",
  "Débito": "debit_card",
  "Debito": "debit_card",
  PIX: "pix",
  Ticket: "ticket",
};

export function parseMixedNote(notes: string | null | undefined): MixedSplitParsed[] {
  if (!notes) return [];
  const idx = notes.indexOf("[Misto]");
  if (idx < 0) return [];
  const body = notes.slice(idx + "[Misto]".length).trim();
  const parts = body.split("+").map((s) => s.trim()).filter(Boolean);
  const out: MixedSplitParsed[] = [];
  for (const p of parts) {
    const m = p.match(/^(.+?)\s+R\$\s*([\d.,]+)$/);
    if (!m) continue;
    const label = m[1].trim();
    const amount = parseFloat(m[2].replace(/\./g, "").replace(",", "."));
    if (isNaN(amount)) continue;
    out.push({ method: LABEL_TO_METHOD[label] ?? label.toLowerCase(), amount });
  }
  return out;
}
