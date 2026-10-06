import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Camera, Clock, Wrench, ClipboardList, ClipboardCheck, ShoppingCart,
    MapPin, User, X, Navigation,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { loadAgendaEvents } from '../utils/agendaEvents';
import { useAuth } from '../context/AuthContext';
import QuickPhotoCapture from './QuickPhotoCapture';
import TimeClockWidget from './TimeClockWidget';
import TerrainVoiceButton from './TerrainVoiceButton';
import { pickCurrentEvent } from '../utils/currentAppointment';

const today = () => new Date().toISOString().split('T')[0];

// Les quatre outils de chantier, ouverts en plein écran dans /terrain.
const MODE_TILES = [
    { id: 'depannage', label: 'Dépannage', hint: 'Rapport + signature', Icon: Wrench, tone: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' },
    { id: 'chantier', label: 'Chantier', hint: 'Suivi du devis', Icon: ClipboardCheck, tone: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' },
    { id: 'visite', label: 'Visite', hint: 'Pour un devis', Icon: ClipboardList, tone: 'bg-violet-100 dark:bg-violet-900/30 text-violet-600' },
    { id: 'commande', label: 'Matériel', hint: 'À commander', Icon: ShoppingCart, tone: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600' },
];

/**
 * Haut de l'écran « Aujourd'hui » : les gestes du chantier (photo, dictée,
 * pointage), les quatre outils terrain et les RDV du jour. Ce bloc remplace
 * l'ancien accueil « Mode terrain » : un seul accueil, le même sur téléphone
 * et sur PC.
 */
const TodayPanel = () => {
    const navigate = useNavigate();
    const { user } = useAuth();

    // ── RDV du jour avec un client connu ────────────────────────────────────
    const [todayEvents, setTodayEvents] = useState([]);
    const [photoEvent, setPhotoEvent] = useState(null);

    useEffect(() => {
        if (!user) return;
        // Même copie que l'Agenda : en zone blanche, les RDV du jour restent
        // affichés (et leurs boutons photo utilisables).
        loadAgendaEvents(user.id)
            .then(({ data }) => {
                const todayStr = today();
                const list = data
                    .filter(e => e.client_id != null)
                    .filter(e => new Date(e.date).toISOString().split('T')[0] === todayStr)
                    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
                setTodayEvents(list);
            })
            .catch(() => setTodayEvents([]));
    }, [user]);

    // RDV du moment : la photo « en un geste » part directement chez ce client.
    const currentEvent = pickCurrentEvent(todayEvents);

    // ── Photo sans RDV en cours : choix du client ───────────────────────────
    const [recentClients, setRecentClients] = useState([]);
    const [pickPhotoClient, setPickPhotoClient] = useState(false);
    const [photoClientQuery, setPhotoClientQuery] = useState('');
    const [searchedClients, setSearchedClients] = useState(null);

    useEffect(() => {
        if (!user || !pickPhotoClient || recentClients.length > 0) return;
        supabase.from('clients')
            .select('id, name')
            .order('created_at', { ascending: false })
            .limit(15)
            .then(({ data }) => setRecentClients(data || []));
    }, [user, pickPhotoClient, recentClients.length]);

    // Les 15 clients récents suffisent d'habitude ; au-delà, recherche en base.
    const photoQuery = photoClientQuery.trim();
    useEffect(() => {
        if (!user || photoQuery.length < 2) return;
        const q = photoQuery;
        const t = setTimeout(() => {
            supabase.from('clients')
                .select('id, name')
                .ilike('name', `%${q.replace(/[%_,]/g, ' ')}%`)
                .order('name')
                .limit(20)
                .then(({ data }) => setSearchedClients(data || []));
        }, 250);
        return () => clearTimeout(t);
    }, [user, photoQuery]);
    const photoClients = photoQuery.length >= 2 && searchedClients ? searchedClients : recentClients;

    const startQuickPhoto = () => {
        if (currentEvent?.client_id) {
            setPhotoEvent(currentEvent);
            return;
        }
        setPhotoClientQuery('');
        setPickPhotoClient(true);
    };

    return (
        <div className="space-y-4">
            {/* Les gestes du quotidien : photo et dictée */}
            <div className="grid grid-cols-2 gap-3">
                <button
                    onClick={startQuickPhoto}
                    aria-label={currentEvent?.client_name ? `Photo pour ${currentEvent.client_name}` : 'Prendre une photo'}
                    className="min-h-[9.5rem] md:min-h-0 md:h-16 flex flex-col md:flex-row items-center justify-center md:justify-start gap-2 md:gap-3 md:px-5 rounded-3xl md:rounded-2xl bg-gray-900 dark:bg-white text-white dark:text-gray-900 shadow-lg md:shadow-sm active:scale-[0.97] transition-all"
                >
                    <Camera className="w-12 h-12 md:w-6 md:h-6 shrink-0" />
                    <span className="flex flex-col items-center md:items-start gap-2 md:gap-0.5 min-w-0 max-w-full">
                        <span className="text-xl md:text-base font-extrabold leading-none">Photo</span>
                        <span className="text-xs font-medium opacity-75 px-2 md:px-0 text-center md:text-left truncate max-w-full">
                            {currentEvent?.client_name || 'Choisir le client'}
                        </span>
                    </span>
                </button>
                <TerrainVoiceButton />
            </div>

            {/* Pointage chantier : j'arrive / je repars */}
            <TimeClockWidget compact />

            {/* Les quatre outils terrain */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {MODE_TILES.map(({ id, label, hint, Icon, tone }) => (
                    <button
                        key={id}
                        onClick={() => navigate(`/terrain?mode=${id}`)}
                        className="min-h-[7.5rem] flex flex-col items-start justify-between gap-3 p-4 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-3xl text-left active:scale-[0.97] transition-all"
                    >
                        <span className={`w-12 h-12 rounded-2xl flex items-center justify-center ${tone}`}>
                            <Icon className="w-7 h-7" />
                        </span>
                        <span>
                            <span className="block font-bold text-gray-900 dark:text-white text-lg leading-tight">{label}</span>
                            <span className="block text-xs text-gray-500 dark:text-gray-400 mt-0.5">{hint}</span>
                        </span>
                    </button>
                ))}
            </div>

            {/* RDV du jour : photo sans rechercher le client, itinéraire */}
            {todayEvents.length > 0 && (
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-3xl p-4">
                    <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5" /> Rendez-vous du jour
                    </p>
                    <div className="space-y-2">
                        {todayEvents.map(ev => (
                            <div
                                key={ev.id}
                                className="flex items-center gap-3 p-3 rounded-2xl border border-gray-100 dark:border-gray-800"
                            >
                                <span className="w-12 shrink-0 text-center text-sm font-bold text-blue-600">{ev.time || '--:--'}</span>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{ev.title}</p>
                                    {ev.client_name && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate">
                                            <User className="w-3 h-3 shrink-0" /> {ev.client_name}
                                        </p>
                                    )}
                                    {ev.address && (
                                        <p className="text-xs text-gray-400 flex items-center gap-1 truncate">
                                            <MapPin className="w-3 h-3 shrink-0" /> {ev.address}
                                        </p>
                                    )}
                                </div>
                                {ev.address && (
                                    <a
                                        href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ev.address)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        aria-label={`Itinéraire vers ${ev.client_name || ev.title}`}
                                        className="w-11 h-11 bg-gray-100 dark:bg-gray-800 rounded-xl flex items-center justify-center shrink-0 active:scale-95"
                                    >
                                        <Navigation className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                                    </a>
                                )}
                                <button
                                    onClick={() => setPhotoEvent(ev)}
                                    aria-label={`Photo pour ${ev.client_name || ev.title}`}
                                    className="w-11 h-11 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center shrink-0 active:scale-95"
                                >
                                    <Camera className="w-5 h-5 text-blue-600" />
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Photo sans RDV en cours : choisir le client en un appui */}
            {pickPhotoClient && (
                <div className="fixed inset-0 z-[60] bg-black/50 flex items-end md:items-center md:justify-center" onClick={() => setPickPhotoClient(false)}>
                    <div
                        className="w-full md:max-w-md max-h-[80vh] flex flex-col bg-white dark:bg-gray-900 rounded-t-3xl md:rounded-3xl safe-area-bottom"
                        onClick={e => e.stopPropagation()}
                        role="dialog"
                        aria-label="Photos pour quel client ?"
                    >
                        <div className="flex items-center justify-between px-4 pt-4 pb-2">
                            <p className="font-bold text-lg text-gray-900 dark:text-white">Photos pour quel client ?</p>
                            <button onClick={() => setPickPhotoClient(false)} className="p-2 -mr-2 text-gray-400" aria-label="Fermer">
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="px-4 pb-2">
                            <input
                                type="search"
                                value={photoClientQuery}
                                onChange={e => setPhotoClientQuery(e.target.value)}
                                placeholder="Rechercher…"
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl text-base"
                            />
                        </div>
                        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
                            {photoClients.length === 0 ? (
                                <p className="text-center text-sm text-gray-400 py-6">Aucun client trouvé</p>
                            ) : photoClients.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => {
                                        setPickPhotoClient(false);
                                        setPhotoEvent({ client_id: c.id, client_name: c.name, title: 'Photos terrain' });
                                    }}
                                    className="w-full flex items-center gap-3 px-4 py-4 rounded-2xl border border-gray-100 dark:border-gray-800 text-left text-base font-semibold text-gray-900 dark:text-white active:bg-blue-50 dark:active:bg-gray-800"
                                >
                                    <User className="w-5 h-5 text-gray-400 shrink-0" />
                                    <span className="truncate">{c.name}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {photoEvent && (
                <QuickPhotoCapture
                    clientId={photoEvent.client_id}
                    clientName={photoEvent.client_name}
                    contextLabel={photoEvent.title}
                    onClose={() => setPhotoEvent(null)}
                />
            )}
        </div>
    );
};

export default TodayPanel;
