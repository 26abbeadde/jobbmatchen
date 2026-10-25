import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTerms, scoreAd, dedupe, extractCvTerms, variantsFor, setSynonymGroups, matchesAny } from '../js/matching.js';

const ad = (over = {}) => ({
  id: String(Math.random()),
  headline: 'Ekonomiassistent',
  employer: { name: 'Bolaget AB' },
  description: { text: 'Om tjänsten\nDu sköter fakturor.\n\nKrav\nErfarenhet av Fortnox.\n\nMeriterande\nKunskap i Excel.' },
  workplace_address: { municipality: 'Uppsala' },
  ...over,
});

test('träff i kravdelen väger tyngre än i meriterande', () => {
  const terms = buildTerms({ tools: ['Fortnox', 'Excel', 'SAP'] });
  const s = scoreAd(ad(), terms);
  assert.deepEqual(s.matched.map((m) => [m.term, m.req]), [['Fortnox', true], ['Excel', false]]);
  // 3*1.3 + 3*1 av 9 möjliga
  assert.equal(s.pct, Math.round(((3 * 1.3 + 3) / 9) * 100));
});

test('träff i rubriken väger mest', () => {
  const s = scoreAd(ad(), buildTerms({ keywords: ['ekonomiassistent'] }));
  assert.equal(s.pct, 100);
});

test('ord som saknas visas som missade', () => {
  const s = scoreAd(ad(), buildTerms({ tools: ['SAP'] }));
  assert.equal(s.pct, 0);
  assert.deepEqual(s.missed.map((m) => m.term), ['SAP']);
});

test('synonymer räknas som träff', () => {
  const s = scoreAd(ad({ description: { text: 'Du behöver kunna kalkylprogram.' } }), buildTerms({ tools: ['Excel'] }));
  assert.equal(s.matched[0].via, 'kalkylprogram');
});

test('synonymer från kompetensregistret kan läggas till', () => {
  setSynonymGroups([['visma', 'visma eekonomi']]);
  assert.ok(variantsFor('Visma').includes('visma eekonomi'));
  setSynonymGroups([]);
});

test('många CV-termer drar inte ner procenten under taket', () => {
  const cvTerms = Array.from({ length: 30 }, (_, i) => `term${i}`);
  const s = scoreAd(ad(), buildTerms({ tools: ['Fortnox'], cvTerms }));
  // Fortnox (3*1.3) av 3 + 8 (taket för CV-termer)
  assert.equal(s.pct, Math.round((3.9 / 11) * 100));
});

test('krav i metadata som saknas i profilen listas', () => {
  const a = ad({ must_have: { skills: [{ label: 'SAP, affärssystem' }, { label: 'Fortnox, ekonomisystem' }] } });
  const s = scoreAd(a, buildTerms({ tools: ['Fortnox'] }));
  assert.deepEqual(s.lacking, ['SAP']);
});

test('dedupe slår ihop samma annons på flera orter', () => {
  const list = dedupe([
    ad({ id: '1', workplace_address: { municipality: 'Uppsala' } }),
    ad({ id: '2', workplace_address: { municipality: 'Enköping' } }),
    ad({ id: '3', headline: 'Lagerarbetare' }),
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0]._places, ['Uppsala', 'Enköping']);
});

test('extractCvTerms hittar verktyg och respekterar borttagna', () => {
  const cv = 'Jag har jobbat med Fortnox och Excel. Truckkort B finns.';
  assert.deepEqual(extractCvTerms(cv).sort(), ['Excel', 'Fortnox', 'Truckkort', 'Truckkort B'].sort());
  assert.ok(!extractCvTerms(cv, [], new Set(['excel'])).includes('Excel'));
});

test('produktnamn i ordlistan matchas skiftlägeskänsligt', () => {
  assert.ok(!extractCvTerms('Jag tycker om att springa och läsa word-filer.').includes('Spring'));
});

test('matchesAny används för uteslutna ord', () => {
  assert.equal(matchesAny(ad({ headline: 'Senior ekonom' }), ['senior']), true);
  assert.equal(matchesAny(ad(), ['senior']), false);
});
