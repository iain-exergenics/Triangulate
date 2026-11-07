// Thin clients for the free services Triangulate uses. Every call accepts an AbortSignal
// so the UI can interrupt work the moment the user changes something.
import { CONFIG } from './config.js';

const cache = new Map();
async function getJSON(url, signal, init) {
  const key = init?.body ? url + '|' + init.body : url;
  if (cache.has(key)) return cache.get(key);
  const res = await fetch(url, { ...init, signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  if (cache.size > 300) cache.delete(cache.keys().next().value);
  cache.set(key, json);
  return json;
}

function photonLabel(p) {
  const street = [p.housenumber, p.street].filter(Boolean).join(' ');
  const primary = p.name || street || p.district || p.city || p.county || p.state || 'Dropped pin';
  const area = [p.name && street ? street : null, p.district || p.locality, p.city, p.postcode, p.country]
    .filter((x, i, a) => x && x !== primary && a.indexOf(x) === i);
  return { label: primary, sub: area.slice(0, 3).join(', ') };
}

export async function searchPlaces(q, bias, signal) {
  const u = new URL(CONFIG.photon + '/api/');
  u.searchParams.set('q', q);
  u.searchParams.set('limit', '6');
  u.searchParams.set('lang', 'en');
  if (bias) {
    u.searchParams.set('lat', bias.lat.toFixed(4));
    u.searchParams.set('lon', bias.lng.toFixed(4));
  }
  const data = await getJSON(u.toString(), signal);
  return (data.features || []).map((f) => ({
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    ...photonLabel(f.properties || {}),
  }));
}

export async function reverse(pt, signal) {
  const u = `${CONFIG.photon}/reverse?lat=${pt.lat.toFixed(5)}&lon=${pt.lng.toFixed(5)}&lang=en`;
  try {
    const data = await getJSON(u, signal);
    const f = data.features?.[0];
    return f ? { ...photonLabel(f.properties || {}), props: f.properties } : null;
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    return null;
  }
}

const coord = (p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;

// Travel-time matrix: sources × destinations. Returns durations (s) and road distances (m).
export async function table(profile, sources, dests, signal) {
  const all = [...sources, ...dests].map(coord).join(';');
  const src = sources.map((_, i) => i).join(';');
  const dst = dests.map((_, i) => i + sources.length).join(';');
  const url = `${CONFIG.routing[profile]}/table/v1/driving/${all}?sources=${src}&destinations=${dst}&annotations=duration,distance`;
  const data = await getJSON(url, signal);
  if (data.code !== 'Ok') throw new Error(data.message || data.code);
  return {
    durations: data.durations,
    distances: data.distances,
    snapped: data.destinations.map((d) => ({ lat: d.location[1], lng: d.location[0] })),
  };
}

export async function route(profile, from, to, signal) {
  const url = `${CONFIG.routing[profile]}/route/v1/driving/${coord(from)};${coord(to)}?overview=simplified&geometries=geojson`;
  const data = await getJSON(url, signal);
  return data.routes?.[0]?.geometry || null;
}

// Public Overpass servers vary wildly in speed, so race the mirrors and keep the first answer.
const venueCache = new Map();
export async function overpass(query, signal) {
  if (venueCache.has(query)) return venueCache.get(query);
  const ctrls = CONFIG.overpass.map(() => new AbortController());
  const onAbort = () => ctrls.forEach((c) => c.abort());
  signal?.addEventListener('abort', onAbort);
  try {
    const result = await Promise.any(CONFIG.overpass.map(async (base, i) => {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query),
        signal: ctrls[i].signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.remark && !json.elements?.length) throw new Error(json.remark);
      ctrls.forEach((c, j) => j !== i && c.abort());
      return json;
    }));
    venueCache.set(query, result);
    return result;
  } catch (e) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    throw e.errors?.[0] || e;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
