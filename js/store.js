// Lagring i webbläsaren samt export/import av dina data som fil.

const PREFIX = 'jm.';
// Nycklar exporteras aldrig, och cachade register laddas om automatiskt.
const EXPORT_EXCLUDE = new Set(['jm.apiKey', 'jm.transitKey', 'jm.taxonomy', 'jm.synonyms', 'jm.skills', 'jm.ssyk',
  'jm.salaries', 'jm.municipalities', 'jm.muniCoords']);

const defaultStorage = () => { try { return globalThis.localStorage ?? null; } catch { return null; } };

export function createStore(storage = defaultStorage()) {
  return {
    get(key, fallback) {
      try { const v = storage?.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    // Fält som börjar med "_" är cachade beräkningar och sparas inte.
    set(key, value) {
      try { storage?.setItem(key, JSON.stringify(value, (k, v) => (k.startsWith('_') ? undefined : v))); } catch { /* full eller blockerad lagring */ }
    },
    remove(key) { try { storage?.removeItem(key); } catch { /* ignoreras */ } },
  };
}

function appKeys(storage) {
  const keys = [];
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i);
    if (k?.startsWith(PREFIX)) keys.push(k);
  }
  return keys;
}

export function exportData(storage, now = new Date()) {
  const data = {};
  for (const k of appKeys(storage)) if (!EXPORT_EXCLUDE.has(k)) data[k] = JSON.parse(storage.getItem(k));
  return { app: 'jobbmatchen', version: 1, exported: now.toISOString(), data };
}

// Ersätter motsvarande nycklar med innehållet i filen. Returnerar antal nycklar.
export function importData(storage, file) {
  if (!file || file.app !== 'jobbmatchen' || typeof file.data !== 'object') {
    throw new Error('Filen är ingen export från Jobbmatchen.');
  }
  let count = 0;
  for (const [k, v] of Object.entries(file.data)) {
    if (!k.startsWith(PREFIX) || EXPORT_EXCLUDE.has(k)) continue;
    storage.setItem(k, JSON.stringify(v));
    count++;
  }
  return count;
}
