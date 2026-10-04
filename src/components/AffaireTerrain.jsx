import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    Camera, Calendar, ShoppingCart, Timer, ClipboardList, ClipboardCheck,
    AlertTriangle, ChevronRight, Navigation, Loader2, FilePlus,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { loadAgendaEvents } from '../utils/agendaEvents';
import { loadProgress, saveProgress } from '../utils/chantierProgressStore';
import { checklistSections, progressStats } from '../utils/chantierProgress';
import { nextAmendmentIndex, amendmentLabel, isAmendmentRow } from '../utils/amendmentIndex';
import { formatAmount, formatDate } from '../utils/format';
import {
    affaireQuoteIds, photoFolderNames, summarizeMaterial, summarizeHours,
    affaireEvents, openExtras, extrasToAmendmentItems, markExtrasConverted,
} from '../utils/affaireSite';
import { Card } from './ui';
import PhotoLightbox from './PhotoLightbox';
import QuickPhotoCapture from './QuickPhotoCapture';

const PHOTO_PREVIEW = 8;

const SectionTitle = ({ icon: Icon, title, to, linkLabel }) => (
    <div className="flex items-center justify-between gap-2 mb-2">
        <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
            <Icon className="w-4 h-4 text-gray-400" aria-hidden="true" /> {title}
        </p>
        {to && (
            <Link to={to} className="text-sm text-ios inline-flex items-center gap-0.5 hover:underline">
                {linkLabel} <ChevronRight className="w-4 h-4" aria-hidden="true" />
            </Link>
        )}
    </div>
);

const REPORT_LABELS = {
    draft: 'Brouillon',
    completed: 'Terminé',
    signed: 'Signé',
};

/**
 * Tout ce qui se passe sur le chantier d'une affaire, sur la fiche Affaire :
 * photos, rendez-vous, matériel, heures, rapports, avancement terrain et
 * travaux notés hors devis (transformables en avenant).
 */
const AffaireTerrain = ({ quote, linkedDocs = [] }) => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const quoteIds = useMemo(() => affaireQuoteIds(quote, linkedDocs), [quote, linkedDocs]);
    const folderNames = useMemo(() => photoFolderNames(quote, linkedDocs), [quote, linkedDocs]);
    const clientId = quote?.client_id ?? null;
    const clientName = quote?.clients?.name || quote?.client_name || 'Client';

    const [data, setData] = useState(null);
    const [lightboxIndex, setLightboxIndex] = useState(null);
    const [photoFolderId, setPhotoFolderId] = useState(null);
    const [capturing, setCapturing] = useState(false);
    const [creatingAmendment, setCreatingAmendment] = useState(false);

    const load = useCallback(async () => {
        if (!user || !quote) return;
        const [folders, material, hours, reports, agenda, progress] = await Promise.all([
            clientId != null && folderNames.length > 0
                ? supabase.from('projects').select('id, name').eq('client_id', clientId).in('name', folderNames)
                : Promise.resolve({ data: [] }),
            supabase.from('procurement_items').select('id, status, quantity, buying_price').in('quote_id', quoteIds),
            supabase.from('task_tracking').select('id, hours_spent, date').in('quote_id', quoteIds),
            supabase.from('intervention_reports')
                .select('id, report_number, title, date, status, report_type')
                .in('quote_id', quoteIds)
                .order('date', { ascending: false }),
            loadAgendaEvents(user.id).catch(() => ({ data: [] })),
            loadProgress(quote.id, user.id).catch(() => null),
        ]);

        const folderIds = (folders.data || []).map(f => f.id);
        let photos = [];
        if (folderIds.length > 0) {
            const { data: rows } = await supabase
                .from('project_photos')
                .select('id, photo_url, category, description, created_at')
                .in('project_id', folderIds)
                .order('created_at', { ascending: false });
            photos = rows || [];
        }
        // Dossier du devis lui-même : celui où ranger les nouvelles photos.
        const ownFolder = (folders.data || []).find(f => f.name === (quote.title || '').trim());

        setPhotoFolderId(ownFolder?.id ?? null);
        setData({
            photos,
            material: summarizeMaterial(material.data || []),
            hours: summarizeHours(hours.data || []),
            reports: reports.data || [],
            events: affaireEvents(agenda?.data || [], {
                quoteIds,
                clientId,
                sinceDate: quote.date || quote.created_at,
            }),
            progress: progress?.progress || null,
        });
    }, [user, quote, clientId, folderNames, quoteIds]);

    useEffect(() => { load(); }, [load]);

    const stats = useMemo(() => {
        if (!data?.progress || !Array.isArray(quote?.items) || quote.items.length === 0) return null;
        const s = progressStats(checklistSections(quote.items), data.progress.done || {});
        return s.totalUnits > 0 ? s : null;
    }, [data, quote]);
    const extras = useMemo(() => openExtras(data?.progress?.extras), [data]);

    // Nouvelle photo : rangée dans le dossier du devis (créé au besoin).
    const startPhoto = async () => {
        if (clientId == null) { toast.error('Aucun client sur ce devis'); return; }
        const name = (quote.title || '').trim();
        if (!photoFolderId && name) {
            const { data: created, error } = await supabase
                .from('projects')
                .insert([{ name, client_id: clientId, user_id: user.id }])
                .select('id')
                .single();
            if (!error && created) setPhotoFolderId(created.id);
        }
        setCapturing(true);
    };

    // Travaux hors devis → avenant brouillon prérempli, prix à renseigner.
    const createAmendmentFromExtras = async () => {
        if (creatingAmendment || extras.length === 0) return;
        setCreatingAmendment(true);
        try {
            // Même règle que « Créer un avenant » dans l'éditeur : tous les
            // avenants déjà rattachés comptent, annulés compris.
            const { data: existing, error: existingError } = await supabase
                .from('quotes')
                .select('id, type, amendment_details, parent_quote_id')
                .eq('parent_id', quote.id)
                .in('type', ['amendment', 'invoice']);
            if (existingError) throw existingError;
            const index = nextAmendmentIndex((existing || []).filter(isAmendmentRow));
            const label = amendmentLabel(index);
            const ref = quote.quote_number || quote.id;
            const { data: created, error } = await supabase
                .from('quotes')
                .insert([{
                    user_id: user.id,
                    client_id: quote.client_id,
                    client_name: clientName,
                    title: `${label} au devis - ${quote.title || ''}`.trim(),
                    date: new Date().toISOString().split('T')[0],
                    status: 'draft',
                    type: 'amendment',
                    parent_id: quote.id,
                    parent_quote_id: quote.id,
                    items: extrasToAmendmentItems(data.progress.extras),
                    amendment_details: { amendment_index: index },
                    notes: `${label} au devis n°${ref} (${quote.title || ''})\n\nTravaux demandés en cours de chantier, hors devis initial.`,
                    include_tva: quote.include_tva,
                    total_ht: 0,
                    total_tva: 0,
                    total_ttc: 0,
                }])
                .select('id')
                .single();
            if (error) throw error;
            await saveProgress(user.id, quote.id, {
                ...data.progress,
                extras: markExtrasConverted(data.progress.extras, created.id),
            });
            toast.success(`${label} créé : renseignez les prix puis envoyez-le.`);
            navigate(`/app/devis/${created.id}`);
        } catch (error) {
            console.error('Error creating amendment from extras:', error);
            toast.error("Impossible de créer l'avenant");
        } finally {
            setCreatingAmendment(false);
        }
    };

    if (!data) {
        return (
            <Card className="p-4 mb-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Chargement du chantier…
            </Card>
        );
    }

    const { photos, material, hours, reports, events } = data;
    const nextEvent = events.upcoming[0] || null;
    const lastEvent = events.past[0] || null;

    return (
        <div className="space-y-4 mb-4">
            {/* Travaux notés hors devis sur le chantier → avenant */}
            {extras.length > 0 && (
                <Card className="p-4 border-amber-200 dark:border-amber-900/50">
                    <SectionTitle icon={AlertTriangle} title={`Hors devis (${extras.length})`} />
                    <ul className="text-sm text-gray-700 dark:text-gray-200 list-disc pl-5 space-y-0.5">
                        {extras.map(e => <li key={e.id}>{e.description}</li>)}
                    </ul>
                    <button
                        type="button"
                        onClick={createAmendmentFromExtras}
                        disabled={creatingAmendment}
                        className="tap-target mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold disabled:opacity-50"
                    >
                        {creatingAmendment
                            ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                            : <FilePlus className="w-4 h-4" aria-hidden="true" />}
                        Créer l'avenant
                    </button>
                </Card>
            )}

            {/* Photos du chantier */}
            <Card className="p-4">
                <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="flex items-center gap-2 font-semibold text-gray-900 dark:text-white">
                        <Camera className="w-4 h-4 text-gray-400" aria-hidden="true" /> Photos {photos.length > 0 && `(${photos.length})`}
                    </p>
                    <button
                        type="button"
                        onClick={startPhoto}
                        className="tap-target inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-semibold"
                    >
                        <Camera className="w-4 h-4" aria-hidden="true" /> Photo
                    </button>
                </div>
                {photos.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Aucune photo dans le dossier de ce chantier.
                        {clientId != null && <> Les autres photos du client sont dans <Link to={`/app/clients/${clientId}`} className="text-ios hover:underline">sa fiche</Link>.</>}
                    </p>
                ) : (
                    <div className="grid grid-cols-4 gap-2">
                        {photos.slice(0, PHOTO_PREVIEW).map((p, i) => (
                            <button
                                key={p.id}
                                type="button"
                                onClick={() => setLightboxIndex(i)}
                                className="aspect-square rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800"
                                aria-label={`Ouvrir la photo ${i + 1}`}
                            >
                                <img src={p.photo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                )}
                {photos.length > PHOTO_PREVIEW && (
                    <button type="button" onClick={() => setLightboxIndex(PHOTO_PREVIEW)} className="mt-2 text-sm text-ios hover:underline">
                        Voir les {photos.length} photos
                    </button>
                )}
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Rendez-vous */}
                <Card className="p-4">
                    <SectionTitle icon={Calendar} title="Rendez-vous" to="/app/agenda" linkLabel="Agenda" />
                    {nextEvent ? (
                        <div className="flex items-center gap-2">
                            <div className="flex-1 min-w-0 text-sm">
                                <p className="font-medium text-gray-900 dark:text-white">
                                    {formatDate(nextEvent.date, { weekday: 'short', day: 'numeric', month: 'short' })}{nextEvent.time ? ` à ${nextEvent.time.slice(0, 5)}` : ''}
                                </p>
                                <p className="text-gray-500 dark:text-gray-400 truncate">{nextEvent.title}</p>
                            </div>
                            {nextEvent.address && (
                                <a
                                    href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(nextEvent.address)}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    aria-label="Itinéraire"
                                    className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center shrink-0"
                                >
                                    <Navigation className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                                </a>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Aucun rendez-vous à venir.</p>
                    )}
                    {lastEvent && (
                        <p className="text-xs text-gray-400 mt-2">Dernier passage : {formatDate(lastEvent.date)}</p>
                    )}
                </Card>

                {/* Avancement terrain */}
                <Card className="p-4">
                    <SectionTitle icon={ClipboardCheck} title="Avancement" to="/terrain?mode=chantier" linkLabel="Suivi terrain" />
                    {stats ? (
                        <>
                            <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                                <div className="h-full bg-emerald-500" style={{ width: `${Math.round(stats.ratio * 100)}%` }} />
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
                                {stats.doneUnits} / {stats.totalUnits} lignes faites ({Math.round(stats.ratio * 100)} %)
                            </p>
                        </>
                    ) : (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Rien de coché pour l'instant.</p>
                    )}
                </Card>

                {/* Matériel */}
                <Card className="p-4">
                    <SectionTitle icon={ShoppingCart} title="Matériel" to="/app/procurement" linkLabel="Gérer" />
                    {material.total === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Aucun matériel noté pour ce chantier.</p>
                    ) : (
                        <div className="text-sm text-gray-600 dark:text-gray-300 space-y-0.5">
                            <p>{material.pending} à commander · {material.ordered} commandé{material.ordered > 1 ? 's' : ''} · {material.received} reçu{material.received > 1 ? 's' : ''}</p>
                            {material.cost > 0 && <p className="text-xs text-gray-400">Achats chiffrés : {formatAmount(material.cost)} HT</p>}
                        </div>
                    )}
                </Card>

                {/* Heures */}
                <Card className="p-4">
                    <SectionTitle icon={Timer} title="Heures" to="/app/heures" linkLabel="Pointage" />
                    {hours.count === 0 ? (
                        <p className="text-sm text-gray-500 dark:text-gray-400">Aucune heure pointée.</p>
                    ) : (
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {hours.total.toLocaleString('fr-FR')} h sur {hours.count} pointage{hours.count > 1 ? 's' : ''}
                            {hours.lastDate ? ` · dernier le ${formatDate(hours.lastDate)}` : ''}
                        </p>
                    )}
                </Card>
            </div>

            {/* Rapports d'intervention et visites liés */}
            {reports.length > 0 && (
                <Card className="p-4">
                    <SectionTitle icon={ClipboardList} title="Rapports" />
                    <ul className="space-y-1">
                        {reports.map(r => (
                            <li key={r.id}>
                                <Link
                                    to={`/app/interventions/${r.id}`}
                                    className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-gray-50 dark:hover:bg-white/5"
                                >
                                    <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">
                                        {r.report_type === 'site_visit' ? 'Visite' : 'Rapport'}{r.report_number ? ` ${r.report_number}` : ''} · {r.title || 'Sans titre'}
                                    </span>
                                    <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                                        {r.date ? formatDate(r.date) : ''}{r.status ? ` · ${REPORT_LABELS[r.status] || r.status}` : ''}
                                    </span>
                                    <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" aria-hidden="true" />
                                </Link>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <PhotoLightbox
                photos={photos.map(p => ({ src: p.photo_url, name: p.description || '', caption: p.description || '' }))}
                index={lightboxIndex}
                onIndexChange={setLightboxIndex}
            />

            {capturing && (
                <QuickPhotoCapture
                    clientId={clientId}
                    clientName={clientName}
                    contextLabel={quote.title || ''}
                    projectId={photoFolderId}
                    onClose={() => setCapturing(false)}
                    onUploaded={() => load()}
                />
            )}
        </div>
    );
};

export default AffaireTerrain;
