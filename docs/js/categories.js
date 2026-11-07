// Venue categories. Each filter is a list of [key, value] pairs ANDed together
// (value null = tag just has to exist). Filters within a category are ORed.
export const CATEGORIES = [
  { id: 'pub', label: 'Pubs', icon: '🍺', filters: [[['amenity', 'pub']]] },
  { id: 'bar', label: 'Bars', icon: '🍸', filters: [[['amenity', 'bar']]] },
  { id: 'cafe', label: 'Cafés', icon: '☕', filters: [[['amenity', 'cafe']]] },
  { id: 'food', label: 'Restaurants', icon: '🍜', filters: [[['amenity', 'restaurant']]] },
  { id: 'brewery', label: 'Breweries', icon: '🍻', filters: [[['craft', 'brewery']], [['microbrewery', 'yes']]] },
  { id: 'dog', label: 'Dog parks', icon: '🐕', unnamed: 'Dog park', filters: [[['leisure', 'dog_park']]] },
  { id: 'park', label: 'Parks', icon: '🌳', filters: [[['leisure', 'park']]] },
  {
    id: 'games', label: 'Games & bowling', icon: '🎳',
    filters: [[['leisure', 'bowling_alley']], [['leisure', 'escape_game']], [['leisure', 'amusement_arcade']], [['amenity', 'karaoke_box']], [['leisure', 'miniature_golf']]],
  },
  {
    id: 'culture', label: 'Cinema & culture', icon: '🎬',
    filters: [[['amenity', 'cinema']], [['tourism', 'museum']], [['tourism', 'gallery']], [['amenity', 'theatre']]],
  },
  { id: 'music', label: 'Live music', icon: '🎶', filters: [[['amenity', 'music_venue']], [['amenity', 'nightclub']]] },
  {
    id: 'active', label: 'Climbing & active', icon: '🧗',
    filters: [[['sport', 'climbing'], ['leisure', null]], [['leisure', 'ice_rink']], [['sport', 'padel']]],
  },
  { id: 'cowork', label: 'Co-working', icon: '💻', filters: [[['amenity', 'coworking_space']], [['office', 'coworking']]] },
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
