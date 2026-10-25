import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVocabulary, skillDemand, normalizeLabel } from '../js/skills.js';
import { parseScb, ssykFor, salaryFor } from '../js/salary.js';
import { parseDuration, nextWeekdayMorning, formatMinutes, travelMinutes } from '../js/transit.js';
import { municipalityCentroids, adPosition } from '../js/geo.js';

const ad = (text, over = {}) => ({ id: String(Math.random()), headline: 'Jobb', description: { text }, ...over });

// ---------- Kompetensöversikt ----------
test('normalizeLabel gör namn jämförbara', () => {
  assert.equal(normalizeLabel('B-körkort'), 'b körkort');
  assert.equal(normalizeLabel('Node.js'), 'node.js');
  assert.equal(normalizeLabel('C#'), 'c#');
});

test('skillDemand räknar andel annonser, krav och vad du har', () => {
  const vocab = buildVocabulary([['visma lön', 'visma löneprogram']]);
  const ads = [
    ad('Krav\nDu har erfarenhet av Excel och Visma Lön.'),
    ad('Meriterande\nExcel är ett plus.'),
    ad('Vi använder Fortnox.'),
  ];
  const d = Object.fromEntries(skillDemand(ads, vocab, ['excel']).map((x) => [x.name, x]));
  assert.equal(d.Excel.count, 2);
  assert.equal(d.Excel.req, 1);
  assert.equal(d.Excel.has, true);
  assert.equal(d['Visma lön'].count, 1);
  assert.equal(d.Fortnox.has, false);
});

test('synonymer räknas som samma kompetens', () => {
  const vocab = buildVocabulary();
  const d = skillDemand([ad('Kunskap i kalkylprogram'), ad('Goda kunskaper i MS Excel')], vocab);
  assert.equal(d.find((x) => x.name === 'Excel')?.count, 2);
});

test('korta och tvetydiga namn från registret ger inga träffar', () => {
  const vocab = buildVocabulary([['os'], ['teams'], ['engineer']]);
  const d = skillDemand([ad('Our teams engineer it, os vi ses')], vocab);
  assert.deepEqual(d.map((x) => x.name), []);
});

test('webbadresser ger inga träffar', () => {
  const vocab = buildVocabulary([['http']]);
  assert.equal(skillDemand([ad('Läs mer på https://example.com/sql')], vocab).length, 0);
});

// ---------- Lön ----------
const scbResponse = {
  columns: [
    { code: 'Sektor', type: 'd' }, { code: 'Yrke2012', type: 'd' }, { code: 'Kon', type: 'd' }, { code: 'Tid', type: 't' },
    { code: '000007CE', type: 'c' }, { code: '000007CF', type: 'c' }, { code: '000007CI', type: 'c' },
  ],
  data: [
    { key: ['0', '2512', '1+2', '2025'], values: ['53500', '39600', '72600'] },
    { key: ['0', '0110', '1+2', '2025'], values: ['..', '..', '..'] },
  ],
};

test('parseScb läser median och spridning och hoppar över prickade värden', () => {
  assert.deepEqual(parseScb(scbResponse), { 2512: { median: 53500, p10: 39600, p90: 72600 } });
});

test('ssykFor använder Platsbankens kod eller registrets', () => {
  assert.equal(ssykFor({ occupation_group: { legacy_ams_taxonomy_id: '2512' } }), '2512');
  assert.equal(ssykFor({ occupation_group: { concept_id: 'abc' } }, { abc: '4111' }), '4111');
  assert.equal(ssykFor({}), null);
});

test('salaryFor kopplar ihop annons och statistik', () => {
  const s = salaryFor({ occupation_group: { legacy_ams_taxonomy_id: '2512', label: 'Utvecklare' } }, { year: '2025', bySsyk: parseScb(scbResponse) });
  assert.equal(s.median, 53500);
  assert.equal(s.year, '2025');
  assert.equal(salaryFor({ occupation_group: { legacy_ams_taxonomy_id: '9999' } }, { bySsyk: {} }), null);
});

// ---------- Restid ----------
test('parseDuration', () => {
  assert.equal(parseDuration('PT1H5M'), 65);
  assert.equal(parseDuration('PT45M'), 45);
  assert.equal(parseDuration('P1DT2H'), 1560);
  assert.equal(parseDuration(''), null);
});

test('nextWeekdayMorning hoppar över helgen', () => {
  assert.deepEqual(nextWeekdayMorning(new Date('2026-10-23T12:00:00')), { date: '2026-10-26', time: '08:00' }); // fredag -> måndag
  assert.deepEqual(nextWeekdayMorning(new Date('2026-10-26T12:00:00')), { date: '2026-10-27', time: '08:00' });
});

test('formatMinutes', () => {
  assert.equal(formatMinutes(45), '45 min');
  assert.equal(formatMinutes(60), '1 h');
  assert.equal(formatMinutes(95), '1 h 35 min');
});

test('travelMinutes väljer snabbaste resan och skickar rätt parametrar', async () => {
  let called;
  const fetchImpl = async (url) => {
    called = new URL(url);
    return { ok: true, status: 200, json: async () => ({ Trip: [{ duration: 'PT1H10M' }, { duration: 'PT55M' }] }) };
  };
  const m = await travelMinutes('nyckel', { lat: 58.41, lon: 15.62 }, { lat: 58.59, lon: 16.18 }, new Date('2026-10-25T12:00:00'), fetchImpl);
  assert.equal(m, 55);
  assert.equal(called.searchParams.get('searchForArrival'), '1');
  assert.equal(called.searchParams.get('date'), '2026-10-26');
});

test('travelMinutes ger tydligt fel vid ogiltig nyckel', async () => {
  const fetchImpl = async () => ({ ok: false, status: 401 });
  await assert.rejects(travelMinutes('fel', { lat: 1, lon: 1 }, { lat: 2, lon: 2 }, new Date(), fetchImpl), /nyckeln godkändes inte/);
});

// ---------- Ungefärlig position ----------
test('kommunens mittpunkt räknas från annonser med koordinater', () => {
  const ads = [
    { workplace_address: { municipality: 'Lund', coordinates: [13.2, 55.7] } },
    { workplace_address: { municipality: 'Lund', coordinates: [13.4, 55.7] } },
    { workplace_address: { municipality: 'Malmö' } },
  ];
  const c = municipalityCentroids(ads, { Ystad: { lat: 55.4, lon: 13.8 } });
  assert.ok(Math.abs(c.Lund.lon - 13.3) < 1e-9);
  assert.ok(c.Ystad);
  assert.equal(c.Malmö, undefined);

  assert.deepEqual(adPosition({ workplace_address: { coordinates: [13.0, 55.6] } }, c), { lat: 55.6, lon: 13.0, approx: false });
  assert.equal(adPosition({ workplace_address: { municipality: 'Lund' } }, c).approx, true);
  assert.equal(adPosition({ workplace_address: { municipality: 'Okänd' } }, c), null);
});
