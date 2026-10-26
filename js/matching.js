// Matchning mellan dina termer (nyckelord, verktyg, CV) och annonserna.

import { SKILL_DICTIONARY, SYNONYM_GROUPS, STOPWORDS, WEIGHT, HEADLINE_BOOST, OCCUPATION_BOOST, REQUIREMENT_BOOST, KEYWORD_TEXT_WEIGHT, CV_TERM_CAP } from './config.js';
import { lc, norm, hasTerm, firstHit, termRegex, cleanLabel } from './text.js';

// ---------- Synonymer ----------
let extraGroups = [];
const variantCache = new Map();

export function setSynonymGroups(groups) {
  extraGroups = groups || [];
  variantCache.clear();
}

// Alla ord som ska räknas som träff för en term, inklusive termen själv.
export function variantsFor(term) {
  const k = lc(term);
  if (!variantCache.has(k)) {
    const set = new Set([term]);
    for (const g of [...SYNONYM_GROUPS, ...extraGroups]) if (g.includes(k)) g.forEach((v) => set.add(v));
    variantCache.set(k, [...set]);
  }
  return variantCache.get(k);
}

// ---------- Annonstext ----------
export const adSkills = (ad) => ['must_have', 'nice_to_have'].flatMap((k) => (ad[k]?.skills || []).flatMap((s) => cleanLabel(s.label)));

export function adText(ad) {
  if (!ad._text) ad._text = [ad.headline, ad.occupation?.label, ad.description?.text, adSkills(ad).join('\n')].filter(Boolean).join('\n');
  return ad._text;
}

export function adLower(ad) {
  if (!ad._lower) ad._lower = lc(adText(ad));
  return ad._lower;
}

// Yrket som arbetsgivaren klassat annonsen som, samt yrkesgruppen.
export function adOccupation(ad) {
  if (ad._occ === undefined) {
    ad._occ = [ad.occupation?.label, ad.occupation_group?.label].filter(Boolean).join('\n');
    ad._occLower = lc(ad._occ);
  }
  return ad._occ;
}

// Delar upp annonstexten i krav och meriter utifrån rubriker och fraser som
// "Krav", "Vi söker dig som", "Meriterande" och "Det är ett plus om".
export function adSections(ad) {
  if (ad._req !== undefined) return ad;
  const req = (ad.must_have?.skills || []).flatMap((s) => cleanLabel(s.label));
  let mode = null;
  for (const line of (ad.description?.text || '').split('\n')) {
    const l = lc(line).trim();
    if (/meriter|plus om|ett plus|önskvärt|bonus|nice to have|fördel om|det är bra om/.test(l)) mode = 'merit';
    else if (/krav|kvalifikation|vi söker dig som|du har|du är|requirements|must have|förutsättning|vi tror att du|din profil|om dig/.test(l)) mode = 'req';
    else if (/^(om (oss|företaget|tjänsten|rollen|jobbet)|vi erbjuder|arbetsuppgifter|ansökan|anställningsvillkor|övrigt|lön|tillträde)/.test(l)) mode = null;
    if (mode === 'req') req.push(line);
  }
  ad._req = req.join('\n');
  ad._reqLower = lc(ad._req);
  return ad;
}

// Samma annons ligger ibland ute en gång per ort, eller både i Platsbanken och
// på en annan jobbsajt. Slå ihop dem; den första (Platsbanken) behålls.
export function dedupe(list) {
  const groups = new Map();
  for (const ad of list) {
    const key = lc(norm(ad.headline || '')) + '|' + lc(ad.employer?.name);
    const place = ad.workplace_address?.municipality;
    const g = groups.get(key);
    if (!g) { ad._places = ad._places?.length ? ad._places : place ? [place] : []; groups.set(key, ad); continue; }
    if (place && !g._places.includes(place)) g._places.push(place);
  }
  return [...groups.values()];
}

// ---------- Termer och poäng ----------
export function buildTerms({ keywords = [], tools = [], cvTerms = [] }) {
  const list = [];
  const seen = new Set();
  const push = (t, type) => { const k = lc(t); if (!seen.has(k)) { seen.add(k); list.push({ term: t, type, variants: variantsFor(t) }); } };
  keywords.forEach((t) => push(t, 'kw'));
  tools.forEach((t) => push(t, 'tool'));
  cvTerms.forEach((t) => push(t, 'cv'));
  return list;
}

export function scoreAd(ad, terms) {
  const text = adText(ad), lower = adLower(ad), occ = adOccupation(ad);
  const head = ad.headline || '', headLower = lc(head);
  adSections(ad);
  const matched = [], missed = [];
  let got = 0, total = 0, cvTotal = 0, kwTitle = false, kwAny = false;
  for (const t of terms) {
    const w = WEIGHT[t.type];
    if (t.type === 'cv') cvTotal += w; else total += w;
    const hit = firstHit(text, lower, t.variants);
    if (!hit) { if (t.type !== 'cv') missed.push(t); continue; }
    // Var träffen finns avgör hur mycket den väger: i rubriken eller yrket säger
    // den vad jobbet är, i kravdelen vad som krävs, annars nämns ordet bara i
    // texten (t.ex. "kontakta vår IT-support"), vilket säger lite om ett nyckelord.
    const where = firstHit(head, headLower, t.variants) ? 'title'
      : firstHit(occ, ad._occLower, t.variants) ? 'occupation'
        : firstHit(ad._req, ad._reqLower, t.variants) ? 'req' : 'text';
    const factor = { title: HEADLINE_BOOST, occupation: OCCUPATION_BOOST, req: REQUIREMENT_BOOST }[where]
      ?? (t.type === 'kw' ? KEYWORD_TEXT_WEIGHT : 1);
    got += w * factor;
    if (t.type === 'kw') { kwAny = true; kwTitle ||= where === 'title' || where === 'occupation'; }
    matched.push({ ...t, where, req: where === 'req', via: lc(hit) !== lc(t.term) ? hit : null });
  }
  // CV-termer kan vara många, så de räknas mot ett tak för att inte dra ner
  // procenten för annonser som matchar det du själv skrivit.
  const denom = total + Math.min(cvTotal, CV_TERM_CAP * WEIGHT.cv);
  const pct = denom ? Math.min(100, Math.round((got / denom) * 100)) : null;

  // Kompetenser som annonsen kräver men som inte finns bland dina termer.
  const lacking = terms.some((t) => t.type !== 'kw')
    ? [...new Set((ad.must_have?.skills || []).flatMap((s) => cleanLabel(s.label).slice(0, 1)))]
      .filter((l) => !terms.some((t) => t.variants.some((v) => hasTerm(l, v) || hasTerm(v, l)))).slice(0, 4)
    : [];
  return { pct, matched, missed, lacking, kwTitle, kwAny };
}

export const matchesAny = (ad, words) => words.some((w) => firstHit(adText(ad), adLower(ad), variantsFor(w)));

// Vilka yrken (Arbetsförmedlingens yrkesbenämningar) annonserna med dina
// nyckelord i rubriken oftast är klassade som. Att söka på yrket ger även
// annonser med andra rubriker, t.ex. "First Line-tekniker" för "it support".
export function occupationSuggestions(ads, exclude = new Set(), max = 4) {
  const counts = new Map();
  for (const ad of ads) {
    const occ = ad.occupation;
    if (!ad._score?.kwTitle || !occ?.concept_id || exclude.has(occ.concept_id)) continue;
    const c = counts.get(occ.concept_id) || { id: occ.concept_id, label: occ.label, count: 0 };
    c.count++;
    counts.set(occ.concept_id, c);
  }
  return [...counts.values()].filter((c) => c.count >= 2).sort((a, b) => b.count - a.count).slice(0, max);
}

// ---------- CV ----------
// Plockar ut kompetenser ur CV:t: ordlistan, kompetenser som annonserna själva
// anger samt system-/produktnamn (versalinledda ord mitt i en mening,
// förkortningar) som också förekommer i de hämtade annonserna.
export function extractCvTerms(cvText, ads = [], removed = new Set()) {
  if (!cvText) return [];
  const found = new Map();
  const add = (t) => { const k = lc(t); if (!found.has(k) && !removed.has(k)) found.set(k, t); };

  SKILL_DICTIONARY.forEach((t) => {
    const caseSensitive = /^\p{Lu}/u.test(t);
    if (termRegex(t, caseSensitive ? 'u' : 'iu').test(cvText)) add(t.charAt(0).toUpperCase() + t.slice(1));
  });

  if (ads.length) {
    const cvLower = lc(cvText);
    ads.forEach((ad) => adSkills(ad).forEach((s) => { if (hasTerm(cvText, s, cvLower)) add(s); }));

    const candidates = new Map();
    const re = /(?<=\p{Ll}[ \t]+|[,;:/(&][ \t]*|(?:^|\s)[-–•*·][ \t]*)([\p{Lu}][\p{L}\p{N}+#.\-]{1,30})|(?<![\p{L}])([\p{Lu}]{2,}[\p{N}+#]*|[\p{L}]+[+#]+|[\p{L}]+\d+[\p{L}\d]*)(?![\p{L}])/gmu;
    for (const m of cvText.matchAll(re)) {
      const word = (m[1] || m[2]).replace(/[.\-]+$/, '');
      const k = lc(word);
      if (word.length < 2 || STOPWORDS.has(k)) continue;
      // Hoppa över delar av redan hittade termer, t.ex. "BI" ur "Power BI".
      if ([...found.keys()].some((f) => f !== k && f.split(/[\s\-/]+/).includes(k))) continue;
      candidates.set(k, word);
    }
    const ranked = [];
    for (const [k, word] of candidates) {
      if (found.has(k)) continue;
      const df = ads.filter((ad) => hasTerm(adText(ad), word, adLower(ad))).length;
      if (df >= 2 && df <= Math.max(3, ads.length * 0.35)) ranked.push([word, df]);
    }
    ranked.sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([w]) => add(w));
  }
  return [...found.values()].slice(0, 40);
}
