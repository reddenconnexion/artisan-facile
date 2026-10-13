import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { drawBeforeAfter } from '../utils/beforeAfterMontage';
import { X, ArrowLeft, Check, Loader2, ZoomIn, ZoomOut, Download, Repeat, Image as ImageIcon } from 'lucide-react';

// Ratio d'une case photo du montage (cf. drawBeforeAfter : 570 × 680).
const CROP_ASPECT = 570 / 680;
const MONTAGE_DESCRIPTION = 'Montage Avant / Après';
const CATEGORY_LABELS = { before: 'Avant', during: 'Pendant', after: 'Après' };

// Catégories proposées par défaut à chaque étape.
const STEP_CATEGORIES = {
    before: ['before'],
    after: ['after', 'during'],
};

const PhotoSlot = ({ label, photo, active, onClick, accent }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex-1 flex items-center gap-2 p-1.5 rounded-xl border-2 transition-colors text-left min-w-0 ${active
            ? `${accent} bg-white dark:bg-gray-900`
            : 'border-gray-200 dark:border-gray-700 bg-white/60 dark:bg-gray-900/60'}`}
    >
        <div className="w-12 h-12 rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 flex-shrink-0 flex items-center justify-center">
            {photo
                ? <img src={photo.photo_url} alt="" className="w-full h-full object-cover" />
                : <ImageIcon className="w-5 h-5 text-gray-400" />}
        </div>
        <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wide text-gray-900 dark:text-white">{label}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{photo ? 'Toucher pour changer' : 'À choisir'}</div>
        </div>
    </button>
);

/**
 * Générateur de montage Avant / Après en 3 étapes :
 * 1. toucher la photo AVANT (grandes vignettes, tout l'écran) ;
 * 2. toucher la photo APRÈS ;
 * 3. aperçu en direct + recadrage facultatif, puis génération.
 * Chaque toucher fait avancer tout seul : pas de défilement à viser.
 */
const BeforeAfterBuilder = ({
    photos,
    projects,
    initialProjectId = 'all',
    initialBefore = null,
    initialAfter = null,
    loadImage,
    onGenerate,
    onClose,
}) => {
    const [before, setBefore] = useState(initialBefore);
    const [after, setAfter] = useState(initialAfter);
    const [step, setStep] = useState(initialBefore && initialAfter ? 'adjust' : initialBefore ? 'after' : 'before');
    const [projectFilter, setProjectFilter] = useState(initialProjectId);
    const [showAllCategories, setShowAllCategories] = useState(false);

    const [cropTarget, setCropTarget] = useState('before');
    const [crops, setCrops] = useState({ before: { x: 0, y: 0 }, after: { x: 0, y: 0 } });
    const [zooms, setZooms] = useState({ before: 1, after: 1 });
    const [areas, setAreas] = useState({ before: null, after: null });

    const [previewUrl, setPreviewUrl] = useState(null);
    const [previewError, setPreviewError] = useState(false);
    const [generating, setGenerating] = useState(false);

    const canvasRef = useRef(null);
    // Photos déjà chargées (url → { img, objectUrl }) : le recadrage ne
    // retélécharge pas les images à chaque mouvement.
    const imageCache = useRef(new Map());

    useEffect(() => {
        const cache = imageCache.current;
        return () => {
            cache.forEach(entry => {
                Promise.resolve(entry)
                    .then(e => { if (e.objectUrl) URL.revokeObjectURL(e.objectUrl); })
                    .catch(() => {});
            });
            cache.clear();
        };
    }, []);

    // Échap pour fermer, et on bloque le défilement de la page derrière.
    useEffect(() => {
        const onKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', onKey);
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', onKey);
            document.body.style.overflow = prevOverflow;
        };
    }, [onClose]);

    // Le parent recrée loadImage à chaque rendu : on passe par une ref pour
    // ne pas relancer l'aperçu à chaque rafraîchissement de la galerie.
    const loadImageRef = useRef(loadImage);
    loadImageRef.current = loadImage;

    const getImage = useCallback(async (url) => {
        const cache = imageCache.current;
        if (!cache.has(url)) {
            const pending = loadImageRef.current(url).catch(err => { cache.delete(url); throw err; });
            cache.set(url, pending);
        }
        const entry = await cache.get(url);
        cache.set(url, entry);
        return entry.img;
    }, []);

    // Les montages déjà générés ne sont pas proposés comme photo source.
    const sourcePhotos = useMemo(
        () => photos.filter(p => p.description !== MONTAGE_DESCRIPTION),
        [photos]
    );

    const inProject = useCallback((p) => (
        projectFilter === 'all'
            ? true
            : projectFilter === 'uncategorized'
                ? p.project_id === null
                : String(p.project_id) === String(projectFilter)
    ), [projectFilter]);

    const pickStep = step === 'after' ? 'after' : 'before';
    const projectPhotos = useMemo(() => sourcePhotos.filter(inProject), [sourcePhotos, inProject]);
    const categoryPhotos = useMemo(
        () => projectPhotos.filter(p => STEP_CATEGORIES[pickStep].includes(p.category)),
        [projectPhotos, pickStep]
    );
    // Rien dans la bonne catégorie : on montre tout plutôt qu'un écran vide.
    const effectiveShowAll = showAllCategories || categoryPhotos.length === 0;
    const gridPhotos = effectiveShowAll ? projectPhotos : categoryPhotos;

    const resetCrop = (target) => {
        setCrops(c => ({ ...c, [target]: { x: 0, y: 0 } }));
        setZooms(z => ({ ...z, [target]: 1 }));
        setAreas(a => ({ ...a, [target]: null }));
    };

    const handlePick = (photo) => {
        if (pickStep === 'before') {
            if (before?.id !== photo.id) resetCrop('before');
            setBefore(photo);
            setShowAllCategories(false);
            setStep(after ? 'adjust' : 'after');
        } else {
            if (after?.id !== photo.id) resetCrop('after');
            setAfter(photo);
            setShowAllCategories(false);
            setStep(before ? 'adjust' : 'before');
        }
    };

    const goToPick = (target) => {
        setShowAllCategories(false);
        setStep(target);
    };

    const handleBack = () => {
        if (step === 'adjust') goToPick('after');
        else if (step === 'after') goToPick('before');
        else onClose();
    };

    const handleSwap = () => {
        setBefore(after);
        setAfter(before);
        setCrops(c => ({ before: c.after, after: c.before }));
        setZooms(z => ({ before: z.after, after: z.before }));
        setAreas(a => ({ before: a.after, after: a.before }));
    };

    // Aperçu en direct (mi-résolution), recalculé peu après chaque recadrage.
    useEffect(() => {
        if (step !== 'adjust' || !before || !after) return undefined;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const [imgBefore, imgAfter] = await Promise.all([getImage(before.photo_url), getImage(after.photo_url)]);
                if (cancelled || !canvasRef.current) return;
                drawBeforeAfter(canvasRef.current, imgBefore, imgAfter, areas.before, areas.after, 0.5);
                setPreviewUrl(canvasRef.current.toDataURL('image/jpeg', 0.8));
                setPreviewError(false);
            } catch (error) {
                console.error('Error generating preview:', error);
                if (!cancelled) setPreviewError(true);
            }
        }, 250);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [step, before, after, areas, getImage]);

    const handleGenerate = async () => {
        if (!before || !after || !canvasRef.current || generating) return;
        setGenerating(true);
        try {
            const [imgBefore, imgAfter] = await Promise.all([getImage(before.photo_url), getImage(after.photo_url)]);
            drawBeforeAfter(canvasRef.current, imgBefore, imgAfter, areas.before, areas.after);
            await onGenerate(canvasRef.current, { before, after });
        } finally {
            setGenerating(false);
        }
    };

    const stepTitle = step === 'before'
        ? 'Touchez la photo AVANT'
        : step === 'after'
            ? 'Touchez la photo APRÈS'
            : 'Vérifiez et générez';
    const stepNumber = step === 'before' ? 1 : step === 'after' ? 2 : 3;
    const selectedId = pickStep === 'before' ? before?.id : after?.id;

    return (
        <div className="fixed inset-0 z-[90] bg-black/80 flex items-stretch sm:items-center justify-center sm:p-4">
            <div className="bg-white dark:bg-gray-800 w-full h-full sm:h-[92vh] sm:max-w-4xl sm:rounded-xl shadow-2xl flex flex-col overflow-hidden">
                {/* En-tête */}
                <div className="px-3 sm:px-5 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="p-2 -ml-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300"
                        aria-label="Retour"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-purple-600 dark:text-purple-300">Avant / Après · étape {stepNumber} sur 3</div>
                        <h3 className="text-lg font-bold text-gray-900 dark:text-white truncate">{stepTitle}</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-full text-gray-500 dark:text-gray-400"
                        aria-label="Fermer"
                    >
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Les deux cases : on voit toujours où on en est */}
                <div className="px-3 sm:px-5 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-700 flex gap-2">
                    <PhotoSlot
                        label="Avant"
                        photo={before}
                        active={step === 'before'}
                        accent="border-gray-700 dark:border-gray-300"
                        onClick={() => goToPick('before')}
                    />
                    <PhotoSlot
                        label="Après"
                        photo={after}
                        active={step === 'after'}
                        accent="border-purple-600"
                        onClick={() => goToPick('after')}
                    />
                </div>

                {step !== 'adjust' ? (
                    <>
                        {/* Filtres */}
                        <div className="px-3 sm:px-5 py-2 flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-700">
                            <select
                                value={projectFilter}
                                onChange={(e) => setProjectFilter(e.target.value)}
                                className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-white"
                            >
                                <option value="all">Tous les chantiers</option>
                                <option value="uncategorized">Non classé</option>
                                {projects.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <div className="flex rounded-lg border border-gray-300 dark:border-gray-700 overflow-hidden text-sm">
                                <button
                                    type="button"
                                    onClick={() => setShowAllCategories(false)}
                                    disabled={categoryPhotos.length === 0}
                                    className={`px-3 py-2 font-medium disabled:opacity-40 ${!effectiveShowAll ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'}`}
                                >
                                    {pickStep === 'before' ? 'Avant' : 'Après'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAllCategories(true)}
                                    className={`px-3 py-2 font-medium ${effectiveShowAll ? 'bg-purple-600 text-white' : 'bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-300'}`}
                                >
                                    Toutes
                                </button>
                            </div>
                        </div>

                        {/* Grille de grandes vignettes : un toucher = choisi */}
                        <div className="flex-1 overflow-y-auto p-2 sm:p-4 overscroll-contain">
                            {gridPhotos.length === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 dark:text-gray-400 px-6 gap-2">
                                    <ImageIcon className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                                    <p className="font-medium">Aucune photo dans ce chantier.</p>
                                    {projectFilter !== 'all' && (
                                        <button
                                            type="button"
                                            onClick={() => setProjectFilter('all')}
                                            className="text-purple-600 dark:text-purple-300 font-medium underline"
                                        >
                                            Voir tous les chantiers
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                                    {gridPhotos.map(p => {
                                        const isSelected = selectedId === p.id;
                                        const usedElsewhere = (pickStep === 'before' ? after?.id : before?.id) === p.id;
                                        return (
                                            <button
                                                type="button"
                                                key={p.id}
                                                onClick={() => handlePick(p)}
                                                className={`relative aspect-square rounded-xl overflow-hidden bg-gray-100 dark:bg-gray-900 active:scale-95 transition-transform ${isSelected ? 'ring-4 ring-purple-600' : ''}`}
                                            >
                                                <img src={p.photo_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                                                {isSelected && (
                                                    <span className="absolute top-2 right-2 w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center shadow">
                                                        <Check className="w-5 h-5" />
                                                    </span>
                                                )}
                                                {usedElsewhere && (
                                                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/70 text-white text-[11px] font-bold">
                                                        {pickStep === 'before' ? 'APRÈS' : 'AVANT'}
                                                    </span>
                                                )}
                                                {effectiveShowAll && CATEGORY_LABELS[p.category] && (
                                                    <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[11px] font-medium">
                                                        {CATEGORY_LABELS[p.category]}
                                                    </span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 overflow-y-auto overscroll-contain p-3 sm:p-5 space-y-4">
                        {/* Aperçu fidèle de l'image finale */}
                        <div className="bg-gray-100 dark:bg-gray-900 rounded-xl p-2 flex justify-center items-center min-h-[140px]">
                            {previewUrl ? (
                                <img src={previewUrl} alt="Aperçu Avant/Après" className="w-full max-h-[38vh] object-contain rounded shadow bg-white" />
                            ) : previewError ? (
                                <div className="text-red-500 dark:text-red-400 text-sm text-center px-4 py-6">
                                    Impossible de générer l'aperçu. Vérifiez votre connexion puis rechoisissez une photo.
                                </div>
                            ) : (
                                <div className="flex items-center text-gray-400 gap-2 py-6">
                                    <Loader2 className="w-5 h-5 animate-spin" /> Préparation de l'aperçu…
                                </div>
                            )}
                        </div>

                        {/* Recadrage facultatif */}
                        <div>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex-1">Cadrer (facultatif)</span>
                                <button
                                    type="button"
                                    onClick={handleSwap}
                                    className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                                >
                                    <Repeat className="w-4 h-4" /> Inverser
                                </button>
                            </div>
                            <div className="flex rounded-lg bg-gray-100 dark:bg-gray-900 p-1 mb-2">
                                {['before', 'after'].map(t => (
                                    <button
                                        type="button"
                                        key={t}
                                        onClick={() => setCropTarget(t)}
                                        className={`flex-1 py-2 rounded-md text-sm font-semibold transition-colors ${cropTarget === t
                                            ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-200 shadow-sm'
                                            : 'text-gray-500 dark:text-gray-400'}`}
                                    >
                                        {t === 'before' ? 'Photo Avant' : 'Photo Après'}
                                    </button>
                                ))}
                            </div>
                            <div className="relative h-72 sm:h-80 rounded-xl overflow-hidden bg-black">
                                <Cropper
                                    key={cropTarget}
                                    image={(cropTarget === 'before' ? before : after).photo_url}
                                    crop={crops[cropTarget]}
                                    zoom={zooms[cropTarget]}
                                    aspect={CROP_ASPECT}
                                    onCropChange={(c) => setCrops(prev => ({ ...prev, [cropTarget]: c }))}
                                    onZoomChange={(z) => setZooms(prev => ({ ...prev, [cropTarget]: z }))}
                                    onCropComplete={(_, px) => setAreas(prev => ({ ...prev, [cropTarget]: px }))}
                                    objectFit="contain"
                                    showGrid
                                    classes={{ cropAreaClassName: '!border-2 !border-white' }}
                                />
                            </div>
                            <div className="flex items-center gap-3 mt-2 px-2 py-2 bg-gray-50 dark:bg-gray-900/40 rounded-lg">
                                <ZoomOut className="w-5 h-5 text-gray-500" />
                                <input
                                    type="range"
                                    value={zooms[cropTarget]}
                                    min={1}
                                    max={3}
                                    step={0.05}
                                    aria-label="Zoom"
                                    onChange={(e) => setZooms(prev => ({ ...prev, [cropTarget]: Number(e.target.value) }))}
                                    className="flex-1 accent-purple-600"
                                />
                                <ZoomIn className="w-5 h-5 text-gray-500" />
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Glissez la photo pour la déplacer, pincez ou utilisez le curseur pour zoomer.</p>
                        </div>
                    </div>
                )}

                {/* Pied : action principale toujours visible */}
                <div className="px-3 sm:px-5 py-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 flex gap-2" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-3 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm font-medium"
                    >
                        Annuler
                    </button>
                    <button
                        type="button"
                        onClick={step === 'adjust' ? handleGenerate : () => setStep('adjust')}
                        disabled={!before || !after || generating}
                        className="flex-1 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold shadow-sm"
                    >
                        {step === 'adjust' ? (
                            <>
                                {generating ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                                Générer et télécharger
                            </>
                        ) : (
                            before && after ? 'Voir le résultat' : `Choisissez la photo ${!before ? 'AVANT' : 'APRÈS'}`
                        )}
                    </button>
                </div>
            </div>
            <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
    );
};

export default BeforeAfterBuilder;
