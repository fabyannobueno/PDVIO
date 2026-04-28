export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
  type: string;
}

const cache = new Map<number, { ts: number; data: Holiday[] }>();
const TTL = 7 * 24 * 60 * 60 * 1000; // 7 dias

export async function fetchHolidays(year: number): Promise<Holiday[]> {
  const hit = cache.get(year);
  if (hit && Date.now() - hit.ts < TTL) return hit.data;
  const res = await fetch(`https://brasilapi.com.br/api/feriados/v1/${year}`);
  if (!res.ok) throw new Error(`Holidays HTTP ${res.status}`);
  const data = (await res.json()) as Holiday[];
  cache.set(year, { ts: Date.now(), data });
  return data;
}

function brasiliaParts(d: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
  return {
    iso: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"), // Mon, Tue, ...
    hour: parseInt(get("hour"), 10),
    minute: parseInt(get("minute"), 10),
    year: parseInt(get("year"), 10),
  };
}

export interface SupportStatus {
  open: boolean;
  reason: string;
  todayHoliday?: Holiday | null;
}

export async function getSupportStatus(now = new Date()): Promise<SupportStatus> {
  const p = brasiliaParts(now);
  let holidays: Holiday[] = [];
  try {
    holidays = await fetchHolidays(p.year);
  } catch {
    holidays = [];
  }
  const todayHoliday = holidays.find((h) => h.date === p.iso) || null;
  const isWeekend = p.weekday === "Sat" || p.weekday === "Sun";
  const minutes = p.hour * 60 + p.minute;
  const inHours = minutes >= 9 * 60 && minutes < 18 * 60;

  if (todayHoliday) {
    return { open: false, reason: `Feriado: ${todayHoliday.name}`, todayHoliday };
  }
  if (isWeekend) {
    return { open: false, reason: "Final de semana", todayHoliday: null };
  }
  if (!inHours) {
    return { open: false, reason: "Fora do horário (09h–18h)", todayHoliday: null };
  }
  return { open: true, reason: "Atendimento disponível", todayHoliday: null };
}
