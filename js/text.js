// Textverktyg utan beroenden till webbläsaren, så att de kan testas i Node.

export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
export const norm = (s) => s.trim().replace(/\s+/g, ' ');
export const lc = (s) => (s || '').toLowerCase();

// Termen måste börja vid en ordgräns. Längre termer får följas av en ändelse
// (t.ex. "Excel" i "Excelkunskaper"), korta termer måste stå för sig själva
// så att "Java" inte matchar "JavaScript".
const regexCache = new Map();
export function termRegex(term, flags = 'iu') {
  const key = term + '|' + flags;
  if (!regexCache.has(key)) {
    const allowSuffix = term.length >= 5 && /[\p{L}\p{N}]$/u.test(term);
    const tail = allowSuffix ? '' : '(?![\\p{L}\\p{N}+#])';
    regexCache.set(key, new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(term).replace(/ /g, '[\\s-]+')}${tail}`, flags));
  }
  return regexCache.get(key);
}

// Snabb förkontroll med includes innan det dyrare reguljära uttrycket körs.
export function hasTerm(text, term, lower) {
  if (!text || !term) return false;
  if (!(lower ?? lc(text)).includes(lc(term).split(' ')[0])) return false;
  return termRegex(term).test(text);
}

export const firstHit = (text, lower, variants) => variants.find((v) => hasTerm(text, v, lower)) || null;

// "SQL, frågespråk" -> ["SQL"], "Artificial Intelligence/Artificiell intelligens/AI" -> tre delar.
export const cleanLabel = (label) => String(label || '').split('/')
  .map((p) => p.replace(/,\s*[a-zåäö][^,]*$/u, '').trim()).filter((p) => p.length > 1);

export function relativeDate(iso, now = new Date()) {
  const d = new Date(iso);
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const diff = Math.round((today - day) / 86400000);
  const time = d.getHours() || d.getMinutes() ? ' ' + d.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' }) : '';
  if (diff <= 0) return { text: `Idag${time}`, fresh: true };
  if (diff === 1) return { text: `Igår${time}`, fresh: true };
  return { text: `${diff} dagar sedan`, fresh: false };
}

// Hela dagar kvar till ett datum, räknat på kalenderdagar (0 = idag).
export function daysUntil(iso, now = new Date()) {
  if (!iso) return null;
  const a = new Date(now); a.setHours(0, 0, 0, 0);
  const b = new Date(iso); b.setHours(0, 0, 0, 0);
  return Math.round((b - a) / 86400000);
}

export function snippet(text = '', max = 320) {
  const t = String(text).replace(/\n{2,}/g, '\n').trim();
  return t.length > max ? t.slice(0, max).replace(/\s+\S*$/, '') + '…' : t;
}

// Fågelvägen mellan två punkter i km (haversine).
export function distanceKm(a, b) {
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}
