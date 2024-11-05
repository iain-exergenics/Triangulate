const form = document.getElementById("address-form");
const map = L.map("map").setView([51.505, -0.09], 13);
const OPEN_CAGE_API_KEY = "cdb17b4b376e49099f2007125c7804a2"; 
const backendUrl = "https://sensational-manatee-7ba85a.netlify.app; // Replace with your deployed backend URL

async function fetchGeocode(addresses) {
    const response = await fetch(`${backendUrl}/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
    });
    return await response.json();
}
async function fetchAutocompleteSuggestions(query) {
    const response = await fetch(
        `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(query)}&key=${OPEN_CAGE_API_KEY}&limit=5`
    );
    const data = await response.json();
    return data.results.map(result => result.formatted);
}

function setupAutocomplete(inputElement) {
    inputElement.addEventListener("input", async (event) => {
        const query = event.target.value;
        if (query.length < 3) return; // Wait until 3 characters are typed

        const suggestions = await fetchAutocompleteSuggestions(query);
        const datalistId = `datalist-${inputElement.name}`;
        let datalist = document.getElementById(datalistId);

        // Create datalist if it doesn't exist
        if (!datalist) {
            datalist = document.createElement("datalist");
            datalist.id = datalistId;
            document.body.appendChild(datalist);
            inputElement.setAttribute("list", datalistId);
        }

        datalist.innerHTML = ""; // Clear previous suggestions
        suggestions.forEach(suggestion => {
            const option = document.createElement("option");
            option.value = suggestion;
            datalist.appendChild(option);
        });
    });
}

// Initialize autocomplete for each address input field
document.querySelectorAll("[name='address']").forEach(setupAutocomplete);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
}).addTo(map);

let markerGroup = L.layerGroup().addTo(map);

function addAddress() {
    const addressInput = document.createElement("input");
    addressInput.type = "text";
    addressInput.name = "address";
    addressInput.placeholder = `Enter address ${document.querySelectorAll("[name=address]").length + 1}`;
    addressInput.required = true;
    document.getElementById("addresses").appendChild(addressInput);

    setupAutocomplete(addressInput); // Apply autocomplete to new inputs
}
form.addEventListener("submit", async (e) => {
    e.preventDefault();
    markerGroup.clearLayers();

    const addresses = Array.from(document.querySelectorAll("[name=address]")).map(input => input.value);
    const response = await fetch("/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
    });

    const { coordinates, centralPoint } = await response.json();

    // Add markers for each address
    coordinates.forEach(({ lat, lng }) => {
        L.marker([lat, lng]).addTo(markerGroup);
    });

    // Add marker for central point
    L.marker([centralPoint.lat, centralPoint.lng])
        .bindPopup("Meeting Point")
        .addTo(markerGroup)
        .openPopup();

    map.setView([centralPoint.lat, centralPoint.lng], 12);
});


let meetingPointMarker;

async function searchNearby(placeType) {
    if (!meetingPointMarker) return;

    const { lat, lng } = meetingPointMarker.getLatLng();
    const radius = 1000; // 1km radius

    // Overpass API query to find nearby places
    const overpassUrl = `https://overpass-api.de/api/interpreter?data=[out:json];node(around:${radius},${lat},${lng})[amenity=${placeType}];out;`;

    const response = await fetch(overpassUrl);
    const data = await response.json();

    // Clear previous markers
    markerGroup.clearLayers();
    markerGroup.addLayer(meetingPointMarker); // Keep the meeting point marker

    // Add markers for nearby places
    data.elements.forEach(element => {
        const placeMarker = L.marker([element.lat, element.lon]).addTo(markerGroup);
        placeMarker.bindPopup(element.tags.name || placeType);
    });
}

form.addEventListener("submit", async (e) => {
    e.preventDefault();
    markerGroup.clearLayers();

    const addresses = Array.from(document.querySelectorAll("[name=address]")).map(input => input.value);
    const response = await fetch("/geocode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
    });

    const { coordinates, centralPoint } = await response.json();

    // Add markers for each address
    coordinates.forEach(({ lat, lng }) => {
        L.marker([lat, lng]).addTo(markerGroup);
    });

    // Add marker for central point
    meetingPointMarker = L.marker([centralPoint.lat, centralPoint.lng])
        .bindPopup("Meeting Point")
        .addTo(markerGroup)
        .openPopup();

    map.setView([centralPoint.lat, centralPoint.lng], 12);

    // Show the nearby search options
    document.getElementById("search-options").style.display = "block";
});