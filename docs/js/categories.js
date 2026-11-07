// Venue categories. Each filter is a list of [key, value] pairs ANDed together
// (value null = tag just has to exist). Filters within a category are ORed.
export const CATEGORIES = [
  { id: 'pub', geo: ['catering.pub'], label: 'Pubs', icon: '🍺', filters: [[['amenity', 'pub']]] },
  { id: 'bar', geo: ['catering.bar'], label: 'Bars', icon: '🍸', filters: [[['amenity', 'bar']]] },
  { id: 'cafe', geo: ['catering.cafe'], label: 'Cafés', icon: '☕', filters: [[['amenity', 'cafe']]] },
  { id: 'food', geo: ['catering.restaurant'], label: 'Restaurants', icon: '🍜', filters: [[['amenity', 'restaurant']]] },
  { id: 'brewery', geo: ['catering.taproom', 'catering.biergarten'], label: 'Breweries', icon: '🍻', filters: [[['craft', 'brewery']], [['microbrewery', 'yes']]] },
  { id: 'dog', geo: ['pet.dog_park'], label: 'Dog parks', icon: '🐕', unnamed: 'Dog park', filters: [[['leisure', 'dog_park']]] },
  { id: 'park', geo: ['leisure.park'], label: 'Parks', icon: '🌳', filters: [[['leisure', 'park']]] },
  {
    id: 'games', geo: ['entertainment.bowling_alley', 'entertainment.escape_game', 'entertainment.amusement_arcade', 'entertainment.miniature_golf'], label: 'Games & bowling', icon: '🎳',
    filters: [[['leisure', 'bowling_alley']], [['leisure', 'escape_game']], [['leisure', 'amusement_arcade']], [['amenity', 'karaoke_box']], [['leisure', 'miniature_golf']]],
  },
  {
    id: 'culture', geo: ['entertainment.cinema', 'entertainment.museum', 'entertainment.culture'], label: 'Cinema & culture', icon: '🎬',
    filters: [[['amenity', 'cinema']], [['tourism', 'museum']], [['tourism', 'gallery']], [['amenity', 'theatre']]],
  },
  { id: 'music', geo: ['adult.nightclub'], label: 'Live music', icon: '🎶', filters: [[['amenity', 'music_venue']], [['amenity', 'nightclub']]] },
  {
    id: 'active', geo: ['entertainment.activity_park.climbing', 'sport.ice_rink'], label: 'Climbing & active', icon: '🧗',
    filters: [[['sport', 'climbing'], ['leisure', null]], [['leisure', 'ice_rink']], [['sport', 'padel']]],
  },
  { id: 'cowork', geo: ['office.coworking'], label: 'Co-working', icon: '💻', filters: [[['amenity', 'coworking_space']], [['office', 'coworking']]] },
];

export const CAT_BY_ID = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

const ovFilter = (pairs) => pairs.map(([k, v]) => (v == null ? `["${k}"]` : `["${k}"="${v}"]`)).join('');

export function buildQuery(catIds, center, radius) {
  const parts = [];
  for (const id of catIds) {
    const cat = CAT_BY_ID[id];
    for (const f of cat.filters) {
      parts.push(`nwr(around:${Math.round(radius)},${center.lat.toFixed(5)},${center.lng.toFixed(5)})${ovFilter(f)}${cat.unnamed ? '' : '["name"]'};`);
    }
  }
  return `[out:json][timeout:20];(${parts.join('')});out center tags 600;`;
}

export function categoryOf(tags, catIds) {
  for (const id of catIds) {
    const cat = CAT_BY_ID[id];
    if (cat.filters.some((f) => f.every(([k, v]) => (v == null ? k in tags : tags[k] === v)))) return cat;
  }
  return null;
}

// Turn a Geoapify feature into a venue with OpenStreetMap-style tags, so highlights,
// booking links and sponsor matching work the same whichever source answered.
const OSM_TYPE = { n: 'node', w: 'way', r: 'relation', node: 'node', way: 'way', relation: 'relation' };
export function fromGeoapify(f, cat) {
  const p = f.properties || {};
  const raw = p.datasource?.raw || {};
  const tags = { ...raw };
  if (p.website && !tags.website) tags.website = p.website;
  if (p.contact?.phone && !tags.phone) tags.phone = p.contact.phone;
  if (p.opening_hours && !tags.opening_hours) tags.opening_hours = p.opening_hours;
  if (!tags['addr:street'] && p.street) { tags['addr:street'] = p.street; if (p.housenumber) tags['addr:housenumber'] = p.housenumber; }
  const name = p.name || raw.name || cat.unnamed;
  if (!name) return null;
  const type = OSM_TYPE[raw.osm_type];
  const id = type && raw.osm_id ? `${type}/${raw.osm_id}` : `geo/${p.place_id}`;
  const [lng, lat] = f.geometry?.type === 'Point' ? f.geometry.coordinates : [p.lon, p.lat];
  return { id, name, lat, lng, cat, tags };
}

// Friendly highlights pulled from OpenStreetMap tags.
export function highlights(tags) {
  const h = [];
  if (tags.beer_garden === 'yes') h.push('Beer garden');
  if (tags.outdoor_seating === 'yes') h.push('Outdoor seating');
  if (tags.dog === 'yes') h.push('Dog friendly');
  if (tags.real_ale === 'yes') h.push('Real ale');
  if (tags.food === 'yes' && tags.amenity === 'pub') h.push('Serves food');
  if (tags.internet_access === 'wlan' || tags.internet_access === 'yes') h.push('Wi-Fi');
  if (tags.wheelchair === 'yes') h.push('Step-free');
  if (tags['diet:vegan'] === 'yes' || tags['diet:vegan'] === 'only') h.push('Vegan options');
  if (tags.cuisine) h.push(tags.cuisine.split(';')[0].replace(/_/g, ' '));
  return h.slice(0, 4);
}
