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
