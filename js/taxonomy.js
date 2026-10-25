// Arbetsförmedlingens yrkes-, orts- och kompetensregister (JobTech Taxonomy).

import { TAXONOMY_API } from './config.js';
import { lc, cleanLabel } from './text.js';

const DAY = 86400000;
const byLabel = (a, b) => a.preferred_label.localeCompare(b.preferred_label, 'sv');

async function graphql(query) {
  const res = await fetch(`${TAXONOMY_API}?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Taxonomy ' + res.status);
  return (await res.json()).data;
}

async function cached(store, key, maxAge, load) {
  const c = store.get(key, null);
  if (c?.data && Date.now() - c.at < maxAge) return c.data;
  const data = await load();
  store.set(key, { at: Date.now(), data });
  return data;
}

// Branscher med sina yrkesgrupper, samt Sveriges län.
export const loadFieldsAndRegions = (store) => cached(store, 'jm.taxonomy', DAY, async () => {
  const [f, r] = await Promise.all([
    graphql('{concepts(type:"occupation-field"){id preferred_label narrower(type:"ssyk-level-4"){id preferred_label}}}'),
    graphql('{concepts(id:"i46j_HmG_v64"){narrower(type:"region"){id preferred_label}}}'),
  ]);
  const fields = f.concepts.sort(byLabel);
  fields.forEach((x) => x.narrower.sort(byLabel));
  return { fields, regions: r.concepts[0].narrower.sort(byLabel) };
});

export async function loadMunicipalities(store, regionId) {
  const all = store.get('jm.municipalities', {});
  if (!all[regionId]) {
    const d = await graphql(`{concepts(id:"${regionId}"){narrower(type:"municipality"){id preferred_label}}}`);
    all[regionId] = d.concepts[0].narrower.sort(byLabel);
    store.set('jm.municipalities', all);
  }
  return all[regionId];
}

// Alla kompetenser i registret, var och en med sina namn. De som har flera
// namn används som synonymer, t.ex. "Artificial Intelligence/Artificiell intelligens/AI".
export const loadSkillGroups = (store) => cached(store, 'jm.skills', 7 * DAY, async () => {
  store.remove('jm.synonyms');   // ersatt av den här listan
  const d = await graphql('{concepts(type:"skill"){preferred_label alternative_labels}}');
  return d.concepts
    .map((c) => [...new Set([...cleanLabel(c.preferred_label), ...(c.alternative_labels || []).flatMap(cleanLabel)].map(lc))])
    .filter((labels) => labels.length);
});

// Yrkesgruppernas SSYK-koder, som SCB:s lönestatistik använder.
export const loadSsykCodes = (store) => cached(store, 'jm.ssyk', 30 * DAY, async () => {
  const d = await graphql('{concepts(type:"ssyk-level-4"){id ssyk_code_2012}}');
  return Object.fromEntries(d.concepts.map((c) => [c.id, c.ssyk_code_2012]));
});
