// Gränssnittet: kopplar ihop formuläret, sökningen, listorna och AI-hjälpen.

import { DAYS, MAX_TERM_QUERIES, PAGE_SIZE, WATCH_INTERVAL, DEADLINE_SOON_DAYS } from './config.js';
import { escapeHtml, lc, norm, termRegex, relativeDate, daysUntil, snippet, distanceKm } from './text.js';
import { setSynonymGroups, buildTerms, scoreAd, extractCvTerms, adText, matchesAny } from './matching.js';
import { buildProfile, learnedBoost, adFeatures } from './learning.js';
import { STATUSES, statusLabel, migrateLegacy, setStatus, update, dueSoon, daysLeftText } from './tracker.js';
import { createStore, exportData, importData } from './store.js';
import { searchAds } from './sources.js';
import { loadFieldsAndRegions, loadMunicipalities, loadSynonymGroups } from './taxonomy.js';
import { readCv } from './cv.js';
import { currentPosition, geocode } from './geo.js';
import * as ai from './ai.js';

const store = createStore();
const $ = (id) => document.getElementById(id);

// ---------- Tillstånd ----------
let ready = false;
let searchedOnce = false;
let searching = false;
let view = 'results';
let ads = [];
let totalAvailable = 0;
let externalCount = 0;
let shown = PAGE_SIZE;
let currentTerms = [];
let watchTimer = null;
let fields = [];

// ---------- Sparat på den här datorn ----------
const tracker = store.get('jm.tracker', null) ?? migrateLegacy(store.get('jm.saved', {}), store.get('jm.applied', {}));
const saveTracker = () => store.set('jm.tracker', tracker);
saveTracker();
const hiddenInfo = store.get('jm.hiddenInfo', {});      // id -> rubrik/arbetsgivare/yrke, för inlärningen
const hidden = new Set([...store.get('jm.hidden', []), ...Object.keys(hiddenInfo)]);
const seen = store.get('jm.seen', {});                  // id -> tidpunkt då annonsen först visades
for (const [id, t] of Object.entries(seen)) if (Date.now() - t > 30 * 86400000) delete seen[id];
const seenAtStart = new Set(Object.keys(seen));         // "ny" = inte visad före det här besöket
const isNew = (ad) => seenAtStart.size > 0 && !seenAtStart.has(ad.id);
let home = store.get('jm.home', null);

// ---------- Chip-fält ----------
function chipInput(boxId, inputId, cls, storeKey, onChange) {
  const box = $(boxId), input = $(inputId);
  let items = store.get(storeKey, []);
  function render() {
    box.querySelectorAll('.chip').forEach((c) => c.remove());
    items.forEach((item, i) => {
      const chip = document.createElement('span');
      chip.className = 'chip ' + cls;
      chip.innerHTML = `${escapeHtml(item)}<button type="button" aria-label="Ta bort ${escapeHtml(item)}">×</button>`;
      chip.querySelector('button').onclick = () => { items.splice(i, 1); render(); };
      box.insertBefore(chip, input);
    });
    store.set(storeKey, items);
    onChange?.();
  }
  function add(raw) {
    raw.split(/[,;]/).map(norm).filter(Boolean).forEach((v) => {
      if (!items.some((x) => lc(x) === lc(v))) items.push(v);
    });
    input.value = '';
    render();
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add(input.value); }
    else if (e.key === 'Backspace' && !input.value && items.length) { items.pop(); render(); }
  });
  input.addEventListener('blur', () => { if (input.value.trim()) add(input.value); });
  box.addEventListener('click', () => input.focus());
  render();
  return { get: () => { if (input.value.trim()) add(input.value); return [...items]; } };
}

const keywords = chipInput('kwBox', 'kwInput', 'kw', 'jm.keywords', () => rerank());
const tools = chipInput('toolBox', 'toolInput', '', 'jm.tools', () => rerank());
const excluded = chipInput('exBox', 'exInput', 'ex', 'jm.exclude', () => rerank());

// ---------- Branscher, roller, län och kommuner ----------
const options = (list) => list.map((c) => `<option value="${c.id}">${escapeHtml(c.preferred_label)}</option>`).join('');

async function initTaxonomy() {
  const data = await loadFieldsAndRegions(store);
  fields = data.fields;
  $('field').innerHTML = '<option value="">Välj bransch…</option>' + options(fields);
  $('region').innerHTML = '<option value="">Hela Sverige</option>' + options(data.regions);

  const sel = store.get('jm.selection', {});
  if (sel.field && fields.some((f) => f.id === sel.field)) $('field').value = sel.field;
  fillGroups();
  if (sel.group) $('group').value = sel.group;
  if (sel.region) {
    $('region').value = sel.region;
    await fillMunicipalities();
    if (sel.municipality) $('municipality').value = sel.municipality;
  }
}

function fillGroups() {
  const field = fields.find((f) => f.id === $('field').value);
  $('group').innerHTML = '<option value="">Alla roller inom området</option>' + (field ? options(field.narrower) : '');
  $('group').disabled = !field;
}

async function fillMunicipalities() {
  const region = $('region').value;
  $('municipality').innerHTML = '<option value="">Hela länet</option>';
  $('municipality').disabled = !region;
  if (region) $('municipality').innerHTML += options(await loadMunicipalities(store, region));
}

// Valda roller: flera kan läggas till. Har inga lagts till används det som
// står i listorna just nu.
const roles = store.get('jm.roles', []);
function currentSelection() {
  if ($('group').value) return { id: $('group').value, label: $('group').selectedOptions[0].text, type: 'group' };
  if ($('field').value) return { id: $('field').value, label: `${$('field').selectedOptions[0].text} (alla roller)`, type: 'field' };
  return null;
}
const activeRoles = () => (roles.length ? roles : [currentSelection()].filter(Boolean));
function renderRoles() {
  $('roleChips').innerHTML = roles.map((r, i) =>
    `<span class="chip role">${escapeHtml(r.label)}<button type="button" data-i="${i}" aria-label="Ta bort">×</button></span>`).join('');
  $('roleChips').querySelectorAll('button').forEach((b) => b.onclick = () => {
    roles.splice(+b.dataset.i, 1); store.set('jm.roles', roles); renderRoles();
  });
}
$('addRole').addEventListener('click', () => {
  const r = currentSelection();
  if (!r) { $('field').focus(); return; }
  if (!roles.some((x) => x.id === r.id)) roles.push(r);
  store.set('jm.roles', roles);
  renderRoles();
});

function saveSelection() {
  store.set('jm.selection', { field: $('field').value, group: $('group').value, region: $('region').value, municipality: $('municipality').value });
}
$('field').addEventListener('change', () => { fillGroups(); saveSelection(); });
$('group').addEventListener('change', saveSelection);
$('region').addEventListener('change', async () => { await fillMunicipalities().catch(console.error); saveSelection(); });
$('municipality').addEventListener('change', saveSelection);

// ---------- Pendlingsavstånd ----------
const distanceActive = () => !!(home && $('radius').value);

function renderHome() {
  const parts = [];
  if (home) parts.push(`Hemort: <strong>${escapeHtml(home.label)}</strong> · <button class="linkbtn" id="homeClear">Ta bort</button>`);
  if ($('radius').value && !home) parts.push('Ange din ort eller använd din position för att kunna välja maxavstånd.');
  if (distanceActive() && ($('region').value || $('municipality').value)) parts.push('Län och kommun används inte när maxavstånd är valt.');
  $('homeStatus').innerHTML = parts.join('<br>');
  $('homeClear')?.addEventListener('click', () => { home = null; store.remove('jm.home'); renderHome(); rerank(); });
}

async function setHome(getter) {
  $('homeStatus').textContent = 'Letar upp platsen…';
  try {
    home = await getter();
    store.set('jm.home', home);
    if (!$('radius').value) $('radius').value = '30';
    store.set('jm.radius', $('radius').value);
    renderHome();
    rerank();
  } catch (err) {
    $('homeStatus').innerHTML = `<span style="color:var(--warn)">${escapeHtml(err.message)}</span>`;
  }
}
$('homeSearch').addEventListener('click', () => { const q = $('homeInput').value.trim(); if (q) setHome(() => geocode(q)); });
$('homeInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('homeSearch').click(); } });
$('homeLocate').addEventListener('click', () => setHome(currentPosition));
$('radius').value = store.get('jm.radius', '');
$('radius').addEventListener('change', () => { store.set('jm.radius', $('radius').value); renderHome(); rerank(); });

// ---------- CV ----------
let cvText = '';
let cvName = '';
let cvTerms = [];
const removedCvTerms = new Set();

async function handleCv(file) {
  if (!file) return;
  const info = $('cvInfo');
  info.hidden = false;
  const progress = (msg) => { info.textContent = msg; };
  progress('Läser CV…');
  try {
    cvText = await readCv(file, progress);
    cvName = file.name;
    removedCvTerms.clear();
    cvTerms = extractCvTerms(cvText, ads, removedCvTerms);
    renderCvInfo();
    rerank();
  } catch (err) {
    console.error(err);
    info.innerHTML = `<span style="color:var(--warn)">${escapeHtml(err.message)}</span>`;
  }
}

function renderCvInfo() {
  const info = $('cvInfo');
  if (!cvText) { info.hidden = true; return; }
  info.hidden = false;
  info.innerHTML = `
    <div class="row"><span>📄 ${escapeHtml(cvName)}</span><button class="linkbtn" id="cvRemove">Ta bort</button></div>
    <div class="hint" style="margin-top:6px">${cvTerms.length
      ? `Hittade ${cvTerms.length} kompetenser i ditt CV. Klicka × på det som inte stämmer.`
      : 'Hittade inga tydliga verktyg/kompetenser ännu. Fler kan dyka upp efter en sökning.'}</div>
    <div class="chips">${cvTerms.map((t) => `<span class="chip">${escapeHtml(t)}<button type="button" data-term="${escapeHtml(t)}" aria-label="Ta bort">×</button></span>`).join('')}</div>`;
  $('cvRemove').onclick = () => { cvText = ''; cvName = ''; cvTerms = []; $('cvFile').value = ''; renderCvInfo(); rerank(); };
  info.querySelectorAll('.chips button').forEach((b) => b.onclick = () => {
    removedCvTerms.add(lc(b.dataset.term));
    cvTerms = cvTerms.filter((t) => t !== b.dataset.term);
    renderCvInfo();
    rerank();
  });
}

const drop = $('drop');
drop.addEventListener('click', () => $('cvFile').click());
drop.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('cvFile').click(); } });
$('cvFile').addEventListener('change', (e) => handleCv(e.target.files[0]));
['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', (e) => handleCv(e.dataTransfer.files[0]));

// ---------- Sökning ----------
function searchPairs() {
  const rolePairs = activeRoles().map((r) => [r.type === 'field' ? 'occupation-field' : 'occupation-group', r.id]);
  const placePairs = $('municipality').value ? [['municipality', $('municipality').value]]
    : $('region').value ? [['region', $('region').value]] : [];
  if (distanceActive()) {
    // Links kan inte söka på avstånd och dess annonser saknar koordinater,
    // så de tas bara med när inget maxavstånd är valt.
    return {
      pairs: [...rolePairs, ['position', `${home.lat.toFixed(4)},${home.lon.toFixed(4)}`], ['position.radius', $('radius').value]],
      linksPairs: null,
    };
  }
  return { pairs: [...rolePairs, ...placePairs], linksPairs: $('includeLinks').checked ? [...rolePairs, ...placePairs] : null };
}

async function search({ silent = false, fromWatch = false } = {}) {
  if (searching) return;
  searching = true;
  const btn = $('searchBtn');
  if (!silent) {
    btn.disabled = true; btn.textContent = 'Söker…';
    $('results').innerHTML = `<div class="status">Hämtar annonser från de senaste ${DAYS} dagarna…</div>`;
    $('filters').hidden = true;
    setView('results');
  }
  const { pairs, linksPairs } = searchPairs();
  const queryTerms = [...new Set([...keywords.get(), ...tools.get(), ...cvTerms].map(lc))].slice(0, MAX_TERM_QUERIES);

  try {
    const previousIds = new Set(ads.map((a) => a.id));
    const result = await searchAds({ pairs, linksPairs, queryTerms, days: DAYS });
    ads = result.ads;
    totalAvailable = result.total;
    externalCount = result.external;
    searchedOnce = true;

    cvTerms = extractCvTerms(cvText, ads, removedCvTerms);
    renderCvInfo();
    computeScores();

    if (fromWatch) {
      const fresh = ads.filter((a) => !seen[a.id] && !previousIds.has(a.id) && passesFilters(a));
      if (fresh.length) notifyNew(fresh.length, silent);
    }
    if (!silent) shown = PAGE_SIZE;
    renderResults();
  } catch (err) {
    console.error(err);
    if (!silent) $('results').innerHTML = `<div class="status error">Kunde inte hämta annonser: ${escapeHtml(err.message)}. Kontrollera internetanslutningen och försök igen.</div>`;
  } finally {
    searching = false;
    btn.disabled = false; btn.textContent = 'Sök jobb';
  }
}

// ---------- Matchning, inlärning och avstånd ----------
const trackedAds = () => Object.values(tracker).map((e) => e.ad);
const findAd = (id) => ads.find((a) => a.id === id) || tracker[id]?.ad;

function computeScores() {
  currentTerms = buildTerms({ keywords: keywords.get(), tools: tools.get(), cvTerms });
  const profile = $('learn').checked
    ? buildProfile({ positive: trackedAds().map(adFeatures), negative: Object.values(hiddenInfo) })
    : null;
  for (const ad of [...ads, ...trackedAds()]) {
    ad._score = scoreAd(ad, currentTerms);
    ad._boost = profile ? learnedBoost(ad, profile) : 0;
    const c = ad.workplace_address?.coordinates;
    ad._dist = home && c?.length === 2 && c[0] != null ? distanceKm(home, { lat: c[1], lon: c[0] }) : null;
  }
}

function rerank() {
  if (!ready || (!searchedOnce && view !== 'tracker')) return;
  computeScores();
  renderResults();
}

// ---------- Filter ----------
const FILTER_IDS = ['sort', 'fWorkplace', 'fHours', 'fEmployment', 'onlyMatch', 'onlyNew', 'showHidden', 'learn', 'includeLinks'];
function loadFilters() {
  const f = store.get('jm.filters', {});
  FILTER_IDS.forEach((id) => {
    if (f[id] === undefined) return;
    if ($(id).type === 'checkbox') $(id).checked = f[id]; else $(id).value = f[id];
  });
}
function saveFilters() {
  store.set('jm.filters', Object.fromEntries(FILTER_IDS.map((id) => [id, $(id).type === 'checkbox' ? $(id).checked : $(id).value])));
}
FILTER_IDS.forEach((id) => $(id).addEventListener('change', () => { saveFilters(); shown = PAGE_SIZE; rerank(); }));

const REMOTE_RE = /distans|på distans|remote|hemifrån|arbeta hemma/i;
function isRemote(ad) {
  const label = ad.workplace_model?.label || '';
  return label === 'Distansarbete' || (!label && REMOTE_RE.test(adText(ad)));
}

function passesFilters(ad) {
  if (hidden.has(ad.id) && !$('showHidden').checked) return false;
  if ($('onlyMatch').checked && currentTerms.length && !ad._score?.matched.length) return false;
  if ($('onlyNew').checked && !isNew(ad)) return false;

  const wp = $('fWorkplace').value;
  if (wp) {
    const remote = isRemote(ad), hybrid = ad.workplace_model?.label === 'Hybridarbete';
    if (wp === 'remote' && !remote) return false;
    if (wp === 'hybrid' && !remote && !hybrid) return false;
    if (wp === 'onsite' && (remote || hybrid)) return false;
  }
  const hours = ad.working_hours_type?.label || '';
  if ($('fHours').value === 'full' && !hours.startsWith('Heltid')) return false;
  if ($('fHours').value === 'part' && !hours.startsWith('Deltid')) return false;
  // "Vanlig anställning" är den äldre benämningen på tillsvidareanställning.
  const emp = ad.employment_type?.label || '';
  const permanent = /tillsvidare|vanlig anställning/i.test(emp);
  if ($('fEmployment').value === 'perm' && !permanent) return false;
  if ($('fEmployment').value === 'temp' && (!emp || permanent)) return false;

  if (distanceActive() && !isRemote(ad) && (ad._dist == null || ad._dist > +$('radius').value)) return false;
  if (matchesAny(ad, excluded.get())) return false;
  return true;
}

// ---------- Visning ----------
function setView(v) {
  view = v;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.view === v));
}
document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
  setView(b.dataset.view); shown = PAGE_SIZE; computeScores(); renderResults();
}));

function renderResults() {
  $('trackerCount').textContent = Object.keys(tracker).length;
  renderReminder();
  const hasTerms = currentTerms.length > 0;
  $('onlyMatchWrap').style.display = hasTerms ? '' : 'none';

  if (view === 'tracker') { renderTracker(hasTerms); return; }
  if (!searchedOnce) return;
  if (!ads.length) {
    $('filters').hidden = true;
    $('results').innerHTML = `<div class="status">Inga annonser publicerade de senaste ${DAYS} dagarna matchade ditt urval. Prova en bredare roll, ett större avstånd eller ett annat län.</div>`;
    return;
  }

  const byMatch = $('sort').value === 'match';
  const rank = (ad) => (ad._score?.pct ?? 0) + (ad._boost || 0);
  const list = ads.filter(passesFilters).sort((a, b) => (byMatch ? rank(b) - rank(a) : 0) || b.publication_date.localeCompare(a.publication_date));

  $('filters').hidden = false;
  const filteredOut = ads.length - list.length;
  const notes = [
    externalCount && `${externalCount} från andra jobbsajter`,
    filteredOut && `${filteredOut} bortfiltrerade`,
    totalAvailable > ads.length && !activeRoles().length && 'välj bransch eller roll för att se fler',
  ].filter(Boolean);
  $('results').innerHTML =
    `<p class="count">${list.length.toLocaleString('sv-SE')} annonser senaste ${DAYS} dagarna` +
    `<span class="sub">${notes.length ? ' · ' + notes.join(' · ') : ''}</span></p>` +
    (list.length
      ? list.slice(0, shown).map((ad) => jobCard(ad, hasTerms)).join('') +
        (list.length > shown ? `<div class="more"><button class="secondary" data-action="more">Visa fler (${list.length - shown} kvar)</button></div>` : '')
      : '<div class="status">Inga annonser kvar med de här filtren. Prova att ändra filtren ovan.</div>');

  // Allt som visats räknas som sett, så att det inte markeras som nytt nästa gång.
  const now = Date.now();
  ads.forEach((a) => { if (!seen[a.id]) seen[a.id] = now; });
  store.set('jm.seen', seen);
}

function renderTracker(hasTerms) {
  $('filters').hidden = true;
  const entries = Object.values(tracker);
  if (!entries.length) {
    $('results').innerHTML = '<div class="status">Inga annonser här ännu. Klicka <strong>☆ Spara</strong> på en annons för att börja följa den. Här kan du sedan ändra status, skriva anteckningar och spara ditt personliga brev.</div>';
    return;
  }
  $('results').innerHTML = STATUSES.map((s) => {
    const group = entries.filter((e) => e.status === s.id).sort((a, b) => b.updated - a.updated);
    if (!group.length) return '';
    return `<h3 class="group-title">${s.label} <span>${group.length}</span></h3>` + group.map((e) => jobCard(e.ad, hasTerms)).join('');
  }).join('');
}

function renderReminder() {
  const due = dueSoon(tracker, DEADLINE_SOON_DAYS);
  const el = $('reminder');
  el.hidden = !due.length;
  if (!due.length) return;
  el.innerHTML = `⏰ <strong>Sista ansökningsdag närmar sig</strong> för ${due.length === 1 ? 'en sparad annons' : `${due.length} sparade annonser`}:<ul>` +
    due.map((e) => `<li><a href="${escapeHtml(e.ad.webpage_url)}" target="_blank" rel="noopener">${escapeHtml(e.ad.headline)}</a>, ${escapeHtml(e.ad.employer?.name || '')}: ${daysLeftText(e.daysLeft)}</li>`).join('') + '</ul>';
}

// En påminnelse per dag som notis, om du tillåtit notiser.
function notifyReminder() {
  const due = dueSoon(tracker, DEADLINE_SOON_DAYS);
  const today = new Date().toISOString().slice(0, 10);
  if (!due.length || store.get('jm.lastReminder') === today) return;
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  new Notification('Jobbmatchen: sista ansökningsdag snart', { body: due.map((e) => `${e.ad.headline} (${daysLeftText(e.daysLeft)})`).join('\n') });
  store.set('jm.lastReminder', today);
}

function highlight(text, terms) {
  let html = escapeHtml(text);
  const variants = [...new Set(terms.flatMap((t) => t.variants))].sort((a, b) => b.length - a.length);
  variants.forEach((v) => { html = html.replace(termRegex(escapeHtml(v), 'giu'), (m) => `<mark>${m}</mark>`); });
  return html;
}

const shortDate = (d) => new Date(d).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

function jobCard(ad, hasTerms) {
  const entry = tracker[ad.id];
  const when = relativeDate(ad.publication_date);
  const places = ad._places?.length ? ad._places : [ad.workplace_address?.municipality].filter(Boolean);
  const region = ad.workplace_address?.region;
  const place = places.length
    ? `${places[0]}${places.length > 1 ? ` +${places.length - 1} orter` : region ? ', ' + region : ''}`
    : ad.workplace_model?.label || 'Ort ej angiven';
  const daysLeft = daysUntil(ad.application_deadline);
  const s = ad._score || { pct: null, matched: [], missed: [], lacking: [] };
  const color = s.pct >= 60 ? 'var(--good)' : s.pct >= 30 ? 'var(--mid)' : 'var(--low)';
  const id = escapeHtml(ad.id);
  const isHidden = hidden.has(ad.id);
  const learn = $('learn').checked;

  const badges = [
    isNew(ad) && '<span class="badge new">NY</span>',
    entry && view !== 'tracker' && `<span class="badge status">${statusLabel(entry.status)}</span>`,
    entry?.appliedAt && `<span class="badge status">Sökt ${shortDate(entry.appliedAt)}</span>`,
    daysLeft !== null && daysLeft >= 0 && daysLeft <= DEADLINE_SOON_DAYS && `<span class="badge urgent">⏰ Sista dag ${daysLeftText(daysLeft)}</span>`,
    daysLeft !== null && daysLeft < 0 && '<span class="badge urgent">Ansökningstiden har gått ut</span>',
    ad.salary_description && `<span class="badge salary">💰 ${escapeHtml(ad.salary_description.slice(0, 80))}</span>`,
    ad.workplace_model?.label && ad.workplace_model.label !== 'Arbete på plats' && `<span class="badge">${escapeHtml(ad.workplace_model.label)}</span>`,
    ad.driving_license_required && '<span class="badge">🚗 Körkort krävs</span>',
    ad.experience_required === false && '<span class="badge">Ingen erfarenhet krävs</span>',
    ad._source && `<span class="badge">Källa: ${escapeHtml(ad._source)}</span>`,
    learn && ad._boost >= 8 && '<span class="badge liked" title="Liknar annonser du sparat eller sökt">👍 Liknar dina sparade</span>',
    learn && ad._boost <= -8 && '<span class="badge" title="Liknar annonser du dolt">👎 Liknar dina dolda</span>',
  ].filter(Boolean).join('');

  const scoreHtml = hasTerms ? `
    <div class="score" title="Andel av dina nyckelord, verktyg och CV-kompetenser som finns i annonsen. Träffar i rubriken och kravdelen väger tyngre.">
      <div class="pct" style="color:${color}">${s.pct}%</div>
      <div class="lbl">matchning</div>
      <div class="bar"><span style="width:${s.pct}%;background:${color}"></span></div>
    </div>` : '';
  const typeLabel = { kw: 'Nyckelord', tool: 'Verktyg/system', cv: 'Från ditt CV' };
  const tags = hasTerms ? `
    <div class="matched">
      ${s.matched.map((t) => `<span class="tag ${t.type === 'cv' ? 'cv' : ''} ${t.req ? 'req' : ''}" title="${typeLabel[t.type]}${t.req ? ' · står bland kraven' : ''}${t.via ? ` · hittades som "${escapeHtml(t.via)}"` : ''}">✓ ${escapeHtml(t.term)}${t.req ? ' <small>krav</small>' : ''}</span>`).join('')}
      ${s.missed.map((t) => `<span class="tag miss" title="Finns inte i annonsen">${escapeHtml(t.term)}</span>`).join('')}
      ${s.lacking.map((l) => `<span class="tag lack" title="Annonsen kräver detta men det finns inte bland dina verktyg eller i ditt CV">Krav: ${escapeHtml(l)}</span>`).join('')}
    </div>` : '';

  const statusSelect = entry
    ? `<select data-action="status" data-id="${id}" aria-label="Status">${STATUSES.map((st) => `<option value="${st.id}" ${st.id === entry.status ? 'selected' : ''}>${st.label}</option>`).join('')}</select>
       <button class="linkbtn" data-action="untrack" data-id="${id}">Sluta följa</button>`
    : `<button class="linkbtn" data-action="save" data-id="${id}">☆ Spara</button>`;

  const track = entry && (view === 'tracker' || entry.letter) ? `
    <div class="track">
      ${view === 'tracker' ? `<label for="notes-${id}">Anteckningar</label>
      <textarea id="notes-${id}" data-field="notes" data-id="${id}" placeholder="T.ex. kontaktperson, intervjudatum, frågor att ställa…">${escapeHtml(entry.notes)}</textarea>` : ''}
      ${entry.letter ? `<label for="letter-${id}">Personligt brev (utkast, redigera fritt)</label>
      <textarea id="letter-${id}" data-field="letter" data-id="${id}" style="min-height:220px">${escapeHtml(entry.letter)}</textarea>
      <div><button class="linkbtn" data-action="copy" data-id="${id}">📋 Kopiera brevet</button></div>` : ''}
    </div>` : '';

  const openText = ad._source ? `Öppna på ${escapeHtml(ad._source)} ↗` : 'Öppna i Platsbanken ↗';

  return `
    <article class="job ${isHidden ? 'dim' : ''}">
      <div class="job-top">
        <div>
          <h2><a href="${escapeHtml(ad.webpage_url)}" target="_blank" rel="noopener">${escapeHtml(ad.headline)}</a></h2>
          <div class="employer">${escapeHtml(ad.employer?.name || '')}</div>
          <div class="meta">
            <span class="${when.fresh ? 'fresh' : ''}">🕒 ${when.text}</span>
            <span title="${escapeHtml(places.join(', '))}">📍 ${escapeHtml(place)}</span>
            ${ad._dist != null ? `<span title="Fågelvägen från din hemort">🚗 ${Math.round(ad._dist)} km</span>` : ''}
            ${ad.occupation?.label ? `<span>💼 ${escapeHtml(ad.occupation.label)}</span>` : ''}
            ${ad.working_hours_type?.label ? `<span>${escapeHtml(ad.working_hours_type.label)}</span>` : ''}
            ${ad.employment_type?.label ? `<span>${escapeHtml(ad.employment_type.label.replace(/\s*\(.*\)/, ''))}</span>` : ''}
            ${ad.application_deadline ? `<span>Sök senast ${shortDate(ad.application_deadline)}</span>` : ''}
          </div>
          ${badges ? `<div class="badges">${badges}</div>` : ''}
        </div>
        ${scoreHtml}
      </div>
      ${tags}
      <div class="desc" id="desc-${id}" data-open="0">${highlight(snippet(ad.description?.text), currentTerms)}</div>
      ${track}
      <div class="ai" id="ai-${id}">${ad._ai ? aiHtml(ad._ai) : ''}</div>
      <div class="actions">
        <button class="linkbtn" data-action="toggle" data-id="${id}">Visa hela annonsen</button>
        <a href="${escapeHtml(ad.webpage_url)}" target="_blank" rel="noopener">${openText}</a>
        ${statusSelect}
        <button class="linkbtn" data-action="hide" data-id="${id}">${isHidden ? 'Visa igen' : 'Dölj'}</button>
      </div>
      <div class="actions">
        <button class="linkbtn" data-action="ai-analyze" data-id="${id}">🤖 Hur väl passar jag?</button>
        <button class="linkbtn" data-action="ai-letter" data-id="${id}">✉️ Skriv personligt brev</button>
        <button class="linkbtn" data-action="ai-cv" data-id="${id}">📝 Tips för CV:t</button>
      </div>
    </article>`;
}

// ---------- Klick och inmatning i listan ----------
$('results').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn || btn.tagName === 'SELECT') return;
  const id = btn.dataset.id;
  const ad = id && findAd(id);
  switch (btn.dataset.action) {
    case 'more':
      shown += PAGE_SIZE; renderResults(); return;
    case 'toggle': {
      const desc = $('desc-' + id);
      const open = desc.dataset.open === '1';
      desc.innerHTML = highlight(open ? snippet(ad.description?.text) : ad.description?.text || '', currentTerms);
      desc.dataset.open = open ? '0' : '1';
      btn.textContent = open ? 'Visa hela annonsen' : 'Visa mindre';
      return;
    }
    case 'save':
      setStatus(tracker, ad, 'saved'); saveTracker(); break;
    case 'untrack':
      if (tracker[id]?.letter && !confirm('Annonsen har ett sparat personligt brev. Sluta följa den ändå?')) return;
      delete tracker[id]; saveTracker(); break;
    case 'hide':
      if (hidden.has(id)) { hidden.delete(id); delete hiddenInfo[id]; }
      else { hidden.add(id); hiddenInfo[id] = adFeatures(ad); }
      store.set('jm.hidden', [...hidden]);
      store.set('jm.hiddenInfo', hiddenInfo);
      break;
    case 'copy':
      navigator.clipboard?.writeText(tracker[id]?.letter || '').then(() => { btn.textContent = '✓ Kopierat'; });
      return;
    case 'ai-analyze': runAi('analyze', ad); return;
    case 'ai-letter': runAi('letter', ad); return;
    case 'ai-cv': runAi('cv', ad); return;
    default: return;
  }
  computeScores();
  renderResults();
});

$('results').addEventListener('change', (e) => {
  if (e.target.dataset.action !== 'status') return;
  setStatus(tracker, findAd(e.target.dataset.id), e.target.value);
  saveTracker();
  renderResults();
});

// Anteckningar och brev sparas medan du skriver, utan att listan ritas om.
let typingTimer = null;
$('results').addEventListener('input', (e) => {
  const { field, id } = e.target.dataset;
  if (!field || !tracker[id]) return;
  tracker[id][field] = e.target.value;
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => { update(tracker, id, {}); saveTracker(); }, 400);
});

// ---------- AI-hjälp ----------
function aiHtml(r) {
  const list = (items) => items.length ? `<ul>${items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : '<p>–</p>';
  if (r.kind === 'error') return `<span class="err">${escapeHtml(r.message)}</span>`;
  if (r.kind === 'busy') return escapeHtml(r.message);
  if (r.kind === 'cv') {
    return `<h3>📝 Så kan du anpassa CV:t</h3><ul>${r.data.tips.map((t) => `<li><strong>${escapeHtml(t.rubrik)}:</strong> ${escapeHtml(t.forslag)}</li>`).join('')}</ul>` +
      (r.data.nyckelord.length ? `<strong>Ord att få med om de stämmer:</strong> ${r.data.nyckelord.map(escapeHtml).join(', ')}` : '');
  }
  const d = r.data;
  return `
    <h3>🤖 AI-bedömning: ${escapeHtml(d.matchning)}% matchning</h3>
    <p>${escapeHtml(d.sammanfattning)}</p>
    <strong>Styrkor</strong>${list(d.styrkor)}
    <strong>Luckor</strong>${list(d.luckor)}
    <strong>Tips för ansökan:</strong> ${escapeHtml(d.tips)}`;
}

const AI_BUSY = { analyze: 'Bedömer hur väl du passar…', letter: 'Skriver ett utkast till personligt brev…', cv: 'Tar fram tips för ditt CV…' };

async function runAi(kind, ad) {
  const box = $('ai-' + ad.id);
  const show = (r) => { ad._ai = r; box.innerHTML = aiHtml(r); };
  const apiKey = store.get('jm.apiKey', '');
  if (!apiKey) {
    show({ kind: 'error', message: 'Lägg in din Anthropic API-nyckel under 🤖 AI-hjälp i vänsterspalten först.' });
    $('aiSettings').open = true;
    return;
  }
  if (!cvText && !currentTerms.length) {
    show({ kind: 'error', message: 'Ladda upp ditt CV eller lägg till nyckelord/verktyg så att AI:n har något att utgå från.' });
    return;
  }
  show({ kind: 'busy', message: AI_BUSY[kind] });
  const profileData = { keywords: keywords.get(), tools: tools.get(), cvText };
  try {
    if (kind === 'letter') {
      const letter = await ai.coverLetter(apiKey, profileData, ad);
      // Brevet sparas på annonsen under Mina ansökningar så att det inte försvinner.
      if (!tracker[ad.id]) setStatus(tracker, ad, 'saved');
      update(tracker, ad.id, { letter });
      saveTracker();
      ad._ai = null;
      renderResults();
      return;
    }
    const data = kind === 'cv' ? await ai.cvTips(apiKey, profileData, ad) : await ai.analyze(apiKey, profileData, ad);
    show({ kind, data });
  } catch (err) {
    console.error(err);
    show({ kind: 'error', message: ai.describeError(err) });
  }
}

function renderKeyStatus() {
  const key = store.get('jm.apiKey', '');
  $('keyStatus').textContent = key ? `✓ Nyckel sparad (…${key.slice(-4)})` : 'Ingen nyckel sparad.';
}
$('saveKey').addEventListener('click', () => {
  const key = $('apiKey').value.trim();
  if (!key) return;
  store.set('jm.apiKey', key);
  $('apiKey').value = '';
  renderKeyStatus();
});
$('clearKey').addEventListener('click', () => { store.remove('jm.apiKey'); renderKeyStatus(); });

// ---------- Export och import ----------
$('exportBtn').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(exportData(localStorage), null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `jobbmatchen-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  $('dataStatus').textContent = '✓ Filen har laddats ner.';
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const count = importData(localStorage, JSON.parse(await file.text()));
    $('dataStatus').textContent = `✓ Importerade ${count} inställningar. Laddar om…`;
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    $('dataStatus').innerHTML = `<span style="color:var(--warn)">${escapeHtml(err instanceof SyntaxError ? 'Filen kunde inte läsas.' : err.message)}</span>`;
  }
});

// ---------- Bevakning ----------
function notifyNew(count, silent) {
  const msg = `${count} ${count === 1 ? 'ny annons' : 'nya annonser'} sedan ${silent ? 'senaste kollen' : 'ditt förra besök'}.`;
  $('banner').hidden = false;
  $('banner').textContent = `🔔 ${msg} De är markerade med NY.`;
  if (silent) {
    document.title = `(${count}) Jobbmatchen`;
    if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification('Jobbmatchen', { body: msg + ' Klicka för att se dem.' });
      n.onclick = () => { window.focus(); n.close(); };
    }
  }
}
window.addEventListener('focus', () => { document.title = 'Jobbmatchen'; });

function setupWatch() {
  clearInterval(watchTimer);
  if ($('watch').checked) watchTimer = setInterval(() => search({ silent: true, fromWatch: true }), WATCH_INTERVAL);
}
$('watch').checked = store.get('jm.watch', false);
$('watch').addEventListener('change', async () => {
  if ($('watch').checked && 'Notification' in window && Notification.permission === 'default') {
    try { await Notification.requestPermission(); } catch { /* notiser stöds inte */ }
  }
  store.set('jm.watch', $('watch').checked);
  setupWatch();
});

// ---------- Start ----------
$('searchBtn').addEventListener('click', () => {
  if (!activeRoles().length && !keywords.get().length && !tools.get().length && !cvText) {
    setView('results');
    $('results').innerHTML = '<div class="status">Välj minst en bransch eller roll, eller lägg till nyckelord, så att sökningen blir relevant.</div>';
    return;
  }
  $('banner').hidden = true;
  search();
});

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Kunde inte installera offlinestöd', err));
}

ready = true;
loadFilters();
renderRoles();
renderHome();
renderKeyStatus();
renderResults();
notifyReminder();
loadSynonymGroups(store)
  .then((groups) => { setSynonymGroups(groups); rerank(); })
  .catch((err) => console.warn('Synonymer kunde inte laddas', err));
initTaxonomy()
  .then(() => {
    renderHome();
    setupWatch();
    if ($('watch').checked && (activeRoles().length || keywords.get().length || tools.get().length)) search({ fromWatch: true });
  })
  .catch((err) => {
    console.error(err);
    $('field').innerHTML = '<option value="">Kunde inte ladda branscher. Ladda om sidan.</option>';
  });
