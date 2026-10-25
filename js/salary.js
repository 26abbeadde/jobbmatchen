// Lönenivå per yrke från SCB:s lönestrukturstatistik (median och spridning,
// alla sektorer, båda könen, senaste året).

import { SCB_SALARY_TABLE } from './config.js';

const CONTENTS = { median: '000007CE', p10: '000007CF', p90: '000007CI' };

// Gör om SCB:s svar till { "2512": { median, p10, p90 } }. Prickade värden ("..")
// betyder att uppgiften saknas eller är för osäker för att redovisas.
export function parseScb(json) {
  const cols = json.columns.filter((c) => c.type === 'c').map((c) => c.code);
  const key = Object.fromEntries(Object.entries(CONTENTS).map(([k, code]) => [code, k]));
  const out = {};
  for (const row of json.data) {
    const ssyk = row.key[1];
    const entry = {};
    row.values.forEach((v, i) => { const n = Number(v); if (Number.isFinite(n) && n > 0) entry[key[cols[i]]] = n; });
    if (entry.median) out[ssyk] = entry;
  }
  return out;
}

export async function fetchSalaries(fetchImpl = fetch) {
  const meta = await (await fetchImpl(SCB_SALARY_TABLE)).json();
  const years = meta.variables.find((v) => v.code === 'Tid').values;
  const year = years[years.length - 1];
  const body = {
    query: [
      { code: 'Sektor', selection: { filter: 'item', values: ['0'] } },
      { code: 'Yrke2012', selection: { filter: 'all', values: ['*'] } },
      { code: 'Kon', selection: { filter: 'item', values: ['1+2'] } },
      { code: 'ContentsCode', selection: { filter: 'item', values: Object.values(CONTENTS) } },
      { code: 'Tid', selection: { filter: 'item', values: [year] } },
    ],
    response: { format: 'json' },
  };
  // Utan Content-Type-huvud blir det en "enkel" förfrågan. SCB:s server svarar
  // inte på den förhandskontroll (CORS preflight) som ett JSON-huvud skulle utlösa.
  const res = await fetchImpl(SCB_SALARY_TABLE, { method: 'POST', body: JSON.stringify(body) });
  if (!res.ok) throw new Error('SCB svarade ' + res.status);
  return { year, bySsyk: parseScb(await res.json()) };
}

// SSYK-kod för en annons: Platsbanken anger den direkt, andra källor via yrkesgruppens id.
export const ssykFor = (ad, conceptToSsyk = {}) =>
  ad.occupation_group?.legacy_ams_taxonomy_id || conceptToSsyk[ad.occupation_group?.concept_id] || null;

export function salaryFor(ad, salaries, conceptToSsyk) {
  const ssyk = ssykFor(ad, conceptToSsyk);
  const s = ssyk && salaries?.bySsyk[ssyk];
  return s ? { ...s, ssyk, year: salaries.year, occupation: ad.occupation_group?.label } : null;
}

export const kr = (n) => `${n.toLocaleString('sv-SE')} kr`;
