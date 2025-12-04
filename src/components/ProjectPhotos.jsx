import React, { useState, useEffect } from 'react';
import { Camera, Trash2, Upload, X, Loader2, Maximize2 } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';

const ProjectPhotos = ({ clientId }) => {
    const { user } = useAuth();
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [activeTab, setActiveTab] = useState('before'); // 'before', 'during', 'after'
    const [selectedPhoto, setSelectedPhoto] = useState(null);

    useEffect(() => {
        if (clientId && user) {
            fetchPhotos();
        }
    }, [clientId, user]);

    const fetchPhotos = async () => {
        try {
            const { data, error } = await supabase
                .from('project_photos')
                .select('*')
                .eq('client_id', clientId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setPhotos(data || []);
        } catch (error) {
            console.error('Error fetching photos:', error);
            toast.error('Erreur lors du chargement des photos');
        } finally {
            setLoading(false);
        }
    };

    const handleFileUpload = async (event) => {
        try {
            const file = event.target.files[0];
            if (!file) return;

            setUploading(true);

            // 1. Upload to Storage
            const fileExt = file.name.split('.').pop();
            const fileName = `${user.id}/${clientId}/${Date.now()}.${fileExt}`;
            const { error: uploadError } = await supabase.storage
                .from('project-photos')
                .upload(fileName, file);

            if (uploadError) throw uploadError;

            // 2. Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from('project-photos')
                .getPublicUrl(fileName);

            // 3. Save to Database
            const { data: photoData, error: dbError } = await supabase
                .from('project_photos')
                .insert([
                    {
                        user_id: user.id,
                        client_id: clientId,
                        photo_url: publicUrl,
                        category: activeTab,
                        description: ''
                    }
                ])
                .select()
                .single();

            if (dbError) throw dbError;

            setPhotos(prev => [photoData, ...prev]);
            toast.success('Photo ajoutée avec succès');
        } catch (error) {
            console.error('Error uploading photo:', error);
            toast.error("Erreur lors de l'envoi de la photo");
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (photoId, photoUrl) => {
        if (!window.confirm('Voulez-vous vraiment supprimer cette photo ?')) return;

        try {
            // 1. Delete from Database
            const { error: dbError } = await supabase
                .from('project_photos')
                .delete()
                .eq('id', photoId);

            if (dbError) throw dbError;

            // 2. Delete from Storage (Optional but good practice)
            // Extract path from URL
            const path = photoUrl.split('/project-photos/')[1];
            if (path) {
                await supabase.storage.from('project-photos').remove([path]);
            }

            setPhotos(prev => prev.filter(p => p.id !== photoId));
            toast.success('Photo supprimée');
        } catch (error) {
            console.error('Error deleting photo:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    const filteredPhotos = photos.filter(p => p.category === activeTab);

    const tabs = [
        { id: 'before', label: 'Avant' },
        { id: 'during', label: 'Pendant' },
        { id: 'after', label: 'Après' }
    ];

    if (loading) return <div className="text-center py-4 text-gray-500">Chargement des photos...</div>;

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mt-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                Photos du chantier
            </h3>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-6">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                            ? 'border-blue-600 text-blue-600'
                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Upload Area */}
            <div className="mb-6">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                        {uploading ? (
                            <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                        ) : (
                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        )}
                        <p className="text-sm text-gray-500">
                            {uploading ? 'Envoi en cours...' : 'Cliquez pour ajouter une photo'}
                        </p>
                    </div>
                    <input
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileUpload}
                        disabled={uploading}
                    />
                </label>
            </div>

            {/* Photo Grid */}
            {filteredPhotos.length === 0 ? (
                <p className="text-center text-gray-400 py-8 italic">Aucune photo pour cette étape.</p>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {filteredPhotos.map(photo => (
                        <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200">
                            <img
                                src={photo.photo_url}
                                alt={photo.category}
                                className="w-full h-full object-cover"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                    onClick={() => setSelectedPhoto(photo)}
                                    className="p-2 bg-white text-gray-900 rounded-full hover:bg-gray-100"
                                    title="Agrandir"
                                >
                                    <Maximize2 className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => handleDelete(photo.id, photo.photo_url)}
                                    className="p-2 bg-white text-red-600 rounded-full hover:bg-red-50"
                                    title="Supprimer"
                                >
                                    <Trash2 className="w-5 h-5" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Fullscreen Modal */}
            {selectedPhoto && (
                <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setSelectedPhoto(null)}>
                    <button
                        onClick={() => setSelectedPhoto(null)}
                        className="absolute top-4 right-4 p-2 text-white/70 hover:text-white rounded-full hover:bg-white/10"
                    >
                        <X className="w-8 h-8" />
                    </button>
                    <img
                        src={selectedPhoto.photo_url}
                        alt="Plein écran"
                        className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking image
                    />
                </div>
            )}
        </div>
    );
};

export default ProjectPhotos;
