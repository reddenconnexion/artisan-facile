import { toast } from 'sonner';
import { isOffline } from '../../utils/offlineSave';

export const EMPTY_MATERIAL = () => ({ id: Date.now(), description: '', quantity: 1, unit: 'unité', price: 0 });

// Contenu d'un rapport vierge (nouveau rapport ou avant chargement)
export const createInitialFormData = () => ({
    title: '',
    date: new Date().toISOString().split('T')[0],
    report_number: '',
    client_id: '',
    client_name: '',
    quote_id: '',
    intervention_address: '',
    intervention_postal_code: '',
    intervention_city: '',
    start_time: '',
    end_time: '',
    duration_hours: '',
    description: '',
    work_done: '',
    materials_used: [EMPTY_MATERIAL()],
    photos: [],
    milestones: [],
    notes: '',
    status: 'draft',
    client_signature: null,
    signed_at: null,
    signer_name: '',
});

// Champs saisis à la main, gardés en brouillon sur le téléphone tant que le
// rapport n'est pas enregistré (appel entrant, appareil photo, onglet
// rechargé par le navigateur mobile…).
export const DRAFT_FIELDS = [
    'title', 'date', 'client_id', 'client_name', 'quote_id',
    'intervention_address', 'intervention_postal_code', 'intervention_city',
    'start_time', 'end_time', 'duration_hours', 'description', 'work_done',
    'materials_used', 'photos', 'milestones', 'notes', 'signer_name',
];

export const pickDraftFields = (data) =>
    Object.fromEntries(DRAFT_FIELDS.filter(k => k in data).map(k => [k, data[k]]));

// Empreinte comparable du contenu saisi : sert à savoir s'il reste des
// modifications non enregistrées. La durée est exclue (recalculée depuis les
// heures) et les lignes de matériel vides ignorées.
export const contentSnapshot = (data) => ({
    title: data.title || '',
    date: data.date || '',
    client_id: data.client_id ? String(data.client_id) : '',
    client_name: data.client_name || '',
    quote_id: data.quote_id ? String(data.quote_id) : '',
    intervention_address: data.intervention_address || '',
    intervention_postal_code: data.intervention_postal_code || '',
    intervention_city: data.intervention_city || '',
    start_time: (data.start_time || '').slice(0, 5),
    end_time: (data.end_time || '').slice(0, 5),
    description: data.description || '',
    work_done: data.work_done || '',
    notes: data.notes || '',
    signer_name: data.signer_name || '',
    materials_used: (data.materials_used || [])
        .filter(m => (m.description || '').trim())
        .map(m => [m.description, String(m.quantity), m.unit, String(m.price)]),
    photos: (data.photos || []).map(p => p.url),
    milestones: (data.milestones || []).map(m => [m.id, m.notes || '']),
});

export const nowHHMM = () => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Hors-ligne : bloque un envoi de fichier en prévenant que le reste du
// rapport est gardé sur le téléphone.
export const blockIfOffline = (what) => {
    if (!isOffline()) return false;
    toast.error(`Pas de réseau : ${what} impossible pour l'instant. Le reste du rapport est gardé sur ce téléphone.`);
    return true;
};

/* ── Jalons d'avancement ──────────────────────────────────────────────── */

export const MILESTONE_LABELS = {
    start:     'Démarrage du chantier',
    progress:  'Avancement',
    reception: 'Réception du chantier',
    custom:    'Étape',
};

export const captureGeolocation = () =>
    new Promise((resolve) => {
        if (!('geolocation' in navigator)) return resolve(null);
        navigator.geolocation.getCurrentPosition(
            (pos) => resolve({
                latitude:  pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy:  pos.coords.accuracy,
            }),
            () => resolve(null),                              // permission refusée → on continue sans GPS
            { enableHighAccuracy: false, timeout: 5000, maximumAge: 60_000 },
        );
    });
