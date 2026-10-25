// Uppföljning av annonser du sparat eller sökt: status, anteckningar,
// personligt brev och påminnelser inför sista ansökningsdag.

import { daysUntil } from './text.js';

export const STATUSES = [
  { id: 'saved', label: 'Sparad' },
  { id: 'applied', label: 'Sökt' },
  { id: 'interview', label: 'Intervju' },
  { id: 'offer', label: 'Erbjudande' },
  { id: 'rejected', label: 'Avslag' },
];
export const statusLabel = (id) => STATUSES.find((s) => s.id === id)?.label || id;

// Tidigare versioner sparade annonser och "sökt" i två separata listor.
export function migrateLegacy(saved = {}, applied = {}) {
  const tracker = {};
  for (const [id, ad] of Object.entries(saved)) {
    tracker[id] = { ad, status: applied[id] ? 'applied' : 'saved', notes: '', letter: '', added: applied[id] || Date.now(), updated: applied[id] || Date.now() };
  }
  return tracker;
}

export function setStatus(tracker, ad, status, now = Date.now()) {
  const entry = tracker[ad.id] || { ad, status, notes: '', letter: '', added: now };
  entry.status = status;
  entry.updated = now;
  if (status === 'applied' && !entry.appliedAt) entry.appliedAt = now;
  tracker[ad.id] = entry;
  return entry;
}

export function update(tracker, id, fields, now = Date.now()) {
  if (!tracker[id]) return null;
  Object.assign(tracker[id], fields, { updated: now });
  return tracker[id];
}

// Sparade (ännu inte sökta) annonser vars sista ansökningsdag är inom `days` dagar.
export function dueSoon(tracker, days, now = new Date()) {
  return Object.values(tracker)
    .filter((e) => e.status === 'saved' && e.ad.application_deadline)
    .map((e) => ({ ...e, daysLeft: daysUntil(e.ad.application_deadline, now) }))
    .filter((e) => e.daysLeft >= 0 && e.daysLeft <= days)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

export const daysLeftText = (d) => (d === 0 ? 'idag' : d === 1 ? 'imorgon' : `om ${d} dagar`);
