// Restid med kollektivtrafik via Trafiklabs ResRobot (kräver en egen, gratis API-nyckel).

import { RESROBOT_API } from './config.js';

// "PT1H5M" -> 65
export function parseDuration(iso) {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso || '');
  if (!m) return null;
  return (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}

// Restiden räknas för att vara framme 08:00 nästa vardag, som en vanlig pendling.
export function nextWeekdayMorning(now = new Date()) {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  const pad = (n) => String(n).padStart(2, '0');
  return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: '08:00' };
}

export const travelKey = (from, to) => `${from.lat.toFixed(3)},${from.lon.toFixed(3)}>${to.lat.toFixed(3)},${to.lon.toFixed(3)}`;

export async function travelMinutes(apiKey, from, to, now = new Date(), fetchImpl = fetch) {
  const { date, time } = nextWeekdayMorning(now);
  const url = new URL(RESROBOT_API);
  url.search = new URLSearchParams({
    format: 'json', accessId: apiKey, date, time, searchForArrival: '1',
    originCoordLat: from.lat, originCoordLong: from.lon, destCoordLat: to.lat, destCoordLong: to.lon,
  });
  const res = await fetchImpl(url);
  if (res.status === 401 || res.status === 403) throw new Error('Trafiklab-nyckeln godkändes inte.');
  if (!res.ok) throw new Error('Reseplaneraren svarade ' + res.status);
  const trips = (await res.json()).Trip || [];
  const minutes = trips.map((t) => parseDuration(t.duration)).filter((m) => m != null);
  return minutes.length ? Math.min(...minutes) : null;
}

export const formatMinutes = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim());
