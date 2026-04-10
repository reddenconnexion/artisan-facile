import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Search, Plus, FileText, CheckCircle, Clock, AlertCircle, Upload, Send, Layers, X, ChevronDown } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQuotes } from '../hooks/useDataCache';
import { useDebounce } from '../hooks/useDebounce';
import { useTestMode } from '../context/TestModeContext';

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
    // Utilisation du cache React Query
    const { data: devisList = [], isLoading: loading } = useQuotes();
    const { isTestMode, testClient } = useTestMode();

    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearch = useDebounce(searchTerm, 300);
    const importInputRef = React.useRef(null);

    const [statusFilter, setStatusFilter] = useState(location.state?.filter || 'all');
    const [mergeMode, setMergeMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showMoreOptions, setShowMoreOptions] = useState(false);

    const toggleSelect = (e, id) => {
        e.stopPropagation();
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const handleCancelMerge = () => { setMergeMode(false); setSelectedIds(new Set()); };

    const handleMerge = () => {
        if (selectedIds.size < 2) return;
        navigate('/app/devis/new', { state: { mergeIds: [...selectedIds] } });
    };

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

    const filteredDevis = devisList.filter(devis => {
        if (!isTestMode && (devis.client_name?.includes('⚗️') || (testClient?.id && devis.client_id === testClient.id))) return false;

        const q = debouncedSearch.toLowerCase();
        const matchesSearch = !q ||
            (devis.client_name && devis.client_name.toLowerCase().includes(q)) ||
            devis.id.toString().includes(q) ||
            (devis.title && devis.title.toLowerCase().includes(q)) ||
            (devis.quote_number && devis.quote_number.toString().includes(q));

        const matchesStatus = statusFilter === 'all' ||
            (statusFilter === 'pending' ? ['draft', 'sent'].includes(devis.status) :
            statusFilter === 'rejected' ? ['rejected', 'refused'].includes(devis.status) :
            devis.status === statusFilter);

        return matchesSearch && matchesStatus;
    });

    // Counts per filter tab (excluding test data)
    const visibleDevis = devisList.filter(d =>
        isTestMode || (!d.client_name?.includes('⚗️') && !(testClient?.id && d.client_id === testClient.id))
    );
    const countFor = (status) => {
        if (status === 'all') return visibleDevis.length;
        if (status === 'pending') return visibleDevis.filter(d => ['draft', 'sent'].includes(d.status)).length;
        if (status === 'rejected') return visibleDevis.filter(d => ['rejected', 'refused'].includes(d.status)).length;
        return visibleDevis.filter(d => d.status === status).length;
    };

    // Expiry warning: sent/draft devis with valid_until within 7 days
    const isExpiringSoon = (devis) => {
        if (!['sent', 'draft'].includes(devis.status) || !devis.valid_until) return false;
        const daysLeft = Math.ceil((new Date(devis.valid_until) - new Date()) / (1000 * 60 * 60 * 24));
        return daysLeft >= 0 && daysLeft <= 7;
    };
    const isExpired = (devis) => {
        if (!['sent', 'draft'].includes(devis.status) || !devis.valid_until) return false;
        return new Date(devis.valid_until) < new Date();
    };

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
                <div className="flex gap-2 relative">
                    {!mergeMode ? (
                        <>
                            {/* Options avancées (Import, Fusion) */}
                            <div className="relative">
                                <button
                                    onClick={() => setShowMoreOptions(v => !v)}
                                    className="flex items-center justify-center px-3 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                    title="Plus d'options"
                                >
                                    <ChevronDown className="w-4 h-4" />
                                </button>
                                {showMoreOptions && (
                                    <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-10 overflow-hidden">
                                        <button
                                            onClick={() => { handleImportClick(); setShowMoreOptions(false); }}
                                            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                                        >
                                            <Upload className="w-4 h-4 text-gray-400" />
                                            Importer (PDF / Word)
                                        </button>
                                        <button
                                            onClick={() => { setMergeMode(true); setShowMoreOptions(false); }}
                                            className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100"
                                        >
                                            <Layers className="w-4 h-4 text-gray-400" />
                                            Fusionner des devis
                                        </button>
                                    </div>
                                )}
                            </div>
                            <button
                                onClick={() => navigate('/app/devis/new')}
                                className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <Plus className="w-5 h-5 mr-2" />
                                Nouveau Devis
                            </button>
                        </>
                    ) : (
                        <button
                            onClick={handleCancelMerge}
                            className="flex items-center justify-center px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                        >
                            <X className="w-5 h-5 mr-2" />
                            Annuler
                        </button>
                    )}
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
                    {['all', 'pending', 'accepted', 'paid', 'rejected', 'followups'].map((status) => {
                        const count = status !== 'followups' ? countFor(status) : null;
                        const labels = {
                            all: 'Tous', pending: 'En cours',
                            accepted: 'Signés', rejected: 'Refusés',
                            paid: 'Payés'
                        };
                        return (
                            <button
                                key={status}
                                onClick={() => setStatusFilter(status)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap flex-shrink-0 flex items-center gap-1 ${status === 'followups' ? 'ml-auto' : ''} ${statusFilter === status
                                    ? status === 'followups'
                                        ? 'bg-blue-600 text-white shadow-sm'
                                        : 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                    }`}
                            >
                                {status === 'followups' ? (
                                    <><Send className="w-3 h-3" />Relances</>
                                ) : (
                                    <>
                                        {labels[status]}
                                        {count > 0 && (
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none ${statusFilter === status ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}`}>
                                                {count}
                                            </span>
                                        )}
                                    </>
                                )}
                            </button>
                        );
                    })}
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
                                    {mergeMode && <th className="pl-4 pr-2 py-3 w-10" />}
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Numéro</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Client / Objet</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Montant TTC</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Statut</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Relance</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-800">
                                {filteredDevis.map((devis) => (
                                    <tr
                                        key={devis.id}
                                        className={`hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer ${mergeMode && selectedIds.has(devis.id) ? 'bg-blue-50 dark:bg-blue-900/20' : isExpired(devis) ? 'bg-red-50/40 dark:bg-red-900/10' : isExpiringSoon(devis) ? 'bg-amber-50/40 dark:bg-amber-900/10' : ''}`}
                                        onClick={mergeMode ? (e) => toggleSelect(e, devis.id) : () => navigate(`/app/devis/${devis.id}`)}
                                    >
                                        {mergeMode && (
                                            <td className="pl-4 pr-2 py-4 w-10">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.has(devis.id)}
                                                    onChange={(e) => toggleSelect(e, devis.id)}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                                />
                                            </td>
                                        )}
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600 dark:text-blue-400">
                                            {devis.type === 'invoice' ? 'FAC' : (devis.type === 'amendment' ? 'AVT' : 'DEV')} #{devis.quote_number || devis.id}
                                        </td>
                                        <td className="px-6 py-4 text-sm">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    if (devis.client_id) navigate(`/app/clients/${devis.client_id}`);
                                                }}
                                                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline font-medium block"
                                            >
                                                {devis.client_name || 'Client inconnu'}
                                            </button>
                                            {devis.title && (
                                                <span className="text-xs text-gray-400 dark:text-gray-500 truncate block max-w-[220px]">{devis.title}</span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                            <div>{new Date(devis.date).toLocaleDateString()}</div>
                                            {isExpired(devis) && (
                                                <span className="text-xs font-medium text-red-600 dark:text-red-400">Expiré</span>
                                            )}
                                            {isExpiringSoon(devis) && !isExpired(devis) && (
                                                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                                                    Expire bientôt
                                                </span>
                                            )}
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
                                className={`bg-white dark:bg-gray-900 p-4 rounded-xl shadow-sm border flex flex-col gap-3 active:scale-[0.98] transition-transform cursor-pointer ${mergeMode && selectedIds.has(devis.id) ? 'border-blue-400 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-100 dark:border-gray-800'}`}
                                onClick={mergeMode ? (e) => toggleSelect(e, devis.id) : () => navigate(`/app/devis/${devis.id}`)}
                            >
                                {mergeMode && (
                                    <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(devis.id)}
                                            onChange={(e) => toggleSelect(e, devis.id)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs">{selectedIds.has(devis.id) ? 'Sélectionné' : 'Sélectionner'}</span>
                                    </div>
                                )}
                                <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0 overflow-hidden">
                                        <span className={`text-xs font-semibold px-2 py-1 rounded inline-block max-w-full truncate ${devis.type === 'invoice' ? 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/30' : (devis.type === 'amendment' ? 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/30' : 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30')}`}>
                                            {devis.type === 'invoice' ? 'Facture' : (devis.type === 'amendment' ? 'Avenant' : 'Devis')} #{devis.quote_number || devis.id}
                                        </span>
                                        <h3 className="font-bold text-gray-900 dark:text-white mt-2 truncate">{devis.client_name || 'Client inconnu'}</h3>
                                        {devis.title && (
                                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{devis.title}</p>
                                        )}
                                        <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-2 flex-wrap mt-0.5">
                                            <span>{new Date(devis.date).toLocaleDateString()}</span>
                                            {isExpired(devis) && <span className="text-red-600 dark:text-red-400 font-medium">Expiré</span>}
                                            {isExpiringSoon(devis) && !isExpired(devis) && <span className="text-amber-600 dark:text-amber-400 font-medium">Expire bientôt</span>}
                                            {devis.last_followup_at && (
                                                <span className="text-orange-600 dark:text-orange-400 inline-flex items-center gap-0.5">
                                                    <Send className="w-2.5 h-2.5" />
                                                    {formatFollowUpDate(devis.last_followup_at)}
                                                </span>
                                            )}
                                        </p>
                                    </div>
                                    <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                        <StatusBadge status={devis.status} />
                                        <span className="font-bold text-gray-900 dark:text-white text-base whitespace-nowrap">
                                            {devis.total_ttc ? devis.total_ttc.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) : '-'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {filteredDevis.length === 0 && (
                        devisList.length === 0 ? (
                            /* Aucun devis en base — premier usage */
                            <div className="text-center py-16 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-6">
                                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-full h-20 w-20 flex items-center justify-center mx-auto mb-5">
                                    <FileText className="h-10 w-10 text-blue-400" />
                                </div>
                                <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                    Créez votre premier devis
                                </h3>
                                <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-sm mx-auto">
                                    Envoyez un document professionnel à votre client en moins de 2 minutes, directement depuis votre téléphone.
                                </p>
                                <button
                                    onClick={() => navigate('/app/devis/new')}
                                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                                >
                                    <Plus className="w-4 h-4" />
                                    Créer mon premier devis
                                </button>
                                <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">
                                    Vous avez déjà des devis ?{' '}
                                    <button onClick={handleImportClick} className="text-blue-500 hover:underline">
                                        Importez un PDF ou Word
                                    </button>
                                </p>
                            </div>
                        ) : searchTerm ? (
                            /* Recherche sans résultat */
                            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                <Search className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                                <p className="text-gray-500 dark:text-gray-400">
                                    Aucun résultat pour "<span className="font-medium">{searchTerm}</span>"
                                </p>
                            </div>
                        ) : (
                            /* Filtre actif sans résultat */
                            <div className="text-center py-12 bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800">
                                <p className="text-gray-500 dark:text-gray-400">
                                    Aucun devis dans cette catégorie.
                                </p>
                            </div>
                        )
                    )}
                </>
            )}

            {/* Barre flottante de fusion */}
            {mergeMode && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-full shadow-xl border transition-all"
                    style={{ background: selectedIds.size >= 2 ? '#2563eb' : '#f3f4f6', color: selectedIds.size >= 2 ? '#fff' : '#6b7280', borderColor: selectedIds.size >= 2 ? '#1d4ed8' : '#e5e7eb' }}
                >
                    <Layers className="w-4 h-4 flex-shrink-0" />
                    {selectedIds.size < 2 ? (
                        <span className="text-sm">Sélectionnez au moins 2 devis</span>
                    ) : (
                        <>
                            <span className="text-sm font-medium">{selectedIds.size} devis sélectionnés</span>
                            <button
                                onClick={handleMerge}
                                className="ml-2 px-4 py-1.5 bg-white text-blue-600 text-sm font-semibold rounded-full hover:bg-blue-50 transition-colors"
                            >
                                Fusionner
                            </button>
                        </>
                    )}
                    <button onClick={handleCancelMerge} className="ml-1 opacity-70 hover:opacity-100 transition-opacity">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default DevisList;
