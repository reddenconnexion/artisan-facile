import React, { useState, useEffect } from 'react';
import { History, X, Mail, Phone, MessageSquare, Clock } from 'lucide-react';
import { supabase } from '../utils/supabase';

function timeAgo(dateStr) {
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return "À l'instant";
    if (diff < 3600) return `Il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 7) return `Il y a ${Math.floor(diff / 86400)} j`;
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function MethodIcon({ method }) {
    if (method === 'phone') return <Phone className="w-3.5 h-3.5" />;
    if (method === 'sms') return <MessageSquare className="w-3.5 h-3.5" />;
    return <Mail className="w-3.5 h-3.5" />;
}

function methodLabel(method) {
    if (method === 'phone') return 'Téléphone';
    if (method === 'sms') return 'SMS';
    return 'Email';
}

/**
 * « Historique des relances » — modal listant les relances déjà envoyées pour
 * un devis (ou un groupe de devis d'un même client). Réutilise la table
 * `quote_follow_ups`. S'ouvre depuis les suggestions de relance du tableau de
 * bord ainsi que depuis le Centre de relance.
 */
export default function RelanceHistory({ quoteIds, onClose }) {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const ids = (quoteIds || []).filter(Boolean);
        if (ids.length === 0) {
            setItems([]);
            setLoading(false);
            return;
        }
        let cancelled = false;
        (async () => {
            setLoading(true);
            const { data } = await supabase
                .from('quote_follow_ups')
                .select('id, quote_id, follow_up_number, content, method, created_at')
                .in('quote_id', ids)
                .order('created_at', { ascending: false })
                .limit(50);
            if (!cancelled) {
                setItems(data ?? []);
                setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [quoteIds]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
            <div
                className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800">
                    <div className="flex items-center gap-2">
                        <History className="w-4 h-4 text-amber-600" />
                        <span className="font-semibold text-gray-900 dark:text-white text-sm">
                            Historique des relances
                        </span>
                        {items.length > 0 && (
                            <span className="bg-amber-100 text-amber-700 text-xs font-bold px-2 py-0.5 rounded-full">
                                {items.length}
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
                <div className="max-h-96 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center py-10">
                            <div className="w-5 h-5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <History className="w-8 h-8 mb-2 opacity-30" />
                            <p className="text-sm">Aucune relance envoyée pour l'instant</p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-50 dark:divide-gray-800">
                            {items.map((it, i) => (
                                <li key={it.id} className="px-5 py-3">
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/30 px-2 py-0.5 rounded-full">
                                            <MethodIcon method={it.method} />
                                            {methodLabel(it.method)} — Niv. {it.follow_up_number}
                                        </span>
                                        <span className="text-xs text-gray-400 flex items-center gap-1 flex-shrink-0">
                                            <Clock className="w-3 h-3" />
                                            {timeAgo(it.created_at)}
                                        </span>
                                    </div>
                                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mb-1">
                                        {new Date(it.created_at).toLocaleString('fr-FR', {
                                            weekday: 'short',
                                            day: 'numeric',
                                            month: 'short',
                                            hour: '2-digit',
                                            minute: '2-digit',
                                        })}
                                    </p>
                                    {it.content && (
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line line-clamp-4">
                                            {it.content}
                                        </p>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>

                {/* Footer */}
                {items.length > 0 && (
                    <div className="px-5 py-3 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-800">
                        <p className="text-xs text-gray-400 text-center">
                            {items.length} relance{items.length > 1 ? 's' : ''} envoyée{items.length > 1 ? 's' : ''}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
