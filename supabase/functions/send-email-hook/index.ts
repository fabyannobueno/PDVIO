// Supabase Auth "Send Email" hook — sends branded emails via Brevo (Sendinblue)
// Deploy with:  supabase functions deploy send-email-hook --no-verify-jwt
// Then in Dashboard → Auth → Hooks, add an HTTPS hook pointing to this function URL,
// using the secret from BREVO_HOOK_SECRET as the "Send Email" hook secret.

// deno-lint-ignore-file no-explicit-any
import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const BREVO_FROM_EMAIL = Deno.env.get("BREVO_FROM_EMAIL") ?? "no-reply@pdvio.com.br";
const BREVO_FROM_NAME = Deno.env.get("BREVO_FROM_NAME") ?? "PDVIO";
const HOOK_SECRET = (Deno.env.get("SEND_EMAIL_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
const APP_URL = Deno.env.get("APP_URL") ?? "https://app.pdvio.com.br";
// SUPABASE_URL and SUPABASE_ANON_KEY are automatically injected by Supabase Edge Functions runtime
const SUPABASE_PROJECT_URL = Deno.env.get("SUPABASE_URL") ?? "https://luznrsvdmlwcajoxaekn.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

type EmailActionType =
  | "signup"
  | "recovery"
  | "magiclink"
  | "invite"
  | "email_change_current"
  | "email_change_new"
  | "reauthentication";

interface HookPayload {
  user: { email: string; user_metadata?: { full_name?: string } };
  email_data: {
    token: string;
    token_hash: string;
    redirect_to: string;
    email_action_type: EmailActionType;
    site_url: string;
    token_new?: string;
    token_hash_new?: string;
  };
}

function buildActionUrl(p: HookPayload): string {
  const { token_hash, email_action_type, redirect_to } = p.email_data;
  const base = APP_URL.replace(/\/$/, "");

  // Map each Supabase auth action to a friendly path on our own domain.
  // The page handles the token via supabase.auth.verifyOtp({ token_hash, type }).
  const pathByAction: Record<string, string> = {
    signup: "/auth/confirm",
    invite: "/auth/confirm",
    magiclink: "/auth/confirm",
    email_change_current: "/auth/confirm",
    email_change_new: "/auth/confirm",
    recovery: "/reset-password",
    reauthentication: "/auth/confirm",
  };
  const path = pathByAction[email_action_type] ?? "/auth/confirm";

  const url = new URL(`${base}${path}`);
  url.searchParams.set("token_hash", token_hash);
  url.searchParams.set("type", email_action_type);
  if (redirect_to) url.searchParams.set("next", redirect_to);
  return url.toString();
}

// PDVIO brand
const BRAND_LOGO = "https://app.pdvio.com.br/logo-pdvio-light.png";
const BRAND_PRIMARY = "#a83dca";        // hsl(283 68% 52%)
const BRAND_PRIMARY_GLOW = "#ec5cf2";   // hsl(300 80% 62%)
const BRAND_GRADIENT = `linear-gradient(135deg, ${BRAND_PRIMARY}, ${BRAND_PRIMARY_GLOW})`;

function shell(content: string, preheader: string) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>PDVIO</title>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#0f172a;">
<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,.06),0 8px 24px rgba(15,23,42,.06);">
      <tr><td style="background:${BRAND_GRADIENT};padding:28px 32px;text-align:center;">
        <img src="${BRAND_LOGO}" alt="PDVIO" height="40" style="display:inline-block;height:40px;width:auto;border:0;outline:none;text-decoration:none;" />
      </td></tr>
      <tr><td style="padding:32px 36px 28px 36px;">${content}</td></tr>
      <tr><td style="padding:0 36px 28px 36px;border-top:1px solid #e2e8f0;">
        <p style="font-size:12px;color:#64748b;margin:18px 0 0 0;line-height:1.55;">
          Você está recebendo este email porque uma ação foi solicitada na sua conta PDVIO.<br/>
          Se não foi você, pode ignorar esta mensagem com segurança.
        </p>
        <p style="font-size:12px;color:#94a3b8;margin:12px 0 0 0;">
          © ${new Date().getFullYear()} PDVIO — A plataforma do seu PDV.
        </p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

function btn(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;">
    <tr><td style="border-radius:10px;background:${BRAND_GRADIENT};">
      <a href="${href}" style="display:inline-block;padding:14px 30px;font-weight:600;font-size:15px;color:#ffffff;text-decoration:none;border-radius:10px;">${label}</a>
    </td></tr></table>`;
}

function fallback(href: string) {
  return `<p style="font-size:13px;color:#64748b;margin:8px 0 0 0;line-height:1.55;">
    Se o botão não funcionar, copie e cole este link no seu navegador:<br/>
    <a href="${href}" style="color:#2563eb;word-break:break-all;">${href}</a>
  </p>`;
}

function template(p: HookPayload): { subject: string; html: string; preheader: string } {
  const action = p.email_data.email_action_type;
  const name = p.user.user_metadata?.full_name?.split(" ")[0] ?? "";
  const href = buildActionUrl(p);
  const greet = name ? `Olá, ${name}!` : "Olá!";

  switch (action) {
    case "signup": {
      const subject = "Confirme seu email — PDVIO";
      const preheader = "Confirme seu email para ativar sua conta no PDVIO.";
      const body = `
        <h1 style="font-size:22px;margin:0 0 12px 0;color:#0f172a;">${greet}</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">
          Bem-vindo ao <strong>PDVIO</strong>! Para ativar sua conta e começar a vender, confirme seu email clicando no botão abaixo.
        </p>
        ${btn(href, "Confirmar meu email")}
        ${fallback(href)}`;
      return { subject, html: shell(body, preheader), preheader };
    }
    case "recovery": {
      const subject = "Recupere sua senha — PDVIO";
      const preheader = "Use o link para criar uma nova senha de acesso ao PDVIO.";
      const body = `
        <h1 style="font-size:22px;margin:0 0 12px 0;color:#0f172a;">${greet}</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">
          Recebemos um pedido para redefinir a senha da sua conta no <strong>PDVIO</strong>. Clique no botão abaixo para criar uma nova senha. Este link expira em 1 hora.
        </p>
        ${btn(href, "Redefinir minha senha")}
        ${fallback(href)}`;
      return { subject, html: shell(body, preheader), preheader };
    }
    case "magiclink": {
      const subject = "Seu link de acesso — PDVIO";
      const preheader = "Use este link para entrar no PDVIO sem digitar senha.";
      const body = `
        <h1 style="font-size:22px;margin:0 0 12px 0;color:#0f172a;">${greet}</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">Use o botão abaixo para entrar diretamente no PDVIO.</p>
        ${btn(href, "Entrar no PDVIO")}
        ${fallback(href)}`;
      return { subject, html: shell(body, preheader), preheader };
    }
    case "invite": {
      const subject = "Você foi convidado para o PDVIO";
      const preheader = "Aceite o convite e crie sua conta no PDVIO.";
      const body = `
        <h1 style="font-size:22px;margin:0 0 12px 0;color:#0f172a;">${greet}</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">Você foi convidado para participar do <strong>PDVIO</strong>. Aceite o convite e defina sua senha:</p>
        ${btn(href, "Aceitar convite")}
        ${fallback(href)}`;
      return { subject, html: shell(body, preheader), preheader };
    }
    case "email_change_current":
    case "email_change_new": {
      const subject = "Confirme a alteração de email — PDVIO";
      const preheader = "Confirme a troca do email da sua conta PDVIO.";
      const body = `
        <h1 style="font-size:22px;margin:0 0 12px 0;color:#0f172a;">${greet}</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">Confirme a alteração de email da sua conta clicando no botão:</p>
        ${btn(href, "Confirmar alteração")}
        ${fallback(href)}`;
      return { subject, html: shell(body, preheader), preheader };
    }
    case "reauthentication": {
      const subject = "Código de confirmação — PDVIO";
      const preheader = "Seu código de verificação para o PDVIO.";
      const body = `
        <h1 style="font-size:22px;margin:0 0 12px 0;color:#0f172a;">${greet}</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 8px 0;">Use o código abaixo para concluir sua ação:</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f1f5f9;border-radius:12px;padding:18px;text-align:center;color:#0f172a;margin:18px 0;">${p.email_data.token}</div>`;
      return { subject, html: shell(body, preheader), preheader };
    }
    default: {
      const subject = "Notificação — PDVIO";
      const body = `<p style="font-size:15px;line-height:1.6;color:#334155;">Acesse sua conta no PDVIO:</p>${btn(href, "Abrir PDVIO")}${fallback(href)}`;
      return { subject, html: shell(body, "PDVIO"), preheader: "PDVIO" };
    }
  }
}

async function sendBrevo(to: string, subject: string, html: string) {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: BREVO_FROM_NAME, email: BREVO_FROM_EMAIL },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Brevo error ${r.status}: ${text}`);
  }
}

Deno.serve(async (req) => {
  try {
    const raw = await req.text();
    const headers = Object.fromEntries(req.headers);

    let payload: HookPayload;
    if (HOOK_SECRET) {
      const wh = new Webhook(HOOK_SECRET);
      payload = wh.verify(raw, headers) as HookPayload;
    } else {
      payload = JSON.parse(raw) as HookPayload;
    }

    const { subject, html } = template(payload);
    await sendBrevo(payload.user.email, subject, html);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("send-email-hook error:", err);
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: String((err as any)?.message ?? err) } }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
});
