// ─────────────────────────────────────────────────────────────────────────────
// Thermal printer integration (ESC/POS) — client-side only.
// Supports: Web Serial (USB cable), Web USB (raw), Web Bluetooth (BLE),
// and a browser fallback via window.print() with HTML.
// ─────────────────────────────────────────────────────────────────────────────

import logoUrl from "@/assets/logo-print.png";
import { supabase } from "@/integrations/supabase/client";

export type PrinterMode = "serial" | "usb" | "bluetooth" | "browser";
export type PaperWidth = 58 | 76 | 80;

export interface PrinterSettings {
  mode: PrinterMode;
  paperWidth: PaperWidth;
  header: string;
  footer: string;
  autoCut: boolean;
  openDrawer: boolean;
  printLogo: boolean;
  autoPrintOnFinalize: boolean;
  deviceLabel?: string;
  /** Optional preset id (brand+model) used to populate paperWidth/cols. */
  presetId?: string;
  /**
   * Number of characters per line. When omitted, falls back to the value
   * derived from paperWidth (58→32, 76→42, 80→48). Use this to override
   * the default for printers whose head density doesn't match the table.
   */
  cols?: number;
}

export function colsFor(s: Pick<PrinterSettings, "cols" | "paperWidth">): number {
  if (s.cols && s.cols >= 16 && s.cols <= 80) return Math.floor(s.cols);
  return s.paperWidth === 58 ? 32 : s.paperWidth === 76 ? 42 : 48;
}

export interface ReceiptItem {
  name: string;
  qty: number;
  price: number;
  unit?: string;
}

export interface Receipt {
  title?: string;
  items: ReceiptItem[];
  subtotal?: number;
  discount?: number;
  total: number;
  payment?: string;
  cashReceived?: number;
  change?: number;
  date?: Date;
  /** Razão social ou nome fantasia da empresa. */
  companyName?: string;
  /** CPF (11 dígitos) ou CNPJ (14 dígitos), apenas dígitos ou já formatado. */
  companyDocument?: string;
  /** Telefone da loja, qualquer formato. */
  companyPhone?: string;
  /** Endereço completo da loja. */
  companyAddress?: string;
  /** Identificador curto da venda (ex.: "012345"). */
  saleNumber?: string;
}

// ─── Helpers públicos ───────────────────────────────────────────────────────

/**
 * Gera um identificador curto (6 dígitos) determinístico a partir do UUID
 * da venda. Usado como fallback quando ainda não existe `numeric_id` no
 * registro (ex.: dados antigos antes da migração).
 */
export function shortSaleNumber(uuid: string | null | undefined): string {
  if (!uuid) return "000000";
  const cleaned = uuid.replace(/[^a-f0-9]/gi, "");
  // Usa os últimos 8 hex chars para evitar overflow no parseInt e dar boa
  // distribuição mesmo se os primeiros forem fixos.
  const slice = cleaned.slice(-8) || "0";
  const n = parseInt(slice, 16);
  if (!isFinite(n) || isNaN(n)) return "000000";
  return String(n % 1000000).padStart(6, "0");
}

/**
 * Formata o `numeric_id` (BIGSERIAL único, vindo do banco) como um número
 * de venda de 6 dígitos para o cupom. Se ultrapassar 999999, mostra todos
 * os dígitos sem cortar — assim a unicidade é sempre preservada.
 */
export function formatSaleNumber(
  numericId: number | string | null | undefined,
  fallbackUuid?: string | null,
): string {
  if (numericId !== null && numericId !== undefined && numericId !== "") {
    const n = typeof numericId === "number" ? numericId : Number(numericId);
    if (Number.isFinite(n) && n > 0) {
      const s = String(Math.trunc(n));
      return s.length >= 6 ? s : s.padStart(6, "0");
    }
  }
  return shortSaleNumber(fallbackUuid ?? null);
}

/**
 * Formata o endereço da loja para impressão.
 * Aceita string simples ou um JSON com as chaves
 * { cep, logradouro, numero, complemento, bairro, cidade, estado }
 * (formato salvo pelo cadastro da empresa).
 * Retorna string vazia quando nada útil estiver disponível.
 */
export function formatAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  const trimmed = String(addr).trim();
  if (!trimmed) return "";

  // Tenta interpretar como JSON. Se falhar, devolve a string crua.
  if (trimmed.startsWith("{")) {
    try {
      const o: Record<string, unknown> = JSON.parse(trimmed);
      const get = (k: string) => {
        const v = o[k];
        return typeof v === "string" ? v.trim() : "";
      };
      const logradouro = get("logradouro") || get("rua") || get("street");
      const numero = get("numero") || get("number");
      const complemento = get("complemento") || get("complement");
      const bairro = get("bairro") || get("neighborhood");
      const cidade = get("cidade") || get("city");
      const estado = get("estado") || get("uf") || get("state");
      const cep = get("cep") || get("zip") || get("postal_code");

      const parts: string[] = [];
      const street = [logradouro, numero].filter(Boolean).join(", ");
      if (street) parts.push(street);
      if (complemento) parts.push(complemento);
      if (bairro) parts.push(bairro);
      const cityState = [cidade, estado].filter(Boolean).join(" - ");
      if (cityState) parts.push(cityState);
      if (cep) parts.push(`CEP ${cep}`);
      // Usa " - " como separador (ASCII puro) para funcionar em qualquer
      // impressora térmica sem suporte a caracteres Unicode.
      return parts.join(" - ");
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

/** Formata CPF/CNPJ e devolve label apropriado ("CPF" ou "CNPJ"). */
export function formatDocument(doc: string | null | undefined): { label: string; value: string } | null {
  if (!doc) return null;
  const digits = doc.replace(/\D/g, "");
  if (digits.length === 11) {
    return {
      label: "CPF",
      value: digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4"),
    };
  }
  if (digits.length === 14) {
    return {
      label: "CNPJ",
      value: digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3.$4-$5"),
    };
  }
  // Formato desconhecido — devolve como veio, assumindo CNPJ por padrão.
  return { label: digits.length > 11 ? "CNPJ" : "CPF", value: doc };
}

const STORAGE_KEY = "pdvio:printer:settings";

export const defaultSettings: PrinterSettings = {
  mode: "browser",
  paperWidth: 80,
  header: "",
  footer: "Obrigado pela preferência!",
  autoCut: true,
  openDrawer: false,
  printLogo: true,
  autoPrintOnFinalize: true,
};

export function getSettings(): PrinterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultSettings };
    return { ...defaultSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: PrinterSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

// ─── DB persistence (per company) ────────────────────────────────────────────
// Device-specific fields are kept local only.
const DB_OMIT_KEYS: (keyof PrinterSettings)[] = ["deviceLabel"];

function stripLocal(s: PrinterSettings): Partial<PrinterSettings> {
  const out: any = { ...s };
  for (const k of DB_OMIT_KEYS) delete out[k];
  return out;
}

export async function loadSettingsFromDB(companyId: string): Promise<PrinterSettings | null> {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("printer_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !data?.printer_settings) return null;
    const local = getSettings();
    return { ...defaultSettings, ...local, ...(data.printer_settings as Partial<PrinterSettings>) };
  } catch {
    return null;
  }
}

export async function saveSettingsToDB(companyId: string, s: PrinterSettings): Promise<void> {
  try {
    await supabase
      .from("companies")
      .update({ printer_settings: stripLocal(s) })
      .eq("id", companyId);
  } catch {
    // ignore — local cache still holds latest
  }
}

export async function hydrateSettingsFromDB(companyId: string): Promise<PrinterSettings> {
  const remote = await loadSettingsFromDB(companyId);
  if (remote) {
    saveSettings(remote);
    return remote;
  }
  return getSettings();
}

// ─── Capability detection ────────────────────────────────────────────────────
export const capabilities = {
  serial: typeof navigator !== "undefined" && "serial" in navigator,
  usb: typeof navigator !== "undefined" && "usb" in navigator,
  bluetooth: typeof navigator !== "undefined" && "bluetooth" in navigator,
};

// ─── ESC/POS byte builder ────────────────────────────────────────────────────
const ESC = 0x1b;
const GS = 0x1d;

function bytes(...arr: number[]): Uint8Array {
  return new Uint8Array(arr);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const len = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

function encodeText(text: string): Uint8Array {
  // Most ESC/POS thermal printers default to a single-byte code page (CP437/850)
  // and render multi-byte UTF-8 sequences as garbage (e.g. NBSP 0xC2A0 → "Â ",
  // "ç" → "Ã§"). We normalize, strip diacritics, replace common Unicode
  // punctuation with ASCII equivalents, and drop anything still >0x7F.
  const normalized = text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")     // combining diacritics
    .replace(/[\u00A0\u202F\u2007]/g, " ") // NBSP / narrow NBSP / figure space
    .replace(/[\u2010-\u2015]/g, "-")    // unicode dashes
    .replace(/[\u2018\u2019\u201B]/g, "'") // curly single quotes
    .replace(/[\u201C\u201D\u201F]/g, '"') // curly double quotes
    .replace(/\u00AA/g, "a")             // ª (ordinal feminino)
    .replace(/\u00BA/g, "o")             // º (ordinal masculino)
    .replace(/[\u2022\u00B7\u2027\u25E6]/g, "-"); // bullets diversos → "-"

  const out = new Uint8Array(normalized.length);
  for (let i = 0; i < normalized.length; i++) {
    const code = normalized.charCodeAt(i);
    out[i] = code <= 0x7f ? code : 0x3f; // '?'
  }
  return out;
}

function line(text = "", opts: { bold?: boolean; align?: "left" | "center" | "right"; double?: boolean } = {}) {
  // IMPORTANT: only emit ESC/GS commands when their value is non-default.
  // Some thermal printer clones don't recognize the GS prefix (0x1D) and end
  // up printing the literal command bytes as text — that's where the leading
  // "!" on every line came from (`GS ! n` = 0x1D 0x21 n, the printer drops
  // GS and prints "!"). Sending the commands only when needed (and resetting
  // after) avoids the issue entirely on normal lines.
  const chunks: Uint8Array[] = [];
  const a = opts.align === "center" ? 1 : opts.align === "right" ? 2 : 0;
  if (a !== 0) chunks.push(bytes(ESC, 0x61, a));
  // Use `ESC ! n` (0x1B 0x21 n) for character size + bold instead of
  // `GS ! n` — it's far more widely supported on cheap/clone thermal
  // printers. Bits: 0x08 = bold, 0x10 = double height, 0x20 = double width.
  let mode = 0;
  if (opts.bold) mode |= 0x08;
  if (opts.double) mode |= 0x30;
  if (mode !== 0) chunks.push(bytes(ESC, 0x21, mode));
  chunks.push(encodeText(text));
  chunks.push(bytes(0x0a));
  // Reset only what we changed, so the next line starts clean.
  if (mode !== 0) chunks.push(bytes(ESC, 0x21, 0));
  if (a !== 0) chunks.push(bytes(ESC, 0x61, 0));
  return concat(chunks);
}

function divider(width: number) {
  return concat([bytes(ESC, 0x61, 0), encodeText("-".repeat(width)), bytes(0x0a)]);
}

function money(v: number) {
  // Limpa ruído de ponto flutuante (até 4 casas) e TRUNCA para 2 casas.
  // Nunca arredonda para cima: 9,998 vira "R$ 9,99" (não "R$ 10,00").
  const cleaned = Math.round(v * 10000) / 10000;
  const truncated = Math.trunc(cleaned * 100) / 100;
  return truncated.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function qty(n: number) {
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function padCols(left: string, right: string, width: number) {
  const space = Math.max(1, width - left.length - right.length);
  return left + " ".repeat(space) + right;
}

function maxPrintWidthDots(paper: PaperWidth): number {
  if (paper === 58) return 384;
  if (paper === 76) return 480;
  return 512;
}

async function rasterizeImageToEscPos(url: string, targetWidthPx: number, paperWidthPx: number): Promise<Uint8Array> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Falha ao carregar logo"));
    img.src = url;
  });

  // Step 1: render the source at its native size with a TRANSPARENT
  // background, then trim transparent/near-white edges. This removes any
  // asymmetric padding baked into the PNG itself — without this, a logo
  // that's "left-heavy" in its file will appear off-center on the receipt
  // even after we center the bitmap.
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;
  const probe = document.createElement("canvas");
  probe.width = srcW;
  probe.height = srcH;
  const pctx = probe.getContext("2d")!;
  pctx.clearRect(0, 0, srcW, srcH);
  pctx.drawImage(img, 0, 0, srcW, srcH);
  const probeData = pctx.getImageData(0, 0, srcW, srcH).data;

  let minX = srcW, maxX = -1, minY = srcH, maxY = -1;
  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const i = (y * srcW + x) * 4;
      const a = probeData[i + 3];
      if (a < 16) continue; // transparent
      const lum = (probeData[i] * 0.299 + probeData[i + 1] * 0.587 + probeData[i + 2] * 0.114);
      if (lum > 240) continue; // near-white
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  // Fallback if the probe found nothing visible.
  if (maxX < 0) { minX = 0; maxX = srcW - 1; minY = 0; maxY = srcH - 1; }
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;
  const cropRatio = cropH / cropW;

  // Step 2: scale the trimmed content to the target width.
  let imgW = Math.min(targetWidthPx, cropW);
  imgW = Math.max(8, Math.floor(imgW / 8) * 8); // multiple of 8
  const h = Math.max(1, Math.round(imgW * cropRatio));

  const canvas = document.createElement("canvas");
  canvas.width = imgW;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, imgW, h);
  ctx.drawImage(img, minX, minY, cropW, cropH, 0, 0, imgW, h);
  const data = ctx.getImageData(0, 0, imgW, h).data;

  // Convert the trimmed image to a 1-bit bitmap at its natural width.
  // Centering is handled by the caller via `ESC a 1` (center alignment),
  // which this printer DOES honor for both text and raster images.
  const bytesPerRow = imgW / 8;
  const bitmap = new Uint8Array(bytesPerRow * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < imgW; x++) {
      const i = (y * imgW + x) * 4;
      const a = data[i + 3] / 255;
      const lum = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) * a + (1 - a) * 255;
      if (lum < 160) {
        bitmap[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
      }
    }
  }

  const xL = bytesPerRow & 0xff;
  const xH = (bytesPerRow >> 8) & 0xff;
  const yL = h & 0xff;
  const yH = (h >> 8) & 0xff;
  const header = bytes(GS, 0x76, 0x30, 0x00, xL, xH, yL, yH);

  const out = new Uint8Array(header.length + bitmap.length);
  out.set(header, 0);
  out.set(bitmap, header.length);
  return out;
}

export async function buildReceiptBytes(receipt: Receipt, s: PrinterSettings): Promise<Uint8Array> {
  const cols = colsFor(s);
  const chunks: Uint8Array[] = [];
  chunks.push(bytes(ESC, 0x40)); // init

  if (s.printLogo) {
    try {
      const paperPx = maxPrintWidthDots(s.paperWidth);
      // Keep the logo at ~60% of paper width so there's room to center.
      const targetW = Math.min(paperPx, Math.floor(paperPx * 0.6 / 8) * 8);
      const raster = await rasterizeImageToEscPos(logoUrl, targetW, paperPx);
      chunks.push(bytes(ESC, 0x61, 0x01)); // center alignment (works for raster on this printer)
      chunks.push(raster);
      chunks.push(bytes(0x0a));
      chunks.push(bytes(ESC, 0x61, 0x00)); // back to left

    } catch {
      // Logo failed to load — proceed without it.
    }
  }

  // ── Bloco de identificação da loja ──────────────────────────────────────
  // Quando temos os dados estruturados da empresa, usamos somente esse bloco
  // e ignoramos o `s.header` para evitar duplicar nome/CPF/TEL no cupom.
  const docInfo = formatDocument(receipt.companyDocument);
  const addressFmt = formatAddress(receipt.companyAddress);
  const hasCompanyBlock = !!(receipt.companyName || docInfo || receipt.companyPhone?.trim() || addressFmt);

  if (s.header.trim() && !hasCompanyBlock) {
    for (const ln of s.header.split("\n")) {
      chunks.push(line(ln, { align: "center", bold: true }));
    }
  }

  if (receipt.companyName) {
    chunks.push(line(receipt.companyName, { align: "center", bold: true }));
  }
  if (docInfo) {
    chunks.push(line(`${docInfo.label}: ${docInfo.value}`, { align: "center" }));
  }
  if (receipt.companyPhone && receipt.companyPhone.trim().length > 0) {
    chunks.push(line(`TEL: ${receipt.companyPhone.trim()}`, { align: "center" }));
  }
  if (addressFmt) {
    // Quebra endereços longos em múltiplas linhas para caber no cupom.
    const words = addressFmt.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const w of words) {
      if ((current + " " + w).trim().length > cols) {
        if (current) lines.push(current);
        current = w;
      } else {
        current = current ? `${current} ${w}` : w;
      }
    }
    if (current) lines.push(current);
    for (const l of lines) chunks.push(line(l, { align: "center" }));
  }
  if (hasCompanyBlock) {
    chunks.push(bytes(0x0a));
  }

  if (receipt.title) chunks.push(line(receipt.title, { align: "center", bold: true, double: true }));
  const date = receipt.date ?? new Date();
  chunks.push(line(date.toLocaleString("pt-BR"), { align: "center" }));
  if (receipt.saleNumber) {
    chunks.push(line(`ID DA VENDA: ${receipt.saleNumber}`, { align: "center", bold: true }));
  }
  chunks.push(divider(cols));

  for (const it of receipt.items) {
    const total = money(it.qty * it.price);
    const unitLabel = it.unit && it.unit.trim().length > 0 ? it.unit : "un";
    // Header line: product name (with quantity prefix on integer items so the
    // listing fica legível mesmo quando o cupom rola).
    chunks.push(line(it.name.slice(0, cols)));
    // Detail line: quantity unit x unit price, alinhado à direita com o total.
    const detail = `  ${qty(it.qty)} ${unitLabel} x ${money(it.price)}`;
    chunks.push(line(padCols(detail.slice(0, cols - total.length - 1), total, cols)));
  }

  chunks.push(divider(cols));
  if (receipt.subtotal != null) chunks.push(line(padCols("Subtotal", money(receipt.subtotal), cols)));
  if (receipt.discount) chunks.push(line(padCols("Desconto", `-${money(receipt.discount)}`, cols)));
  chunks.push(line(padCols("TOTAL", money(receipt.total), cols), { bold: true, double: false }));
  if (receipt.payment) chunks.push(line(padCols("Pagamento", receipt.payment, cols)));
  if (receipt.cashReceived != null) chunks.push(line(padCols("Valor recebido", money(receipt.cashReceived), cols)));
  if (receipt.change != null) chunks.push(line(padCols("Troco", money(receipt.change), cols), { bold: true }));

  chunks.push(bytes(0x0a));
  if (s.footer.trim()) {
    for (const ln of s.footer.split("\n")) chunks.push(line(ln, { align: "center" }));
    chunks.push(bytes(0x0a)); // extra blank line below the footer
  }
  if (s.openDrawer) chunks.push(bytes(ESC, 0x70, 0x00, 0x19, 0xfa));
  if (s.autoCut) {
    // Feed enough lines to clear the cutter, then cut.
    // IMPORTANT: this printer doesn't recognize the `GS V` cut command and
    // ends up printing its bytes as text (e.g. "V", "VBQ" near the top of
    // the next receipt). We use `ESC i` (0x1B 0x69) instead — the ESC-based
    // partial-cut command supported by virtually all clones.
    chunks.push(bytes(ESC, 0x64, 0x06)); // feed 6 lines (~21 mm)
    chunks.push(bytes(ESC, 0x69));       // partial cut
  } else {
    chunks.push(bytes(ESC, 0x64, 0x03));
  }

  return concat(chunks);
}

// ─── Connection state (module-singleton) ─────────────────────────────────────
type SerialPort = any;
type USBDevice = any;
type BTRemote = { device: any; characteristic: any };

let serialPort: SerialPort | null = null;
let serialWriter: WritableStreamDefaultWriter<Uint8Array> | null = null;
let usbDevice: USBDevice | null = null;
let usbEndpoint = 0;
let bt: BTRemote | null = null;

const BT_SERVICE = "000018f0-0000-1000-8000-00805f9b34fb";
const BT_CHAR = "00002af1-0000-1000-8000-00805f9b34fb";

// ─── Connect helpers ─────────────────────────────────────────────────────────
export async function connectSerial(baudRate = 9600): Promise<string> {
  if (!capabilities.serial) throw new Error("Web Serial não suportado neste navegador");
  const nav = navigator as any;
  const port = await nav.serial.requestPort();
  await port.open({ baudRate });
  serialPort = port;
  serialWriter = port.writable.getWriter();
  const info = port.getInfo?.() ?? {};
  const label = info.usbVendorId ? `Serial USB ${info.usbVendorId.toString(16)}:${info.usbProductId?.toString(16)}` : "Impressora Serial";
  return label;
}

export async function connectUSB(): Promise<string> {
  if (!capabilities.usb) throw new Error("Web USB não suportado neste navegador");
  const nav = navigator as any;
  const device = await nav.usb.requestDevice({ filters: [{ classCode: 7 }, {}] });
  await device.open();
  if (device.configuration === null) await device.selectConfiguration(1);
  const iface = device.configuration.interfaces.find((i: any) =>
    i.alternates[0].endpoints.some((e: any) => e.direction === "out")
  ) ?? device.configuration.interfaces[0];
  await device.claimInterface(iface.interfaceNumber);
  const ep = iface.alternates[0].endpoints.find((e: any) => e.direction === "out");
  if (!ep) throw new Error("Endpoint de saída não encontrado");
  usbDevice = device;
  usbEndpoint = ep.endpointNumber;
  return device.productName || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`;
}

export async function connectBluetooth(): Promise<string> {
  if (!capabilities.bluetooth) throw new Error("Web Bluetooth não suportado neste navegador");
  const nav = navigator as any;
  const device = await nav.bluetooth.requestDevice({
    optionalServices: [BT_SERVICE],
    acceptAllDevices: true,
  });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(BT_SERVICE);
  const characteristic = await service.getCharacteristic(BT_CHAR);
  bt = { device, characteristic };
  return device.name || "Impressora Bluetooth";
}

export function isConnected(mode: PrinterMode): boolean {
  if (mode === "serial") return !!serialWriter;
  if (mode === "usb") return !!usbDevice;
  if (mode === "bluetooth") return !!bt;
  return true; // browser mode is always available
}

// ─── Auto-reconnect to previously-authorized devices ─────────────────────────
// Browsers persist the *permission* but not the actual port/device handle
// across page reloads. This re-acquires the handle silently if available.
export async function autoReconnect(mode: PrinterMode, baudRate = 9600): Promise<string | null> {
  try {
    if (mode === "serial" && capabilities.serial) {
      const nav = navigator as any;
      const ports = await nav.serial.getPorts();
      if (!ports.length) return null;
      const port = ports[0];
      if (!port.readable) await port.open({ baudRate });
      serialPort = port;
      try { serialWriter = port.writable.getWriter(); } catch { /* already locked */ }
      const info = port.getInfo?.() ?? {};
      return info.usbVendorId
        ? `Serial USB ${info.usbVendorId.toString(16)}:${info.usbProductId?.toString(16)}`
        : "Impressora Serial";
    }
    if (mode === "usb" && capabilities.usb) {
      const nav = navigator as any;
      const devices = await nav.usb.getDevices();
      if (!devices.length) return null;
      const device = devices[0];
      if (!device.opened) await device.open();
      if (device.configuration === null) await device.selectConfiguration(1);
      const iface = device.configuration.interfaces.find((i: any) =>
        i.alternates[0].endpoints.some((e: any) => e.direction === "out")
      ) ?? device.configuration.interfaces[0];
      try { await device.claimInterface(iface.interfaceNumber); } catch { /* already claimed */ }
      const ep = iface.alternates[0].endpoints.find((e: any) => e.direction === "out");
      if (!ep) return null;
      usbDevice = device;
      usbEndpoint = ep.endpointNumber;
      return device.productName || `USB ${device.vendorId.toString(16)}:${device.productId.toString(16)}`;
    }
    if (mode === "bluetooth" && capabilities.bluetooth) {
      const nav = navigator as any;
      // navigator.bluetooth.getDevices() is only available behind a flag in
      // most Chrome versions — fall back to no-op when unavailable.
      if (typeof nav.bluetooth.getDevices !== "function") return null;
      const devices = await nav.bluetooth.getDevices();
      if (!devices.length) return null;
      const device = devices[0];
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService(BT_SERVICE);
      const characteristic = await service.getCharacteristic(BT_CHAR);
      bt = { device, characteristic };
      return device.name || "Impressora Bluetooth";
    }
  } catch {
    return null;
  }
  return null;
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

// ─── Send raw bytes via current mode ─────────────────────────────────────────
// Thermal printers have a small internal buffer (often 4 KB) and at low baud
// rates (9600 bps ≈ 960 B/s) they can't keep up with bulk writes. When the
// buffer overflows, bytes are dropped — typically losing ESC/GS prefixes,
// which causes:
//   • literal command bytes printing as text (e.g. "!" from `GS ! n`)
//   • the cut command being lost, so the next receipt appends to the
//     unfinished one.
// We chunk all writes and pace them, leaving the printer time to drain.
async function sendBytes(data: Uint8Array, mode: PrinterMode): Promise<void> {
  if (mode === "serial") {
    if (!serialWriter) throw new Error("Impressora serial não conectada");
    // Send the whole payload in a single write. The Web Serial writer
    // already applies OS-level flow control, so the bytes go out at the
    // hardware rate without us having to pace them. Manual chunking with
    // sleeps actually breaks ESC/POS commands on serial: if a chunk
    // boundary lands inside a multi-byte command (e.g. `GS ! n`), the idle
    // gap can make the printer drop the prefix byte (0x1D) and print the
    // remaining bytes as text — that's where the leading "!" came from,
    // and why the cut command was being lost between receipts.
    await serialWriter.write(data);
    // Small settle so the cut finishes before the next print starts.
    await sleep(250);
    return;
  }
  if (mode === "usb") {
    if (!usbDevice) throw new Error("Impressora USB não conectada");
    // USB bulk endpoints are fast, but the printer logic is the same:
    // pace large jobs (logo + items) so the firmware keeps up.
    const CHUNK = 1024;
    const PAUSE_MS = 10;
    for (let i = 0; i < data.length; i += CHUNK) {
      await usbDevice.transferOut(usbEndpoint, data.slice(i, i + CHUNK));
      if (data.length > CHUNK) await sleep(PAUSE_MS);
    }
    await sleep(150);
    return;
  }
  if (mode === "bluetooth") {
    if (!bt) throw new Error("Impressora Bluetooth não conectada");
    // BLE has MTU limits; chunk the data
    const CHUNK = 180;
    for (let i = 0; i < data.length; i += CHUNK) {
      await bt.characteristic.writeValueWithoutResponse(data.slice(i, i + CHUNK));
      await sleep(20);
    }
    await sleep(200);
    return;
  }
  throw new Error("Modo de impressão inválido para envio de bytes");
}

// ─── Browser fallback (window.print + HTML) ──────────────────────────────────
function printViaBrowser(receipt: Receipt, s: PrinterSettings) {
  const cols = colsFor(s);
  const widthMm = s.paperWidth;
  const date = receipt.date ?? new Date();
  const itemsHtml = receipt.items
    .map((it) => {
      const total = money(it.qty * it.price);
      const unitLabel = it.unit && it.unit.trim().length > 0 ? it.unit : "un";
      // Sempre mostrar nome e, na linha de baixo, "qty unit x preço" alinhado
      // ao total — para que o valor da unidade (un/kg/etc.) apareça no cupom.
      return `<div class="item"><div class="name">${escapeHtml(it.name)}</div>` +
        `<div class="row"><span class="left" style="padding-left:8px">${escapeHtml(qty(it.qty))} ${escapeHtml(unitLabel)} x ${escapeHtml(money(it.price))}</span><span class="price">${escapeHtml(total)}</span></div></div>`;
    })
    .join("");

  // Empty <title> + zero @page margin reduce browser print headers/footers
  // (URL, page number, document title) which on thermal paper appear as
  // stray characters like "!" at the page edges.
  const html = `<!doctype html><html><head><meta charset="utf-8"><title> </title>
<style>
@page { size: ${widthMm}mm auto; margin: 0; }
html, body { margin: 0; padding: 0; }
* { box-sizing: border-box; }
body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.25; color: #000; padding: 2mm; width: ${widthMm}mm; }
.center { text-align: center; }
.bold { font-weight: 700; }
.big { font-size: 16px; }
.row { display: flex; justify-content: space-between; gap: 6px; align-items: flex-start; }
.left { flex: 1 1 auto; min-width: 0; word-break: break-word; overflow-wrap: anywhere; white-space: normal; }
.price { flex: 0 0 auto; white-space: nowrap; text-align: right; }
.item { margin: 0; padding: 0; }
.divider { border-top: 1px dashed #000; margin: 3px 0; }
.total { font-weight: 800; font-size: 14px; }
@media print { body { width: ${widthMm}mm; } }
</style></head><body>
${s.printLogo ? `<div class="center"><img src="${logoUrl}" alt="" style="max-width:60%;max-height:80px;object-fit:contain;filter:grayscale(1) contrast(1.5);"/></div>` : ""}
${(() => {
  const d = formatDocument(receipt.companyDocument);
  const addressFmt = formatAddress(receipt.companyAddress);
  const hasCompanyBlock = !!(receipt.companyName || d || receipt.companyPhone?.trim() || addressFmt);
  const headerHtml =
    s.header && !hasCompanyBlock
      ? `<div class="center bold">${escapeHtml(s.header).replace(/\n/g, "<br>")}</div>`
      : "";
  return [
    headerHtml,
    receipt.companyName ? `<div class="center bold">${escapeHtml(receipt.companyName)}</div>` : "",
    d ? `<div class="center">${d.label}: ${escapeHtml(d.value)}</div>` : "",
    receipt.companyPhone && receipt.companyPhone.trim()
      ? `<div class="center">TEL: ${escapeHtml(receipt.companyPhone.trim())}</div>`
      : "",
    addressFmt ? `<div class="center">${escapeHtml(addressFmt)}</div>` : "",
  ].join("");
})()}
${receipt.title ? `<div class="center bold big" style="margin-top:6px">${escapeHtml(receipt.title)}</div>` : ""}
<div class="center">${date.toLocaleString("pt-BR")}</div>
${receipt.saleNumber ? `<div class="center bold">ID DA VENDA: ${escapeHtml(receipt.saleNumber)}</div>` : ""}
<div class="divider"></div>
${itemsHtml}
<div class="divider"></div>
${receipt.subtotal != null ? `<div class="row"><span>Subtotal</span><span>${money(receipt.subtotal)}</span></div>` : ""}
${receipt.discount ? `<div class="row"><span>Desconto</span><span>-${money(receipt.discount)}</span></div>` : ""}
<div class="row total"><span>TOTAL</span><span>${money(receipt.total)}</span></div>
${receipt.payment ? `<div class="row"><span>Pagamento</span><span>${escapeHtml(receipt.payment)}</span></div>` : ""}
${receipt.cashReceived != null ? `<div class="row"><span>Valor recebido</span><span>${money(receipt.cashReceived)}</span></div>` : ""}
${receipt.change != null ? `<div class="row bold"><span>Troco</span><span>${money(receipt.change)}</span></div>` : ""}
${s.footer ? `<div class="divider"></div><div class="center">${escapeHtml(s.footer).replace(/\n/g, "<br>")}</div>` : ""}
<script>window.addEventListener('load',()=>{setTimeout(()=>{window.print();},100);});<\/script>
</body></html>`;

  const w = window.open("", "_blank", "width=420,height=640");
  if (!w) throw new Error("Pop-up bloqueado pelo navegador");
  w.document.open();
  w.document.write(html);
  w.document.close();
  // unused but kept for reference
  void cols;
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

// ─── High-level print API ────────────────────────────────────────────────────
export async function printReceipt(receipt: Receipt, settings = getSettings()): Promise<void> {
  if (settings.mode === "browser") {
    printViaBrowser(receipt, settings);
    return;
  }
  const data = await buildReceiptBytes(receipt, settings);
  await sendBytes(data, settings.mode);
}

export async function printTest(
  settings = getSettings(),
  company?: {
    name?: string | null;
    document?: string | null;
    phone?: string | null;
    address?: string | null;
  } | null,
): Promise<void> {
  const sample: Receipt = {
    title: "CUPOM DE TESTE",
    items: [
      { name: "X-Burger", qty: 1, price: 24.9 },
      { name: "Refrigerante 350ml", qty: 2, price: 6.5 },
      { name: "Batata frita G", qty: 1, price: 18.0 },
    ],
    subtotal: 55.9,
    discount: 0,
    total: 55.9,
    payment: "Cartão de débito",
    date: new Date(),
    companyName: company?.name ?? undefined,
    companyDocument: company?.document ?? undefined,
    companyPhone: company?.phone ?? undefined,
    companyAddress: company?.address ?? undefined,
    saleNumber: "000000",
  };
  await printReceipt(sample, settings);
}

export async function openCashDrawer(settings = getSettings()): Promise<void> {
  if (settings.mode === "browser") throw new Error("Abertura de gaveta requer impressora conectada (Serial, USB ou Bluetooth)");
  await sendBytes(bytes(ESC, 0x70, 0x00, 0x19, 0xfa), settings.mode);
}
