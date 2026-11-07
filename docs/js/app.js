import { CONFIG } from './config.js';
import * as G from './geo.js';
import * as API from './api.js';
import { CATEGORIES, CAT_BY_ID, buildQuery, categoryOf, highlights } from './categories.js';

const COLORS = ['#E8505B', '#2E74B5', '#F5A623', '#2BB673', '#8E5CF7', '#00A9C6', '#F06EAA', '#5B6B7A', '#C77C2E', '#3D4CC9'];
const LETTERS = 'ABCDEFGHIJ';
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TRAVEL_WORD = { car: 'driving', bike: 'cycling', foot: 'walking' };
const isMobile = () => matchMedia('(max-width: 760px)').matches;

const state = {
  people: [],
  mode: 'time',
  travel: 'car',
  meet: null, // { lat, lng, times[], roadDists[], straight[], name, manual }
  manual: false,
  cats: new Set(['pub', 'cafe']),
  radius: 600,
  venues: [],
  showAll: false,
  selected: null,
  sponsors: [],
};
let nextId = 1;

/* ------------------------------------------------------------------ analytics */
function track(name, params = {}) {
  if (window.gtag) window.gtag('event', name, params);
}
if (CONFIG.gaMeasurementId) {
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${CONFIG.gaMeasurementId}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', CONFIG.gaMeasurementId);
}

/* ------------------------------------------------------------------ map */
// Start the map (and the example) in the visitor's likely city, from their timezone — no lookup needed.
const REGIONS = {
  london: { center: [-0.1, 51.51], ex: [['Camden Town', 51.539, -0.1426], ['Peckham', 51.474, -0.069], ['Hammersmith', 51.4927, -0.224], ['Hackney Central', 51.545, -0.0553]] },
  melbourne: { center: [144.96, -37.81], ex: [['Brunswick', -37.7667, 144.9603], ['St Kilda', -37.8676, 144.9809], ['Footscray', -37.8, 144.9], ['Richmond', -37.8183, 145.0018]] },
  sydney: { center: [151.2, -33.87], ex: [['Bondi', -33.8915, 151.2767], ['Newtown', -33.8981, 151.1749], ['Manly', -33.7969, 151.2878], ['Parramatta', -33.8151, 151.0011]] },
  newyork: { center: [-73.97, 40.73], ex: [['Williamsburg', 40.7081, -73.9571], ['Upper West Side', 40.787, -73.9754], ['Astoria', 40.7644, -73.9235], ['Park Slope', 40.671, -73.9814]] },
  sanfrancisco: { center: [-122.35, 37.77], ex: [['Mission District', 37.7599, -122.4148], ['Oakland', 37.8044, -122.2712], ['Sausalito', 37.8591, -122.4853], ['Daly City', 37.6879, -122.4702]] },
};
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
const REGION = /Melbourne|Hobart/.test(TZ) ? REGIONS.melbourne : /Sydney|Brisbane|Canberra/.test(TZ) ? REGIONS.sydney
  : /New_York|Toronto|Detroit/.test(TZ) ? REGIONS.newyork : /Los_Angeles|Vancouver/.test(TZ) ? REGIONS.sanfrancisco : REGIONS.london;

const dark = matchMedia('(prefers-color-scheme: dark)').matches;
const map = new maplibregl.Map({
  container: 'map',
  style: dark ? CONFIG.mapStyle.dark : CONFIG.mapStyle.light,
  center: REGION.center,
  zoom: 10.3,
  attributionControl: { compact: true },
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
const mapReady = new Promise((r) => map.on('load', r));

mapReady.then(() => {
  map.addSource('zone', { type: 'geojson', data: emptyFC() });
  map.addSource('links', { type: 'geojson', data: emptyFC() });
  map.addLayer({ id: 'zone-fill', type: 'fill', source: 'zone', paint: { 'fill-color': '#2E74B5', 'fill-opacity': 0.08 } });
  map.addLayer({ id: 'zone-line', type: 'line', source: 'zone', paint: { 'line-color': '#2E74B5', 'line-width': 2, 'line-dasharray': [2, 2], 'line-opacity': 0.7 } });
  map.addLayer({
    id: 'links-casing', type: 'line', source: 'links', layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': dark ? '#0d141c' : '#ffffff', 'line-width': 7, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'links', type: 'line', source: 'links', filter: ['!', ['get', 'straight']], layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 4 },
  });
  map.addLayer({
    id: 'links-straight', type: 'line', source: 'links', filter: ['get', 'straight'], layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-width': 3.5, 'line-dasharray': [0.5, 2] },
  });
});
function emptyFC() { return { type: 'FeatureCollection', features: [] }; }
function setData(id, data) { mapReady.then(() => map.getSource(id)?.setData(data)); }

function panelPadding() {
  if (isMobile()) return { top: 60, bottom: window.innerHeight * 0.62 + 20, left: 30, right: 30 };
  return { top: 70, bottom: 50, left: 460, right: 70 };
}

map.on('click', async (e) => {
  if (e.originalEvent.target.closest('.vpin, .pin, .meet-pin')) return;
  let p = state.people.find((x) => x.lat == null);
  if (!p) {
    if (state.people.length >= CONFIG.maxPeople) return toast(`That's the max of ${CONFIG.maxPeople} people`);
    p = addPerson();
  }
  setPersonLocation(p, { lat: e.lngLat.lat, lng: e.lngLat.lng, label: 'Dropped pin', sub: '' }, true);
});

/* ------------------------------------------------------------------ people */
function addPerson(data) {
  if (state.people.length >= CONFIG.maxPeople) return null;
  const used = new Set(state.people.map((p) => p.idx));
  let idx = 0;
  while (used.has(idx)) idx++;
  const p = { id: nextId++, idx, color: COLORS[idx], letter: LETTERS[idx], lat: null, lng: null, label: '', sub: '' };
  state.people.push(p);
  renderPeople();
  if (data) setPersonLocation(p, data, false);
  return p;
}

function removePerson(p) {
  p.marker?.remove();
  state.people = state.people.filter((x) => x !== p);
  if (state.people.length < 2) addPerson();
  renderPeople();
  schedule();
}

async function setPersonLocation(p, loc, needLabel) {
  p.lat = loc.lat; p.lng = loc.lng; p.label = loc.label; p.sub = loc.sub || '';
  placePersonMarker(p);
  renderPeople();
  state.manual = false;
  schedule();
  if (needLabel) {
    const r = await API.reverse(p).catch(() => null);
    if (r && p.lat === loc.lat) { p.label = r.label; p.sub = r.sub; renderPeople(); syncHash(); }
  }
}

function placePersonMarker(p) {
  if (!p.marker) {
    const el = document.createElement('div');
    el.innerHTML = `<div class="pin" style="background:${p.color}"><span>${p.letter}</span></div>`;
    el.title = 'Drag to adjust';
    p.marker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom', offset: [0, -4] }).setLngLat([p.lng, p.lat]).addTo(map);
    p.marker.on('dragend', () => {
      const ll = p.marker.getLngLat();
      setPersonLocation(p, { lat: ll.lat, lng: ll.lng, label: 'Dropped pin' }, true);
    });
  } else {
    p.marker.setLngLat([p.lng, p.lat]);
  }
}

function renderPeople() {
  const ol = $('#people');
  // Keep focused input stable: only rebuild rows whose identity changed.
  const existing = new Map([...ol.children].map((li) => [Number(li.dataset.id), li]));
  const frag = document.createDocumentFragment();
  state.people.forEach((p, i) => {
    let li = existing.get(p.id);
    if (!li) li = buildPersonRow(p);
    li.classList.toggle('set', p.lat != null);
    const input = $('input', li);
    if (document.activeElement !== input) input.value = p.lat != null ? [p.label, p.sub].filter(Boolean).join(', ') : input.value;
    $('.remove', li).hidden = state.people.length <= 2 && p.lat == null;
    $('.locate', li).hidden = i !== 0 || p.lat != null;
    frag.appendChild(li);
  });
  ol.replaceChildren(frag);
  $('#add-person').disabled = state.people.length >= CONFIG.maxPeople;
  $('#add-person').textContent = state.people.length >= CONFIG.maxPeople ? 'Max 10 people' : '＋ Add someone';
}

function buildPersonRow(p) {
  const li = document.createElement('li');
  li.className = 'person';
  li.dataset.id = p.id;
  li.innerHTML = `
    <span class="avatar" style="background:${p.color}">${p.letter}</span>
    <div class="field">
      <input type="text" autocomplete="off" spellcheck="false" placeholder="Address, postcode or place"
        aria-label="Starting point ${p.letter}" role="combobox" aria-expanded="false" aria-autocomplete="list" />
      <ul class="suggest" role="listbox" hidden></ul>
    </div>
    <button class="icon-btn locate" type="button" title="Use my location" aria-label="Use my location">⌖</button>
    <button class="icon-btn remove" type="button" title="Remove" aria-label="Remove person ${p.letter}">✕</button>`;
  const input = $('input', li);
  const list = $('.suggest', li);
  let items = [], active = -1, timer, ctrl;

  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); active = -1; };
  const choose = (it) => {
    close();
    input.value = [it.label, it.sub].filter(Boolean).join(', ');
    setPersonLocation(p, it, false);
    const nextEmpty = state.people.find((x) => x.lat == null && x !== p);
    if (nextEmpty) setTimeout(() => $(`[data-id="${nextEmpty.id}"] input`)?.focus(), 50);
    else input.blur();
  };
  const draw = () => {
    list.innerHTML = items.length
      ? items.map((it, i) => `<li role="option" data-i="${i}" aria-selected="${i === active}"><b>${esc(it.label)}</b><span>${esc(it.sub)}</span></li>`).join('')
      : '<li class="empty">No matches — try a postcode or tap the map</li>';
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    ctrl?.abort();
    const q = input.value.trim();
    if (q.length < 3) return close();
    timer = setTimeout(async () => {
      ctrl = new AbortController();
      const c = map.getCenter();
      try {
        items = await API.searchPlaces(q, { lat: c.lat, lng: c.lng }, ctrl.signal);
        active = items.length ? 0 : -1;
        if (document.activeElement === input) draw();
      } catch (e) { if (e.name !== 'AbortError') toast('Search is busy — try again in a sec'); }
    }, 220);
  });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { active = Math.min(items.length - 1, active + 1); draw(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { active = Math.max(0, active - 1); draw(); e.preventDefault(); }
    else if (e.key === 'Enter') { if (items[active]) choose(items[active]); e.preventDefault(); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 160));
  input.addEventListener('focus', () => { if (p.lat != null) input.select(); });
  list.addEventListener('mousedown', (e) => {
    const li2 = e.target.closest('li[data-i]');
    if (li2) { e.preventDefault(); choose(items[Number(li2.dataset.i)]); }
  });
  $('.remove', li).addEventListener('click', () => removePerson(p));
  $('.locate', li).addEventListener('click', () => {
    if (!navigator.geolocation) return toast('Location is not available in this browser');
    status('Finding you…');
    navigator.geolocation.getCurrentPosition(
      (pos) => { status(); setPersonLocation(p, { lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'My location' }, true); map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12 }); },
      () => { status(); toast('Could not get your location'); },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  });
  return li;
}

/* ------------------------------------------------------------------ compute (interruptible) */
let computeCtrl, computeTimer;
function schedule(delay = 250) {
  clearTimeout(computeTimer);
  computeCtrl?.abort();
  syncHash();
  computeTimer = setTimeout(() => compute(), delay);
}

const located = () => state.people.filter((p) => p.lat != null);

async function compute() {
  computeCtrl?.abort();
  const ctrl = (computeCtrl = new AbortController());
  const signal = ctrl.signal;
  const pts = located();
  if (pts.length < 2) {
    state.meet = null;
    renderResult();
    clearMeet();
    if (pts.length === 1) map.flyTo({ center: [pts[0].lng, pts[0].lat], zoom: Math.max(map.getZoom(), 11) });
    return;
  }
  setBusy(true);
  try {
    let meet;
    if (state.manual && state.meet) {
      meet = await evaluatePoint(pts, { lat: state.meet.lat, lng: state.meet.lng }, signal);
      meet.manual = true;
    } else if (state.mode === 'distance') {
      status('Finding the equal-distance point…');
      const center = equalDistancePoint(pts);
      meet = await evaluatePoint(pts, center, signal);
    } else {
      status(`Balancing ${TRAVEL_WORD[state.travel]} times for ${pts.length} people…`);
      meet = await equalTimePoint(pts, signal, (rough) => {
        // Show the first-pass answer straight away; refinement continues in the background.
        if (signal.aborted) return;
        state.meet = { ...rough, name: null };
        renderResult(); placeMeetMarker(); fitAll();
        loadVenues(); // start the (slow) venue lookup now; refinement rarely moves far
        status('Fine-tuning…');
      });
    }
    if (signal.aborted) return;
    const prevName = state.meet?.name;
    const moved = !state.meet || G.haversine(state.meet, meet) > 50;
    state.meet = { ...meet, name: moved ? null : prevName };
    renderResult();
    placeMeetMarker();
    drawLinks(pts, signal);
    if (!state.meet.manual) fitAll();
    track('find_middle', { mode: state.mode, travel: state.travel, people: pts.length });
    status();
    nameMeet(signal);
    loadVenues();
  } catch (e) {
    if (e.name === 'AbortError') return;
    console.error(e);
    status();
    toast('Routing service is busy — showing equal distance instead');
    try {
      const c = equalDistancePoint(pts);
      state.meet = { ...c, times: pts.map(() => null), roadDists: pts.map(() => null), straight: pts.map((p) => G.haversine(p, c)), degraded: true };
      renderResult(); placeMeetMarker(); fitAll(); loadVenues();
    } catch {}
  } finally {
    if (computeCtrl === ctrl) setBusy(false);
  }
}

function equalDistancePoint(pts) {
  const proj = G.makeProjection(pts);
  const c = G.minEnclosingCircle(pts.map(proj.fwd));
  return proj.inv(c);
}

async function evaluatePoint(pts, pt, signal) {
  const t = await API.table(state.travel, pts, [pt], signal).catch((e) => { if (e.name === 'AbortError') throw e; return null; });
  return {
    lat: pt.lat, lng: pt.lng,
    times: pts.map((_, i) => t?.durations?.[i]?.[0] ?? null),
    roadDists: pts.map((_, i) => t?.distances?.[i]?.[0] ?? null),
    straight: pts.map((p) => G.haversine(p, pt)),
  };
}

// Equal travel time: sample a grid of candidate spots, get everyone's travel time to each
// (one matrix request), keep the spot with the shortest worst-case journey and the smallest
// gap between people, then refine around it with a finer grid.
function fairness(times) {
  if (times.some((t) => t == null)) return Infinity;
  const max = Math.max(...times), min = Math.min(...times);
  return max + 0.6 * (max - min);
}
async function equalTimePoint(pts, signal, onRough) {
  const proj = G.makeProjection(pts);
  const xy = pts.map(proj.fwd);
  const mec = G.minEnclosingCircle(xy);
  const budget = Math.max(30, 90 - pts.length);
  const evalGrid = async (center, radius, n) => {
    const grid = G.hexGrid(center, radius, n);
    const cands = grid.points.map(proj.inv);
    const t = await API.table(state.travel, pts, cands, signal);
    let best = null;
    cands.forEach((c, j) => {
      const times = pts.map((_, i) => t.durations[i][j]);
      const score = fairness(times);
      if (!best || score < best.score) {
        best = { score, j, times, roadDists: pts.map((_, i) => t.distances?.[i]?.[j] ?? null), loc: t.snapped[j], xy: grid.points[j] };
      }
    });
    return { best, spacing: grid.spacing };
  };
  const r1 = Math.max(mec.r * 1.05, 600);
  const pass1 = await evalGrid(mec, r1, budget);
  if (!pass1.best || pass1.best.score === Infinity) throw new Error('unroutable');
  const shape = (b) => ({ lat: b.loc.lat, lng: b.loc.lng, times: b.times, roadDists: b.roadDists, straight: pts.map((p) => G.haversine(p, b.loc)) });
  onRough?.(shape(pass1.best));
  const pass2 = await evalGrid(pass1.best.xy, pass1.spacing * 1.25, 30).catch((e) => {
    if (e.name === 'AbortError') throw e;
    return { best: null };
  });
  const best = pass2.best && pass2.best.score < pass1.best.score ? pass2.best : pass1.best;
  return {
    lat: best.loc.lat, lng: best.loc.lng, times: best.times, roadDists: best.roadDists,
    straight: pts.map((p) => G.haversine(p, best.loc)),
  };
}

async function nameMeet(signal) {
  if (state.meet?.name) return renderMeetName();
  const m = state.meet;
  const r = await API.reverse(m, signal).catch(() => null);
  if (state.meet !== m) return;
  const pr = r?.props || {};
  const area = pr.district || pr.locality || pr.city;
  const spot = pr.street || r?.label;
  m.name = r ? [spot, area !== spot ? area : null].filter(Boolean).join(', ') : 'Your meeting point';
  renderMeetName();
}

/* ------------------------------------------------------------------ meeting point on the map */
let meetMarker;
function placeMeetMarker() {
  const m = state.meet;
  if (!meetMarker) {
    const el = document.createElement('div');
    el.className = 'meet-pin';
    el.style.zIndex = '5';
    el.innerHTML = `<img src="assets/mark.svg" alt="" width="54" height="54" draggable="false" />`;
    el.title = 'Fair meeting point — drag to fine-tune';
    meetMarker = new maplibregl.Marker({ element: el, draggable: true, anchor: 'bottom' }).setLngLat([m.lng, m.lat]).addTo(map);
    meetMarker.on('dragstart', () => computeCtrl?.abort());
    meetMarker.on('drag', () => {
      const ll = meetMarker.getLngLat();
      setData('zone', G.circlePolygon({ lat: ll.lat, lng: ll.lng }, state.radius));
    });
    meetMarker.on('dragend', () => {
      const ll = meetMarker.getLngLat();
      state.manual = true;
      state.meet = { ...state.meet, lat: ll.lat, lng: ll.lng, name: null };
      schedule(0);
    });
  } else {
    meetMarker.setLngLat([m.lng, m.lat]);
  }
  setData('zone', G.circlePolygon(m, state.radius));
}
function clearMeet() {
  meetMarker?.remove(); meetMarker = null;
  setData('zone', emptyFC()); setData('links', emptyFC());
  clearVenueMarkers();
  $('#step-venues').hidden = true;
}

let linksCtrl;
async function drawLinks(pts, parentSignal) {
  linksCtrl?.abort();
  const ctrl = (linksCtrl = new AbortController());
  parentSignal.addEventListener('abort', () => ctrl.abort());
  const m = state.meet;
  const straight = pts.map((p) => ({
    type: 'Feature', properties: { color: p.color, straight: true },
    geometry: { type: 'LineString', coordinates: [[p.lng, p.lat], [m.lng, m.lat]] },
  }));
  setData('links', { type: 'FeatureCollection', features: straight });
  if (state.mode === 'distance' && !state.manual) return;
  // Real routes, 3 at a time; straight lines stay as placeholders until each arrives.
  const feats = straight.slice();
  let i = 0;
  const worker = async () => {
    while (i < pts.length) {
      const k = i++;
      try {
        const geom = await API.route(state.travel, pts[k], m, ctrl.signal);
        if (geom && !ctrl.signal.aborted) {
          feats[k] = { type: 'Feature', properties: { color: pts[k].color, straight: false }, geometry: geom };
          setData('links', { type: 'FeatureCollection', features: feats });
        }
      } catch (e) { if (e.name === 'AbortError') return; }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

function fitAll() {
  const pts = located();
  if (!pts.length) return;
  const b = new maplibregl.LngLatBounds();
  pts.forEach((p) => b.extend([p.lng, p.lat]));
  if (state.meet) b.extend([state.meet.lng, state.meet.lat]);
  map.fitBounds(b, { padding: panelPadding(), maxZoom: 14, duration: 900 });
}

/* ------------------------------------------------------------------ result card */
function renderResult() {
  const sec = $('#step-result');
  const m = state.meet;
  const wasHidden = sec.hidden;
  sec.hidden = !m;
  if (m && wasHidden && !document.activeElement?.matches('input')) {
    requestAnimationFrame(() => sec.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }
  $('#step-venues').hidden = !m;
  if (!m) return;
  const pts = located();
  const isTime = state.mode === 'time' || m.manual;
  const vals = isTime && m.times.every((t) => t != null) ? m.times : m.straight;
  const usingTime = vals === m.times;
  const max = Math.max(...vals), min = Math.min(...vals);
  $('#meet-kicker').textContent = m.manual ? 'Your custom spot' : state.mode === 'time' ? 'Equal travel time' : 'Equal distance';
  $('#reset-meet').hidden = !m.manual;
  const sum = usingTime
    ? `Everyone within ${G.fmtTime(max)} <em>· ${TRAVEL_WORD[state.travel]} · ${G.fmtTime(max - min)} between quickest & longest</em>`
    : `Nobody further than ${G.fmtDist(max)} <em>· as the crow flies</em>`;
  $('#meet-sum').innerHTML = sum;
  $('#fairness').innerHTML = pts.map((p, i) => {
    const v = vals[i];
    const pct = max > 0 ? Math.max(6, (v / max) * 100) : 100;
    const primary = usingTime ? G.fmtTime(v) : G.fmtDist(v);
    const secondary = usingTime ? G.fmtDist(m.roadDists[i]) : m.times[i] != null ? G.fmtTime(m.times[i]) : '';
    return `<li title="${esc(p.label)}"><span class="avatar" style="background:${p.color}">${p.letter}</span>
      <div class="bar"><i style="width:${pct}%;background:${p.color}"></i></div>
      <span class="val">${primary} <small>${secondary}</small></span></li>`;
  }).join('');
  // Nudge: equal distance can hide very unequal journeys.
  const nudge = $('#nudge');
  nudge.hidden = true;
  if (state.mode === 'distance' && !m.manual && m.times.every((t) => t != null)) {
    const spread = Math.max(...m.times) - Math.min(...m.times);
    if (spread > 600) {
      nudge.innerHTML = `Heads up: ${TRAVEL_WORD[state.travel]} times here range by ${G.fmtTime(spread)}. <button type="button" data-switch>Switch to equal travel time →</button>`;
      nudge.hidden = false;
    }
  }
  renderMeetName();
  updateShareLinks();
}
function renderMeetName() {
  const m = state.meet;
  if (!m) return;
  $('#meet-name').innerHTML = m.name ? esc(m.name) : '<span class="skeleton"></span>';
  updateShareLinks();
}
$('#nudge').addEventListener('click', (e) => { if (e.target.closest('[data-switch]')) setMode('time'); });
$('#reset-meet').addEventListener('click', () => { state.manual = false; schedule(0); });

/* ------------------------------------------------------------------ venues */
function renderCats() {
  $('#cats').innerHTML = CATEGORIES.map((c) => `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${state.cats.has(c.id)}">${c.icon} ${c.label}</button>`).join('');
}
$('#cats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  const id = b.dataset.cat;
  state.cats.has(id) ? state.cats.delete(id) : state.cats.add(id);
  b.setAttribute('aria-pressed', state.cats.has(id));
  state.showAll = false;
  syncHash();
  loadVenues(150);
});
$('#radius').addEventListener('input', (e) => {
  state.radius = Number(e.target.value);
  $('#radius-out').textContent = G.fmtDist(state.radius);
  if (state.meet) setData('zone', G.circlePolygon(state.meet, state.radius));
  syncHash();
  loadVenues(350);
});

let venueCtrl, venueTimer, area = null;
function loadVenues(delay = 0) {
  clearTimeout(venueTimer);
  venueCtrl?.abort();
  venueTimer = setTimeout(fetchVenues, delay);
}
async function fetchVenues() {
  const m = state.meet;
  if (!m) return;
  const ctrl = (venueCtrl = new AbortController());
  const cats = [...state.cats];
  const box = $('#venues');
  if (!cats.length) {
    state.venues = [];
    clearVenueMarkers();
    box.innerHTML = '<p class="empty-state">Pick something you\'re in the mood for ☝️</p>';
    return;
  }
  // Venues are fetched once for a generous area and per category, so moving the slider,
  // nudging the pin or re-adding a category filters instantly instead of re-querying.
  if (!area || G.haversine(area.center, m) + state.radius > area.R) {
    area = { center: { lat: m.lat, lng: m.lng }, R: Math.max(state.radius, 1200) + 400, byCat: new Map() };
  }
  const missing = cats.filter((c) => !area.byCat.has(c));
  let slowTimer;
  if (missing.length) {
    box.innerHTML = '<p class="empty-state"><span class="spinner" style="display:inline-block;vertical-align:middle"></span>&nbsp; Finding places in the zone…</p>' +
      '<div class="venue ghost-card"><span class="skeleton" style="width:60%"></span><br><span class="skeleton" style="width:40%;margin-top:6px"></span></div>'.repeat(3);
    slowTimer = setTimeout(() => {
      const p = $('#venues .empty-state');
      if (p && venueCtrl === ctrl) p.innerHTML = '<span class="spinner" style="display:inline-block;vertical-align:middle"></span>&nbsp; The free venue database is busy — still looking…';
    }, 6000);
    ctrl.signal.addEventListener('abort', () => clearTimeout(slowTimer));
  }
  try {
    // The network fetch belongs to the area, not this render, so an interruption (slider,
    // pin drag, refinement) never throws away a slow lookup that's nearly done.
    const thisArea = area;
    for (let guard = 0; guard < 4; guard++) {
      const need = cats.filter((c) => !thisArea.byCat.has(c));
      if (!need.length) break;
      if (!thisArea.inflight) {
        thisArea.inflight = fetchArea(thisArea, need).finally(() => { thisArea.inflight = null; });
      }
      await thisArea.inflight;
      if (ctrl.signal.aborted) return;
    }
    clearTimeout(slowTimer);
    if (ctrl.signal.aborted) return;
    const seen = new Set();
    let venues = [];
    for (const c of cats) {
      for (const v of area.byCat.get(c) || []) {
        const dist = G.haversine(m, v);
        if (dist > state.radius) continue;
        const key = v.name.toLowerCase() + '|' + v.cat.id;
        if (seen.has(key) || seen.has(v.id)) continue;
        seen.add(key); seen.add(v.id);
        venues.push({ ...v, dist });
      }
    }
    venues.sort((a, b) => a.dist - b.dist);
    venues = mergeSponsors(venues, m, cats);
    state.venues = venues;
    renderVenues();
  } catch (e) {
    clearTimeout(slowTimer);
    if (e.name === 'AbortError') return;
    box.innerHTML = '<p class="empty-state">Venue search is busy right now. <button class="btn link" type="button" id="retry-venues">Try again</button></p>';
    $('#retry-venues')?.addEventListener('click', () => loadVenues());
  }
}

async function fetchArea(a, catIds) {
  const data = await API.overpass(buildQuery(catIds, a.center, a.R));
  const fresh = new Map(catIds.map((c) => [c, []]));
  for (const el of data.elements || []) {
    const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
    if (lat == null) continue;
    const tags = el.tags || {};
    const cat = categoryOf(tags, catIds);
    const name = cat && (tags.name || cat.unnamed);
    if (!name) continue;
    fresh.get(cat.id).push({ id: `${el.type}/${el.id}`, name, lat, lng, cat, tags });
  }
  fresh.forEach((list, c) => a.byCat.set(c, list));
}

function mergeSponsors(venues, m, cats) {
  const out = [];
  const promoted = [];
  for (const s of state.sponsors) {
    if (s.categories?.length && !s.categories.some((c) => cats.includes(c))) continue;
    const d = G.haversine(m, s);
    if (d > state.radius + (s.reachMeters ?? 1500)) continue;
    const cat = CAT_BY_ID[s.categories?.[0]] || CAT_BY_ID[cats[0]];
    promoted.push({ id: s.osmId || `sponsor/${s.id}`, name: s.name, lat: s.lat, lng: s.lng, cat, tags: s.tags || {}, dist: d, tier: s.tier || 'sponsored', sponsor: s });
  }
  const promotedIds = new Set(promoted.map((p) => p.id));
  const tierRank = { sponsored: 0, preferred: 1 };
  promoted.sort((a, b) => tierRank[a.tier] - tierRank[b.tier] || a.dist - b.dist);
  for (const v of venues) if (!promotedIds.has(v.id)) out.push(v);
  return [...promoted, ...out];
}

let venueMarkers = [];
function clearVenueMarkers() { venueMarkers.forEach((mk) => mk.remove()); venueMarkers = []; }

function renderVenues() {
  const box = $('#venues');
  const vs = state.venues;
  clearVenueMarkers();
  if (!vs.length) {
    box.innerHTML = `<p class="empty-state">Nothing tagged here yet. Try widening the zone or adding another vibe.</p>`;
    return;
  }
  const limit = state.showAll ? 80 : 12;
  const shown = vs.slice(0, limit);
  const hasSponsor = vs.some((v) => v.tier === 'sponsored');
  let html = '';
  shown.forEach((v, i) => {
    if (i === Math.min(3, shown.length) && !hasSponsor) html += houseAd();
    html += venueCard(v);
  });
  if (shown.length < 3 && !hasSponsor) html += houseAd();
  if (vs.length > limit) html += `<button class="btn ghost more" type="button" id="show-more">Show ${Math.min(80, vs.length) - limit} more</button>`;
  box.innerHTML = html;
  $('#show-more')?.addEventListener('click', () => { state.showAll = true; renderVenues(); });

  for (const v of vs.slice(0, state.showAll ? 80 : 40)) {
    const el = document.createElement('button');
    el.className = 'vpin' + (v.tier === 'sponsored' ? ' sponsored' : '');
    el.type = 'button';
    el.textContent = v.cat.icon;
    el.setAttribute('aria-label', v.name);
    el.dataset.id = v.id;
    el.addEventListener('click', (e) => { e.stopPropagation(); selectVenue(v.id, true); });
    const mk = new maplibregl.Marker({ element: el }).setLngLat([v.lng, v.lat])
      .setPopup(new maplibregl.Popup({ offset: 18, closeButton: false }).setHTML(`<b>${esc(v.name)}</b><br><small>${esc(v.cat.label)} · ${G.fmtDist(v.dist)} from the middle</small>`))
      .addTo(map);
    el.addEventListener('mouseenter', () => mk.togglePopup());
    el.addEventListener('mouseleave', () => mk.getPopup().isOpen() && mk.togglePopup());
    venueMarkers.push(mk);
  }
  if (state.selected) highlightVenue(state.selected);
}

function houseAd() {
  return `<div class="house-ad"><b>⭐ Your venue could be here</b>Groups meeting around this spot see featured places first. <button class="btn link" type="button" data-advertise style="padding:0">Get featured →</button></div>`;
}

function venueCard(v) {
  const hl = highlights(v.tags);
  const badge = v.tier === 'sponsored' ? '<span class="badge sponsored">Sponsored</span> ' : v.tier === 'preferred' ? '<span class="badge pick">Triangulate pick</span> ' : '';
  const addr = [v.tags['addr:housenumber'], v.tags['addr:street']].filter(Boolean).join(' ');
  const hours = v.tags.opening_hours;
  return `<article class="venue ${v.tier || ''}" data-id="${esc(v.id)}" tabindex="0">
    <div class="venue-top">
      <div class="venue-icon">${v.cat.icon}</div>
      <div class="venue-main">
        <p class="venue-name">${esc(v.name)}</p>
        <p class="venue-meta">${badge}${esc(v.cat.label.replace(/s$/, ''))} · ${G.fmtDist(v.dist)} from the middle</p>
        ${hl.length ? `<div class="tags">${hl.map((h) => `<span class="tag">${esc(h)}</span>`).join('')}</div>` : ''}
        ${v.sponsor?.offer ? `<p class="offer">🎁 ${esc(v.sponsor.offer)}</p>` : ''}
      </div>
    </div>
    <div class="venue-detail">
      <div class="journeys" data-journeys><span class="tiny" style="margin:0">Checking everyone's journey…</span></div>
      ${addr ? `<p class="detail-line">📍 ${esc(addr)}</p>` : ''}
      ${hours ? `<p class="detail-line">🕒 ${esc(hours)}</p>` : ''}
      <div class="row-actions">
        <button class="btn primary small" type="button" data-book>${v.tier === 'sponsored' ? 'Book now' : 'Book / visit'}</button>
        <button class="btn ghost small" type="button" data-share-venue>Send to group</button>
        <a class="btn link small" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(v.name)}&query_place_id=&center=${v.lat},${v.lng}">Reviews ↗</a>
      </div>
    </div>
  </article>`;
}

$('#venues').addEventListener('click', (e) => {
  if (e.target.closest('[data-advertise]')) return openAdvertise();
  const card = e.target.closest('.venue');
  if (!card) return;
  const v = state.venues.find((x) => x.id === card.dataset.id);
  if (!v) return;
  if (e.target.closest('[data-book]')) return openBooking(v);
  if (e.target.closest('[data-share-venue]')) return sharePlan(v);
  if (e.target.closest('a')) return;
  selectVenue(v.id, false);
});
$('#venues').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.classList.contains('venue')) selectVenue(e.target.dataset.id, false);
});

let journeyCtrl;
async function selectVenue(id, fromMap) {
  const v = state.venues.find((x) => x.id === id);
  if (!v) return;
  state.selected = state.selected === id && !fromMap ? null : id;
  highlightVenue(state.selected);
  syncHash();
  if (!state.selected) return;
  track('venue_view', { venue: v.name, sponsored: v.tier === 'sponsored', category: v.cat.id });
  map.easeTo({ center: [v.lng, v.lat], zoom: Math.max(map.getZoom(), 15), padding: panelPadding(), duration: 600 });
  const card = $(`.venue[data-id="${CSS.escape(id)}"]`);
  if (fromMap && card) {
    if (isMobile()) $('#panel').classList.remove('collapsed');
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  // Everyone's journey to this exact venue.
  journeyCtrl?.abort();
  journeyCtrl = new AbortController();
  const pts = located();
  const slot = card && $('[data-journeys]', card);
  try {
    const t = await API.table(state.travel, pts, [v], journeyCtrl.signal);
    const times = pts.map((_, i) => t.durations[i][0]);
    v.times = times;
    if (slot) slot.innerHTML = pts.map((p, i) => `<span class="journey" title="${esc(p.label)}"><span class="avatar" style="background:${p.color}">${p.letter}</span>${G.fmtTime(times[i])}</span>`).join('');
  } catch (e) {
    if (e.name !== 'AbortError' && slot) slot.innerHTML = '';
  }
}
function highlightVenue(id) {
  document.querySelectorAll('.venue').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
  document.querySelectorAll('.vpin').forEach((c) => c.classList.toggle('active', c.dataset.id === id));
}

/* ------------------------------------------------------------------ booking */
let bookingVenue;
function openBooking(v) {
  bookingVenue = v;
  const d = $('#book-dialog');
  $('#book-kicker').textContent = v.tier === 'sponsored' ? 'Sponsored · Book direct' : 'Plan your visit';
  $('#book-name').textContent = v.name;
  $('#book-addr').textContent = [v.cat.label.replace(/s$/, ''), [v.tags['addr:housenumber'], v.tags['addr:street']].filter(Boolean).join(' ')].filter(Boolean).join(' · ');
  const today = new Date();
  $('#book-date').value = today.toISOString().slice(0, 10);
  $('#book-date').min = today.toISOString().slice(0, 10);
  $('#book-party').value = Math.max(2, located().length);
  const url = bookingUrl(v);
  $('#book-note').textContent = url.direct ? `You'll finish booking on ${url.host}.` : `No online booking listed — we'll search for it for you.`;
  const phone = v.sponsor?.phone || v.tags.phone || v.tags['contact:phone'];
  const call = $('#book-call');
  call.hidden = !phone;
  if (phone) call.href = `tel:${phone.replace(/[^\d+]/g, '')}`;
  d.showModal();
}
function bookingUrl(v, opts) {
  const raw = v.sponsor?.bookingUrl || v.tags['reservation:url'] || v.tags['contact:reservation'] || v.tags.website || v.tags['contact:website'] || v.tags.url;
  if (raw) {
    try {
      const u = new URL(raw.startsWith('http') ? raw : `https://${raw}`);
      CONFIG.utm.split('&').forEach((kv) => { const [k, val] = kv.split('='); u.searchParams.set(k, val); });
      if (v.sponsor && opts) { u.searchParams.set('party', opts.party); u.searchParams.set('date', opts.date); u.searchParams.set('time', opts.time); }
      return { href: u.toString(), host: u.host.replace(/^www\./, ''), direct: true };
    } catch {}
  }
  const q = `${v.name} ${v.tags['addr:city'] || v.tags['addr:street'] || ''} book a table`;
  return { href: `https://www.google.com/search?q=${encodeURIComponent(q)}`, host: 'Google', direct: false };
}
$('#book-dialog').addEventListener('close', () => {
  if ($('#book-dialog').returnValue !== 'go' || !bookingVenue) return;
  const opts = { date: $('#book-date').value, time: $('#book-time').value, party: $('#book-party').value };
  const u = bookingUrl(bookingVenue, opts);
  track('book_click', { venue: bookingVenue.name, sponsored: bookingVenue.tier === 'sponsored', party: opts.party, direct: u.direct });
  window.open(u.href, '_blank', 'noopener');
});

/* ------------------------------------------------------------------ share */
function planText(v) {
  const m = state.meet;
  const pts = located();
  const where = v ? v.name : m?.name || 'the middle';
  const times = v?.times || (state.mode === 'time' || m?.manual ? m?.times : null);
  let fair = '';
  if (times && times.every((t) => t != null)) fair = ` Everyone's within ${G.fmtTime(Math.max(...times))} ${TRAVEL_WORD[state.travel]}.`;
  else if (m) fair = ` Nobody's more than ${G.fmtDist(Math.max(...m.straight))} away.`;
  return `Let's meet at ${where} — it's the fair middle for all ${pts.length} of us.${fair}`;
}
function shareUrl() { return location.href; }
async function sharePlan(v) {
  syncHash();
  const text = planText(v);
  const url = shareUrl();
  track('share_plan', { venue: v?.name || '', people: located().length });
  if (navigator.share && isMobile()) {
    try { await navigator.share({ title: 'Triangulate', text, url }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    toast('Plan copied — paste it in the group chat');
  } catch { prompt('Copy this link', url); }
}
function updateShareLinks() {
  $('#whatsapp').href = `https://wa.me/?text=${encodeURIComponent(planText() + '\n' + shareUrl())}`;
}
$('#share-plan').addEventListener('click', () => sharePlan(state.venues.find((v) => v.id === state.selected)));
$('#whatsapp').addEventListener('click', () => { syncHash(); updateShareLinks(); track('share_plan', { channel: 'whatsapp' }); });

/* ------------------------------------------------------------------ URL state */
function syncHash() {
  const ps = located().map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${encodeURIComponent(p.label || '')}`).join('|');
  const parts = [];
  if (ps) parts.push(`p=${ps}`);
  parts.push(`m=${state.mode}`, `t=${state.travel}`, `c=${[...state.cats].join(',')}`, `r=${state.radius}`);
  if (state.manual && state.meet) parts.push(`x=${state.meet.lat.toFixed(5)},${state.meet.lng.toFixed(5)}`);
  if (state.selected) parts.push(`v=${encodeURIComponent(state.selected)}`);
  history.replaceState(null, '', '#' + parts.join('&'));
  if (state.meet) updateShareLinks();
}
function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  const out = { people: [] };
  (h.get('p') || '').split('|').filter(Boolean).forEach((s) => {
    const [lat, lng, ...rest] = s.split(',');
    if (!isNaN(+lat) && !isNaN(+lng)) out.people.push({ lat: +lat, lng: +lng, label: decodeURIComponent(rest.join(',')) || 'Dropped pin' });
  });
  if (['time', 'distance'].includes(h.get('m'))) state.mode = h.get('m');
  if (['car', 'bike', 'foot'].includes(h.get('t'))) state.travel = h.get('t');
  if (h.has('c')) state.cats = new Set(h.get('c').split(',').filter((c) => CAT_BY_ID[c]));
  if (h.get('r')) state.radius = Math.min(3000, Math.max(200, +h.get('r') || 600));
  if (h.get('x')) {
    const [lat, lng] = h.get('x').split(',').map(Number);
    if (!isNaN(lat) && !isNaN(lng)) { state.manual = true; state.meet = { lat, lng }; }
  }
  if (h.get('v')) state.selected = h.get('v');
  return out;
}

/* ------------------------------------------------------------------ controls */
function setMode(mode) {
  state.mode = mode;
  state.manual = false;
  document.querySelectorAll('#mode [data-mode]').forEach((b) => b.setAttribute('aria-checked', b.dataset.mode === mode));
  schedule(0);
}
function setTravel(t) {
  state.travel = t;
  document.querySelectorAll('#travel [data-travel]').forEach((b) => b.setAttribute('aria-checked', b.dataset.travel === t));
  schedule(0);
}
$('#mode').addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
$('#travel').addEventListener('click', (e) => { const b = e.target.closest('[data-travel]'); if (b) setTravel(b.dataset.travel); });
$('#add-person').addEventListener('click', () => {
  const p = addPerson();
  if (p) setTimeout(() => $(`[data-id="${p.id}"] input`)?.focus(), 30);
});
$('#try-example').addEventListener('click', () => {
  const ex = REGION.ex.map(([label, lat, lng]) => ({ label, lat, lng, sub: '' }));
  state.people.forEach((p) => p.marker?.remove());
  state.people = [];
  state.manual = false;
  ex.forEach((x) => { const p = addPerson(); p.lat = x.lat; p.lng = x.lng; p.label = x.label; p.sub = x.sub; placePersonMarker(p); });
  renderPeople();
  schedule(0);
});
$('#grip').addEventListener('click', () => $('#panel').classList.toggle('collapsed'));
$('#advertise').addEventListener('click', openAdvertise);
function openAdvertise() {
  track('advertise_click');
  const a = $('#ad-contact');
  a.hidden = !CONFIG.advertiseEmail;
  $('#ad-soon').hidden = !!CONFIG.advertiseEmail;
  if (CONFIG.advertiseEmail) a.href = `mailto:${CONFIG.advertiseEmail}?subject=${encodeURIComponent('Featuring my venue on Triangulate')}`;
  $('#ad-dialog').showModal();
}

/* ------------------------------------------------------------------ status helpers */
function status(msg) {
  const el = $('#status');
  if (!msg) { el.hidden = true; return; }
  el.innerHTML = `<span class="spinner"></span>${esc(msg)}`;
  el.hidden = false;
}
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), 3200);
}
function setBusy(b) {
  $('#step-result').classList.toggle('loading', b);
  meetMarker?.getElement().classList.toggle('busy', b);
  if (!b) status();
}

/* ------------------------------------------------------------------ boot */
(async function boot() {
  const fromHash = readHash();
  document.querySelectorAll('#mode [data-mode]').forEach((b) => b.setAttribute('aria-checked', b.dataset.mode === state.mode));
  document.querySelectorAll('#travel [data-travel]').forEach((b) => b.setAttribute('aria-checked', b.dataset.travel === state.travel));
  $('#radius').value = state.radius;
  $('#radius-out').textContent = G.fmtDist(state.radius);
  renderCats();
  try {
    const res = await fetch('sponsors.json', { cache: 'no-cache' });
    state.sponsors = (await res.json()).sponsors || [];
  } catch { state.sponsors = []; }
  if (fromHash.people.length) {
    fromHash.people.slice(0, CONFIG.maxPeople).forEach((x) => { const p = addPerson(); p.lat = x.lat; p.lng = x.lng; p.label = x.label; placePersonMarker(p); });
    if (state.people.length < 2) addPerson();
    renderPeople();
    await mapReady;
    compute();
  } else {
    addPerson(); addPerson();
    if (isMobile()) $('#panel').classList.remove('collapsed');
  }
})();

// Expose for debugging / testing.
window.triangulate = { state, compute, addPerson, setPersonLocation };
