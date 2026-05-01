// Serviço W-API — envio de mensagens WhatsApp por empresa
// As credenciais (instanceId + token) ficam armazenadas na tabela companies
// e são passadas como parâmetros (nunca hardcoded / env var em produção).

export interface WApiCredentials {
  instanceId: string;
  token: string;
}

export interface WhatsAppSendResult {
  ok: boolean;
  error?: string;
}

/**
 * Envia uma mensagem de texto via W-API.
 * phone: número com DDD, com ou sem +55 (ex: "11999998888" ou "+5511999998888")
 */
export async function sendWhatsAppMessage(
  credentials: WApiCredentials,
  phone: string,
  message: string,
): Promise<WhatsAppSendResult> {
  const { instanceId, token } = credentials;

  if (!instanceId || !token) {
    return { ok: false, error: "Credenciais W-API não configuradas." };
  }

  const clean = phone.replace(/\D/g, "");
  const formatted = clean.startsWith("55") ? clean : `55${clean}`;

  const url = `https://api.w-api.app/v1/message/send-text?instanceId=${instanceId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone: formatted, message, delayMessage: 0 }),
    });

    if (response.ok) {
      return { ok: true };
    }

    let errMsg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      errMsg = body?.message ?? errMsg;
    } catch {}

    return { ok: false, error: errMsg };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Erro de conexão." };
  }
}

/**
 * Testa a conexão com a instância W-API verificando o status dela.
 */
export async function testWApiConnection(
  credentials: WApiCredentials,
): Promise<WhatsAppSendResult> {
  const { instanceId, token } = credentials;

  if (!instanceId || !token) {
    return { ok: false, error: "Preencha o Instance ID e o Token antes de testar." };
  }

  try {
    const response = await fetch(
      `https://api.w-api.app/v1/instance/status?instanceId=${instanceId}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    if (response.ok) {
      const body = await response.json();
      const connected = body?.connected === true || body?.status === "connected";
      if (connected) return { ok: true };
      return { ok: false, error: "Instância desconectada. Escaneie o QR Code no painel W-API." };
    }

    let errMsg = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      errMsg = body?.message ?? errMsg;
    } catch {}
    return { ok: false, error: errMsg };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Erro de conexão." };
  }
}
