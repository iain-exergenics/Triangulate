# Triangulate

**Meet in the fair middle.** Add up to 10 starting points, choose what "fair" means, and Triangulate finds the meeting spot, then shows pubs, cafés, dog parks and more inside a zone around it, ready to book.

Live: https://iain-exergenics.github.io/Triangulate/

## What it does

- **Up to 10 people.** Search an address (autocomplete), use your location, tap the map, or drag pins.
- **Two kinds of fair:**
  - **Equal travel time** samples candidate spots, gets everyone's real driving, cycling or walking time to each in one matrix request, then refines around the best. It minimises the longest journey, then the gap between the quickest and slowest. You see the first answer fast, and refinement follows live.
  - **Equal distance** uses the centre of the smallest circle containing everyone, so nobody is further than necessary as the crow flies. It warns you when that spot makes travel times very unequal.
- **Interruptible.** Change anything mid-calculation (mode, travel type, a person, the pin) and the old work is cancelled instantly. Drag the ▲ pin to fine-tune, and everyone's times update.
- **Venue zone.** A 200 m to 3 km radius slider and 12 multi-select categories: pubs, bars, cafés, restaurants, breweries, dog parks, parks, games & bowling, cinema & culture, live music, climbing & active, and co-working. Pick a venue to see each person's journey to that exact place.
- **Sponsored and preferred slots.** Featured venues pin to the top, glow gold on the map and get a "Book now" button. A house ad ("Your venue could be here") fills the slot until you sell it.
- **Booking hand-off.** Date, time and group size, then out to the venue's booking page or website with UTM tags (Google search as a fallback). Sponsored links also receive `party`, `date` and `time`.
- **Share.** The whole plan lives in the URL. "Share with the group" uses native share or copies to the clipboard, and there's a one-tap WhatsApp button.
- Responsive bottom sheet on phones, dark mode, keyboard navigation and reduced-motion support.

## Stack (all free; one optional free key)

| Need | Service |
|---|---|
| Map | MapLibre GL + OpenFreeMap tiles |
| Address search | Photon (komoot) |
| Travel times & routes | OSRM on routing.openstreetmap.de (car / bike / foot) |
| Venues | Geoapify Places (free key, OpenStreetMap data), falling back to the public Overpass API |
| Hosting | GitHub Pages from `/docs` |

It's plain HTML/CSS/ES modules with no build step. To run it locally:

```bash
cd docs && python3 -m http.server 8787
```

## Configuration — `docs/js/config.js`

- `gaMeasurementId`: GA4 ID. Turns on events (`find_middle`, `venue_view`, `book_click`, `share_plan`, `advertise_click`) to import as Google Ads conversions.
- `advertiseEmail`: shows a "Get in touch" button in the venue-owner pitch.
- `utm`: tags added to outbound booking links.
- `geoapifyKey`: free Geoapify key (3,000 credits/day, no card) for fast venue search. Create one at myprojects.geoapify.com, then set its **Allowed origins** to `https://iain-exergenics.github.io` so nobody else can spend your quota. Each category search returns up to `geoapifyLimit` places (every 20 places = 1 credit), and results are cached per area. Left blank, the app uses the public Overpass servers.

## Sponsored venues — `docs/sponsors.json`

```json
{
  "sponsors": [
    {
      "id": "the-crown",
      "name": "The Crown",
      "lat": 51.5123, "lng": -0.1270,
      "categories": ["pub", "food"],
      "tier": "sponsored",
      "reachMeters": 1500,
      "osmId": "node/123456789",
      "offer": "10% off for groups of 4+",
      "bookingUrl": "https://example.com/book",
      "phone": "+44 20 0000 0000",
      "tags": { "beer_garden": "yes", "addr:street": "Example St" }
    }
  ]
}
```

- `tier`: `sponsored` (gold badge, top) or `preferred` ("Triangulate pick", below sponsored).
- A sponsor shows when it's within `radius + reachMeters` of the meeting point and matches a selected category.
- `osmId` replaces the venue's organic listing so it isn't shown twice.

## Known limits of the free tier

- Without a Geoapify key, venue search uses public Overpass servers, which can take 20–40 s or fail at busy times.
- Public transport times aren't available from any keyless service; drive, cycle and walk are.
