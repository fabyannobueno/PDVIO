// ─────────────────────────────────────────────────────────────────────────────
// Impressão de etiquetas de pesagem (popup HTML + window.print()).
//
// Funciona com QUALQUER impressora reconhecida pelo navegador — térmica de
// etiqueta (Argox, Elgin L42, Bematech LB-1000, Zebra), térmica de cupom
// (configurada para tamanho 80×40 mm) ou impressora comum em folha A4 com
// adesivos. O usuário escolhe a impressora e o tamanho do papel no diálogo
// padrão de impressão do navegador, exatamente como faz para o cupom.
//
// Tamanhos suportados (compatíveis com balanças térmicas Toledo, Filizola,
// Elgin, Argox e similares):
//   • 40 × 40 mm — etiqueta compacta de pesagem
//   • 60 × 40 mm — padrão de varejo, mais usada
//   • 60 × 80 mm — etiqueta alta, para mais informações
// ─────────────────────────────────────────────────────────────────────────────

import JsBarcode from "jsbarcode";

export type WeighLabelSize = "40x40" | "60x40" | "60x80";

export const WEIGH_LABEL_SIZES: Array<{
  id: WeighLabelSize;
  label: string;
  description: string;
}> = [
  {
    id: "40x40",
    label: "40 × 40 mm (4 × 4 cm)",
    description: "Compacta — Filizola, Toledo, Elgin, Argox",
  },
  {
    id: "60x40",
    label: "60 × 40 mm (6 × 4 cm)",
    description: "Padrão de varejo — mais utilizada",
  },
  {
    id: "60x80",
    label: "60 × 80 mm (6 × 8 cm)",
    description: "Alta — Prix Toledo / Filizola",
  },
];

export const DEFAULT_WEIGH_LABEL_SIZE: WeighLabelSize = "60x40";

interface SizeStyle {
  width: number;          // mm
  height: number;         // mm
  padding: string;
  gap: string;
  companyFs: string;
  nameFs: string;
  codeFs: string;
  lblFs: string;
  valFs: string;
  totalLblFs: string;
  totalValFs: string;
  barcodeHeightMm: number;
  barcodeWidth: number;   // bar thickness in JsBarcode units
  barcodeFontPt: number;
}

const SIZE_STYLES: Record<WeighLabelSize, SizeStyle> = {
  "40x40": {
    width: 40,
    height: 40,
    padding: "1.2mm 1.5mm",
    gap: "0.6mm",
    companyFs: "6.5pt",
    nameFs: "7.5pt",
    codeFs: "5pt",
    lblFs: "4.8pt",
    valFs: "6.8pt",
    totalLblFs: "6.5pt",
    totalValFs: "10pt",
    barcodeHeightMm: 9,
    barcodeWidth: 1.4,
    barcodeFontPt: 7,
  },
  "60x40": {
    width: 60,
    height: 40,
    padding: "1.6mm 2.2mm",
    gap: "0.8mm",
    companyFs: "8pt",
    nameFs: "10pt",
    codeFs: "6pt",
    lblFs: "5.5pt",
    valFs: "8pt",
    totalLblFs: "8pt",
    totalValFs: "13pt",
    barcodeHeightMm: 11,
    barcodeWidth: 1.7,
    barcodeFontPt: 9,
  },
  "60x80": {
    width: 60,
    height: 80,
    padding: "2.5mm 3mm",
    gap: "1.2mm",
    companyFs: "9pt",
    nameFs: "12pt",
    codeFs: "7pt",
    lblFs: "6.5pt",
    valFs: "10pt",
    totalLblFs: "9pt",
    totalValFs: "16pt",
    barcodeHeightMm: 18,
    barcodeWidth: 2.2,
    barcodeFontPt: 11,
  },
};

export interface WeighLabelData {
  productName: string;
  weightKg: number;
  pricePerKg: number;
  totalPrice: number;
  barcode: string;          // EAN-13 já com check digit
  companyName?: string;
  productCode?: string;     // 6 dígitos exibidos abaixo do nome
  printedAt?: Date;
  /** Validade do produto, se aplicável (DD/MM/YYYY). */
  expiresAt?: string;
  /** Tamanho do papel — afeta CSS @page e fontes. */
  size?: WeighLabelSize;
}

const BRL = (v: number) => {
  // Limpa ruído de ponto flutuante e TRUNCA para 2 casas.
  // Nunca arredonda para cima: 9,998 vira "R$ 9,99" (não "R$ 10,00").
  const cleaned = Math.round(v * 10000) / 10000;
  const truncated = Math.trunc(cleaned * 100) / 100;
  return truncated.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const KG = (v: number) =>
  `${v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} kg`;

function generateBarcodeSvg(value: string, style: SizeStyle): string {
  // Renderiza o código de barras em um SVG offscreen e devolve o markup.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  // JsBarcode usa "height" em pixels; convertemos mm → px (~3.78 px/mm @ 96 dpi).
  const heightPx = Math.round(style.barcodeHeightMm * 3.78);
  try {
    JsBarcode(svg, value, {
      format: "EAN13",
      width: style.barcodeWidth,
      height: heightPx,
      displayValue: true,
      fontSize: Math.round(style.barcodeFontPt * 1.6),
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch {
    // Fallback: tenta CODE128 se o valor não passar na validação EAN.
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        width: style.barcodeWidth,
        height: heightPx,
        displayValue: true,
        fontSize: Math.round(style.barcodeFontPt * 1.6),
        margin: 0,
      });
    } catch {
      // se ainda falhar, devolve um placeholder
      return `<text x="0" y="20">${value}</text>`;
    }
  }
  return new XMLSerializer().serializeToString(svg);
}

/**
 * Abre uma janela popup com a etiqueta renderizada e dispara o diálogo de
 * impressão automaticamente. Se o popup for bloqueado, lança um erro.
 *
 * Suporta uma ou várias etiquetas — quando recebe um array, imprime todas no
 * mesmo trabalho. O tamanho do papel pode ser definido por etiqueta; quando
 * o array tem tamanhos diferentes, vence o tamanho da primeira.
 */
export function printWeighLabel(input: WeighLabelData | WeighLabelData[]): void {
  const list = Array.isArray(input) ? input : [input];
  if (list.length === 0) return;

  const size: WeighLabelSize = list[0].size ?? DEFAULT_WEIGH_LABEL_SIZE;
  const style = SIZE_STYLES[size];

  const cards = list.map((d) => {
    const barcodeSvg = generateBarcodeSvg(d.barcode, style);
    return `
      <article class="label">
        ${d.companyName ? `<header class="company">${escapeHtml(d.companyName)}</header>` : ""}
        <div class="product">
          <div class="name">${escapeHtml(d.productName)}</div>
          ${d.productCode ? `<div class="code">Cód.: ${escapeHtml(d.productCode)}</div>` : ""}
        </div>
        <div class="grid">
          <div class="cell">
            <span class="lbl">PESO LÍQ.</span>
            <span class="val">${KG(d.weightKg)}</span>
          </div>
          <div class="cell right">
            <span class="lbl">PREÇO/KG</span>
            <span class="val">${BRL(d.pricePerKg)}</span>
          </div>
        </div>
        <div class="total">
          <span class="lbl">TOTAL</span>
          <span class="val">${BRL(d.totalPrice)}</span>
        </div>
        <div class="barcode">${barcodeSvg}</div>
        ${d.expiresAt ? `<footer class="meta"><span>Validade: ${escapeHtml(d.expiresAt)}</span></footer>` : ""}
      </article>
    `;
  }).join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Etiqueta de pesagem (${size})</title>
<style>
  @page { size: ${style.width}mm ${style.height}mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #000; background: #fff;
    -webkit-font-smoothing: antialiased;
  }
  .label {
    width: ${style.width}mm;
    height: ${style.height}mm;
    padding: ${style.padding};
    page-break-after: always;
    display: flex; flex-direction: column;
    gap: ${style.gap};
    overflow: hidden;
  }
  .label:last-child { page-break-after: auto; }
  .company {
    font-size: ${style.companyFs}; font-weight: 700;
    text-align: center;
    text-transform: uppercase;
    border-bottom: 0.4mm solid #000;
    padding-bottom: 0.5mm;
    line-height: 1.1;
  }
  .product .name {
    font-size: ${style.nameFs}; font-weight: 800;
    text-transform: uppercase;
    line-height: 1.1;
    word-break: break-word;
  }
  .product .code {
    font-size: ${style.codeFs}; color: #666;
    margin-top: 0.3mm;
  }
  .grid {
    display: flex; justify-content: space-between; align-items: stretch;
    gap: 2mm;
    border-top: 0.2mm solid #000;
    border-bottom: 0.2mm solid #000;
    padding: 0.6mm 0;
  }
  .cell { display: flex; flex-direction: column; }
  .cell.right { text-align: right; align-items: flex-end; }
  .cell .lbl { font-size: ${style.lblFs}; text-transform: uppercase; color: #555; letter-spacing: 0.04em; line-height: 1.1; }
  .cell .val { font-size: ${style.valFs}; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.15; }
  .total {
    display: flex; align-items: baseline; justify-content: space-between;
  }
  .total .lbl { font-size: ${style.totalLblFs}; text-transform: uppercase; color: #000; font-weight: 700; }
  .total .val { font-size: ${style.totalValFs}; font-weight: 800; font-variant-numeric: tabular-nums; }
  .barcode {
    margin-top: auto;
    display: flex; justify-content: center; align-items: flex-end;
    width: 100%;
  }
  .barcode svg { max-width: 100%; height: ${style.barcodeHeightMm}mm; display: block; }
  .meta {
    display: flex; justify-content: center;
    font-size: ${style.lblFs}; color: #555;
  }
  @media screen {
    body { padding: 12px; background: #f5f5f5; }
    .label {
      background: #fff;
      border: 1px solid #ddd;
      box-shadow: 0 2px 8px rgba(0,0,0,0.06);
      margin: 0 auto 12px;
    }
    .hint {
      max-width: ${Math.max(style.width, 60)}mm; margin: 0 auto 16px;
      font-size: 12px; text-align: center; color: #555;
    }
  }
  @media print { .hint { display: none; } }
</style>
</head>
<body>
  <div class="hint">Selecione sua impressora de etiquetas (${style.width}×${style.height} mm) e clique em Imprimir.</div>
  ${cards}
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 250);
    });
    window.addEventListener("afterprint", function () { window.close(); });
  </script>
</body>
</html>`;

  const winWidth = Math.max(360, Math.round(style.width * 6));
  const winHeight = Math.max(420, Math.round(style.height * 6));
  const win = window.open("", "_blank", `width=${winWidth},height=${winHeight}`);
  if (!win) {
    throw new Error("O navegador bloqueou a janela de impressão. Permita pop-ups e tente novamente.");
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
