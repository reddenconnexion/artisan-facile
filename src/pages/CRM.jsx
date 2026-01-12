import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';
import {
    Maximize2, Minimize2, Search, MapPin, FileText,
    Calendar, ArrowRight, CheckCircle, Clock, Construction
} from 'lucide-react';

const WorksitePilot = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [worksites, setWorksites] = useState([]);
    const [loading, setLoading] = useState(true);
    const [focusedColumn, setFocusedColumn] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const containerRef = useRef(null);
    const [zoomLevel, setZoomLevel] = useState(1);

    const columns = [
        {
            id: 'planned',
            title: 'À Planifier',
            color: 'bg-blue-50 border-blue-100',
            icon: Calendar,
            description: 'Devis signés, en attente de dates'
        },
        {
            id: 'in_progress',
            title: 'En Cours',
            color: 'bg-amber-50 border-amber-100',
            icon: Construction,
            description: 'Chantiers démarrés'
        },
        {
            id: 'completed',
            title: 'Terminé',
            color: 'bg-green-50 border-green-100',
            icon: CheckCircle,
            description: 'Travaux finis, à facturer/archiver'
        }
    ];

    useEffect(() => {
        if (user) {
            fetchWorksites();

            // Realtime subscription on QUOTES
            const subscription = supabase
                .channel('crm_worksite_subscription')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'quotes' },
                    () => {
                        fetchWorksites();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(subscription);
            };
        }
    }, [user]);

    // Handle Wheel Zoom
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleWheel = (e) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const delta = e.deltaY * -0.001;
                setZoomLevel(prev => Math.min(Math.max(prev + delta, 0.5), 1));
            }
        };

        container.addEventListener('wheel', handleWheel, { passive: false });
        // Clean up
        return () => container.removeEventListener('wheel', handleWheel);
    }, []);

    const fetchWorksites = async () => {
        try {
            // Fetch accepted quotes (jobs)
            const { data, error } = await supabase
                .from('quotes')
                .select('*, clients(*)')
                // We focus on quotes that are AT LEAST accepted.
                // Status: accepted, billed, paid. (Draft/Sent are not jobs yet)
                .in('status', ['accepted', 'billed', 'paid'])
                .order('updated_at', { ascending: false });

            if (error) throw error;
            setWorksites(data || []);
        } catch (error) {
            toast.error('Erreur chargement chantiers');
            console.error('Error fetching worksites:', error);
        } finally {
            setLoading(false);
        }
    };

    const updateStage = async (quoteId, newStage) => {
        try {
            // Optimistic Update
            setWorksites(prev => prev.map(w =>
                w.id === quoteId ? { ...w, work_stage: newStage } : w
            ));

            const { error } = await supabase
                .from('quotes')
                .update({ work_stage: newStage })
                .eq('id', quoteId);

            if (error) throw error;
            toast.success('Chantier déplacé');
        } catch (error) {
            console.error('Error updating stage:', error);
            toast.error('Erreur mise à jour: ' + error.message);
            fetchWorksites(); // Revert on error
        }
    };

    const getWorksitesByStage = (stageId) => {
        return worksites.filter(site => {
            // Logic to determine stage
            // If work_stage is set, respect it.
            // If NOT set, default to 'planned' (since we only fetched accepted+ status)
            const currentStage = site.work_stage || 'planned';

            const matchesStage = currentStage === stageId;

            // Search
            const term = searchTerm.toLowerCase();
            const clientName = site.clients?.name?.toLowerCase() || '';
            const city = site.clients?.city?.toLowerCase() || '';
            const matchesSearch = !term || clientName.includes(term) || city.includes(term) || site.id.toString().includes(term);

            return matchesStage && matchesSearch;
        });
    };

    const handleDragStart = (e, quoteId) => {
        e.dataTransfer.setData('quoteId', quoteId);
        e.dataTransfer.effectAllowed = 'move';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = (e, stageId) => {
        e.preventDefault();
        const quoteId = e.dataTransfer.getData('quoteId');
        if (quoteId) {
            updateStage(parseInt(quoteId), stageId);
        }
    };

    const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.1, 1));
    const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.1, 0.5));

    if (loading) return <div className="flex justify-center items-center h-64">Chargement des chantiers...</div>;

    return (
        <div className="h-[calc(100vh-100px)] overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 px-4 shrink-0 gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        Pilotage Chantiers
                        {focusedColumn && <span className="text-gray-400 text-lg font-normal">/ {columns.find(c => c.id === focusedColumn)?.title}</span>}
                    </h2>
                    <p className="text-sm text-gray-500">Gérez l'avancement de vos travaux signés.</p>
                </div>

                <div className="flex gap-2 w-full md:w-auto items-center">
                    {/* Zoom Controls */}
                    <div className="hidden md:flex items-center bg-white rounded-lg border border-gray-200 mr-4 shadow-sm">
                        <button onClick={handleZoomOut} className="p-1.5 hover:bg-gray-50 text-gray-600 rounded-l-lg disabled:opacity-50"><Minimize2 className="w-4 h-4" /></button>
                        <span className="px-2 text-xs font-medium text-gray-600 w-12 text-center">{Math.round(zoomLevel * 100)}%</span>
                        <button onClick={handleZoomIn} className="p-1.5 hover:bg-gray-50 text-gray-600 rounded-r-lg disabled:opacity-50"><Maximize2 className="w-4 h-4" /></button>
                    </div>

                    {/* Search */}
                    <div className="relative flex-1 md:w-64">
                        <input
                            type="text"
                            placeholder="Rechercher chantier..."
                            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
                    </div>

                    {focusedColumn && (
                        <button onClick={() => setFocusedColumn(null)} className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center">
                            <Minimize2 className="w-4 h-4 md:mr-2" />
                            <span className="hidden md:inline">Vue d'ensemble</span>
                        </button>
                    )}
                </div>
            </div>

            {/* Canvas */}
            <div
                ref={containerRef}
                className={`flex gap-4 px-4 pb-4 h-full ${focusedColumn ? 'overflow-hidden' : 'flex-col overflow-y-auto md:flex-row md:overflow-x-auto'}`}
            >
                <div className="flex gap-4 h-full" style={{ zoom: zoomLevel }}>
                    {columns.map(column => {
                        if (focusedColumn && focusedColumn !== column.id) return null;
                        const items = getWorksitesByStage(column.id);

                        return (
                            <div
                                key={column.id}
                                className={`
                                    flex flex-col rounded-xl border ${column.color} transition-all duration-300
                                    ${focusedColumn ? 'w-full max-w-4xl mx-auto h-full' : 'w-full shrink-0 md:w-80 md:h-full md:max-h-full'}
                                `}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, column.id)}
                            >
                                {/* Column Header */}
                                <div className="p-4 font-semibold text-gray-700 flex justify-between items-center bg-white/60 rounded-t-xl border-b border-gray-200/50 backdrop-blur-sm shrink-0">
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-lg ${column.color.split(' ')[0]} bg-opacity-100`}>
                                            <column.icon className="w-4 h-4 text-gray-700" />
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span>{column.title}</span>
                                                <span className="bg-white px-2 py-0.5 rounded-full text-xs text-gray-500 shadow-sm border border-gray-100">
                                                    {items.length}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    {!focusedColumn && (
                                        <button onClick={() => setFocusedColumn(column.id)} className="p-1 hover:bg-white/50 rounded text-gray-400 hover:text-gray-600">
                                            <Maximize2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                                <div className="text-xs text-gray-500 px-4 pb-2 italic">{column.description}</div>

                                {/* Items List */}
                                <div className="p-3 flex-1 overflow-y-auto space-y-3">
                                    {items.map(job => (
                                        <div
                                            key={job.id}
                                            draggable="true"
                                            onDragStart={(e) => handleDragStart(e, job.id)}
                                            className="bg-white p-4 rounded-lg shadow-sm border border-gray-100 hover:shadow-md transition-shadow group cursor-move active:cursor-grabbing border-l-4"
                                            style={{ borderLeftColor: column.id === 'in_progress' ? '#F59E0B' : column.id === 'completed' ? '#10B981' : '#3B82F6' }}
                                        >
                                            {/* Card Top: Client & Price */}
                                            <div className="flex justify-between items-start mb-2">
                                                <div>
                                                    <h4 className="font-bold text-gray-900 truncate pr-2">{job.clients?.name || 'Client Inconnu'}</h4>
                                                    <div
                                                        onClick={() => navigate(`/app/devis/${job.id}`)}
                                                        className="text-xs text-blue-600 hover:underline cursor-pointer flex items-center gap-1 mt-0.5"
                                                    >
                                                        <FileText className="w-3 h-3" /> Devis #{job.id}
                                                    </div>
                                                </div>
                                                <span className="font-bold text-gray-700 text-sm">{job.total_ttc} €</span>
                                            </div>

                                            {/* Card Middle: Address & Info */}
                                            <div className="space-y-1.5 mb-3">
                                                {job.clients?.address && (
                                                    <div className="flex items-start text-xs text-gray-500">
                                                        <MapPin className="w-3 h-3 mr-1.5 mt-0.5 shrink-0" />
                                                        <span className="line-clamp-2">{job.clients.address} {job.clients.city && `, ${job.clients.city}`}</span>
                                                    </div>
                                                )}
                                                {job.clients?.phone && (
                                                    <div className="flex items-center text-xs text-gray-500">
                                                        <Phone className="w-3 h-3 mr-1.5" />
                                                        {job.clients.phone}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Card Bottom: Actions */}
                                            <div className="flex justify-between items-center pt-2 border-t border-gray-50">
                                                <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">
                                                    MAJ: {new Date(job.updated_at).toLocaleDateString()}
                                                </span>

                                                <div className="flex gap-2">
                                                    {job.clients?.address && (
                                                        <a
                                                            href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.clients.address + ' ' + (job.clients.city || ''))}`}
                                                            target="_blank"
                                                            rel="noreferrer"
                                                            className="p-1.5 hover:bg-blue-50 text-blue-600 rounded transition-colors"
                                                            title="GPS"
                                                        >
                                                            <MapPin className="w-4 h-4" />
                                                        </a>
                                                    )}
                                                    {column.id !== 'completed' && (
                                                        <button
                                                            onClick={() => updateStage(job.id, column.id === 'planned' ? 'in_progress' : 'completed')}
                                                            className="p-1.5 hover:bg-gray-100 text-gray-600 rounded"
                                                            title="Avancer"
                                                        >
                                                            <ArrowRight className="w-4 h-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {items.length === 0 && (
                                        <div className="text-center py-8 text-gray-400 text-sm border-2 border-dashed border-gray-100 rounded-lg">
                                            Aucun chantier
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default WorksitePilot;
