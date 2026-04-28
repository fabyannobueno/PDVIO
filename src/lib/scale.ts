// ─────────────────────────────────────────────────────────────────────────────
// Driver de balança comercial (Web Serial).
//
// Suporta os principais protocolos do mercado brasileiro:
//   • Toledo Prix III / IV / Plus (Toledo do tipo "9600 8N1", quadro
//     STX <peso 6 dígitos> ETX, ou linha contínua "P000.255KG\r\n").
//   • Filizola CS / Smart        (parecido com Toledo, "9600 8N1").
//   • Urano POP / UDC            (4800 ou 9600, peso em gramas).
//   • Genérico                   (qualquer balança que envie o peso em ASCII
//     com CR/LF — extrai o primeiro número decimal da linha).
//
// O parser é tolerante: aceita formatos com STX/ETX, prefixo "P", sufixo "kg"
// ou "g", separador vírgula ou ponto. Sempre devolve o peso em quilogramas
// (Number) ou `null` se a linha for inválida ou instável.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/integrations/supabase/client";

export type ScaleMode = "serial" | "manual";
export type ScaleProtocol = "toledo" | "filizola" | "urano" | "generic";

export interface ScaleSettings {
  mode: ScaleMode;
  protocol: ScaleProtocol;
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
  /** Etiqueta amigável do dispositivo conectado. */
  deviceLabel?: string;
}

export const defaultScaleSettings: ScaleSettings = {
  mode: "manual",
  protocol: "toledo",
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "none",
};

export const SCALE_PRESETS: Array<{
  id: ScaleProtocol;
  label: string;
  brands: string;
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
}> = [
  { id: "toledo",   label: "Toledo Prix (III, IV, Plus)",  brands: "Toledo",   baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
  { id: "filizola", label: "Filizola Smart / CS / Platina", brands: "Filizola", baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
  { id: "urano",    label: "Urano POP-S / UDC",            brands: "Urano",    baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
  { id: "generic",  label: "Genérica (ASCII)",             brands: "Outras",   baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
];

const STORAGE_KEY = "pdvio:scale:settings";

export function getSettings(): ScaleSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultScaleSettings };
    return { ...defaultScaleSettings, ...JSON.parse(raw) };
  } catch {
    return { ...defaultScaleSettings };
  }
}

export function saveSettings(s: ScaleSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

const DB_OMIT_KEYS: (keyof ScaleSettings)[] = ["deviceLabel"];

function stripLocal(s: ScaleSettings): Partial<ScaleSettings> {
  const out: any = { ...s };
  for (const k of DB_OMIT_KEYS) delete out[k];
  return out;
}

export async function loadSettingsFromDB(companyId: string): Promise<ScaleSettings | null> {
  try {
    const { data, error } = await supabase
      .from("companies")
      .select("scale_settings")
      .eq("id", companyId)
      .maybeSingle();
    if (error || !(data as any)?.scale_settings) return null;
    const local = getSettings();
    return { ...defaultScaleSettings, ...local, ...((data as any).scale_settings as Partial<ScaleSettings>) };
  } catch {
    return null;
  }
}

export async function saveSettingsToDB(companyId: string, s: ScaleSettings): Promise<void> {
  try {
    await supabase
      .from("companies")
      .update({ scale_settings: stripLocal(s) } as any)
      .eq("id", companyId);
  } catch {
    // ignore — local cache mantém o estado mais recente
  }
}

export async function hydrateSettingsFromDB(companyId: string): Promise<ScaleSettings> {
  const remote = await loadSettingsFromDB(companyId);
  if (remote) {
    saveSettings(remote);
    return remote;
  }
  return getSettings();
}

// ─── Capabilities ────────────────────────────────────────────────────────────
export const capabilities = {
  serial: typeof navigator !== "undefined" && "serial" in navigator,
};

// ─── Estado de conexão (singleton) ───────────────────────────────────────────
let serialPort: any | null = null;
let serialReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let abortReading = false;
let lineBuffer = "";
let lastWeight: number | null = null;
const subscribers = new Set<(weightKg: number | null) => void>();

export function isConnected(): boolean {
  return !!serialPort;
}

export function getLastWeight(): number | null {
  return lastWeight;
}

// ─── Conexão serial ──────────────────────────────────────────────────────────
export async function connect(s: ScaleSettings): Promise<string> {
  if (!capabilities.serial) {
    throw new Error("Web Serial não suportado neste navegador. Use Chrome ou Edge.");
  }
  if (serialPort) {
    try { await disconnect(); } catch { /* ignore */ }
  }
  const nav = navigator as any;
  const port = await nav.serial.requestPort();
  await port.open({
    baudRate: s.baudRate,
    dataBits: s.dataBits,
    stopBits: s.stopBits,
    parity: s.parity,
    flowControl: "none",
  });
  serialPort = port;
  abortReading = false;
  void readLoop(s.protocol);
  const info = port.getInfo?.() ?? {};
  const label = info.usbVendorId
    ? `Balança USB ${String(info.usbVendorId).toString(16)}:${String(info.usbProductId ?? 0).toString(16)}`
    : "Balança Serial";
  return label;
}

export async function disconnect(): Promise<void> {
  abortReading = true;
  try {
    if (serialReader) {
      await serialReader.cancel().catch(() => {});
      serialReader.releaseLock();
    }
  } catch { /* ignore */ }
  try {
    if (serialPort) await serialPort.close();
  } catch { /* ignore */ }
  serialReader = null;
  serialPort = null;
  lineBuffer = "";
  lastWeight = null;
  notifySubscribers(null);
}

async function readLoop(protocol: ScaleProtocol) {
  if (!serialPort?.readable) return;
  try {
    serialReader = serialPort.readable.getReader();
    const decoder = new TextDecoder("ascii");
    while (!abortReading) {
      const { value, done } = await serialReader!.read();
      if (done) break;
      if (!value) continue;
      const chunk = decoder.decode(value, { stream: true });
      lineBuffer += chunk;
      // Processa linhas completas (terminadores variados: \r, \n, \r\n, ETX).
      const parts = lineBuffer.split(/[\r\n\x03]+/);
      lineBuffer = parts.pop() ?? "";
      for (const raw of parts) {
        const w = parseLine(raw, protocol);
        if (w !== null) {
          lastWeight = w;
          notifySubscribers(w);
        }
      }
    }
  } catch {
    // Erro/cancelamento — sai silenciosamente; UI mostra desconexão.
  } finally {
    if (serialReader) {
      try { serialReader.releaseLock(); } catch { /* ignore */ }
      serialReader = null;
    }
  }
}

function notifySubscribers(weight: number | null) {
  for (const fn of subscribers) {
    try { fn(weight); } catch { /* ignore */ }
  }
}

/**
 * Inscreve-se para receber leituras de peso conforme a balança envia. Retorna
 * uma função para cancelar a inscrição. Já entrega a última leitura conhecida
 * (se houver) imediatamente.
 */
export function subscribe(fn: (weightKg: number | null) => void): () => void {
  subscribers.add(fn);
  if (lastWeight !== null) {
    try { fn(lastWeight); } catch { /* ignore */ }
  }
  return () => { subscribers.delete(fn); };
}

// ─── Parser ──────────────────────────────────────────────────────────────────
/**
 * Extrai o peso em quilogramas a partir de uma linha recebida da balança.
 * Aceita:
 *   • "P000.255KG"          → 0.255
 *   • "STX 000.255 ETX"     → 0.255   (STX/ETX já removidos pelo split)
 *   • "0,255"               → 0.255
 *   • "PESO+0.255 KG"       → 0.255
 *   • "00255 G"             → 0.255   (gramas → kg)
 *   • "I" / "PESO INSTAVEL" → null    (instável / sem peso)
 *   • "00000.000"           → 0       (peso zero válido)
 */
export function parseLine(raw: string, protocol: ScaleProtocol = "toledo"): number | null {
  if (!raw) return null;
  // Remove STX (0x02), ETX (0x03), ENQ, ACK, NUL e outros caracteres de
  // controle baixos exceto \t.
  const cleaned = raw.replace(/[\x00-\x08\x0b-\x1f]/g, "").trim();
  if (!cleaned) return null;

  // Linhas claramente de status (instável, erro, etc.) — descarta.
  const upper = cleaned.toUpperCase();
  if (/INST|ERR|FAIL|FALHA|MOV/.test(upper) && !/\d/.test(cleaned)) return null;

  // Detecta unidade explicitada na própria linha.
  const isGrams = /(^|[^A-Z])G\b(?!K)/.test(upper) && !/KG/.test(upper);

  // Captura o primeiro número (com vírgula ou ponto). Permite sinal +/-.
  const match = cleaned.match(/[-+]?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const num = Number(match[0].replace(",", "."));
  if (!Number.isFinite(num)) return null;
  if (num < 0) return null; // peso negativo → ignora

  let kg: number;
  if (isGrams) {
    kg = num / 1000;
  } else if (protocol === "urano" && /^\d+$/.test(match[0])) {
    // Urano por padrão envia peso inteiro em gramas (sem casa decimal).
    kg = num / 1000;
  } else {
    kg = num;
  }
  // Filtro de sanidade: balanças comerciais raramente passam de 30 kg.
  if (kg > 200) return null;
  // Arredonda para 3 casas (gramas).
  return Math.round(kg * 1000) / 1000;
}
