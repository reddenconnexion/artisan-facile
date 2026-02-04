import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { Download, ExternalLink, Image as ImageIcon, MapPin, Calendar, Loader2, ArrowRight, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

/**
 * Portfolio Page
 * Displays a gallery of all "Before/After" montages created by the user.
 * Links to the corresponding client and project (if available).
 * Allows downloading the image for social media.
 */
const Portfolio = () => {
    const { user } = useAuth();
    const [montages, setMontages] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (user) {
            fetchMontages();
        }
    }, [user]);

    const fetchMontages = async () => {
        try {
            // We fetch photos that have "Montage Avant / Après" in the description
            // Join with clients table to get client names
            // Join with projects table to get project names (if project_id is present)
            const { data, error } = await supabase
                .from('project_photos')
                .select(`
                    id,
                    photo_url,
                    description,
                    created_at,
                    project_id,
                    client_id,
                    category,
                    clients (

                        id,
                        name,
                        address
                    ),
                    projects (
                        id,
                        name
                    )
                `)
                .ilike('description', '%Montage Avant / Après%')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Portfolio join error:', error);

                // Fallback Query (No Joins)
                const { data: simpleData, error: simpleError } = await supabase
                    .from('project_photos')
                    .select('*')
                    .ilike('description', '%Montage Avant / Après%')
                    .eq('user_id', user.id)
                    .order('created_at', { ascending: false });

                if (!simpleError && simpleData) {
                    setMontages(simpleData);
                    toast.error(`Affichage limité (Erreur relation: ${error.message})`);
                } else {
                    throw error;
                }
            } else {
                setMontages(data || []);
            }
        } catch (error) {
            console.error('Error fetching portfolio:', error);
            toast.error("Impossible de charger le portfolio: " + (error.message || error.details || 'Erreur inconnue'));
        } finally {
            setLoading(false);
        }
    };

    const handleDownload = async (url, filename) => {
        try {
            const response = await fetch(url);
            const blob = await response.blob();
            const blobUrl = window.URL.createObjectURL(blob);

            const link = document.createElement('a');
            link.href = blobUrl;
            link.download = filename || 'montage-avant-apres.jpg';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(blobUrl);
            toast.success("Téléchargement lancé !");
        } catch (error) {
            console.error('Download error:', error);
            toast.error("Erreur lors du téléchargement.");
        }
    };

    const handleDelete = async (item) => {
        if (!window.confirm('Voulez-vous vraiment supprimer ce montage du portfolio ?')) return;

        try {
            // 1. Delete from Database
            const { error: dbError } = await supabase
                .from('project_photos')
                .delete()
                .eq('id', item.id);

            if (dbError) throw dbError;

            // 2. Delete from Storage (Optional but cleaner)
            const path = item.photo_url.split('/project-photos/')[1];
            if (path) {
                await supabase.storage.from('project-photos').remove([path]);
            }

            setMontages(prev => prev.filter(m => m.id !== item.id));
            toast.success('Montage supprimé');
        } catch (error) {
            console.error('Error deleting montage:', error);
            toast.error('Erreur lors de la suppression');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            {/* Header */}
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <ImageIcon className="w-8 h-8 text-blue-600" />
                    Portfolio
                </h1>
                <p className="mt-2 text-gray-600 dark:text-gray-400">
                    Retrouvez tous vos montages Avant/Après. Téléchargez-les pour vos réseaux sociaux ou partagez-les avec vus clients.
                </p>
            </div>

            {/* Gallery Grid */}
            {montages.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-dashed border-gray-300 dark:border-gray-700">
                    <ImageIcon className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">Aucun montage pour le moment</h3>
                    <p className="text-gray-500 dark:text-gray-400 mt-2">
                        Créez des montages "Avant / Après" depuis la section Photos d'un client pour garnir votre portfolio.
                    </p>
                    <Link
                        to="/app/clients"
                        className="mt-6 inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Aller vers Clients <ArrowRight className="w-4 h-4 ml-2" />
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {montages.map((item) => {
                        const clientName = item.clients?.name || 'Client inconnu';
                        const location = item.clients?.address;
                        const projectName = item.projects?.name;
                        const dateDate = new Date(item.created_at).toLocaleDateString('fr-FR');

                        return (
                            <div key={item.id} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow flex flex-col">
                                {/* Image Preview */}
                                <div className="aspect-[4/3] bg-gray-100 dark:bg-gray-900 relative group overflow-hidden">
                                    <img
                                        src={item.photo_url}
                                        alt={`Avant/Après - ${clientName}`}
                                        className="w-full h-full object-contain"
                                        loading="lazy"
                                    />
                                    {/* Overlay Actions */}
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 pointer-events-none">
                                        <button
                                            onClick={() => handleDownload(item.photo_url, `avant-apres-${clientName.replace(/\s+/g, '-')}-${item.id}.jpg`)}
                                            className="p-3 bg-white text-gray-900 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors shadow-lg pointer-events-auto"
                                            title="Télécharger"
                                        >
                                            <Download className="w-6 h-6" />
                                        </button>
                                        <a
                                            href={item.photo_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="p-3 bg-white text-gray-900 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors shadow-lg pointer-events-auto"
                                            title="Voir en grand"
                                        >
                                            <ExternalLink className="w-6 h-6" />
                                        </a>
                                        <button
                                            onClick={() => handleDelete(item)}
                                            className="p-3 bg-white text-red-600 rounded-full hover:bg-red-50 hover:text-red-700 transition-colors shadow-lg pointer-events-auto"
                                            title="Supprimer du portfolio"
                                        >
                                            <Trash2 className="w-6 h-6" />
                                        </button>
                                    </div>
                                </div>

                                {/* Info Card */}
                                <div className="p-4 flex flex-col flex-1">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <h3 className="font-bold text-gray-900 dark:text-white truncate" title={clientName}>
                                                {clientName}
                                            </h3>
                                            {projectName && (
                                                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-0.5 bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded inline-block">
                                                    {projectName}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    <div className="mt-auto space-y-2 text-sm text-gray-600 dark:text-gray-400 pt-3 border-t border-gray-100 dark:border-gray-700">
                                        {item.clients?.id && (
                                            <Link
                                                to={`/app/clients/${item.clients.id}`}
                                                className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                Voir la fiche client
                                            </Link>
                                        )}
                                        {location && (
                                            <div className="flex items-center gap-2">
                                                <MapPin className="w-3.5 h-3.5 text-gray-400" />
                                                {location}
                                            </div>
                                        )}
                                        <div className="flex items-center gap-2 text-xs text-gray-400">
                                            <Calendar className="w-3.5 h-3.5" />
                                            Créé le {dateDate}
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => handleDownload(item.photo_url, `avant-apres-${clientName.replace(/\s+/g, '-')}-${item.id}.jpg`)}
                                        className="mt-4 w-full py-2 px-4 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg flex items-center justify-center gap-2 transition-colors border border-gray-200 dark:border-gray-600"
                                    >
                                        <Download className="w-4 h-4" />
                                        Télécharger pour réseaux
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Portfolio;
