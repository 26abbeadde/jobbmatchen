// Rankning som lär sig av dina val: annonser du sparar eller söker drar upp
// liknande annonser, annonser du döljer drar ner liknande.

import { STOPWORDS } from './config.js';
import { lc } from './text.js';

const MIN_SIGNALS = 2;
const MAX_BOOST = 25;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const headlineWords = (headline) =>
  [...new Set(lc(headline).split(/[^\p{L}\p{N}#+]+/u).filter((w) => w.length >= 4 && !STOPWORDS.has(w)))];

// Bara de fält som behövs sparas, så att dolda annonser tar lite plats.
export const adFeatures = (ad) => ({ headline: ad.headline || '', employer: ad.employer?.name || '', occupation: ad.occupation?.label || '' });

export function buildProfile({ positive = [], negative = [] }) {
  const profile = { occupation: {}, employer: {}, words: {}, signals: positive.length + negative.length };
  const add = (map, key, v) => { if (key) map[key] = (map[key] || 0) + v; };
  for (const f of positive) {
    add(profile.occupation, lc(f.occupation), 1);
    add(profile.employer, lc(f.employer), 0.5);
    headlineWords(f.headline).forEach((w) => add(profile.words, w, 1));
  }
  for (const f of negative) {
    add(profile.occupation, lc(f.occupation), -1);
    add(profile.employer, lc(f.employer), -2);
    headlineWords(f.headline).forEach((w) => add(profile.words, w, -1));
  }
  return profile;
}

// Extrapoäng (-25..+25) som läggs på matchningen vid sortering "Bäst matchning".
export function learnedBoost(ad, profile) {
  if (!profile || profile.signals < MIN_SIGNALS) return 0;
  const f = adFeatures(ad);
  let boost = 4 * clamp(profile.occupation[lc(f.occupation)] || 0, -3, 3);
  boost += 5 * clamp(profile.employer[lc(f.employer)] || 0, -3, 1);
  boost += 2 * headlineWords(f.headline).reduce((sum, w) => sum + clamp(profile.words[w] || 0, -2, 2), 0);
  return clamp(Math.round(boost), -MAX_BOOST, MAX_BOOST);
}
