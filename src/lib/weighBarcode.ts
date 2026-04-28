// ─────────────────────────────────────────────────────────────────────────────
// EAN-13 com preço embutido (padrão brasileiro de balança).
//
// Formato:   2 PPPPPP VVVVV C
//            │ │      │     └── dígito verificador (módulo 10 GTIN)
//            │ │      └──────── 5 dígitos = preço total em centavos (R$ 0,01 a 999,99)
//            │ └─────────────── 6 dígitos = código interno do produto
//            └───────────────── prefixo fixo "2" (uso interno em loja)
//
// Esse é o formato emitido por Toledo Prix, Filizola Smart, Urano POP e demais
// balanças computadoras do mercado brasileiro. Quando o leitor do PDV escaneia
// uma etiqueta gerada aqui, decodificamos o produto e o valor total automatica-
// mente — exatamente como em supermercados.
// ─────────────────────────────────────────────────────────────────────────────

/** Calcula o dígito verificador GTIN (módulo 10) para os 12 primeiros dígitos. */
export function gtinCheckDigit(twelveDigits: string): number {
  if (!/^\d{12}$/.test(twelveDigits)) {
    throw new Error("gtinCheckDigit: esperado 12 dígitos numéricos");
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = twelveDigits.charCodeAt(i) - 48;
    // Posições ímpares (1,3,5...) peso 1; pares (2,4,6...) peso 3.
    sum += i % 2 === 0 ? d : d * 3;
  }
  return (10 - (sum % 10)) % 10;
}

/** Verdadeiro se for um EAN-13 válido (13 dígitos + check digit correto). */
export function isValidEan13(barcode: string): boolean {
  if (!/^\d{13}$/.test(barcode)) return false;
  return gtinCheckDigit(barcode.slice(0, 12)) === Number(barcode[12]);
}

/**
 * Deriva o "código de balança" de 6 dígitos a partir do `numeric_id` do produto.
 * Para empresas com até 1 milhão de produtos cadastrados, o módulo é único na
 * prática. O valor 0 nunca é usado (reservado para "não cadastrado").
 */
export function productScaleCode(numericId: number | string | null | undefined): string {
  if (numericId == null || numericId === "") return "000001";
  const n = typeof numericId === "number" ? numericId : Number(numericId);
  if (!Number.isFinite(n) || n <= 0) return "000001";
  const mod = Math.trunc(n) % 1_000_000;
  const safe = mod === 0 ? 1_000_000 - 1 : mod;
  return String(safe).padStart(6, "0");
}

/**
 * Monta o código de barras EAN-13 com preço embutido para uma etiqueta de
 * pesagem. Lança se o preço ultrapassar R$ 999,99 (limite do formato).
 */
export function buildPriceLabelBarcode(productCode: string, priceInReais: number): string {
  const code = String(productCode).replace(/\D/g, "").padStart(6, "0").slice(-6);
  // Trunca (não arredonda) para centavos: o formato EAN-13 com preço só
  // suporta 2 casas decimais. Usar Math.floor garante que nunca cobramos
  // a mais quando o cálculo dá 9,998 — o barcode codifica R$ 9,99.
  const priceCents = Math.floor(Math.round(priceInReais * 100000) / 1000);
  if (priceCents < 0 || priceCents > 99999) {
    throw new Error("Preço fora do limite do formato (máx. R$ 999,99 por etiqueta)");
  }
  const cents = String(priceCents).padStart(5, "0");
  const twelve = `2${code}${cents}`;
  const check = gtinCheckDigit(twelve);
  return `${twelve}${check}`;
}

export interface WeighBarcodeData {
  productCode: string;   // 6 dígitos
  priceInReais: number;  // valor total da etiqueta (R$)
}

/**
 * Decodifica um EAN-13 que comece com "2" como etiqueta de pesagem (preço
 * embutido). Retorna `null` se não estiver no formato.
 */
export function decodePriceLabelBarcode(barcode: string): WeighBarcodeData | null {
  const clean = String(barcode).replace(/\D/g, "");
  if (!isValidEan13(clean)) return null;
  if (clean[0] !== "2") return null;
  const productCode = clean.slice(1, 7);
  const priceCents = Number(clean.slice(7, 12));
  if (!Number.isFinite(priceCents)) return null;
  return { productCode, priceInReais: priceCents / 100 };
}
