import express from "express";
import fetch from "node-fetch";
import path from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const app = express();
const PORT = 3000;

// Replace with your OpenCage API key
const OPENCAGE_API_KEY = "cdb17b4b376e49099f2007125c7804a2";

// Fixing __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, "public")));

// Parse incoming JSON requests
app.use(express.json());

// Endpoint to handle address geocoding
app.post("/geocode", async (req, res) => {
    const addresses = req.body.addresses;

    try {
        // Geocode each address
        const coordinates = await Promise.all(
            addresses.map(async (address) => {
                const response = await fetch(
                    `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(address)}&key=${OPENCAGE_API_KEY}`
                );
                const data = await response.json();
                const { lat, lng } = data.results[0].geometry;
                return { lat, lng };
            })
        );

        // Calculate the average latitude and longitude for the central point
        const centralPoint = coordinates.reduce(
            (acc, coord) => ({
                lat: acc.lat + coord.lat / coordinates.length,
                lng: acc.lng + coord.lng / coordinates.length,
            }),
            { lat: 0, lng: 0 }
        );

        res.json({ coordinates, centralPoint });
    } catch (error) {
        res.status(500).json({ error: "Failed to geocode addresses." });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});