const BASE_URL = import.meta.env.VITE_URL_API_PIX as string;
const CHAVE_PIX = import.meta.env.VITE_CHAVE_PIX as string;

export interface PixCobResponse {
  txid: string;
  status: string;
  pixCopiaECola: string;
  location: string;
  loc: { id: number; location: string; tipoCob: string; criacao: string };
  valor: { original: string };
  calendario: { criacao: string; expiracao: number };
  solicitacaoPagador: string;
  chave: string;
}

export interface PixStatusResponse {
  txid: string;
  status: "ATIVA" | "CONCLUIDA" | "EXPIRADA" | "REMOVIDA_PELO_USUARIO_RECEBEDOR" | "REMOVIDA_PELO_PSP";
  valor: { original: string };
  calendario?: { criacao: string; expiracao: number };
  pix?: Array<{ endToEndId: string; valor: string; horario: string }>;
}

export async function createPixCharge(
  valor: number,
  solicitacaoPagador: string
): Promise<PixCobResponse> {
  const response = await fetch(`${BASE_URL}/api/pix/cob?env=production`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      valor: valor.toFixed(2),
      chave: CHAVE_PIX,
      solicitacaoPagador,
      expiracao: 3600,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "");
    throw new Error(`Erro ao criar cobrança PIX: ${err}`);
  }

  return response.json();
}

export async function getPixStatus(txid: string): Promise<PixStatusResponse> {
  const response = await fetch(
    `${BASE_URL}/api/pix/cob/${txid}?env=production`
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.warn(`[PIX] getPixStatus txid=${txid} status=${response.status}`, body);
    if (response.status === 404) {
      return { txid, status: "EXPIRADA", valor: { original: "0" } };
    }
    throw new Error(`Erro ao verificar status do pagamento: ${body}`);
  }

  const data: PixStatusResponse = await response.json();

  if (data.status === "ATIVA" && data.calendario?.criacao && data.calendario?.expiracao) {
    const createdAt = new Date(data.calendario.criacao).getTime();
    const expiresAt = createdAt + data.calendario.expiracao * 1000;
    if (Date.now() > expiresAt) {
      console.log(`[PIX] txid=${txid} marcada como EXPIRADA localmente (criacao=${data.calendario.criacao}, expiracao=${data.calendario.expiracao}s)`);
      return { ...data, status: "EXPIRADA" };
    }
  }

  return data;
}
