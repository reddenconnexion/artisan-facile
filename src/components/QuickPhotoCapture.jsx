import React, { useState, useRef, useEffect } from 'react';
import { Camera, X, Loader2, Check, User } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { validateFiles, UPLOAD_PRESETS } from '../utils/uploadValidation';
import { compressImageFile } from '../utils/mediaConverters';
import { assertWithinQuota } from '../utils/storageQuota';

/**
 * Capture photo rapide « mode terrain ».
 *
 * Pensé pour une intervention déjà planifiée : le client est connu d'avance
 * (RDV de l'agenda, intervention du jour…) donc on n'a JAMAIS à le rechercher.
 * Les photos atterrissent directement dans la galerie du client
 * (table `project_photos`, bucket `project-photos`) et sont donc immédiatement
 * réutilisables dans le portfolio, les rapports et les montages avant/après.
 *
 * Props :
 *  - clientId      : id du client (obligatoire)
 *  - clientName    : nom affiché (facultatif)
 *  - contextLabel  : libellé de contexte enregistré en description (ex. titre du RDV)
 *  - onClose       : fermeture du modal
 *  - onUploaded    : callback(count) après upload réussi (facultatif)
 */
const CATEGORIES = [
    { id: 'before', label: 'Avant' },
    { id: 'during', label: 'Pendant' },
    { id: 'after', label: 'Après' },
];

const QuickPhotoCapture = ({ clientId, clientName, contextLabel = '', onClose, onUploaded }) => {
    const { user } = useAuth();
    const fileInputRef = useRef(null);
    const [category, setCategory] = useState('during');
    const [uploading, setUploading] = useState(false);
    const [photos, setPhotos] = useState([]); // { id, url }
    const [savedCount, setSavedCount] = useState(0);

    // Ouvre directement l'appareil photo au montage : 0 clic superflu sur le chantier.
    useEffect(() => {
        const t = setTimeout(() => fileInputRef.current?.click(), 150);
        return () => clearTimeout(t);
    }, []);

    const handleFiles = async (e) => {
        const files = Array.from(e.target.files || []);
        e.target.value = '';
        if (!files.length) return;
        if (!clientId) {
            toast.error('Aucun client associé à cette intervention');
            return;
        }

        // Validation stricte (magic bytes, taille, type MIME réel).
        const { valid, errors } = await validateFiles(files, UPLOAD_PRESETS.image);
        if (errors.length > 0) {
            toast.error(`${errors.length} fichier(s) refusé(s)`, {
                description: errors.slice(0, 3).join(' · '),
                duration: 6000,
            });
        }
        if (valid.length === 0) return;

        setUploading(true);
        try {
            // Compression (max 1600 px, JPEG q0.8) avant le contrôle de quota.
            const compressed = await Promise.all(
                valid.map(f => compressImageFile(f, { maxDim: 1600, quality: 0.8 })),
            );
            const addBytes = compressed.reduce((sum, f) => sum + (f.size || 0), 0);
            try {
                await assertWithinQuota(addBytes);
            } catch (quotaErr) {
                toast.error(quotaErr.message, { duration: 7000 });
                return;
            }

            const description = contextLabel?.trim() || '';
            const inserted = [];
            for (const blob of compressed) {
                const path = `${user.id}/${clientId}/${crypto.randomUUID()}.jpg`;
                const { error: uploadError } = await supabase.storage
                    .from('project-photos')
                    .upload(path, blob, { contentType: 'image/jpeg' });
                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = supabase.storage
                    .from('project-photos')
                    .getPublicUrl(path);

                const { data: row, error: dbError } = await supabase
                    .from('project_photos')
                    .insert([{
                        user_id: user.id,
                        client_id: clientId,
                        photo_url: publicUrl,
                        category,
                        description,
                    }])
                    .select('id, photo_url')
                    .single();
                if (dbError) throw dbError;
                inserted.push({ id: row.id, url: row.photo_url });
            }

            setPhotos(prev => [...inserted, ...prev]);
            setSavedCount(c => c + inserted.length);
            toast.success(
                `${inserted.length} photo${inserted.length > 1 ? 's' : ''} ajoutée${inserted.length > 1 ? 's' : ''}${clientName ? ` à ${clientName}` : ''}`,
            );
            onUploaded?.(inserted.length);
        } catch (err) {
            console.error('QuickPhotoCapture upload error:', err);
            toast.error('Erreur lors de l\'ajout des photos');
        } finally {
            setUploading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
            <div className="w-full sm:max-w-md bg-white dark:bg-gray-900 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                {/* En-tête */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white leading-tight">Photos d'intervention</p>
                        {clientName && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5 truncate">
                                <User className="w-3 h-3 shrink-0" /> {clientName}
                            </p>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 -mr-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-xl"
                        aria-label="Fermer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-5 space-y-4 overflow-y-auto">
                    {/* Catégorie */}
                    <div>
                        <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                            Étape
                        </label>
                        <div className="grid grid-cols-3 gap-2">
                            {CATEGORIES.map(c => (
                                <button
                                    key={c.id}
                                    onClick={() => setCategory(c.id)}
                                    className={`py-2.5 rounded-xl text-sm font-semibold border transition-colors ${
                                        category === c.id
                                            ? 'bg-blue-600 border-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:border-blue-300'
                                    }`}
                                >
                                    {c.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        multiple
                        className="hidden"
                        onChange={handleFiles}
                    />

                    {/* Bouton appareil photo */}
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading}
                        className="w-full flex flex-col items-center justify-center gap-2 py-8 bg-white dark:bg-gray-800 border-2 border-dashed border-blue-300 rounded-3xl text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-700 active:bg-blue-100 transition-colors disabled:opacity-60"
                    >
                        {uploading ? (
                            <Loader2 className="w-10 h-10 animate-spin" />
                        ) : (
                            <Camera className="w-10 h-10" />
                        )}
                        <span className="text-base font-bold">
                            {uploading ? 'Envoi en cours…' : 'Prendre une photo'}
                        </span>
                        <span className="text-xs text-blue-400">ou choisir depuis la galerie</span>
                    </button>

                    {/* Aperçu des photos ajoutées */}
                    {photos.length > 0 && (
                        <div className="grid grid-cols-3 gap-2">
                            {photos.map(p => (
                                <div key={p.id} className="relative aspect-square bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden">
                                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                                    <div className="absolute top-1 right-1 bg-green-600 text-white rounded-full p-0.5">
                                        <Check className="w-3 h-3" />
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Pied : terminer */}
                <div className="px-5 py-4 border-t border-gray-100 dark:border-gray-800">
                    <button
                        onClick={onClose}
                        className="w-full py-3 rounded-2xl font-semibold text-sm bg-gray-900 dark:bg-white text-white dark:text-gray-900 hover:opacity-90 active:opacity-80 transition-opacity"
                    >
                        {savedCount > 0 ? `Terminé · ${savedCount} photo${savedCount > 1 ? 's' : ''} enregistrée${savedCount > 1 ? 's' : ''}` : 'Fermer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default QuickPhotoCapture;
