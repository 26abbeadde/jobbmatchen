import { test } from 'node:test';
import assert from 'node:assert/strict';
import { migrateLegacy, setStatus, update, dueSoon, daysLeftText } from '../js/tracker.js';

const ad = (id, deadline) => ({ id, headline: 'Jobb ' + id, application_deadline: deadline });

test('gamla sparade och sökta annonser flyttas över', () => {
  const t = migrateLegacy({ a: ad('a'), b: ad('b') }, { b: 1000 });
  assert.equal(t.a.status, 'saved');
  assert.equal(t.b.status, 'applied');
});

test('setStatus skapar post och minns när du sökte', () => {
  const t = {};
  setStatus(t, ad('x'), 'saved', 1);
  assert.equal(t.x.status, 'saved');
  setStatus(t, ad('x'), 'applied', 2);
  setStatus(t, ad('x'), 'interview', 3);
  assert.equal(t.x.appliedAt, 2);
  assert.equal(t.x.status, 'interview');
  assert.equal(t.x.added, 1);
});

test('update ändrar fält och tidsstämpel', () => {
  const t = {};
  setStatus(t, ad('x'), 'saved', 1);
  update(t, 'x', { notes: 'Ring Anna' }, 5);
  assert.equal(t.x.notes, 'Ring Anna');
  assert.equal(t.x.updated, 5);
  assert.equal(update(t, 'saknas', {}), null);
});

test('dueSoon tar bara sparade annonser med deadline inom gränsen', () => {
  const now = new Date('2026-10-25T10:00:00');
  const t = {};
  setStatus(t, ad('snart', '2026-10-26T23:59:59'), 'saved');
  setStatus(t, ad('idag', '2026-10-25T23:59:59'), 'saved');
  setStatus(t, ad('sen', '2026-11-20T23:59:59'), 'saved');
  setStatus(t, ad('passerad', '2026-10-20T23:59:59'), 'saved');
  setStatus(t, ad('sokt', '2026-10-26T23:59:59'), 'applied');
  assert.deepEqual(dueSoon(t, 3, now).map((e) => [e.ad.id, e.daysLeft]), [['idag', 0], ['snart', 1]]);
});

test('daysLeftText', () => {
  assert.equal(daysLeftText(0), 'idag');
  assert.equal(daysLeftText(1), 'imorgon');
  assert.equal(daysLeftText(3), 'om 3 dagar');
});
