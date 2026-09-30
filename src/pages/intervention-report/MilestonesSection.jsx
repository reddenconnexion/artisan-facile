import { Trash2, MapPin, Flag } from 'lucide-react';
import { formatDateTime } from '../../utils/format';

// Jalons d'avancement — preuves datées et géolocalisées.
// Porte aussi les champs fichier cachés (repli de l'appareil photo en rafale
// et capture des jalons) : la section est toujours affichée.
export const MilestonesSection = ({
    formData, uploadingPhotos,
    triggerMilestoneCapture, handleMilestoneFile, milestoneFileRef,
    removeMilestone, updateMilestoneNotes,
    nativePhotoRef, handlePhotoUpload, camera,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
                <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <Flag className="w-5 h-5 text-blue-500" />
                    Jalons d'avancement
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Photos horodatées et géolocalisées — protection juridique en cas de litige.
                </p>
            </div>
        </div>

        {/* Boutons de capture */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
                { type: 'start',     label: 'Début',      color: 'green',   icon: '🟢' },
                { type: 'progress',  label: 'Avancement', color: 'blue',    icon: '🔵' },
                { type: 'reception', label: 'Réception',  color: 'purple',  icon: '🟣' },
                { type: 'custom',    label: 'Étape',      color: 'gray',    icon: '⚪' },
            ].map(({ type, label, icon }) => (
                <button
                    key={type}
                    type="button"
                    onClick={() => triggerMilestoneCapture(type)}
                    disabled={uploadingPhotos}
                    className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-medium rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50 text-gray-900 dark:text-gray-100"
                >
                    <span>{icon}</span>
                    <span className="text-gray-700 dark:text-gray-300">{label}</span>
                </button>
            ))}
        </div>

        {/* Repli de l'appareil photo en rafale : appareil du téléphone */}
        <input ref={nativePhotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhotoUpload} />
        {camera}

        {/* Input fichier avec capture caméra (mobile) */}
        <input
            ref={milestoneFileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={handleMilestoneFile}
        />

        {/* Liste des jalons capturés */}
        {(formData.milestones || []).length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-400 dark:text-gray-500">
                Aucun jalon enregistré pour le moment. Cliquez sur une étape ci-dessus pour prendre une photo.
            </div>
        ) : (
            <div className="space-y-2">
                {(formData.milestones || []).map((m) => {
                    const colorByType = {
                        start:     'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800/40',
                        progress:  'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40',
                        reception: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/40',
                        custom:    'bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700',
                    }[m.type] || 'bg-gray-50 border-gray-200';

                    return (
                        <div key={m.id} className={`flex items-start gap-3 p-3 rounded-lg border ${colorByType}`}>
                            <a href={m.photo_url} target="_blank" rel="noopener noreferrer" className="flex-shrink-0">
                                <img
                                    src={m.photo_url}
                                    alt={m.label}
                                    className="w-20 h-20 object-cover rounded-md border border-white/60 dark:border-gray-700"
                                />
                            </a>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold text-sm text-gray-900 dark:text-white">{m.label}</span>
                                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                        {formatDateTime(m.timestamp, { dateStyle: 'short', timeStyle: 'short' })}
                                    </span>
                                    {m.latitude !== undefined && m.longitude !== undefined && (
                                        <a
                                            href={`https://www.google.com/maps?q=${m.latitude},${m.longitude}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-0.5"
                                            title={`Précision ±${Math.round(m.accuracy || 0)}m`}
                                        >
                                            <MapPin className="w-3 h-3" />
                                            Voir sur la carte
                                        </a>
                                    )}
                                </div>
                                <input
                                    type="text"
                                    value={m.notes || ''}
                                    onChange={(e) => updateMilestoneNotes(m.id, e.target.value)}
                                    placeholder="Note (optionnel)"
                                    maxLength={200}
                                    className="mt-1.5 w-full text-xs px-2 py-1 bg-white/70 dark:bg-gray-800/70 border border-gray-200 dark:border-gray-700 rounded focus:ring-1 focus:ring-ios"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => removeMilestone(m)}
                                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg flex-shrink-0"
                                title="Supprimer ce jalon"
                                aria-label="Supprimer ce jalon"
                            >
                                <Trash2 className="w-5 h-5" />
                            </button>
                        </div>
                    );
                })}
            </div>
        )}
    </div>
);
