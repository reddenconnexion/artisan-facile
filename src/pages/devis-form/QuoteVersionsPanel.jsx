import { FileText, Loader2, Clock } from 'lucide-react';
import { formatDate, formatCurrency } from '../../utils/format';

/**
 * Historique des versions archivées — la trace de ce qui a été envoyé au client.
 */
const QuoteVersionsPanel = ({
    handleViewVersionPdf,
    quoteVersions,
    versionPdfLoading,
}) => {
    return (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl p-4 mb-6">
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center mb-3">
                <Clock className="w-4 h-4 mr-2 text-gray-400" />
                Versions archivées
            </h4>
            <ul className="space-y-2">
                {quoteVersions.map(v => {
                    const reasonLabels = {
                        sent: { label: 'Envoyée au client', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' },
                        pre_modification: { label: 'Avant modification', cls: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300' },
                        restore: { label: 'Restaurée', cls: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' },
                    };
                    const reason = reasonLabels[v.reason] || reasonLabels.pre_modification;
                    const versionTtc = parseFloat(v.snapshot?.total_ttc);
                    return (
                        <li key={v.id} className="flex items-center justify-between gap-3 text-sm">
                            <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="font-semibold text-gray-700 dark:text-gray-300 flex-shrink-0">V{v.version_number}</span>
                                <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">
                                    {formatDate(v.created_at)}
                                </span>
                                {!Number.isNaN(versionTtc) && (
                                    <span className="font-medium text-gray-900 dark:text-gray-100 flex-shrink-0">
                                        {formatCurrency(versionTtc)}
                                    </span>
                                )}
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${reason.cls}`}>
                                    {reason.label}
                                </span>
                            </div>
                            <button
                                type="button"
                                onClick={() => handleViewVersionPdf(v)}
                                disabled={versionPdfLoading === v.id}
                                className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg flex-shrink-0"
                            >
                                {versionPdfLoading === v.id
                                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    : <FileText className="w-3.5 h-3.5" />}
                                PDF
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

export default QuoteVersionsPanel;
