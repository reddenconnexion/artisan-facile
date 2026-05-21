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
    // Préférence : éviter systématiquement l'autoroute (économie batterie)
    avoidHighway: false,
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

const parseOsrmRoute = (route) => ({
    distanceKm: route.distance / 1000,
    durationMin: route.duration / 60,
    geometry: route.geometry,
    legs: route.legs.map((l) => ({
        distanceKm: l.distance / 1000,
        durationMin: l.duration / 60,
    })),
});

/**
 * Fetch the default (fastest) route. Returns the parsed route, or null.
 */
const fetchFastestRoute = async (stops) => {
    if (stops.length < 2) return null;
    const coords = buildCoordsParam(stops);
    const params = new URLSearchParams({
        overview: 'full',
        geometries: 'geojson',
        steps: 'false',
    });
    const resp = await fetch(`${OSRM_BASE}/${coords}?${params.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    return parseOsrmRoute(data.routes[0]);
};

/**
 * Fetch up to N alternatives and return the slowest one (heuristic for "least
 * highway"). Le serveur OSRM démo ne supporte pas `exclude=motorway`, on utilise
 * donc cette stratégie : OSRM peut renvoyer des alternatives qui contournent
 * les axes rapides, et la vitesse moyenne est un bon proxy du contenu autoroutier.
 *
 * Renvoie { route, isAlternative } où isAlternative=true indique qu'on n'a pas
 * pu obtenir d'alternative plus lente que la route rapide (donc résultat à
 * prendre avec précaution).
 */
const fetchSlowestAlternative = async (stops) => {
    if (stops.length < 2) return null;
    const coords = buildCoordsParam(stops);
    const params = new URLSearchParams({
        overview: 'full',
        geometries: 'geojson',
        steps: 'false',
        alternatives: '3',
    });
    const resp = await fetch(`${OSRM_BASE}/${coords}?${params.toString()}`);
    if (!resp.ok) return null;
    const data = await resp.json();
    if (data.code !== 'Ok' || !data.routes?.length) return null;
    // Tri par vitesse moyenne ascendante → la plus lente = la moins autoroutière.
    const sorted = [...data.routes].sort((a, b) => {
        const speedA = a.distance / a.duration;
        const speedB = b.distance / b.duration;
        return speedA - speedB;
    });
    const slowest = sorted[0];
    const fastest = sorted[sorted.length - 1];
    return {
        route: parseOsrmRoute(slowest),
        // Si la route la plus lente et la plus rapide sont identiques, OSRM n'a
        // pas trouvé d'alternative — on signale au caller pour qu'il avertisse.
        isAlternative: slowest !== fastest,
    };
};

/**
 * Fetch both fastest and "scenic" (least-highway) routes for comparison.
 * Pass `onlyScenic: true` pour ne calculer que l'itinéraire le moins autoroutier.
 *
 * Renvoie { fastest, scenic, scenicHasNoAlternative } où ce dernier flag indique
 * qu'OSRM n'a pas trouvé de variante moins autoroutière (la route "scenic" est
 * alors identique à la rapide).
 */
export const fetchAlternativeRoutes = async (stops, { onlyScenic = false } = {}) => {
    if (onlyScenic) {
        const result = await fetchSlowestAlternative(stops);
        if (!result) return { fastest: null, scenic: null, scenicHasNoAlternative: false };
        return {
            fastest: null,
            scenic: result.route,
            scenicHasNoAlternative: !result.isAlternative,
        };
    }
    const [fastest, alt] = await Promise.all([
        fetchFastestRoute(stops),
        fetchSlowestAlternative(stops),
    ]);
    return {
        fastest,
        scenic: alt?.route ?? null,
        scenicHasNoAlternative: alt ? !alt.isAlternative : false,
    };
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
