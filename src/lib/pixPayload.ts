// Geração local do payload PIX estático (BR Code) — sem API.

export type PixKeyType = "cpf" | "cnpj" | "email" | "telefone" | "aleatoria";

/**
 * Normaliza a chave PIX conforme as regras do BACEN para inclusão no BR Code.
 * - cpf: somente dígitos
 * - cnpj: somente dígitos
 * - telefone: somente dígitos prefixados com +55
 * - email: minúsculo, sem espaços
 * - aleatoria: sem alteração
 */
export function formatPixKey(key: string, type: PixKeyType): string {
  const v = (key ?? "").trim();
  switch (type) {
    case "cpf":
      return v.replace(/\D+/g, "");
    case "cnpj":
      return v.replace(/\D+/g, "");
    case "telefone": {
      const digits = v.replace(/\D+/g, "");
      if (!digits) return "";
      // Se já vier com 55 no começo, mantém; caso contrário, prefixa.
      const withCountry = digits.startsWith("55") ? digits : `55${digits}`;
      return `+${withCountry}`;
    }
    case "email":
      return v.toLowerCase();
    case "aleatoria":
    default:
      return v;
  }
}

/** Remove acentos e caracteres não permitidos para o BR Code. */
function sanitizeAscii(s: string, max: number): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z0-9 .,\-/]/g, "")
    .trim()
    .slice(0, max);
}

function tlv(id: string, value: string): string {
  const size = String(value.length).padStart(2, "0");
  return id + size + value;
}

function crc16(data: string): string {
  const polynomial = 0x1021;
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ polynomial : crc << 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export interface GeneratePixOptions {
  pixKey: string;
  pixKeyType: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  txid?: string;
  description?: string;
}

/** Gera o payload (BR Code) PIX estático pronto para virar QR Code. */
export function generatePixPayload(opts: GeneratePixOptions): string {
  const key = formatPixKey(opts.pixKey, opts.pixKeyType);
  if (!key) throw new Error("Chave PIX vazia.");

  const merchantName = sanitizeAscii(opts.merchantName || "RECEBEDOR", 25);
  const merchantCity = sanitizeAscii(opts.merchantCity || "BRASIL", 15);
  const txid = sanitizeAscii(opts.txid || "***", 25) || "***";
  const description = opts.description ? sanitizeAscii(opts.description, 50) : "";

  const gui = tlv("00", "br.gov.bcb.pix");
  const keyTlv = tlv("01", key);
  const descTlv = description ? tlv("02", description) : "";
  const merchantAccountInfo = tlv("26", gui + keyTlv + descTlv);

  const additionalData = tlv("62", tlv("05", txid));

  const amountStr =
    typeof opts.amount === "number" && opts.amount > 0
      ? opts.amount.toFixed(2)
      : "";

  const payload =
    tlv("00", "01") +
    merchantAccountInfo +
    tlv("52", "0000") +
    tlv("53", "986") +
    (amountStr ? tlv("54", amountStr) : "") +
    tlv("58", "BR") +
    tlv("59", merchantName) +
    tlv("60", merchantCity) +
    additionalData;

  const withCrcPlaceholder = payload + "63" + "04";
  const crc = crc16(withCrcPlaceholder);
  return payload + "63" + "04" + crc;
}

/** Gera um TXID alfanumérico em maiúsculas (até 25 chars). */
export function generateTxId(length = 20): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let out = "";
  for (let i = 0; i < length; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
