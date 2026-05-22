import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Battery, Zap, Route as RouteIcon, MapPin, Plus, Trash2,
    AlertTriangle, CheckCircle2, Settings, ArrowLeft, Loader2, Navigation,
} from 'lucide-react';
import {
    loadEvProfile,
    saveEvProfile,
    geocodeStops,
    fetchAlternativeRoutes,
    computeConsumption,
    formatDuration,
} from '../utils/evRouting';

// Leaflet est bundlé (et non chargé par CDN) pour rester conforme au CSP
// strict de l'app (script-src 'self', style-src 'self').
const loadLeaflet = async () => {
    const [leafletMod, , iconUrl, iconRetinaUrl, shadowUrl] = await Promise.all([
        import('leaflet'),
        import('leaflet/dist/leaflet.css'),
        import('leaflet/dist/images/marker-icon.png'),
        import('leaflet/dist/images/marker-icon-2x.png'),
        import('leaflet/dist/images/marker-shadow.png'),
    ]);
    const L = leafletMod.default || leafletMod;
    // Vite résout les images en URLs avec hash ; on remplace les chemins
    // relatifs hardcodés de Leaflet pour que les marqueurs s'affichent.
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconUrl: iconUrl.default,
        iconRetinaUrl: iconRetinaUrl.default,
        shadowUrl: shadowUrl.default,
    });
    return L;
};

const ScoreBadge = ({ status, label }) => {
    const styles = {
        ok: 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200',
        warn: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 border-amber-200',
        ko: 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 border-red-200',
    };
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border ${styles[status]}`}>
            {status === 'ok' && <CheckCircle2 className="w-3.5 h-3.5" />}
            {status !== 'ok' && <AlertTriangle className="w-3.5 h-3.5" />}
            {label}
        </span>
    );
};

const routeStatus = (consumption) => {
    if (!consumption) return 'warn';
    if (!consumption.feasible) return 'ko';
    if (consumption.marginPct < 15) return 'warn';
    return 'ok';
};

const routeStatusLabel = (consumption) => {
    if (!consumption) return 'Inconnu';
    if (!consumption.feasible) return 'Trajet trop long sans recharge';
    if (consumption.marginPct < 15) return 'Marge faible';
    return 'OK';
};

const RouteCard = ({ title, subtitle, color, route, consumption, onSelect, selected }) => {
    if (!route) {
        return (
            <div className="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                <h4 className="font-semibold text-gray-700 dark:text-gray-300">{title}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Pas d'itinéraire disponible.</p>
            </div>
        );
    }
    const status = routeStatus(consumption);
    const ringColor =
        status === 'ok' ? 'ring-green-500'
        : status === 'warn' ? 'ring-amber-500'
        : 'ring-red-500';

    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full text-left p-4 rounded-xl border bg-white dark:bg-gray-900 transition-all ${
                selected ? `ring-2 ${ringColor} border-transparent` : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
            }`}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                    <h4 className="font-semibold text-gray-900 dark:text-white">{title}</h4>
                </div>
                <ScoreBadge status={status} label={routeStatusLabel(consumption)} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{subtitle}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">Distance</div>
                    <div className="font-semibold text-gray-900 dark:text-white">{route.distanceKm.toFixed(1)} km</div>
                </div>
                <div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">Durée</div>
                    <div className="font-semibold text-gray-900 dark:text-white">{formatDuration(route.durationMin)}</div>
                </div>
                <div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">Consommation estimée</div>
                    <div className={`font-semibold ${status === 'ko' ? 'text-red-600' : 'text-gray-900 dark:text-white'}`}>
                        {consumption ? `${consumption.consumptionPct.toFixed(0)} % de batterie` : '—'}
                    </div>
                </div>
                <div>
                    <div className="text-gray-500 dark:text-gray-400 text-xs">Marge après trajet</div>
                    <div className={`font-semibold ${status === 'ko' ? 'text-red-600' : status === 'warn' ? 'text-amber-600' : 'text-green-600'}`}>
                        {consumption ? `${consumption.marginPct.toFixed(0)} %` : '—'}
                    </div>
                </div>
            </div>
            {consumption && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                    Vitesse moyenne {consumption.avgSpeed.toFixed(0)} km/h
                    {' · '}
                    Profil {(consumption.highwayRatio * 100).toFixed(0)} % autoroute
                </div>
            )}
        </button>
    );
};

const StopRow = ({ index, value, onChange, onRemove, canRemove }) => (
    <div className="flex items-center gap-2">
        <div className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-bold shrink-0">
            {index + 1}
        </div>
        <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={index === 0 ? 'Adresse de départ' : `Étape ${index + 1}`}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
        />
        {canRemove && (
            <button
                type="button"
                onClick={onRemove}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                title="Retirer cette étape"
            >
                <Trash2 className="w-4 h-4" />
            </button>
        )}
    </div>
);

const RoutePlanner = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const mapRef = useRef(null);
    const mapInstanceRef = useRef(null);
    const leafletRef = useRef(null);
    const layersRef = useRef([]);

    const initialStops = useMemo(() => {
        const prefill = location.state?.stops;
        if (Array.isArray(prefill) && prefill.length >= 1) {
            return prefill.length >= 2 ? prefill : ['', ...prefill];
        }
        return ['', ''];
    }, [location.state]);

    const [stops, setStops] = useState(initialStops);
    const [profile, setProfile] = useState(loadEvProfile);
    const [showSettings, setShowSettings] = useState(false);
    const [routes, setRoutes] = useState({ fastest: null, scenic: null });
    const [scenicHasNoAlternative, setScenicHasNoAlternative] = useState(false);
    const [planStops, setPlanStops] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState('fastest');
    const [roundTrip, setRoundTrip] = useState(false);

    // Aller-retour pertinent quand il n'y a qu'une destination unique.
    const canRoundTrip = stops.filter((s) => s.trim()).length === 2;
    useEffect(() => {
        if (!canRoundTrip && roundTrip) setRoundTrip(false);
    }, [canRoundTrip, roundTrip]);

    useEffect(() => {
        if (profile.avoidHighway) setSelected('scenic');
    }, [profile.avoidHighway]);

    useEffect(() => {
        if (!mapRef.current) return;
        let cancelled = false;
        loadLeaflet()
            .then((L) => {
                if (cancelled || mapInstanceRef.current) return;
                leafletRef.current = L;
                const map = L.map(mapRef.current, {
                    center: [46.6, 2.5],
                    zoom: 6,
                    scrollWheelZoom: true,
                });
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '© OpenStreetMap',
                    maxZoom: 19,
                }).addTo(map);
                mapInstanceRef.current = map;
            })
            .catch(() => toast.error('Impossible de charger la carte'));
        return () => {
            cancelled = true;
        };
    }, []);

    const updateStop = (i, value) => {
        setStops((prev) => prev.map((s, idx) => (idx === i ? value : s)));
    };

    const addStop = () => setStops((prev) => [...prev, '']);
    const removeStop = (i) => setStops((prev) => prev.filter((_, idx) => idx !== i));

    const updateProfile = (patch) => {
        setProfile((prev) => {
            const next = { ...prev, ...patch };
            saveEvProfile(next);
            return next;
        });
    };

    const drawRoutes = (fastest, scenic, stopCoords) => {
        const L = leafletRef.current;
        const map = mapInstanceRef.current;
        if (!L || !map) return;

        layersRef.current.forEach((l) => map.removeLayer(l));
        layersRef.current = [];

        const addRoute = (route, color, dashed = false) => {
            if (!route?.geometry) return;
            const latlngs = route.geometry.coordinates.map(([lon, lat]) => [lat, lon]);
            const line = L.polyline(latlngs, {
                color,
                weight: 5,
                opacity: 0.85,
                dashArray: dashed ? '8 6' : null,
            }).addTo(map);
            layersRef.current.push(line);
        };

        addRoute(scenic, '#16a34a', true);
        addRoute(fastest, '#2563eb', false);

        stopCoords.forEach((c, idx) => {
            if (!c) return;
            const marker = L.marker([c.lat, c.lon])
                .addTo(map)
                .bindPopup(`<b>Étape ${idx + 1}</b><br/>${c.address}`);
            layersRef.current.push(marker);
        });

        const allLatLngs = stopCoords.filter(Boolean).map((c) => [c.lat, c.lon]);
        if (allLatLngs.length >= 2) {
            map.fitBounds(allLatLngs, { padding: [40, 40] });
        }
    };

    const handlePlan = async () => {
        const filled = stops.map((s) => s.trim()).filter(Boolean);
        if (filled.length < 2) {
            toast.error('Renseignez au moins une adresse de départ et une destination.');
            return;
        }
        setLoading(true);
        try {
            toast.info('Géocodage des adresses…');
            const geocoded = await geocodeStops(stops);
            const missingIndex = geocoded.findIndex((c, i) => stops[i]?.trim() && !c);
            if (missingIndex >= 0) {
                toast.error(`Adresse introuvable : « ${stops[missingIndex]} »`);
                setLoading(false);
                return;
            }
            const usable = geocoded.filter(Boolean);
            // Aller-retour : on rajoute l'origine en fin de parcours pour qu'OSRM
            // calcule le retour réel (peut différer en cas de sens unique, etc.).
            const routeStops = roundTrip && usable.length === 2
                ? [...usable, usable[0]]
                : usable;

            toast.info('Calcul des itinéraires…');
            const result = await fetchAlternativeRoutes(routeStops, {
                onlyScenic: profile.avoidHighway,
            });
            if (!result.fastest && !result.scenic) {
                toast.error('Aucun itinéraire trouvé.');
                setLoading(false);
                return;
            }
            setRoutes({ fastest: result.fastest, scenic: result.scenic });
            setScenicHasNoAlternative(result.scenicHasNoAlternative);
            setPlanStops(usable);
            if (profile.avoidHighway) setSelected('scenic');
            drawRoutes(result.fastest, result.scenic, usable);
            toast.success('Itinéraires calculés.');
        } catch (e) {
            console.error(e);
            toast.error('Erreur lors du calcul de l\'itinéraire.');
        } finally {
            setLoading(false);
        }
    };

    const fastestConsumption = useMemo(
        () => computeConsumption(routes.fastest, profile),
        [routes.fastest, profile]
    );
    const scenicConsumption = useMemo(
        () => computeConsumption(routes.scenic, profile),
        [routes.scenic, profile]
    );

    const recommendation = useMemo(() => {
        const f = fastestConsumption;
        const s = scenicConsumption;
        if (!f && !s) return null;
        if (!f && s) return { key: 'scenic', text: 'Seul l\'itinéraire sans autoroute est disponible.' };
        if (f && !s) return { key: 'fastest', text: 'Seul l\'itinéraire rapide est disponible.' };
        if (!f.feasible && s.feasible) {
            return { key: 'scenic', text: 'L\'autoroute n\'est pas faisable avec votre charge actuelle. Prenez la route nationale.' };
        }
        if (f.feasible && !s.feasible) {
            return { key: 'fastest', text: 'L\'itinéraire rapide reste votre meilleure option (nationale trop longue).' };
        }
        if (!f.feasible && !s.feasible) {
            return { key: 'fastest', text: 'Aucun itinéraire faisable sans recharge intermédiaire. Prévoyez une halte sur borne.' };
        }
        // Both feasible
        if (f.marginPct < 20 && s.marginPct >= 20) {
            return { key: 'scenic', text: 'Marge serrée sur autoroute, la nationale est plus prudente.' };
        }
        if (s.durationMin - f.durationMin > 30 && f.marginPct >= 20) {
            return { key: 'fastest', text: 'Autoroute conseillée : marge confortable et gain de temps significatif.' };
        }
        return { key: 'fastest', text: 'Les deux options sont viables. L\'autoroute reste plus rapide.' };
    }, [fastestConsumption, scenicConsumption]);

    return (
        <div className="flex flex-col h-full space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate(-1)}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg text-gray-600 dark:text-gray-400"
                        title="Retour"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <RouteIcon className="w-7 h-7 text-blue-600" />
                        Planification de tournée
                    </h2>
                </div>
                <button
                    onClick={() => setShowSettings((s) => !s)}
                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                    <Settings className="w-4 h-4" />
                    Mon véhicule
                </button>
            </div>

            {showSettings && (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                        <Battery className="w-5 h-5 text-blue-600" />
                        Profil véhicule électrique
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <label className="block">
                            <span className="text-gray-600 dark:text-gray-400">Autonomie ville (km)</span>
                            <input
                                type="number"
                                value={profile.rangeCityKm}
                                onChange={(e) => updateProfile({ rangeCityKm: Number(e.target.value) || 0 })}
                                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md"
                            />
                        </label>
                        <label className="block">
                            <span className="text-gray-600 dark:text-gray-400">Autonomie autoroute (km)</span>
                            <input
                                type="number"
                                value={profile.rangeHighwayKm}
                                onChange={(e) => updateProfile({ rangeHighwayKm: Number(e.target.value) || 0 })}
                                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md"
                            />
                        </label>
                        <label className="block">
                            <span className="text-gray-600 dark:text-gray-400">Charge actuelle (%)</span>
                            <input
                                type="number"
                                min="0"
                                max="100"
                                value={profile.currentChargePct}
                                onChange={(e) => updateProfile({ currentChargePct: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
                                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md"
                            />
                        </label>
                        <label className="block">
                            <span className="text-gray-600 dark:text-gray-400">Réserve mini (%)</span>
                            <input
                                type="number"
                                min="0"
                                max="50"
                                value={profile.reserveBufferPct}
                                onChange={(e) => updateProfile({ reserveBufferPct: Math.max(0, Math.min(50, Number(e.target.value) || 0)) })}
                                className="mt-1 w-full px-2 py-1.5 border border-gray-300 rounded-md"
                            />
                        </label>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
                        L'autonomie autoroute est typiquement 30 à 40 % inférieure à l'autonomie WLTP. Pour un utilitaire électrique,
                        comptez 130-180 km à 110 km/h en pleine charge.
                    </p>
                </div>
            )}

            <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
                {/* Left panel: stops + results */}
                <div className="w-full lg:w-[420px] flex flex-col gap-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-blue-600" />
                            Étapes
                        </h3>
                        <div className="space-y-2">
                            {stops.map((s, i) => (
                                <StopRow
                                    key={i}
                                    index={i}
                                    value={s}
                                    onChange={(v) => updateStop(i, v)}
                                    onRemove={() => removeStop(i)}
                                    canRemove={stops.length > 2}
                                />
                            ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 text-sm">
                            <label className="inline-flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={profile.avoidHighway}
                                    onChange={(e) => updateProfile({ avoidHighway: e.target.checked })}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-gray-700 dark:text-gray-300">Éviter l'autoroute</span>
                            </label>
                            {canRoundTrip && (
                                <label className="inline-flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={roundTrip}
                                        onChange={(e) => setRoundTrip(e.target.checked)}
                                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-gray-700 dark:text-gray-300">Aller-retour</span>
                                </label>
                            )}
                        </div>
                        <div className="flex justify-between items-center mt-3">
                            <button
                                onClick={addStop}
                                className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
                            >
                                <Plus className="w-4 h-4" />
                                Ajouter une étape
                            </button>
                            <button
                                onClick={handlePlan}
                                disabled={loading}
                                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-60"
                            >
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                                {loading ? 'Calcul…' : 'Calculer'}
                            </button>
                        </div>
                    </div>

                    {(routes.fastest || routes.scenic) && (
                        <div className="space-y-3">
                            {roundTrip && (
                                <div className="px-3 py-2 rounded-lg bg-violet-50 border border-violet-100 text-xs text-violet-800">
                                    Estimation calculée pour le trajet <strong>aller-retour</strong>.
                                </div>
                            )}
                            {!profile.avoidHighway && (
                                <RouteCard
                                    title="Itinéraire rapide"
                                    subtitle="Autoroutes autorisées"
                                    color="#2563eb"
                                    route={routes.fastest}
                                    consumption={fastestConsumption}
                                    onSelect={() => setSelected('fastest')}
                                    selected={selected === 'fastest'}
                                />
                            )}
                            <RouteCard
                                title={scenicHasNoAlternative ? 'Itinéraire alternatif' : 'Le moins autoroutier'}
                                subtitle={scenicHasNoAlternative
                                    ? 'OSRM n\'a pas trouvé d\'alternative plus lente'
                                    : 'Privilégie nationales et départementales'}
                                color="#16a34a"
                                route={routes.scenic}
                                consumption={scenicConsumption}
                                onSelect={() => setSelected('scenic')}
                                selected={selected === 'scenic'}
                            />

                            {scenicHasNoAlternative && (
                                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-xs text-amber-800 dark:text-amber-400 space-y-1">
                                    <p>
                                        <strong>Évitement non garanti :</strong> le service de routage utilisé (OSRM)
                                        ne sait pas exclure l'autoroute de façon stricte. L'itinéraire affiché peut
                                        encore en contenir.
                                    </p>
                                    <p>
                                        Pour la navigation réelle, ouvre l'itinéraire dans Waze ci-dessous et active
                                        « Éviter les autoroutes / les péages » dans les paramètres Waze : ton app
                                        gérera l'évitement de façon fiable.
                                    </p>
                                </div>
                            )}

                            {planStops.length >= 2 && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        const dest = planStops[planStops.length - 1];
                                        const url = `https://waze.com/ul?ll=${dest.lat}%2C${dest.lon}&navigate=yes`;
                                        window.open(url, '_blank', 'noopener,noreferrer');
                                    }}
                                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500 text-white text-sm font-semibold rounded-lg hover:bg-sky-600"
                                    title={`Démarrer la navigation vers ${planStops[planStops.length - 1].address}`}
                                >
                                    <Navigation className="w-4 h-4" />
                                    Ouvrir dans Waze
                                </button>
                            )}

                            {!profile.avoidHighway && recommendation && (
                                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 text-sm text-blue-900">
                                    <strong>Recommandation : </strong>
                                    {recommendation.text}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Map */}
                <div className="flex-1 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden min-h-[400px]">
                    <div ref={mapRef} className="w-full h-full" style={{ minHeight: '400px' }} />
                </div>
            </div>
        </div>
    );
};

export default RoutePlanner;
