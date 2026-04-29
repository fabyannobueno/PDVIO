// ─────────────────────────────────────────────────────────────────────────────
// Impressão de etiquetas de pesagem (popup HTML + window.print()).
//
// Layout: padrão de balança térmica brasileira (Filizola, Toledo, Elgin,
// Argox e similares). Título do produto à esquerda em destaque, duas
// colunas de informações (Data Pesagem / Tara × Peso / R$ por kg), e na
// base o código de barras EAN-13 à esquerda com a faixa preta TOTAL R$ e
// o valor em destaque à direita.
//
// Tamanhos suportados:
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
  titleFs: string;
  unitFs: string;
  infoLblFs: string;
  infoValFs: string;
  totalLblFs: string;
  totalValFs: string;
  barcodeHeightMm: number;
  /** Largura-alvo do código de barras em mm (área final renderizada) */
  barcodeTargetMm: number;
  barcodeFontPt: number;
  barcodeBlockMm: number;
  totalBlockMm: number;
}

const SIZE_STYLES: Record<WeighLabelSize, SizeStyle> = {
  "40x40": {
    width: 40,
    height: 40,
    padding: "1mm 1.5mm",
    titleFs: "8pt",
    unitFs: "6pt",
    infoLblFs: "5pt",
    infoValFs: "5.5pt",
    totalLblFs: "5.5pt",
    totalValFs: "13pt",
    barcodeHeightMm: 9,
    barcodeTargetMm: 30,
    barcodeFontPt: 6,
    barcodeBlockMm: 32,
    totalBlockMm: 10,
  },
  "60x40": {
    width: 60,
    height: 40,
    padding: "1.4mm 2mm",
    titleFs: "11pt",
    unitFs: "8pt",
    infoLblFs: "6pt",
    infoValFs: "7pt",
    totalLblFs: "7pt",
    totalValFs: "18pt",
    barcodeHeightMm: 11,
    barcodeTargetMm: 38,
    barcodeFontPt: 7,
    barcodeBlockMm: 40,
    totalBlockMm: 17,
  },
  "60x80": {
    width: 60,
    height: 80,
    padding: "2.5mm 3mm",
    titleFs: "13pt",
    unitFs: "10pt",
    infoLblFs: "7.5pt",
    infoValFs: "9pt",
    totalLblFs: "9pt",
    totalValFs: "22pt",
    barcodeHeightMm: 16,
    barcodeTargetMm: 42,
    barcodeFontPt: 8,
    barcodeBlockMm: 44,
    totalBlockMm: 19,
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
  /** Tara aplicada (kg). Quando 0/undefined, omitida da etiqueta. */
  tareKg?: number;
  /** Data de embalagem. Default = data atual. */
  packagedAt?: Date;
  /** Validade do produto (DD/MM/YY). Quando vazia, omitida. */
  expiresAt?: string;
  /** Tamanho do papel — afeta CSS @page e fontes. */
  size?: WeighLabelSize;
}

const BRL_NUMBER = (v: number) => {
  // Limpa ruído de ponto flutuante e TRUNCA para 2 casas.
  // Nunca arredonda para cima: 9,998 vira "9,99" (não "10,00").
  const cleaned = Math.round(v * 10000) / 10000;
  const truncated = Math.trunc(cleaned * 100) / 100;
  return truncated.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const KG_NUMBER = (v: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const fmtDateBR = (d: Date) =>
  d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

// 96 DPI base usado por todos os navegadores em CSS pixels.
const PX_PER_MM = 96 / 25.4; // ≈ 3.7795

/**
 * EAN-13 ocupa um número fixo de "módulos" (a unidade base de largura):
 *   • 95 módulos para os dados/guardas
 *   • + 11 módulos de quiet zone à esquerda
 *   • + 7  módulos de quiet zone à direita
 * Total = 113 módulos. Para CODE128 usamos uma estimativa mais larga.
 */
function generateBarcodeSvg(value: string, style: SizeStyle): string {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const targetPx = style.barcodeTargetMm * PX_PER_MM;
  const heightPx = Math.round(style.barcodeHeightMm * PX_PER_MM);
  const fontPx = Math.max(8, Math.round(style.barcodeFontPt * 1.6));

  // Tenta EAN-13 primeiro (sempre 113 módulos).
  // Calcula a largura por barra em px integer-friendly.
  const eanModules = 113;
  const eanWidth = Math.max(1, Math.round((targetPx / eanModules) * 100) / 100);
  try {
    JsBarcode(svg, value, {
      format: "EAN13",
      width: eanWidth,
      height: heightPx,
      displayValue: true,
      fontSize: fontPx,
      textMargin: 0,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    });
  } catch {
    try {
      // Fallback: CODE128 — largura por módulo um pouco maior para legibilidade.
      const c128Width = Math.max(1, Math.round((targetPx / 90) * 100) / 100);
      JsBarcode(svg, value, {
        format: "CODE128",
        width: c128Width,
        height: heightPx,
        displayValue: true,
        fontSize: fontPx,
        textMargin: 0,
        margin: 0,
        background: "#ffffff",
        lineColor: "#000000",
      });
    } catch {
      return `<text x="0" y="20">${value}</text>`;
    }
  }

  // Forçar bordas nítidas + remover qualquer width/height embutidos para
  // que o CSS controle o tamanho final em mm (sem reescala distorcida).
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.removeAttribute("width");
  svg.removeAttribute("height");

  return new XMLSerializer().serializeToString(svg);
}

/**
 * Abre uma janela popup com a etiqueta renderizada e dispara o diálogo de
 * impressão automaticamente. Se o popup for bloqueado, lança um erro.
 */
export function printWeighLabel(input: WeighLabelData | WeighLabelData[]): void {
  const list = Array.isArray(input) ? input : [input];
  if (list.length === 0) return;

  const size: WeighLabelSize = list[0].size ?? DEFAULT_WEIGH_LABEL_SIZE;
  const style = SIZE_STYLES[size];

  const cards = list.map((d) => {
    const barcodeSvg = generateBarcodeSvg(d.barcode, style);
    const packaged = d.packagedAt ?? new Date();
    const packagedStr = fmtDateBR(packaged);
    const expiresStr = d.expiresAt && d.expiresAt.trim() ? d.expiresAt.trim() : "";
    const tara = typeof d.tareKg === "number" && d.tareKg > 0 ? d.tareKg : 0;

    // Coluna esquerda: data de pesagem + tara
    const leftLines: string[] = [
      `<div class="row"><span class="lbl">Data Pesagem:</span><span class="val">${packagedStr}</span></div>`,
    ];
    if (expiresStr) {
      leftLines.push(
        `<div class="row"><span class="lbl">Validade:</span><span class="val">${escapeHtml(expiresStr)}</span></div>`,
      );
    }
    leftLines.push(
      `<div class="row"><span class="lbl">Tara(T):</span><span class="val">${KG_NUMBER(tara)}kg</span></div>`,
    );

    // Coluna direita: peso líquido + preço/kg
    const rightLines: string[] = [
      `<div class="row"><span class="lbl">Peso(L):</span><span class="val">${KG_NUMBER(d.weightKg)}kg</span></div>`,
      `<div class="row"><span class="lbl">R$ / kg:</span><span class="val">${BRL_NUMBER(d.pricePerKg)}</span></div>`,
    ];

    return `
      <article class="label">
        ${d.companyName ? `<div class="company">${escapeHtml(d.companyName)}</div>` : ""}
        <div class="title">
          <span class="t-name">${escapeHtml(d.productName)}</span>
          <span class="t-unit">kg</span>
        </div>
        <div class="info">
          <div class="col">${leftLines.join("")}</div>
          <div class="col right">${rightLines.join("")}</div>
        </div>
        <div class="footer">
          <div class="barcode">${barcodeSvg}</div>
          <div class="total">
            <div class="t-banner">TOTAL R$</div>
            <div class="t-val">${BRL_NUMBER(d.totalPrice)}</div>
          </div>
        </div>
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
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }
  .label {
    width: ${style.width}mm;
    height: ${style.height}mm;
    padding: ${style.padding};
    page-break-after: always;
    display: flex; flex-direction: column;
    overflow: hidden;
  }
  .label:last-child { page-break-after: auto; }

  .company {
    font-size: ${style.infoLblFs};
    font-weight: 700;
    text-transform: uppercase;
    text-align: left;
    line-height: 1.05;
    color: #000;
  }
  .title {
    display: flex;
    align-items: baseline;
    gap: 1.2mm;
    line-height: 1;
    padding: 0.2mm 0 0.4mm;
    border-bottom: 0.25mm solid #000;
    margin-bottom: 0.4mm;
  }
  .t-name {
    font-size: ${style.titleFs};
    font-weight: 800;
    text-transform: uppercase;
    word-break: break-word;
    flex: 1 1 auto;
    min-width: 0;
  }
  .t-unit {
    font-size: ${style.unitFs};
    font-weight: 700;
    flex: 0 0 auto;
  }

  .info {
    display: flex;
    justify-content: space-between;
    gap: 2mm;
    padding: 0.2mm 0;
    flex: 0 0 auto;
  }
  .info .col { display: flex; flex-direction: column; gap: 0.2mm; min-width: 0; }
  .info .col.right { text-align: right; align-items: stretch; }
  .info .row {
    display: flex;
    justify-content: space-between;
    gap: 1mm;
    line-height: 1.1;
    white-space: nowrap;
  }
  .info .lbl {
    font-size: ${style.infoLblFs};
    font-weight: 600;
    color: #000;
  }
  .info .val {
    font-size: ${style.infoValFs};
    font-weight: 700;
    font-variant-numeric: tabular-nums;
  }

  .footer {
    margin-top: auto;
    display: flex;
    align-items: stretch;
    justify-content: space-between;
    gap: 1.5mm;
    padding-top: 0.5mm;
  }
  .barcode {
    flex: 0 0 ${style.barcodeBlockMm}mm;
    min-width: 0;
    display: flex; align-items: flex-end;
    justify-content: flex-start;
  }
  .barcode svg {
    width: ${style.barcodeTargetMm}mm;
    height: ${style.barcodeHeightMm}mm;
    display: block;
    shape-rendering: crispEdges;
    image-rendering: pixelated;
  }
  .total {
    flex: 0 0 ${style.totalBlockMm}mm;
    display: flex; flex-direction: column;
    align-items: stretch;
    justify-content: flex-end;
    text-align: right;
  }
  .t-banner {
    background: #000 !important;
    color: #fff !important;
    font-size: ${style.totalLblFs};
    font-weight: 800;
    text-transform: uppercase;
    text-align: center;
    line-height: 1.15;
    padding: 0.3mm 0.6mm;
    letter-spacing: 0.04em;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
    /* Fallback: borda preta densa simula a faixa caso o navegador
       remova mesmo o background, garantindo contraste no rótulo. */
    box-shadow: inset 0 0 0 100mm #000;
  }
  .t-val {
    font-size: ${style.totalValFs};
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    text-align: right;
    padding-top: 0.3mm;
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
