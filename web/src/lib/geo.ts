import { useEffect, useState } from 'react';
import type { Weather } from './api';

export type Pos = { lat: number; lng: number; accuracy: number };
export type GeoState = { pos: Pos | null; error: string | null };

export function useLocation(): GeoState {
  const [state, setState] = useState<GeoState>({ pos: null, error: null });
  useEffect(() => {
    const mock = import.meta.env.DEV && new URLSearchParams(location.search).get('geo');
    if (mock) {
      const [lat, lng] = mock.split(',').map(Number);
      setState({ pos: { lat, lng, accuracy: 8 }, error: null });
      return;
    }
    if (!navigator.geolocation) {
      setState({ pos: null, error: 'Din telefon saknar GPS-stöd i webbläsaren.' });
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (p) => setState({ pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }, error: null }),
      (e) => setState((s) => ({ ...s, error: e.code === 1 ? 'Tillåt plats i webbläsaren så ser vi var du fiskar.' : 'Hittar ingen GPS-position.' })),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);
  return state;
}

const cache = new Map<string, Promise<unknown>>();
function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!cache.has(key)) {
    const p = fn().catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return cache.get(key) as Promise<T>;
}

// Ungefär 1 km-rutor så vi inte spammar externa tjänster när man rör sig.
const cell = (lat: number, lng: number) => `${lat.toFixed(2)},${lng.toFixed(2)}`;

export function fetchWeather(lat: number, lng: number): Promise<Weather> {
  return cached(`w:${cell(lat, lng)}`, async () => {
    const q = new URLSearchParams({
      latitude: String(lat), longitude: String(lng), wind_speed_unit: 'ms',
      current: 'temperature_2m,wind_speed_10m,wind_direction_10m,surface_pressure,cloud_cover,weather_code',
    });
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`);
    if (!r.ok) throw new Error('väder');
    const c = (await r.json()).current;
    return {
      temp: c.temperature_2m, wind: c.wind_speed_10m, windDir: c.wind_direction_10m,
      pressure: c.surface_pressure, cloud: c.cloud_cover, code: c.weather_code,
    };
  });
}

const WATER_TYPES = ['water', 'bay', 'strait', 'sea', 'lake'];

export function fetchLake(lat: number, lng: number): Promise<string | null> {
  return cached(`l:${cell(lat, lng)}`, async () => {
    const nom = (extra: string) =>
      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=sv&lat=${lat}&lon=${lng}&${extra}`, {
        signal: AbortSignal.timeout(8000),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null);

    // 1) Närmaste namngivna vatten (snabbt och pålitligt).
    const water = await nom('layer=natural&zoom=14');
    if (water?.name && WATER_TYPES.includes(water.type)) return water.name as string;

    // 2) Overpass hittar även stora sjöar som man står mitt i – men publika servern är ofta överbelastad.
    const ql = `[out:json][timeout:8];is_in(${lat},${lng})->.a;
      (area.a["natural"="water"]["name"]; area.a["place"="sea"]["name"];);out tags 5;`;
    try {
      const r = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST', body: new URLSearchParams({ data: ql }), signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        const els = (await r.json()).elements as { tags?: { name?: string } }[];
        const name = els.map((e) => e.tags?.name).find(Boolean);
        if (name) return name;
      }
    } catch { /* faller tillbaka nedan */ }

    // 3) Ort i närheten.
    const place = await nom('zoom=12');
    const a = place?.address ?? {};
    const near = a.village ?? a.town ?? a.city ?? a.municipality ?? a.county;
    return near ? `nära ${near}` : null;
  });
}

const CODES: [number[], string, string][] = [
  [[0], 'Soligt', '☀️'], [[1, 2], 'Mest klart', '🌤️'], [[3], 'Mulet', '☁️'],
  [[45, 48], 'Dimma', '🌫️'], [[51, 53, 55, 56, 57], 'Duggregn', '🌦️'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Regn', '🌧️'], [[71, 73, 75, 77, 85, 86], 'Snö', '🌨️'],
  [[95, 96, 99], 'Åska', '⛈️'],
];
export function describeWeather(code: number): { label: string; icon: string } {
  const hit = CODES.find(([codes]) => codes.includes(code));
  return hit ? { label: hit[1], icon: hit[2] } : { label: 'Okänt', icon: '🌡️' };
}
export function windDirName(deg: number) {
  return ['N', 'NO', 'O', 'SO', 'S', 'SV', 'V', 'NV'][Math.round(deg / 45) % 8];
}

// Verkliga tips som beror på lufttryck – roligt för nybörjare.
export function fishingTip(w: Weather): string {
  if (w.pressure < 1000) return 'Lågt lufttryck – fisken är ofta på hugget före ett oväder 🎣';
  if (w.pressure > 1020) return 'Högt lufttryck – fisken kan vara lite trög, testa mindre beten 🤏';
  if (w.wind > 8) return 'Blåsigt! Fiska i lä och ta det försiktigt i båten ⛵';
  return 'Bra förhållanden – lycka till! 🍀';
}
