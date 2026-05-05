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

export interface WhatsAppVerifyResult {
  ok: boolean;
  exists: boolean;
  error?: string;
}

/**
 * Verifica se um número de telefone tem WhatsApp ativo, usando as credenciais
 * globais VITE_WAPI_INSTANCE_ID / VITE_WAPI_TOKEN definidas no ambiente.
 * Persiste o resultado (delivery_whatsapp_verified) na tabela companies —
 * essa responsabilidade fica no chamador.
 */
export async function verifyDeliveryWhatsappNumber(
  phone: string,
): Promise<WhatsAppVerifyResult> {
  const instanceId = import.meta.env.VITE_WAPI_INSTANCE_ID as string | undefined;
  const token = import.meta.env.VITE_WAPI_TOKEN as string | undefined;

  if (!instanceId || !token) {
    return { ok: false, exists: false, error: "Credenciais W-API (VITE_WAPI_INSTANCE_ID / VITE_WAPI_TOKEN) não configuradas." };
  }

  if (!phone) {
    return { ok: false, exists: false, error: "Número não informado." };
  }

  const clean = phone.replace(/\D/g, "");
  const formatted = clean.startsWith("55") ? clean : `55${clean}`;

  const url = `https://api.w-api.app/v1/contact/check-number?instanceId=${instanceId}&phone=${formatted}`;

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401 || response.status === 403) {
      return { ok: false, exists: false, error: `Token W-API inválido ou sem permissão (HTTP ${response.status}).` };
    }

    let body: any = {};
    try { body = await response.json(); } catch {}

    if (!response.ok) {
      return { ok: false, exists: false, error: body?.message ?? `HTTP ${response.status}` };
    }

    return { ok: true, exists: !!body?.exists };
  } catch (err: any) {
    return { ok: false, exists: false, error: err?.message ?? "Erro de conexão." };
  }
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
 * Testa a conexão com a instância W-API.
 * Usa o endpoint de envio com um número inválido — se a resposta não for
 * 401/403, as credenciais são válidas e a instância está acessível.
 */
export async function testWApiConnection(
  credentials: WApiCredentials,
): Promise<WhatsAppSendResult> {
  const { instanceId, token } = credentials;

  if (!instanceId || !token) {
    return { ok: false, error: "Preencha o Instance ID e o Token antes de testar." };
  }

  const url = `https://api.w-api.app/v1/message/send-text?instanceId=${instanceId}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ phone: "000", message: "__test__", delayMessage: 0 }),
    });

    // 401 / 403 → credenciais inválidas
    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: "Token inválido ou sem permissão (HTTP " + response.status + ")." };
    }

    // Qualquer outra resposta (200, 400, 422…) indica que a instância está
    // acessível e as credenciais são aceitas.
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Erro de conexão." };
  }
}
