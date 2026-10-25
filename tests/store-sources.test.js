import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, exportData, importData } from '../js/store.js';
import { normalizeLinksAd, externalOnly, searchAds } from '../js/sources.js';

// Minimal ersättning för localStorage.
function memoryStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

test('store sparar inte cachade _-fält', () => {
  const s = createStore(memoryStorage());
  s.set('jm.x', { a: 1, _cache: 'stor' });
  assert.deepEqual(s.get('jm.x'), { a: 1 });
  assert.equal(s.get('jm.saknas', 'standard'), 'standard');
});

test('export utesluter API-nyckel och cacher, import återställer', () => {
  const src = memoryStorage({
    'jm.keywords': '["junior"]', 'jm.apiKey': '"hemlig"', 'jm.taxonomy': '{}', 'annat': '1',
  });
  const file = exportData(src, new Date('2026-10-25'));
  assert.deepEqual(Object.keys(file.data), ['jm.keywords']);

  const dst = memoryStorage();
  assert.equal(importData(dst, JSON.parse(JSON.stringify(file))), 1);
  assert.equal(dst.getItem('jm.keywords'), '["junior"]');
});

test('import vägrar okända filer och farliga nycklar', () => {
  assert.throws(() => importData(memoryStorage(), { hej: 1 }), /ingen export/);
  const dst = memoryStorage();
  assert.equal(importData(dst, { app: 'jobbmatchen', data: { 'jm.apiKey': 'x', 'annat': 1 } }), 0);
  assert.equal(dst.length, 0);
});

const linksHit = (id, labels) => ({
  id, headline: 'Jobb ' + id, brief: 'Kort text', employer: { name: 'X AB' },
  occupation_group: { label: 'Systemutvecklare', concept_id: 'g' },
  workplace_addresses: [{ municipality: '', region: '' }, { municipality: 'Lund', region: 'Skåne län' }],
  publication_date: '2026-10-24T00:00:00',
  source_links: labels.map((l) => ({ label: l, url: `https://${l}/annons/${id}` })),
});

test('Links-annonser görs om till vanligt format', () => {
  const ad = normalizeLinksAd(linksHit('a', ['studentjob.se']));
  assert.equal(ad.id, 'link-a');
  assert.equal(ad.description.text, 'Kort text');
  assert.equal(ad.workplace_address.municipality, 'Lund');
  assert.equal(ad.webpage_url, 'https://studentjob.se/annons/a');
  assert.equal(ad._source, 'studentjob.se');
});

test('Links-annonser som också finns i Platsbanken hoppas över', () => {
  const ads = externalOnly([linksHit('a', ['arbetsformedlingen.se']), linksHit('b', ['ledigajobb.se'])]);
  assert.deepEqual(ads.map((a) => a.id), ['link-b']);
});

test('searchAds slår ihop källor, filtrerar på datum och tar bort dubbletter', async () => {
  const now = new Date('2026-10-25T12:00:00').getTime();
  const jsHit = (id, date, headline = 'Jobb ' + id) => ({ id, headline, employer: { name: 'X AB' }, publication_date: date, workplace_address: {} });
  const fetchImpl = async (url) => {
    const u = new URL(url);
    let body;
    if (u.hostname.startsWith('links')) {
      body = { total: { value: 2 }, hits: [linksHit('ext', ['ledigajobb.se']), linksHit('dup', ['ledigajobb.se'])] };
    } else if (u.searchParams.get('offset') === '0') {
      body = { total: { value: 3 }, hits: [jsHit('1', '2026-10-25T08:00:00'), jsHit('gammal', '2026-10-10T08:00:00'), jsHit('2', '2026-10-24T08:00:00', 'Jobb dup')] };
    } else {
      body = { total: { value: 3 }, hits: [] };
    }
    return { ok: true, json: async () => body };
  };
  const res = await searchAds({ pairs: [], linksPairs: [], now, fetchImpl });
  assert.deepEqual(res.ads.map((a) => a.id).sort(), ['1', '2', 'link-ext']);
  assert.equal(res.external, 1);
  assert.equal(res.total, 3);
});
