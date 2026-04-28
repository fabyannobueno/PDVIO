export function onlyDigits(value: string): string {
  return (value || "").replace(/\D/g, "");
}

export function isValidCPF(value: string): boolean {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  const calc = (slice: number) => {
    let sum = 0;
    for (let i = 0; i < slice; i++) {
      sum += parseInt(cpf.charAt(i), 10) * (slice + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calc(9) === parseInt(cpf.charAt(9), 10) && calc(10) === parseInt(cpf.charAt(10), 10);
}

export function isValidCNPJ(value: string): boolean {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (digits: string, weights: number[]) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += parseInt(digits.charAt(i), 10) * weights[i];
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

  const d1 = calc(cnpj, w1);
  if (d1 !== parseInt(cnpj.charAt(12), 10)) return false;
  const d2 = calc(cnpj, w2);
  return d2 === parseInt(cnpj.charAt(13), 10);
}

export function isValidDocument(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCPF(digits);
  if (digits.length === 14) return isValidCNPJ(digits);
  return false;
}

export type CnpjData = {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: string | null;
  email: string | null;
  ddd_telefone_1: string | null;
  cnae_fiscal_descricao: string | null;
  situacao_cadastral: string | null;
};

async function fetchReceitaWS(digits: string, signal?: AbortSignal): Promise<Partial<CnpjData> | null> {
  try {
    const res = await fetch(`https://receitaws.com.br/v1/cnpj/${digits}`, { signal });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status === "ERROR") return null;
    return {
      email: data.email || null,
      ddd_telefone_1: data.telefone || null,
      nome_fantasia: data.fantasia || null,
      razao_social: data.nome || "",
      logradouro: data.logradouro || null,
      numero: data.numero || null,
      complemento: data.complemento || null,
      bairro: data.bairro || null,
      municipio: data.municipio || null,
      uf: data.uf || null,
      cep: data.cep || null,
      cnae_fiscal_descricao: data.atividade_principal?.[0]?.text || null,
      situacao_cadastral: data.situacao || null,
    };
  } catch {
    return null;
  }
}

export async function fetchCnpjBrasilAPI(cnpj: string, signal?: AbortSignal): Promise<CnpjData | null> {
  const digits = onlyDigits(cnpj);
  if (digits.length !== 14) return null;

  let primary: CnpjData | null = null;
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`, { signal });
    if (res.ok) {
      const data = await res.json();
      primary = {
        cnpj: digits,
        razao_social: data.razao_social || data.nome_empresarial || "",
        nome_fantasia: data.nome_fantasia || null,
        logradouro: data.logradouro || null,
        numero: data.numero || null,
        complemento: data.complemento || null,
        bairro: data.bairro || null,
        municipio: data.municipio || null,
        uf: data.uf || null,
        cep: data.cep || null,
        email: data.email || null,
        ddd_telefone_1: data.ddd_telefone_1 || null,
        cnae_fiscal_descricao: data.cnae_fiscal_descricao || null,
        situacao_cadastral: data.descricao_situacao_cadastral || null,
      };
    }
  } catch {}

  const needsFallback = !primary || !primary.email || !primary.ddd_telefone_1;
  if (needsFallback) {
    const extra = await fetchReceitaWS(digits, signal);
    if (extra) {
      if (!primary) {
        primary = {
          cnpj: digits,
          razao_social: extra.razao_social || "",
          nome_fantasia: extra.nome_fantasia ?? null,
          logradouro: extra.logradouro ?? null,
          numero: extra.numero ?? null,
          complemento: extra.complemento ?? null,
          bairro: extra.bairro ?? null,
          municipio: extra.municipio ?? null,
          uf: extra.uf ?? null,
          cep: extra.cep ?? null,
          email: extra.email ?? null,
          ddd_telefone_1: extra.ddd_telefone_1 ?? null,
          cnae_fiscal_descricao: extra.cnae_fiscal_descricao ?? null,
          situacao_cadastral: extra.situacao_cadastral ?? null,
        };
      } else {
        primary = {
          ...primary,
          email: primary.email || extra.email || null,
          ddd_telefone_1: primary.ddd_telefone_1 || extra.ddd_telefone_1 || null,
        };
      }
    }
  }

  return primary;
}
