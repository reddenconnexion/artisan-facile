
// OpenStreetMap Nominatim API for geocoding
// Free usage limits apply (1 request/sec approx)

/**
 * Geocodes an address string to coordinates {lat, lon}.
 * @param {string} address - Full address string
 * @returns {Promise<{lat: number, lon: number}|null>}
 */
export const getCoordinates = async (address) => {
    try {
        if (!address) return null;

        // Add "France" context if not present for better accuracy
        const query = address.toLowerCase().includes('france') ? address : `${address}, France`;
        const encoded = encodeURIComponent(query);

        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1`;

        const response = await fetch(url, {
            headers: {
                // Nominatim requires a User-Agent identifyng the application
                'User-Agent': 'ArtisanFacile/1.0'
            }
        });

        if (!response.ok) return null;

        const data = await response.json();

        if (data && data.length > 0) {
            return {
                lat: parseFloat(data[0].lat),
                lon: parseFloat(data[0].lon)
            };
        }
        return null;
    } catch (error) {
        console.error("Geocoding error:", error);
        return null;
    }
};

/**
 * Calculates distance between two coordinates in km using Haversine formula.
 * @param {{lat: number, lon: number}} coord1 
 * @param {{lat: number, lon: number}} coord2 
 * @returns {number} Distance in kilometers
 */
export const calculateDistance = (coord1, coord2) => {
    if (!coord1 || !coord2) return 0;

    const R = 6371; // Earth radius in km
    const dLat = toRad(coord2.lat - coord1.lat);
    const dLon = toRad(coord2.lon - coord1.lon);

    const lat1 = toRad(coord1.lat);
    const lat2 = toRad(coord2.lat);

    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
};

const toRad = (val) => {
    return val * Math.PI / 180;
};

/**
 * Determines the applicable travel fee based on distance and zones.
 * @param {number} distanceKm 
 * @param {Array<{radius: number, price: number}>} zones 
 * @returns {number} Fee in Euros, or 0 if no zone matches
 */
export const getZoneFee = (distanceKm, zones) => {
    // Sort zones by radius ascending to find the first matching zone
    const sortedZones = [...zones].sort((a, b) => a.radius - b.radius);

    for (const zone of sortedZones) {
        if (distanceKm <= zone.radius) {
            return zone.price;
        }
    }

    // If distance exceeds all zones, perhaps charge the max zone? 
    // Or return 0 (too far). The user prompt implies 3 specific zones.
    // Let's assume strict zones.
    return 0;
};
