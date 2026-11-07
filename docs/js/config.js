// Triangulate configuration — everything here is free / keyless by default.
export const CONFIG = {
  maxPeople: 10,

  // Google Analytics 4 measurement ID (e.g. "G-ABC123XYZ"). When set, GA4 loads and
  // the app sends events (find_middle, venue_view, book_click, share_plan, advertise_click)
  // that you can import into Google Ads as conversions.
  gaMeasurementId: '',

  // Where the "Advertise your venue" call-to-action sends venue owners.
  // Leave blank to show the pitch without a contact button.
  advertiseEmail: '',

  // Appended to outbound booking links so venues can see Triangulate sent the booking.
  utm: 'utm_source=triangulate&utm_medium=referral&utm_campaign=venue_booking',

  // Geoapify Places API key (free plan: 3,000 credits/day, no card). Venue search uses it
  // first and falls back to the public Overpass servers if it's blank or fails.
  // The key is visible in the page by design: restrict it to your site's address under
  // the key's "Allowed origins" in the Geoapify dashboard.
  geoapifyKey: '93ca234d6c254fe38f01bd1bb0631e52',
  geoapifyLimit: 80, // places per category per search (every 20 places = 1 credit)

  // Free public services (no API keys).
  photon: 'https://photon.komoot.io',
  routing: {
    car: 'https://routing.openstreetmap.de/routed-car',
    bike: 'https://routing.openstreetmap.de/routed-bike',
    foot: 'https://routing.openstreetmap.de/routed-foot',
  },
  overpass: [
    'https://overpass-api.de/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  ],
  mapStyle: {
    light: 'https://tiles.openfreemap.org/styles/positron',
    dark: 'https://tiles.openfreemap.org/styles/dark',
  },
};
