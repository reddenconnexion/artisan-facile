import React, { useState, useEffect } from 'react';
import { Eye, X, Clock } from 'lucide-react';
import { supabase } from '../utils/supabase';

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 7) return `Il y a ${Math.floor(diff / 86400)} j`;
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

export default function QuoteViewHistory({ quoteId, onClose }) {
    const [views, setViews] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!quoteId) return;
        fetchViews();
    }, [quoteId]);

    const fetchViews = async () => {
        setLoading(true);
        const { data } = await supabase
            .from('quote_views')
            .select('id, viewed_at')
            .eq('quote_id', quoteId)
            .order('viewed_at', { ascending: false })
            .limit(50);
        setViews(data ?? []);
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-blue-600" />
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">
                            Historique des ouvertures
                        </span>
                        {views.length > 0 && (
                            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                {views.length}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="max-h-80 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : views.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <Eye className="w-8 h-8 mb-2 opacity-30" />
                            <p className="text-sm">Devis pas encore consulté</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                            {views.map((v, i) => (
                                <li key={v.id} className="flex items-center gap-3 px-5 py-3">
                                    <div className="relative flex-shrink-0">
                                        <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-blue-500' : 'bg-gray-300'}`} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-gray-800 dark:text-gray-200 font-medium">
                                            {i === 0 ? 'Dernière ouverture' : `Ouverture n°${views.length - i}`}
                                        </p>
                                        <p className="text-xs text-gray-400 dark:text-gray-500">
                                            {new Date(v.viewed_at).toLocaleString('fr-FR', {
                                                weekday: 'short',
                                                day: 'numeric',
                                                month: 'short',
                                                hour: '2-digit',
                                                minute: '2-digit',
                                            })}
                                        </p>
                                    </div>
                                    <span className="text-xs text-gray-400 flex-shrink-0 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {timeAgo(v.viewed_at)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Footer */}
                {views.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-gray-400 text-center">
                            {views.length} ouverture{views.length > 1 ? 's' : ''} au total
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
