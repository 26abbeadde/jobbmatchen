// Kompetensöversikt: vilka kompetenser som nämns oftast i annonserna, och
// vilka av dem du redan har.

import { SKILL_DICTIONARY, SYNONYM_GROUPS, STOPWORDS } from './config.js';
import { lc } from './text.js';
import { adText, adSections } from './matching.js';

// Ord i kompetensregistret som också är vanliga vardagsord eller förmåner i annonser.
const AMBIGUOUS = new Set(['net', 'service', 'ansvar', 'kommunikation', 'samarbete', 'administration', 'struktur',
  'flexibilitet', 'teknik', 'data', 'design', 'test', 'drift', 'support', 'utveckling', 'ekonomi', 'marknadsföring',
  'ledarskap', 'planering', 'analys', 'kvalitet', 'säkerhet', 'projekt', 'verktyg', 'management', 'distans', 'access',
  'golv', 'most', 'basic', 'fysik', 'underhåll', 'försäkringar', 'kollektivavtal', 'rekrytering', 'friskvård', 'pension',
  'tjänstepension', 'friskvårdsbidrag', 'bemanning', 'konsult', 'heltid', 'deltid', 'semester', 'lön', 'office',
  'rekryterare', 'recruitment', 'remote', 'distansarbete', 'hemifrån', 'engineer', 'client', 'server', 'teams', 'regi', 'intyg',
  'post', 'e post', 'balans', 'nätverk']);
// Korta namn (t.ex. "OS", "IF", "PRO") ger för många falska träffar och tas bara
// med om de finns i appens egna, handplockade listor.
const MIN_REGISTER_LABEL = 4;

export const tokens = (text) => lc(text).replace(/[-–/]/g, ' ').match(/[\p{L}\p{N}#+]+(?:\.[\p{L}\p{N}]+)*/gu) || [];
export const normalizeLabel = (label) => tokens(label).join(' ');
const CURATED = new Set([...SYNONYM_GROUPS.flat(), ...SKILL_DICTIONARY].map(normalizeLabel));

// Webbadresser och e-post ger annars träffar som "HTTP" och "www".
const stripLinks = (text) => String(text || '').replace(/https?:\/\/\S+|www\.\S+|\S+@\S+/gi, ' ');

function grams(text) {
  const t = tokens(stripLinks(text));
  const out = new Set();
  for (let i = 0; i < t.length; i++) {
    out.add(t[i]);
    if (i + 1 < t.length) out.add(t[i] + ' ' + t[i + 1]);
    if (i + 2 < t.length) out.add(t[i] + ' ' + t[i + 1] + ' ' + t[i + 2]);
  }
  return out;
}

const display = (label) => {
  const known = SKILL_DICTIONARY.find((d) => normalizeLabel(d) === normalizeLabel(label));
  if (known) return known.charAt(0).toUpperCase() + known.slice(1);
  return label.length <= 3 ? label.toUpperCase() : label.charAt(0).toUpperCase() + label.slice(1);
};

// Bygger en ordlista: varje normaliserad etikett pekar på en kompetens med
// ett visningsnamn och alla dess namn. `groups` är listor av namn per kompetens.
export function buildVocabulary(groups = []) {
  const vocab = new Map();
  const all = [...SYNONYM_GROUPS, ...SKILL_DICTIONARY.map((d) => [d]), ...groups];
  for (const group of all) {
    const labels = group.map(normalizeLabel).filter((l) =>
      l.length >= 2 && !STOPWORDS.has(l) && !AMBIGUOUS.has(l) && (l.length >= MIN_REGISTER_LABEL || CURATED.has(l)));
    if (!labels.length) continue;
    // Finns någon av etiketterna redan hör gruppen ihop med den kompetensen.
    const existing = labels.map((l) => vocab.get(l)).find(Boolean);
    const skill = existing || { name: display(group[0]), labels: new Set() };
    labels.forEach((l) => { skill.labels.add(l); vocab.set(l, skill); });
  }
  return vocab;
}

// Andel annonser som nämner varje kompetens, och hur ofta den står bland kraven.
export function skillDemand(ads, vocab, userLabels = []) {
  const counts = new Map();
  for (const ad of ads) {
    adSections(ad);
    const found = new Set();
    for (const g of grams(adText(ad))) { const s = vocab.get(g); if (s) found.add(s); }
    const req = new Set();
    for (const g of grams(ad._req)) { const s = vocab.get(g); if (s) req.add(s); }
    for (const s of found) {
      const c = counts.get(s) || { count: 0, req: 0 };
      c.count++;
      if (req.has(s)) c.req++;
      counts.set(s, c);
    }
  }
  const mine = new Set(userLabels.map(normalizeLabel));
  return [...counts.entries()]
    .map(([s, c]) => ({ name: s.name, count: c.count, req: c.req, share: ads.length ? c.count / ads.length : 0, has: [...s.labels].some((l) => mine.has(l)) }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'sv'));
}
