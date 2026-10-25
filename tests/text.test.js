import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasTerm, cleanLabel, distanceKm, daysUntil, snippet, relativeDate, escapeHtml } from '../js/text.js';

test('korta termer matchar inte inuti längre ord', () => {
  assert.equal(hasTerm('Vi använder JavaScript', 'Java'), false);
  assert.equal(hasTerm('Erfarenhet av Java och Spring', 'Java'), true);
});

test('längre termer får ha svensk ändelse', () => {
  assert.equal(hasTerm('Goda Excelkunskaper krävs', 'Excel'), true);
  assert.equal(hasTerm('Pythonutvecklare sökes', 'Python'), true);
});

test('termer med specialtecken matchas', () => {
  assert.equal(hasTerm('Backend i C# och .NET', 'C#'), true);
  assert.equal(hasTerm('Backend i C och Go', 'C#'), false);
  assert.equal(hasTerm('Vi kodar i C++', 'C++'), true);
});

test('flerordstermer tål bindestreck', () => {
  assert.equal(hasTerm('Krav: B-körkort', 'B körkort'), true);
  assert.equal(hasTerm('Rapporter i Power BI', 'power bi'), true);
});

test('cleanLabel tar bort kategori och delar upp alternativ', () => {
  assert.deepEqual(cleanLabel('SQL, frågespråk'), ['SQL']);
  assert.deepEqual(cleanLabel('Artificial Intelligence/Artificiell intelligens/AI'), ['Artificial Intelligence', 'Artificiell intelligens', 'AI']);
});

test('distanceKm Stockholm–Göteborg är cirka 400 km', () => {
  const d = distanceKm({ lat: 59.3293, lon: 18.0686 }, { lat: 57.7089, lon: 11.9746 });
  assert.ok(d > 390 && d < 405, `fick ${d}`);
});

test('daysUntil räknar kalenderdagar', () => {
  const now = new Date('2026-10-25T15:00:00');
  assert.equal(daysUntil('2026-10-25T23:59:59', now), 0);
  assert.equal(daysUntil('2026-10-27T08:00:00', now), 2);
  assert.equal(daysUntil(null, now), null);
});

test('relativeDate visar idag/igår/dagar sedan', () => {
  const now = new Date('2026-10-25T15:00:00');
  assert.match(relativeDate('2026-10-25T12:54:00', now).text, /^Idag 12:54/);
  assert.equal(relativeDate('2026-10-24T00:00:00', now).text, 'Igår');
  assert.equal(relativeDate('2026-10-21T10:00:00', now).text, '4 dagar sedan');
});

test('snippet kortar vid ordgräns', () => {
  const s = snippet('ord '.repeat(200), 50);
  assert.ok(s.length <= 51 && s.endsWith('…'));
});

test('escapeHtml', () => {
  assert.equal(escapeHtml('<a href="x">&</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
});
