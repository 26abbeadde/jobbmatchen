// Hemort för pendlingsavstånd: din position eller en sökt ort/adress.

import { GEOCODE_API } from './config.js';

export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Webbläsaren kan inte ta fram din position.'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, label: 'Min position' }),
      () => reject(new Error('Fick inte tillgång till din position. Skriv in din ort i stället.')),
      { timeout: 15000, maximumAge: 600000 },
    );
  });
}

// Kommunernas ungefärliga mittpunkt, räknad som medelvärdet av koordinaterna
// i de annonser som har sådana. Används för annonser som bara anger kommun.
export function municipalityCentroids(ads, known = {}) {
  const sums = {};
  for (const ad of ads) {
    const name = ad.workplace_address?.municipality;
    const c = ad.workplace_address?.coordinates;
    if (!name || c?.length !== 2 || c[0] == null) continue;
    const s = (sums[name] ||= { lat: 0, lon: 0, n: 0 });
    s.lat += c[1]; s.lon += c[0]; s.n++;
  }
  const out = { ...known };
  for (const [name, s] of Object.entries(sums)) out[name] = { lat: s.lat / s.n, lon: s.lon / s.n };
  return out;
}

// Annonsens position: egna koordinater i första hand, annars kommunens mittpunkt.
export function adPosition(ad, centroids = {}) {
  const c = ad.workplace_address?.coordinates;
  if (c?.length === 2 && c[0] != null) return { lat: c[1], lon: c[0], approx: false };
  const m = centroids[ad.workplace_address?.municipality];
  return m ? { ...m, approx: true } : null;
}

// Slår upp en ort eller adress i Sverige via OpenStreetMap (Nominatim).
export async function geocode(query) {
  const url = new URL(GEOCODE_API);
  url.search = new URLSearchParams({ q: query, format: 'json', limit: '1', countrycodes: 'se', 'accept-language': 'sv' });
  const res = await fetch(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error('Ortsökningen svarade ' + res.status);
  const [hit] = await res.json();
  if (!hit) throw new Error(`Hittade ingen plats som heter "${query}".`);
  return { lat: +hit.lat, lon: +hit.lon, label: hit.display_name.split(',').slice(0, 2).join(',') };
}
