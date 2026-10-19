import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCcw, RotateCcwSquare, RotateCwSquare, Copy, Share2, Download, Trash2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { useModalA11y } from '../hooks/useModalA11y';
import { normalizeQuarterTurn, rotationPreviewStyle } from '../utils/imageRotation';
import { fetchStoredPhoto } from '../utils/storagePhoto';

/**
 * Visionneuse plein écran pour les photos de chantier.
 *
 * Une vignette de 56 px ne permet ni de vérifier qu'une photo est nette, ni
 * de la réutiliser. Ici : pincer pour zoomer, passer à la suivante, copier
 * l'image dans le presse-papier (pour la coller dans un devis, un mail, un
 * message), la partager, la télécharger, la supprimer. Tout est au doigt :
 * aucune action n'attend un survol de souris.
 *
 * @param {object} props
 * @param {{ src: string, name?: string, caption?: string, blob?: Blob }[]} props.photos
 *   `blob` : fichier local de la photo, s'il est encore là (évite de le relire)
 * @param {number|null} props.index - photo ouverte ; null = fermée
 * @param {(index: number|null) => void} props.onIndexChange
 * @param {(photo: object, index: number) => (void|Promise<void>)} [props.onDelete] - absent = pas de suppression
 * @param {(photo: object, index: number, rotation: number) => (boolean|Promise<boolean>)} [props.onRotate]
 *   enregistre la photo tournée de `rotation` degrés (sens horaire) ; absent = pas de rotation
 */
const PhotoLightbox = ({ photos = [], index, onIndexChange, onDelete, onRotate }) => {
    const open = index !== null && index !== undefined && Boolean(photos[index]);
    const close = () => onIndexChange?.(null);
    const containerRef = useModalA11y(open, close);
    const [busy, setBusy] = useState(null); // 'copy' | 'share' | 'download' | 'delete' | 'rotate'
    const [copied, setCopied] = useState(false);
    // Rotation en attente : l'aperçu tourne tout de suite, le fichier n'est
    // remplacé qu'à « Enregistrer ». Repart de zéro à chaque photo.
    const [turn, setTurn] = useState(0);

    const photo = open ? photos[index] : null;
    const photoSrc = photo?.src;
    useEffect(() => { setTurn(0); }, [photoSrc]);
    const hasPrev = open && index > 0;
    const hasNext = open && index < photos.length - 1;

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'ArrowLeft' && hasPrev) onIndexChange(index - 1);
            if (e.key === 'ArrowRight' && hasNext) onIndexChange(index + 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, index, hasPrev, hasNext, onIndexChange]);

    if (!open) return null;

    const fileName = photo.name || `photo-${index + 1}.jpg`;

    // L'image peut être un fichier local (photo pas encore envoyée) ou une URL
    // publique. Le fichier, quand l'appelant le fournit, évite tout aller-retour ;
    // une photo du stockage passe par fetchStoredPhoto (voir pourquoi là-bas).
    const fetchBlob = async () => {
        if (photo.blob) return photo.blob;
        return fetchStoredPhoto(photo.src);
    };

    // Le presse-papier n'accepte que du PNG sur la plupart des navigateurs :
    // on ré-encode l'image à la volée.
    const toPngBlob = (blob) => new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(blob);
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            canvas.getContext('2d').drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('Conversion impossible'))), 'image/png');
        };
        img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image illisible')); };
        img.src = url;
    });

    const handleCopy = async () => {
        setBusy('copy');
        try {
            if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('unsupported');
            // Le ClipboardItem reçoit une promesse et l'écriture part tout de
            // suite, dans le geste de l'utilisateur : iPhone (Safari) refuse
            // une écriture lancée après un téléchargement ou une conversion.
            const png = fetchBlob().then(toPngBlob);
            await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
            toast.success('Photo copiée — collez-la où vous voulez.');
        } catch {
            // Repli : le lien de l'image, toujours utilisable dans un message
            // — sauf pour une photo locale, dont le lien ne mène nulle part.
            const shareable = /^https?:/.test(photo.src);
            try {
                if (!shareable) throw new Error('local');
                await navigator.clipboard.writeText(photo.src);
                toast.success("Image non copiable sur cet appareil — lien de la photo copié à la place.");
            } catch {
                toast.error('Copie impossible sur cet appareil — utilisez Partager.');
            }
        } finally {
            setBusy(null);
        }
    };

    const handleShare = async () => {
        setBusy('share');
        try {
            const blob = await fetchBlob();
            const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
            if (navigator.canShare?.({ files: [file] })) {
                await navigator.share({ files: [file], title: fileName });
            } else if (navigator.share) {
                await navigator.share({ title: fileName, url: photo.src });
            } else {
                throw new Error('unsupported');
            }
        } catch (err) {
            if (err?.name !== 'AbortError') toast.error('Partage indisponible sur cet appareil.');
        } finally {
            setBusy(null);
        }
    };

    const handleDownload = async () => {
        setBusy('download');
        try {
            const blob = await fetchBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            toast.error('Téléchargement impossible.');
        } finally {
            setBusy(null);
        }
    };

    const handleDelete = async () => {
        if (!onDelete) return;
        setBusy('delete');
        try {
            const deleted = await onDelete(photo, index);
            if (deleted === false) return;
            // Après suppression, rester sur la photo qui prend la place, ou fermer.
            if (photos.length <= 1) onIndexChange(null);
            else onIndexChange(Math.min(index, photos.length - 2));
        } finally {
            setBusy(null);
        }
    };

    const turnBy = (deg) => setTurn((t) => normalizeQuarterTurn(t + deg));

    const handleSaveRotation = async () => {
        if (!onRotate || !turn) return;
        setBusy('rotate');
        try {
            const saved = await onRotate(photo, index, turn);
            if (saved !== false) setTurn(0);
        } finally {
            setBusy(null);
        }
    };

    const actionClass = 'flex flex-col items-center gap-1 px-3 py-2 text-white/85 hover:text-white disabled:opacity-40 text-[11px] font-semibold';

    return createPortal(
        <div
            ref={containerRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Photo ${index + 1} sur ${photos.length}`}
            className="fixed inset-0 z-[80] bg-black flex flex-col select-none"
        >
            {/* Bandeau */}
            <div className="shrink-0 flex items-center gap-2 px-3 py-2 text-white safe-area-top">
                <span className="text-sm font-semibold tabular-nums">{index + 1} / {photos.length}</span>
                {photo.caption && <span className="text-xs text-white/70 truncate">{photo.caption}</span>}
                <div className="flex-1" />
                <button type="button" onClick={close} className="p-2.5 rounded-full bg-white/15" aria-label="Fermer">
                    <X className="w-5 h-5" />
                </button>
            </div>

            {/* Image zoomable */}
            <div className="flex-1 relative overflow-hidden">
                <TransformWrapper key={photo.src} initialScale={1} minScale={1} maxScale={6} centerOnInit doubleClick={{ mode: 'toggle', step: 2 }}>
                    {({ zoomIn, zoomOut, resetTransform }) => (
                        <>
                            <TransformComponent
                                wrapperClass="!w-full !h-full"
                                contentClass="!w-full !h-full flex items-center justify-center"
                            >
                                <img
                                    src={photo.src}
                                    alt={photo.name || `Photo ${index + 1}`}
                                    className="max-w-full max-h-full object-contain"
                                    style={rotationPreviewStyle(turn)}
                                    draggable="false"
                                />
                            </TransformComponent>
                            <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 rounded-full px-2 py-1 backdrop-blur-sm">
                                <button type="button" onClick={() => zoomOut()} className="p-2 text-white/80" aria-label="Dézoomer"><ZoomOut className="w-5 h-5" /></button>
                                <button type="button" onClick={() => resetTransform()} className="p-2 text-white/80" aria-label="Taille d'origine"><RotateCcw className="w-4 h-4" /></button>
                                <button type="button" onClick={() => zoomIn()} className="p-2 text-white/80" aria-label="Zoomer"><ZoomIn className="w-5 h-5" /></button>
                                {onRotate && (
                                    <>
                                        <span className="w-px h-5 bg-white/20 mx-1" aria-hidden="true" />
                                        <button type="button" onClick={() => turnBy(-90)} disabled={Boolean(busy)} className="p-2 text-white/80 disabled:opacity-40" aria-label="Pivoter vers la gauche"><RotateCcwSquare className="w-5 h-5" /></button>
                                        <button type="button" onClick={() => turnBy(90)} disabled={Boolean(busy)} className="p-2 text-white/80 disabled:opacity-40" aria-label="Pivoter vers la droite"><RotateCwSquare className="w-5 h-5" /></button>
                                    </>
                                )}
                            </div>
                            {turn !== 0 && (
                                <div className="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => setTurn(0)}
                                        disabled={busy === 'rotate'}
                                        className="px-3 py-2 rounded-full bg-white/15 text-white text-sm font-semibold disabled:opacity-40"
                                    >
                                        Annuler
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleSaveRotation}
                                        disabled={Boolean(busy)}
                                        className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-gray-900 text-sm font-semibold disabled:opacity-60"
                                    >
                                        {busy === 'rotate' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                                        Enregistrer la rotation
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </TransformWrapper>

                {hasPrev && (
                    <button
                        type="button"
                        onClick={() => onIndexChange(index - 1)}
                        className="absolute left-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white"
                        aria-label="Photo précédente"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>
                )}
                {hasNext && (
                    <button
                        type="button"
                        onClick={() => onIndexChange(index + 1)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 p-3 rounded-full bg-black/40 text-white"
                        aria-label="Photo suivante"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                )}
            </div>

            {/* Actions */}
            <div className="shrink-0 flex items-center justify-around px-2 py-2 border-t border-white/10 safe-area-bottom">
                <button type="button" onClick={handleCopy} disabled={Boolean(busy)} className={actionClass}>
                    {busy === 'copy' ? <Loader2 className="w-5 h-5 animate-spin" /> : copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                    Copier
                </button>
                <button type="button" onClick={handleShare} disabled={Boolean(busy)} className={actionClass}>
                    {busy === 'share' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Share2 className="w-5 h-5" />}
                    Partager
                </button>
                <button type="button" onClick={handleDownload} disabled={Boolean(busy)} className={actionClass}>
                    {busy === 'download' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
                    Enregistrer
                </button>
                {onDelete && (
                    <button type="button" onClick={handleDelete} disabled={Boolean(busy)} className={`${actionClass} !text-red-300 hover:!text-red-200`}>
                        {busy === 'delete' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                        Supprimer
                    </button>
                )}
            </div>
        </div>,
        document.body
    );
};

export default PhotoLightbox;
