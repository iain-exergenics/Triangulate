// Geometry helpers. Points are {lat, lng}; projected points are {x, y} in metres.
const R_EARTH = 6371008.8;
const rad = (d) => (d * Math.PI) / 180;

export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Local equirectangular projection centred on the points' mean — accurate to well under 1%
// for anything city- or region-sized, which is what meet-ups are.
export function makeProjection(points) {
  const lat0 = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng0 = points.reduce((s, p) => s + p.lng, 0) / points.length;
  const kx = (Math.PI / 180) * R_EARTH * Math.cos(rad(lat0));
  const ky = (Math.PI / 180) * R_EARTH;
  return {
    fwd: (p) => ({ x: (p.lng - lng0) * kx, y: (p.lat - lat0) * ky }),
    inv: (q) => ({ lat: q.y / ky + lat0, lng: q.x / kx + lng0 }),
  };
}

// Minimal enclosing circle (Welzl, iterative). Its centre is the point whose
// furthest person is as close as possible — the fairest "equal distance" spot.
export function minEnclosingCircle(pts) {
  const p = pts.slice();
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const inside = (c, q) => c && Math.hypot(q.x - c.x, q.y - c.y) <= c.r * (1 + 1e-9) + 1e-6;
  const two = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, r: Math.hypot(a.x - b.x, a.y - b.y) / 2 });
  const three = (a, b, c) => {
    const d = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    if (Math.abs(d) < 1e-9) {
      const cs = [two(a, b), two(a, c), two(b, c)];
      return cs.reduce((m, k) => (k.r > m.r ? k : m));
    }
    const a2 = a.x * a.x + a.y * a.y, b2 = b.x * b.x + b.y * b.y, c2 = c.x * c.x + c.y * c.y;
    const x = (a2 * (b.y - c.y) + b2 * (c.y - a.y) + c2 * (a.y - b.y)) / d;
    const y = (a2 * (c.x - b.x) + b2 * (a.x - c.x) + c2 * (b.x - a.x)) / d;
    return { x, y, r: Math.hypot(a.x - x, a.y - y) };
  };
  let c = null;
  for (let i = 0; i < p.length; i++) {
    if (inside(c, p[i])) continue;
    c = { x: p[i].x, y: p[i].y, r: 0 };
    for (let j = 0; j < i; j++) {
      if (inside(c, p[j])) continue;
      c = two(p[i], p[j]);
      for (let k = 0; k < j; k++) if (!inside(c, p[k])) c = three(p[i], p[j], p[k]);
    }
  }
  return c;
}

// Roughly `count` points on a hex grid inside a circle (always includes the centre).
export function hexGrid(center, radius, count) {
  const s = radius * Math.sqrt((2 * Math.PI) / (Math.sqrt(3) * Math.max(count, 1)));
  const out = [{ x: center.x, y: center.y }];
  const rows = Math.ceil(radius / (s * 0.866)) + 1;
  for (let r = -rows; r <= rows; r++) {
    const y = r * s * 0.866;
    const off = (Math.abs(r) % 2) * s / 2;
    const cols = Math.ceil(radius / s) + 1;
    for (let c = -cols; c <= cols; c++) {
      const x = c * s + off;
      if ((x === 0 && y === 0) || Math.hypot(x, y) > radius) continue;
      out.push({ x: center.x + x, y: center.y + y });
    }
  }
  return { points: out.slice(0, count), spacing: s };
}

export function circlePolygon(c, radiusM, steps = 72) {
  const kx = (Math.PI / 180) * R_EARTH * Math.cos(rad(c.lat));
  const ky = (Math.PI / 180) * R_EARTH;
  const ring = [];
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI;
    ring.push([c.lng + (radiusM * Math.cos(t)) / kx, c.lat + (radiusM * Math.sin(t)) / ky]);
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } };
}

export function fmtDist(m) {
  if (m == null) return '–';
  if (m < 950) return `${Math.round(m / 10) * 10} m`;
  return `${(m / 1000).toFixed(m < 9950 ? 1 : 0)} km`;
}

export function fmtTime(s) {
  if (s == null) return '–';
  const m = Math.max(1, Math.round(s / 60));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return `${h} h ${String(m % 60).padStart(2, '0')}`;
}
