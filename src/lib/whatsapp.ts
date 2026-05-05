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
 * Envia um código de verificação de 6 dígitos via WhatsApp para o número informado,
 * usando as credenciais globais VITE_WAPI_INSTANCE_ID / VITE_WAPI_TOKEN.
 * Retorna o código gerado para que o chamador possa comparar com o que o usuário digitar.
 */
export async function sendWhatsAppVerificationCode(
  phone: string,
): Promise<WhatsAppSendResult & { code?: string }> {
  const instanceId = import.meta.env.VITE_WAPI_INSTANCE_ID as string | undefined;
  const token = import.meta.env.VITE_WAPI_TOKEN as string | undefined;

  if (!instanceId || !token) {
    return { ok: false, error: "Credenciais W-API (VITE_WAPI_INSTANCE_ID / VITE_WAPI_TOKEN) não configuradas." };
  }

  if (!phone) {
    return { ok: false, error: "Número não informado." };
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const clean = phone.replace(/\D/g, "");
  const formatted = clean.startsWith("55") ? clean : `55${clean}`;
  const message = `🔐 Seu código de verificação PDVIO é: *${code}*\n\nInsira esse código no painel para confirmar o WhatsApp da sua loja.`;

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

    if (response.status === 401 || response.status === 403) {
      return { ok: false, error: `Token W-API inválido ou sem permissão (HTTP ${response.status}).` };
    }

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try { const b = await response.json(); errMsg = b?.message ?? errMsg; } catch {}
      return { ok: false, error: errMsg };
    }

    return { ok: true, code };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? "Erro de conexão." };
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
