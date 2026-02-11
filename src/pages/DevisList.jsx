import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Search, Plus, FileText, CheckCircle, Clock, AlertCircle, Upload, Zap, Loader2, Send } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuotes, useInvalidateCache } from '../hooks/useDataCache';
import { useDebounce } from '../hooks/useDebounce';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';

const FollowUps = lazy(() => import('./FollowUps'));

const StatusBadge = ({ status }) => {
    const styles = {
        draft: { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300', icon: Clock, label: 'Brouillon' },
        sent: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: AlertCircle, label: 'Envoyé' },
        accepted: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircle, label: 'Accepté' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: AlertCircle, label: 'Refusé' },
        refused: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: AlertCircle, label: 'Refusé' },
        billed: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', icon: CheckCircle, label: 'Facturé' },
        paid: { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle, label: 'Payé' },
        postponed: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', icon: Clock, label: 'Reporté' },
    };
    const style = styles[status] || styles.draft;
    const Icon = style.icon;

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
            <Icon className="w-3 h-3 mr-1" />
            {style.label}
        </span>
    );
};

const formatFollowUpDate = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `il y a ${diffDays}j`;
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
};

const DevisList = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { invalidateQuotes } = useInvalidateCache();
    const [convertingId, setConvertingId] = useState(null);

    // Utilisation du cache React Query
    const { data: devisList = [], isLoading: loading } = useQuotes();

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const importInputRef = React.useRef(null);

    const [statusFilter, setStatusFilter] = useState(location.state?.filter || 'all');

    // Reset filter if location state changes
    useEffect(() => {
        if (location.state?.filter) {
            setStatusFilter(location.state.filter);
        }
    }, [location.state]);

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleFileChange = (event) => {
        const file = event.target.files?.[0];
        if (file) {
            navigate('/app/devis/new', { state: { importFile: file } });
        }
    };

    const handleConvertToInvoice = async (e, devis) => {
        e.stopPropagation();
        setConvertingId(devis.id);

        try {
            const { error } = await supabase
                .from('quotes')
                .update({
                    type: 'invoice',
                    status: 'billed',
                    date: new Date().toISOString().split('T')[0]
                })
                .eq('id', devis.id);

            if (error) throw error;

            if (devis.client_id) {
                await supabase.from('clients').update({ status: 'signed' }).eq('id', devis.client_id).catch(() => {});
            }

            invalidateQuotes();
            toast.success(
                `Facture FAC #${devis.id} créée !`,
                {
                    action: {
                        label: 'Voir la facture',
                        onClick: () => navigate(`/app/devis/${devis.id}`)
                    },
                    duration: 6000
                }
            );
        } catch (error) {
            console.error('Error converting to invoice:', error);
            toast.error('Erreur lors de la conversion');
        } finally {
            setConvertingId(null);
        }
    };

    const filteredDevis = devisList.filter(devis => {
        const matchesSearch = (devis.client_name && devis.client_name.toLowerCase().includes(debouncedSearch.toLowerCase())) ||
            devis.id.toString().includes(debouncedSearch);

        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'pending' ? ['draft', 'sent'].includes(devis.status) :
            statusFilter === 'rejected' ? ['rejected', 'refused'].includes(devis.status) :
            devis.status === statusFilter);

        return matchesSearch && matchesStatus;
    });

    // Sous-onglet actif : 'liste' ou 'relances'
    const isFollowUpsTab = statusFilter === 'followups';

    if (loading) {
        return <div className="flex justify-center items-center h-64">Chargement...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <FileText className="w-8 h-8 text-blue-600" />
                    Devis & Factures
                </h2>
                <div className="flex gap-2">
                    <button
                        onClick={handleImportClick}
                        className="flex items-center justify-center px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                        <Upload className="w-5 h-5 mr-2" />
                        Importer (PDF / Word)
                    </button>
                    <button
                        onClick={() => navigate('/app/devis/new')}
                        className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        <Plus className="w-5 h-5 mr-2" />
                        Nouveau Devis
                    </button>
                </div>
                <input
                    type="file"
                    ref={importInputRef}
                    onChange={handleFileChange}
                    accept="application/pdf, .docx, application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                />
            </div>

            {/* Filtres et Recherche */}
            <div className="flex flex-col md:flex-row gap-4">
                {!isFollowUpsTab && (
                    <div className="relative flex-1">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                            <Search className="h-5 w-5 text-gray-400" />
                        </div>
                        <input
                            type="text"
                            placeholder="Rechercher un devis, un client..."
                            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg leading-5 bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                )}
                <div className={`flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg overflow-x-auto ${isFollowUpsTab ? 'flex-1' : ''}`}>
                    {['all', 'pending', 'draft', 'sent', 'accepted', 'rejected', 'billed', 'paid', 'postponed', 'followups'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setStatusFilter(status)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap flex-shrink-0 ${status === 'followups' ? 'ml-auto' : ''} ${statusFilter === status
                                ? status === 'followups'
                                    ? 'bg-blue-600 text-white shadow-sm'
                                    : 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                }`}
                        >
                            {status === 'all' && 'Tous'}
                            {status === 'pending' && 'En attente'}
                            {status === 'draft' && 'Brouillons'}
                            {status === 'sent' && 'Envoyés'}
                            {status === 'accepted' && 'Signés'}
                            {status === 'rejected' && 'Refusés'}
                            {status === 'billed' && 'Facturés'}
                            {status === 'paid' && 'Payés'}
                            {status === 'postponed' && 'Reportés'}
                            {status === 'followups' && (
                                <span className="flex items-center gap-1">
                                    <Send className="w-3 h-3" />
                                    Relances
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contenu : liste ou relances */}
            {isFollowUpsTab ? (
                <Suspense fallback={<div className="text-center py-12 text-gray-500">Chargement...</div>}>
                    <FollowUps embedded />
                </Suspense>
            ) : (
                <>
                    {/* Desktop Table View */}
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden hidden md:block">
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                            <thead className="bg-gray-50 dark:bg-gray-800/50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Numéro</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Client</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Montant TTC</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Statut</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Relance</th>
                                    <th className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                                {filteredDevis.map((devis) => (
                                    <tr key={devis.id} className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer" onClick={() => navigate(`/app/devis/${devis.id}`)}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                                            {devis.type === 'invoice' ? 'FAC' : (devis.type === 'amendment' ? 'AVT' : 'DEV')} #{devis.id}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (devis.client_id) {
                                                        navigate(`/app/clients/${devis.client_id}`);
                                                    }
                                                }}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline font-medium"
                                            >
                                                {devis.client_name || 'Client inconnu'}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            {new Date(devis.date).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-900 dark:text-white">
                                            {devis.total_ttc ? devis.total_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '-'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <StatusBadge status={devis.status} />
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                            {devis.last_followup_at ? (
                                                <span className="inline-flex items-center gap-1 text-orange-600 dark:text-orange-400">
                                                    <Send className="w-3 h-3" />
                                                    {formatFollowUpDate(devis.last_followup_at)}
                                                </span>
                                            ) : devis.status === 'sent' ? (
                                                <span className="text-gray-400">-</span>
                                            ) : null}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                            {devis.type === 'quote' && devis.status === 'accepted' ? (
                                                <button
                                                    onClick={(e) => handleConvertToInvoice(e, devis)}
                                                    disabled={convertingId === devis.id}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                                                    title="Convertir en facture"
                                                >
                                                    {convertingId === devis.id
                                                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                        : <Zap className="w-3.5 h-3.5" />
                                                    }
                                                    Facturer
                                                </button>
                                            ) : (
                                                <button className="text-gray-400 hover:text-gray-600">
                                                    <FileText className="w-5 h-5" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-4">
                        {filteredDevis.map((devis) => (
                            <div
                                key={devis.id}
                                className="bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-800 flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer"
                                onClick={() => navigate(`/app/devis/${devis.id}`)}
                            >
                                <div className="flex justify-between items-start">
                                    <div>
                                        <span className={`text-xs font-semibold px-2 py-1 rounded ${devis.type === 'invoice' ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30' : (devis.type === 'amendment' ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30' : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30')}`}>
                                            {devis.type === 'invoice' ? 'Facture' : (devis.type === 'amendment' ? 'Avenant' : 'Devis')} #{devis.id}
                                        </span>
                                        <h3 className="font-bold text-gray-900 dark:text-white mt-2">{devis.client_name || 'Client inconnu'}</h3>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                            {new Date(devis.date).toLocaleDateString()}
                                            {devis.last_followup_at && (
                                                <span className="ml-2 text-orange-600 dark:text-orange-400 inline-flex items-center gap-0.5">
                                                    <Send className="w-2.5 h-2.5" />
                                                    {formatFollowUpDate(devis.last_followup_at)}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2">
                                        <StatusBadge status={devis.status} />
                                        <span className="font-bold text-gray-900 dark:text-white text-lg">
                                            {devis.total_ttc ? devis.total_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '-'}
                                        </span>
                                        {devis.type === 'quote' && devis.status === 'accepted' && (
                                            <button
                                                onClick={(e) => handleConvertToInvoice(e, devis)}
                                                disabled={convertingId === devis.id}
                                                className="flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
                                            >
                                                {convertingId === devis.id
                                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    : <Zap className="w-3.5 h-3.5" />
                                                }
                                                Facturer
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredDevis.length === 0 && (
                        <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                            <p className="text-gray-500 dark:text-gray-400">Aucun devis trouvé.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default DevisList;
