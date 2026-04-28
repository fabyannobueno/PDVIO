// ─────────────────────────────────────────────────────────────────────────────
// Impressão de etiquetas de pesagem (popup HTML + window.print()).
//
// Funciona com QUALQUER impressora reconhecida pelo navegador — térmica de
// etiqueta (Argox, Elgin L42, Bematech LB-1000, Zebra), térmica de cupom
// (configurada para tamanho 80×40 mm) ou impressora comum em folha A4 com
// adesivos. O usuário escolhe a impressora e o tamanho do papel no diálogo
// padrão de impressão do navegador, exatamente como faz para o cupom.
// ─────────────────────────────────────────────────────────────────────────────

import JsBarcode from "jsbarcode";

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

function generateBarcodeSvg(value: string): string {
  // Renderiza o código de barras em um SVG offscreen e devolve o markup.
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, value, {
      format: "EAN13",
      width: 2.6,
      height: 70,
      displayValue: true,
      fontSize: 16,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch {
    // Fallback: tenta CODE128 se o valor não passar na validação EAN.
    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        width: 2.6,
        height: 70,
        displayValue: true,
        fontSize: 16,
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
 * mesmo trabalho.
 */
export function printWeighLabel(input: WeighLabelData | WeighLabelData[]): void {
  const list = Array.isArray(input) ? input : [input];
  if (list.length === 0) return;

  const cards = list.map((d) => {
    const printed = d.printedAt ?? new Date();
    const dateStr = printed.toLocaleDateString("pt-BR");
    const timeStr = printed.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const barcodeSvg = generateBarcodeSvg(d.barcode);
    return `
      <article class="label">
        ${d.companyName ? `<header class="company">${escapeHtml(d.companyName)}</header>` : ""}
        <div class="product">
          <div class="name">${escapeHtml(d.productName)}</div>
          ${d.productCode ? `<div class="code">Cód.: ${escapeHtml(d.productCode)}</div>` : ""}
        </div>
        <div class="grid">
          <div class="cell">
            <span class="lbl">Peso líq.</span>
            <span class="val">${KG(d.weightKg)}</span>
          </div>
          <div class="cell">
            <span class="lbl">Preço/kg</span>
            <span class="val">${BRL(d.pricePerKg)}</span>
          </div>
        </div>
        <div class="total">
          <span class="lbl">Total a pagar</span>
          <span class="val">${BRL(d.totalPrice)}</span>
        </div>
        <div class="barcode">${barcodeSvg}</div>
        <footer class="meta">
          <span>${dateStr} ${timeStr}</span>
          ${d.expiresAt ? `<span>Validade: ${escapeHtml(d.expiresAt)}</span>` : ""}
        </footer>
      </article>
    `;
  }).join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Etiqueta de pesagem</title>
<style>
  @page { size: 80mm 50mm; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    margin: 0; padding: 0;
    font-family: "Helvetica Neue", Arial, sans-serif;
    color: #000; background: #fff;
    -webkit-font-smoothing: antialiased;
  }
  .label {
    width: 80mm;
    min-height: 50mm;
    padding: 2mm 3mm;
    page-break-after: always;
    display: flex; flex-direction: column;
    gap: 1mm;
  }
  .label:last-child { page-break-after: auto; }
  .company {
    font-size: 9pt; font-weight: 700;
    text-align: center;
    border-bottom: 0.5mm solid #000;
    padding-bottom: 0.5mm;
  }
  .product .name {
    font-size: 11pt; font-weight: 700;
    line-height: 1.15;
    word-break: break-word;
  }
  .product .code {
    font-size: 7pt; color: #444;
  }
  .grid {
    display: grid; grid-template-columns: 1fr 1fr;
    gap: 1mm 3mm;
    border-top: 0.2mm solid #000;
    border-bottom: 0.2mm solid #000;
    padding: 0.8mm 0;
    margin-top: 0.5mm;
  }
  .cell { display: flex; flex-direction: column; }
  .cell .lbl { font-size: 6.5pt; text-transform: uppercase; color: #555; letter-spacing: 0.02em; }
  .cell .val { font-size: 9pt; font-weight: 600; font-variant-numeric: tabular-nums; }
  .total {
    display: flex; align-items: baseline; justify-content: space-between;
    margin-top: 0.5mm;
  }
  .total .lbl { font-size: 8pt; text-transform: uppercase; color: #000; font-weight: 600; }
  .total .val { font-size: 14pt; font-weight: 800; font-variant-numeric: tabular-nums; }
  .barcode {
    margin-top: auto;
    display: block;
    width: 100%;
  }
  .barcode svg { width: 100%; height: 18mm; display: block; }
  .meta {
    display: flex; justify-content: space-between;
    font-size: 6.5pt; color: #555;
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
      max-width: 80mm; margin: 0 auto 16px;
      font-size: 12px; text-align: center; color: #555;
    }
  }
  @media print { .hint { display: none; } }
</style>
</head>
<body>
  <div class="hint">Selecione sua impressora de etiquetas e clique em Imprimir.</div>
  ${cards}
  <script>
    window.addEventListener("load", function () {
      setTimeout(function () { window.print(); }, 250);
    });
    window.addEventListener("afterprint", function () { window.close(); });
  </script>
</body>
</html>`;

  const win = window.open("", "_blank", "width=420,height=600");
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
