export interface Geo {
  name: string;
  state: string;
  latitude: number;
  longitude: number;
}

export interface CurrentWeather {
  temperature: number;
  apparent: number;
  weatherCode: number;
  humidity: number;
  windKmh: number;
  precipitationProb: number;
  isDay: boolean;
  description: string;
  icon: string; // emoji
}

const GEO_STORAGE_KEY = "openmeteo:geo:v1";

const geoCache = new Map<string, Geo | null>(
  (() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(GEO_STORAGE_KEY) : null;
      return raw ? (JSON.parse(raw) as [string, Geo | null][]) : [];
    } catch { return []; }
  })()
);

function persistGeoCache() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(GEO_STORAGE_KEY, JSON.stringify(Array.from(geoCache.entries())));
    }
  } catch { /* ignore */ }
}

export function geoCacheKey(city: string, state: string) {
  return `${city.trim().toLowerCase()}|${state.trim().toUpperCase()}`;
}

export function getCachedGeo(city: string, state: string): Geo | null {
  return geoCache.get(geoCacheKey(city, state)) ?? null;
}

export async function geocodeCity(city: string, state: string): Promise<Geo | null> {
  const key = geoCacheKey(city, state);
  if (geoCache.has(key)) return geoCache.get(key) ?? null;
  if (!city.trim()) {
    geoCache.set(key, null);
    persistGeoCache();
    return null;
  }
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&country=BR&language=pt&count=10&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    geoCache.set(key, null);
    persistGeoCache();
    return null;
  }
  const j = (await res.json()) as { results?: Array<{ name: string; admin1?: string; admin1_code?: string; latitude: number; longitude: number }> };
  const list = j.results ?? [];
  const match =
    list.find((r) => (r.admin1_code ?? "").toUpperCase() === state.toUpperCase()) ||
    list.find((r) => r.admin1?.toLowerCase() === state.toLowerCase()) ||
    list[0];
  if (!match) {
    geoCache.set(key, null);
    persistGeoCache();
    return null;
  }
  const geo: Geo = {
    name: match.name,
    state: match.admin1 ?? state,
    latitude: match.latitude,
    longitude: match.longitude,
  };
  geoCache.set(key, geo);
  persistGeoCache();
  return geo;
}

const WEATHER_LABEL: Record<number, { label: string; icon: string }> = {
  0: { label: "Céu limpo", icon: "☀️" },
  1: { label: "Predominantemente limpo", icon: "🌤️" },
  2: { label: "Parcialmente nublado", icon: "⛅" },
  3: { label: "Nublado", icon: "☁️" },
  45: { label: "Neblina", icon: "🌫️" },
  48: { label: "Neblina com gelo", icon: "🌫️" },
  51: { label: "Garoa fraca", icon: "🌦️" },
  53: { label: "Garoa", icon: "🌦️" },
  55: { label: "Garoa forte", icon: "🌧️" },
  61: { label: "Chuva fraca", icon: "🌦️" },
  63: { label: "Chuva", icon: "🌧️" },
  65: { label: "Chuva forte", icon: "🌧️" },
  71: { label: "Neve fraca", icon: "🌨️" },
  73: { label: "Neve", icon: "🌨️" },
  75: { label: "Neve forte", icon: "❄️" },
  80: { label: "Pancadas de chuva", icon: "🌦️" },
  81: { label: "Pancadas fortes", icon: "🌧️" },
  82: { label: "Tempestade de chuva", icon: "⛈️" },
  95: { label: "Trovoadas", icon: "⛈️" },
  96: { label: "Trovoadas com granizo", icon: "⛈️" },
  99: { label: "Tempestade severa", icon: "⛈️" },
};

const WEATHER_STORAGE_KEY = "openmeteo:weather:v1";
const WEATHER_TTL = 15 * 60 * 1000; // 15 min

type WeatherCacheEntry = { ts: number; data: CurrentWeather };

const weatherCache: Map<string, WeatherCacheEntry> = new Map(
  (() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(WEATHER_STORAGE_KEY) : null;
      return raw ? (JSON.parse(raw) as [string, WeatherCacheEntry][]) : [];
    } catch { return []; }
  })()
);

function persistWeatherCache() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(Array.from(weatherCache.entries())));
    }
  } catch { /* ignore */ }
}

function weatherKey(geo: Geo) {
  return `${geo.latitude.toFixed(3)},${geo.longitude.toFixed(3)}`;
}

export function getCachedWeather(geo: Geo): CurrentWeather | null {
  return weatherCache.get(weatherKey(geo))?.data ?? null;
}

export async function fetchCurrentWeather(geo: Geo): Promise<CurrentWeather | null> {
  const k = weatherKey(geo);
  const hit = weatherCache.get(k);
  if (hit && Date.now() - hit.ts < WEATHER_TTL) return hit.data;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${geo.latitude}&longitude=${geo.longitude}&current=temperature_2m,apparent_temperature,relative_humidity_2m,is_day,precipitation_probability,wind_speed_10m,weather_code&timezone=America%2FSao_Paulo`;
  const res = await fetch(url);
  if (!res.ok) return hit?.data ?? null;
  const j = await res.json();
  const c = j.current ?? {};
  const code = Number(c.weather_code ?? 0);
  const meta = WEATHER_LABEL[code] ?? { label: "—", icon: "🌡️" };
  const data: CurrentWeather = {
    temperature: Number(c.temperature_2m ?? 0),
    apparent: Number(c.apparent_temperature ?? 0),
    weatherCode: code,
    humidity: Number(c.relative_humidity_2m ?? 0),
    windKmh: Number(c.wind_speed_10m ?? 0),
    precipitationProb: Number(c.precipitation_probability ?? 0),
    isDay: Number(c.is_day ?? 1) === 1,
    description: meta.label,
    icon: meta.icon,
  };
  weatherCache.set(k, { ts: Date.now(), data });
  persistWeatherCache();
  return data;
}
