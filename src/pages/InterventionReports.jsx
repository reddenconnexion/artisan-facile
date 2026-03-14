import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ClipboardList, Plus, Search, Trash2, Edit, FileDown, CheckCircle, Clock, PenLine } from 'lucide-react';
import { toast } from 'sonner';
import { format, parseISO } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '../utils/supabase';
import { useInterventionReports, useInvalidateCache } from '../hooks/useDataCache';
import { useUserProfile } from '../hooks/useDataCache';
import { generateInterventionReportPDF } from '../utils/pdfGenerator';
import { useTestMode } from '../context/TestModeContext';

const STATUS_CONFIG = {
    draft: { label: 'Brouillon', bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: Clock },
    completed: { label: 'Terminé', bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-400', icon: CheckCircle },
    signed: { label: 'Signé', bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-400', icon: PenLine },
};

const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.draft;
    const Icon = config.icon;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
            <Icon className="w-3 h-3" />
            {config.label}
        </span>
    );
};

const InterventionReports = () => {
    const navigate = useNavigate();
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [deletingId, setDeletingId] = useState(null);
    const [exportingId, setExportingId] = useState(null);

    const { data: reports = [], isLoading } = useInterventionReports();
    const { data: userProfile } = useUserProfile();
    const { invalidateInterventionReports } = useInvalidateCache();
    const { isTestMode, testClient } = useTestMode();

    const filtered = reports.filter(r => {
        if (!isTestMode && (r.client_name?.includes('⚗️') || (testClient?.id && r.client_id === testClient.id))) return false;
        const matchSearch =
            (r.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.client_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (r.intervention_city || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchStatus = statusFilter === 'all' || r.status === statusFilter;
        return matchSearch && matchStatus;
    });

    const handleDelete = async (id) => {
        if (!window.confirm('Supprimer ce rapport d\'intervention ?')) return;
        setDeletingId(id);
        try {
            const { error } = await supabase.from('intervention_reports').delete().eq('id', id);
            if (error) throw error;
            invalidateInterventionReports();
            toast.success('Rapport supprimé');
        } catch (err) {
            toast.error('Erreur lors de la suppression');
        } finally {
            setDeletingId(null);
        }
    };

    const handleExportPDF = async (report) => {
        setExportingId(report.id);
        try {
            await generateInterventionReportPDF(report, userProfile);
            toast.success('PDF généré');
        } catch (err) {
            toast.error('Erreur lors de la génération du PDF');
        } finally {
            setExportingId(null);
        }
    };

    const visibleReports = reports.filter(r =>
        isTestMode || !(r.client_name?.includes('⚗️') || (testClient?.id && r.client_id === testClient.id))
    );

    const stats = {
        total: visibleReports.length,
        signed: visibleReports.filter(r => r.status === 'signed').length,
        completed: visibleReports.filter(r => r.status === 'completed').length,
        draft: visibleReports.filter(r => r.status === 'draft').length,
    };

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <ClipboardList className="w-8 h-8 text-blue-600" />
                        Rapports d'intervention
                    </h1>
                    <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                        Suivi de vos dépannages et interventions
                    </p>
                </div>
                <button
                    onClick={() => navigate('/app/interventions/new')}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                    <Plus className="w-5 h-5" />
                    Nouveau rapport
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total', value: stats.total, color: 'text-gray-700 dark:text-gray-200' },
                    { label: 'Brouillons', value: stats.draft, color: 'text-gray-600 dark:text-gray-400' },
                    { label: 'Terminés', value: stats.completed, color: 'text-blue-600 dark:text-blue-400' },
                    { label: 'Signés', value: stats.signed, color: 'text-green-600 dark:text-green-400' },
                ].map(stat => (
                    <div key={stat.label} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">{stat.label}</p>
                        <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Rechercher par titre, client ou ville..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                    <option value="all">Tous les statuts</option>
                    <option value="draft">Brouillon</option>
                    <option value="completed">Terminé</option>
                    <option value="signed">Signé</option>
                </select>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
                    <ClipboardList className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                    <p className="text-gray-500 dark:text-gray-400 font-medium">
                        {searchTerm || statusFilter !== 'all'
                            ? 'Aucun rapport ne correspond à votre recherche'
                            : 'Aucun rapport d\'intervention pour l\'instant'}
                    </p>
                    {!searchTerm && statusFilter === 'all' && (
                        <button
                            onClick={() => navigate('/app/interventions/new')}
                            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                            Créer votre premier rapport
                        </button>
                    )}
                </div>
            ) : (
                <>
                    {/* Desktop Table */}
                    <div className="hidden md:block bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Date</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Titre</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Client</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Lieu</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Durée</th>
                                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Statut</th>
                                    <th className="px-6 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                {filtered.map(report => (
                                    <tr key={report.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                            {report.date ? format(parseISO(report.date), 'd MMM yyyy', { locale: fr }) : '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <button
                                                onClick={() => navigate(`/app/interventions/${report.id}`)}
                                                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline text-left"
                                            >
                                                {report.title}
                                            </button>
                                            {report.report_number && (
                                                <p className="text-xs text-gray-400 mt-0.5">#{report.report_number}</p>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                                            {report.client_name || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                                            {[report.intervention_city, report.intervention_postal_code].filter(Boolean).join(' ') || '—'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                            {report.duration_hours ? `${report.duration_hours}h` : '—'}
                                        </td>
                                        <td className="px-6 py-4">
                                            <StatusBadge status={report.status} />
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 justify-end">
                                                <button
                                                    onClick={() => handleExportPDF(report)}
                                                    disabled={exportingId === report.id}
                                                    className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                    title="Exporter en PDF"
                                                >
                                                    {exportingId === report.id
                                                        ? <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                                                        : <FileDown className="w-4 h-4" />}
                                                </button>
                                                <button
                                                    onClick={() => navigate(`/app/interventions/${report.id}`)}
                                                    className="p-2 text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                                                    title="Modifier"
                                                >
                                                    <Edit className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => handleDelete(report.id)}
                                                    disabled={deletingId === report.id}
                                                    className="p-2 text-gray-500 hover:text-red-600 dark:text-gray-400 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                                    title="Supprimer"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-3">
                        {filtered.map(report => (
                            <div
                                key={report.id}
                                className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3"
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <button
                                            onClick={() => navigate(`/app/interventions/${report.id}`)}
                                            className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline text-left truncate block"
                                        >
                                            {report.title}
                                        </button>
                                        {report.client_name && (
                                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{report.client_name}</p>
                                        )}
                                    </div>
                                    <StatusBadge status={report.status} />
                                </div>
                                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                                    {report.date && (
                                        <span>{format(parseISO(report.date), 'd MMM yyyy', { locale: fr })}</span>
                                    )}
                                    {report.duration_hours && <span>{report.duration_hours}h</span>}
                                    {report.intervention_city && <span>{report.intervention_city}</span>}
                                </div>
                                <div className="flex gap-2 pt-1 border-t border-gray-100 dark:border-gray-700">
                                    <button
                                        onClick={() => handleExportPDF(report)}
                                        disabled={exportingId === report.id}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                    >
                                        <FileDown className="w-3.5 h-3.5" />
                                        PDF
                                    </button>
                                    <button
                                        onClick={() => navigate(`/app/interventions/${report.id}`)}
                                        className="flex-1 flex items-center justify-center gap-1 px-3 py-2 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                    >
                                        <Edit className="w-3.5 h-3.5" />
                                        Modifier
                                    </button>
                                    <button
                                        onClick={() => handleDelete(report.id)}
                                        disabled={deletingId === report.id}
                                        className="px-3 py-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                    >
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

export default InterventionReports;
