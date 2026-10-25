import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildProfile, learnedBoost, headlineWords, adFeatures } from '../js/learning.js';

const ad = (headline, employer, occupation) => ({ headline, employer: { name: employer }, occupation: { label: occupation } });

test('headlineWords tar bort korta ord och stoppord', () => {
  assert.deepEqual(headlineWords('Vi söker en Frontendutvecklare till Spotify'), ['frontendutvecklare', 'spotify']);
});

test('ingen effekt förrän det finns minst två val', () => {
  const profile = buildProfile({ positive: [adFeatures(ad('Frontendutvecklare', 'A', 'Frontend-utvecklare'))] });
  assert.equal(learnedBoost(ad('Frontendutvecklare', 'B', 'Frontend-utvecklare'), profile), 0);
});

test('liknande annonser som sparats ger plus', () => {
  const profile = buildProfile({
    positive: [ad('Frontendutvecklare React', 'A', 'Frontend-utvecklare'), ad('Frontendutvecklare', 'B', 'Frontend-utvecklare')].map(adFeatures),
  });
  assert.ok(learnedBoost(ad('Junior Frontendutvecklare', 'C', 'Frontend-utvecklare'), profile) > 0);
  assert.equal(learnedBoost(ad('Lagerarbetare', 'D', 'Lagerarbetare'), profile), 0);
});

test('dolda arbetsgivare ger minus', () => {
  const profile = buildProfile({
    negative: [ad('Säljare', 'Bemanning AB', 'Säljare'), ad('Kundtjänst', 'Bemanning AB', 'Kundtjänstmedarbetare')].map(adFeatures),
  });
  assert.ok(learnedBoost(ad('Lagermedarbetare', 'Bemanning AB', 'Lagerarbetare'), profile) < 0);
});

test('effekten är begränsad', () => {
  const many = Array.from({ length: 20 }, () => adFeatures(ad('Frontendutvecklare React TypeScript', 'A', 'Frontend-utvecklare')));
  const b = learnedBoost(ad('Frontendutvecklare React TypeScript', 'A', 'Frontend-utvecklare'), buildProfile({ positive: many }));
  assert.equal(b, 25);
});
