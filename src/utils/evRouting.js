import { getCoordinates } from './geoService';

// OSRM public demo server. Gratuit, sans clé, mais à remplacer par une instance
// dédiée si l'usage devient significatif (cf. https://github.com/Project-OSRM/osrm-backend).
const OSRM_BASE = 'https://router.project-osrm.org/route/v1/driving';

const LS_KEY = 'ev_profile';

const DEFAULT_PROFILE = {
    // Utilitaire électrique typique (Kangoo E-Tech / Berlingo e / e-Expert)
    rangeCityKm: 250,       // autonomie cycle mixte / ville (km)
    rangeHighwayKm: 170,    // autonomie réelle autoroute @ 110-130 km/h (km)
    currentChargePct: 80,   // état de charge actuel (%)
    // Marge de sécurité : on considère qu'on ne descend pas sous ce seuil
    reserveBufferPct: 10,
};

export const loadEvProfile = () => {
    try {
        const raw = localStorage.getItem(LS_KEY);
        if (!raw) return { ...DEFAULT_PROFILE };
        const parsed = JSON.parse(raw);
        return { ...DEFAULT_PROFILE, ...parsed };
    } catch {
        return { ...DEFAULT_PROFILE };
    }
};

export const saveEvProfile = (profile) => {
    localStorage.setItem(LS_KEY, JSON.stringify(profile));
};

/**
 * Geocode a list of addresses sequentially (Nominatim rate limit ~1/s).
 * Returns null entries for failed geocodes so callers can flag them.
 */
export const geocodeStops = async (addresses) => {
    const out = [];
    for (const addr of addresses) {
        if (!addr || !addr.trim()) {
            out.push(null);
            continue;
        }
        const coord = await getCoordinates(addr);
        out.push(coord ? { ...coord, address: addr } : null);
        // Respect Nominatim usage policy
        await new Promise((r) => setTimeout(r, 1100));
    }
    return out;
};

const buildCoordsParam = (stops) =>
    stops.map((s) => `${s.lon},${s.lat}`).join(';');

/**
 * Fetch a route via OSRM. `exclude` can be 'motorway' to force national roads.
 * Returns { distanceKm, durationMin, geometry, legs } or null on failure.
 */
const fetchOsrmRoute = async (stops, { exclude } = {}) => {
    if (stops.length < 2) return null;
    const coords = buildCoordsParam(stops);
    const params = new URLSearchParams({
        overview: 'full',
        geometries: 'geojson',
        steps: 'false',
    });
    if (exclude) params.set('exclude', exclude);

    const url = `${OSRM_BASE}/${coords}?${params.toString()}`;
    const resp = await fetch(url);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;

    const route = data.routes[0];
    return {
        distanceKm: route.distance / 1000,
        durationMin: route.duration / 60,
        geometry: route.geometry, // GeoJSON LineString
        legs: route.legs.map((l) => ({
            distanceKm: l.distance / 1000,
            durationMin: l.duration / 60,
        })),
    };
};

/**
 * Fetch both fastest and motorway-free routes for comparison.
 * Returns { fastest, scenic } where scenic excludes motorways.
 */
export const fetchAlternativeRoutes = async (stops) => {
    const [fastest, scenic] = await Promise.all([
        fetchOsrmRoute(stops),
        fetchOsrmRoute(stops, { exclude: 'motorway' }),
    ]);
    return { fastest, scenic };
};

/**
 * Heuristic: classify a route as "mostly highway" vs "mostly road" by comparing
 * the fastest-route avg speed with what we'd expect on nationals. Returns a 0-1
 * highway ratio used to weight consumption between rangeHighwayKm and rangeCityKm.
 */
const estimateHighwayRatio = (route) => {
    if (!route || route.distanceKm < 1) return 0;
    const avgSpeed = (route.distanceKm / route.durationMin) * 60; // km/h
    // < 70 km/h -> urbain ; 70-95 -> mixte ; > 95 -> autoroutier
    if (avgSpeed <= 70) return 0;
    if (avgSpeed >= 105) return 1;
    return (avgSpeed - 70) / 35;
};

/**
 * Compute battery consumption for a given route and EV profile.
 * Returns { consumptionPct, kmAvailable, feasible, marginPct, highwayRatio, avgSpeed }.
 */
export const computeConsumption = (route, profile) => {
    if (!route) return null;
    const highwayRatio = estimateHighwayRatio(route);
    // Effective autonomy weighted by route type
    const effectiveRange =
        profile.rangeHighwayKm * highwayRatio +
        profile.rangeCityKm * (1 - highwayRatio);

    const consumptionPct = (route.distanceKm / effectiveRange) * 100;
    const usablePct = profile.currentChargePct - profile.reserveBufferPct;
    const marginPct = usablePct - consumptionPct;
    const kmAvailable = (usablePct / 100) * effectiveRange;
    const avgSpeed = (route.distanceKm / route.durationMin) * 60;

    return {
        consumptionPct,
        kmAvailable,
        marginPct,
        feasible: marginPct >= 0,
        highwayRatio,
        avgSpeed,
        effectiveRange,
    };
};

export const formatDuration = (minutes) => {
    if (minutes == null) return '—';
    const h = Math.floor(minutes / 60);
    const m = Math.round(minutes % 60);
    if (h === 0) return `${m} min`;
    return `${h}h${m.toString().padStart(2, '0')}`;
};
