import { Plus, Camera, X, Images } from 'lucide-react';

export const PhotosSection = ({
    formData, uploadingPhotos, openCamera,
    handlePhotoUpload, removePhoto, setPhotoViewer,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-500" />
                Photos de l'intervention
            </h2>
            {uploadingPhotos ? (
                <span className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg font-medium bg-gray-100 dark:bg-gray-700 text-gray-400">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> Upload...
                </span>
            ) : (
                // Appareil photo et galerie séparés : un seul input ne
                // permet pas les deux de façon fiable sur mobile.
                <div className="flex items-center gap-2">
                    <button type="button" onClick={openCamera} className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                        <Camera className="w-4 h-4" /> Photos
                    </button>
                    <label className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg cursor-pointer transition-colors font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40">
                        <Images className="w-4 h-4" /> Galerie
                        <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                    </label>
                </div>
            )}
        </div>

        {(formData.photos || []).length === 0 ? (
            <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={openCamera} className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <Camera className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                    <span className="text-sm text-gray-400 dark:text-gray-500">Prendre des photos</span>
                </button>
                <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
                    <Images className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-2" />
                    <span className="text-sm text-gray-400 dark:text-gray-500">Choisir dans la galerie</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                </label>
            </div>
        ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {(formData.photos || []).map((photo, idx) => (
                    <div key={photo.url} className="relative group rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 flex items-center justify-center" style={{ minHeight: '100px', aspectRatio: '4/3' }}>
                        {/* Un tap ouvre la photo en grand : zoom, copie, partage, suppression. */}
                        <button
                            type="button"
                            onClick={() => setPhotoViewer(idx)}
                            className="w-full h-full"
                            aria-label={`Agrandir la photo ${idx + 1}`}
                        >
                            <img
                                src={photo.url}
                                alt={photo.name || `Photo ${idx + 1}`}
                                className="w-full h-full object-contain"
                            />
                        </button>
                        <button
                            type="button"
                            onClick={() => removePhoto(photo)}
                            className="absolute top-1 right-1 p-2.5 bg-black/60 hover:bg-red-500 text-white rounded-full transition-colors shadow-md"
                            title="Supprimer"
                            aria-label="Supprimer la photo"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <label className="flex flex-col items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100" style={{ aspectRatio: '4/3' }}>
                    <Plus className="w-6 h-6 text-gray-400 dark:text-gray-500" />
                    <span className="text-xs text-gray-400 dark:text-gray-500 mt-1">Ajouter</span>
                    <input type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
                </label>
            </div>
        )}
    </div>
);
