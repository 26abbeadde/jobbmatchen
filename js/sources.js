// Hämtar annonser: Platsbanken (JobSearch) och andra jobbsajter (JobTech Links).

import { SEARCH_API, LINKS_API, BASE_PAGES, LINKS_PAGES } from './config.js';
import { dedupe } from './matching.js';

export async function fetchJson(base, pairs, fetchImpl = fetch) {
  const url = new URL(base);
  pairs.forEach(([k, v]) => { if (v !== '' && v != null) url.searchParams.append(k, v); });
  const res = await fetchImpl(url, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(`Annonstjänsten svarade ${res.status}`);
  return res.json();
}

export const isAfLink = (link) => /arbetsformedlingen\.se/i.test(link?.label || link?.url || '');

// Links-annonser har ett annat format. Gör om dem så att resten av appen kan
// behandla dem som vanliga annonser. De har bara en kort sammanfattning.
export function normalizeLinksAd(hit) {
  const link = (hit.source_links || []).find((l) => !isAfLink(l)) || hit.source_links?.[0] || {};
  const addresses = hit.workplace_addresses || [];
  const addr = addresses.find((a) => a.municipality) || addresses[0] || {};
  return {
    id: 'link-' + hit.id,
    headline: hit.headline,
    description: { text: hit.brief || '' },
    employer: hit.employer || {},
    occupation: hit.occupation_group ? { label: hit.occupation_group.label } : null,
    occupation_group: hit.occupation_group,
    occupation_field: hit.occupation_field,
    workplace_address: { municipality: addr.municipality || null, region: addr.region || null, country: addr.country || null },
    publication_date: hit.publication_date,
    webpage_url: link.url,
    _source: link.label || 'annan jobbsajt',
  };
}

// Annonser som bara finns på andra sajter; de som även ligger i Platsbanken
// hämtas redan med fullständig text via JobSearch.
export const externalOnly = (hits) => hits.filter((h) => !(h.source_links || []).some(isAfLink)).map(normalizeLinksAd);

// Annonser från andra jobbsajter, för sig. Används när Links-sökningen måste
// göras efter Platsbanken-sökningen (t.ex. med län som tagits fram ur den).
export async function fetchExternal({ linksPairs, days = 7, now = Date.now(), fetchImpl = fetch }) {
  // Links anger bara datum, inte klockslag, så hela den första dagen räknas med.
  const since = new Date(now - days * 86400000).toISOString().slice(0, 10) + 'T00:00:00';
  const dayCutoff = new Date(now - days * 86400000); dayCutoff.setHours(0, 0, 0, 0);
  const pages = await Promise.allSettled(Array.from({ length: LINKS_PAGES }, (_, p) =>
    fetchJson(LINKS_API, [...linksPairs, ['published-after', since], ['sort', 'pubdate-desc'], ['limit', 100], ['offset', p * 100]], fetchImpl)));
  return pages.filter((r) => r.status === 'fulfilled')
    .flatMap((r) => externalOnly(r.value.hits))
    .filter((ad) => new Date(ad.publication_date) >= dayCutoff);
}

export async function searchAds({ pairs, linksPairs = null, queryTerms = [], days = 7, now = Date.now(), fetchImpl = fetch }) {
  const sort = ['sort', 'pubdate-desc'];
  const jobsearch = [];
  for (let p = 0; p < BASE_PAGES; p++) {
    jobsearch.push(fetchJson(SEARCH_API, [...pairs, ['published-after', days * 24 * 60], sort, ['limit', 100], ['offset', p * 100]], fetchImpl));
  }
  // Riktade sökningar per nyckelord, så att träffar inte missas när det finns
  // fler annonser än vi hämtar.
  queryTerms.forEach((q) => jobsearch.push(fetchJson(SEARCH_API, [...pairs, ['published-after', days * 24 * 60], ['q', q], sort, ['limit', 100]], fetchImpl)));

  const [js, external] = await Promise.all([
    Promise.allSettled(jobsearch),
    linksPairs ? fetchExternal({ linksPairs, days, now, fetchImpl }) : [],
  ]);
  const ok = js.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  if (!ok.length) throw js[0].reason;

  const cutoff = now - days * 86400000;
  const byId = new Map();
  ok.forEach((r) => r.hits.forEach((ad) => {
    if (!byId.has(ad.id) && new Date(ad.publication_date).getTime() >= cutoff) byId.set(ad.id, ad);
  }));
  external.forEach((ad) => { if (!byId.has(ad.id)) byId.set(ad.id, ad); });

  const ads = dedupe([...byId.values()]);
  return { ads, total: ok[0].total?.value ?? 0, external: ads.filter((a) => a._source).length };
}
