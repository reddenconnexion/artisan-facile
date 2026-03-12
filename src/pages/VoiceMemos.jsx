import React, { useState, useEffect, useCallback } from 'react';
import { Mic, CheckCircle2, XCircle, Loader2, Clock, RefreshCw, ChevronRight, AlertCircle, Sparkles } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const STATUS_CONFIG = {
    pending:     { label: 'En attente',     icon: Clock,        color: 'text-gray-400',  bg: 'bg-gray-50' },
    transcribing:{ label: 'Transcription',  icon: Loader2,      color: 'text-blue-500',  bg: 'bg-blue-50', spin: true },
    processing:  { label: 'Traitement IA',  icon: Sparkles,     color: 'text-purple-500',bg: 'bg-purple-50' },
    done:        { label: 'Traité',          icon: CheckCircle2, color: 'text-green-500', bg: 'bg-green-50' },
    error:       { label: 'Erreur',          icon: XCircle,      color: 'text-red-500',   bg: 'bg-red-50' },
    cancelled:   { label: 'Annulé',          icon: XCircle,      color: 'text-gray-400',  bg: 'bg-gray-50' },
};

const INTENT_LABELS = {
    create_client: 'Création client',
    create_quote: 'Création devis',
    create_invoice: 'Création facture',
    send_invoice: 'Envoi facture',
    create_intervention_report: 'Rapport intervention',
    schedule_appointment: 'Rendez-vous',
    calendar: 'Agenda',
    email: 'Email',
    navigation: 'Navigation',
    unknown: 'Non identifié',
};

const VoiceMemoCard = ({ memo, onRetry }) => {
    const navigate = useNavigate();
    const config = STATUS_CONFIG[memo.status] || STATUS_CONFIG.pending;
    const StatusIcon = config.icon;
    const actions = memo.actions_taken || [];

    return (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between gap-3">
                {/* Status icon */}
                <div className={`mt-0.5 p-2 rounded-lg ${config.bg} flex-shrink-0`}>
                    <StatusIcon
                        size={16}
                        className={`${config.color} ${config.spin ? 'animate-spin' : ''}`}
                    />
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
                        {memo.intent_result?.intent && memo.intent_result.intent !== 'unknown' && (
                            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
                                {INTENT_LABELS[memo.intent_result.intent] || memo.intent_result.intent}
                            </span>
                        )}
                    </div>

                    {/* Transcript */}
                    {memo.transcript && (
                        <p className="text-sm text-gray-700 italic line-clamp-2 mb-2">
                            "{memo.transcript}"
                        </p>
                    )}

                    {/* Actions taken */}
                    {actions.length > 0 && (
                        <div className="space-y-1">
                            {actions.map((action, i) => (
                                <button
                                    key={i}
                                    onClick={() => action.link && navigate(action.link)}
                                    className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                                >
                                    <ChevronRight size={10} />
                                    {action.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* AI response */}
                    {memo.intent_result?.response && actions.length === 0 && (
                        <p className="text-xs text-gray-500 mt-1">{memo.intent_result.response}</p>
                    )}

                    {/* Date */}
                    <p className="text-xs text-gray-400 mt-2">
                        {format(new Date(memo.created_at), "d MMM yyyy 'à' HH:mm", { locale: fr })}
                    </p>
                </div>

                {/* Retry button for errors */}
                {memo.status === 'error' && (
                    <button
                        onClick={() => onRetry(memo.id)}
                        title="Réessayer"
                        className="text-gray-400 hover:text-blue-500 p-1 flex-shrink-0"
                    >
                        <RefreshCw size={14} />
                    </button>
                )}
            </div>
        </div>
    );
};

const VoiceMemos = () => {
    const { user } = useAuth();
    const { plan, usage, remainingVoice, voiceLimit, isPro } = usePlanLimits();
    const [memos, setMemos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const navigate = useNavigate();

    const fetchMemos = useCallback(async () => {
        if (!user) return;
        const { data, error } = await supabase
            .from('voice_memos')
            .select('*')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(50);

        if (!error) setMemos(data || []);
        setLoading(false);
    }, [user]);

    useEffect(() => {
        fetchMemos();

        // Real-time updates for processing memos
        const channel = supabase.channel('voice_memos_changes')
            .on('postgres_changes', {
                event: 'UPDATE',
                schema: 'public',
                table: 'voice_memos',
                filter: `user_id=eq.${user?.id}`,
            }, () => fetchMemos())
            .subscribe();

        return () => supabase.removeChannel(channel);
    }, [fetchMemos, user]);

    const handleRetry = async (memoId) => {
        toast.info('Fonctionnalité de relance en cours de développement');
    };

    const filteredMemos = filter === 'all'
        ? memos
        : memos.filter(m => m.status === filter);

    const statusCounts = memos.reduce((acc, m) => {
        acc[m.status] = (acc[m.status] || 0) + 1;
        return acc;
    }, {});

    const currentMonth = new Date().toLocaleString('fr-FR', { month: 'long', year: 'numeric' });

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Mic size={22} className="text-blue-500" />
                        Mémos vocaux
                    </h1>
                    <p className="text-sm text-gray-500 mt-0.5">Historique de vos enregistrements vocaux</p>
                </div>
                <button
                    onClick={fetchMemos}
                    className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
                    title="Rafraîchir"
                >
                    <RefreshCw size={16} />
                </button>
            </div>

            {/* Usage summary card */}
            <div className={`rounded-xl p-4 mb-5 ${isPro ? 'bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-100' : 'bg-blue-50 border border-blue-100'}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Utilisation — {currentMonth}
                        </p>
                        <p className="text-2xl font-bold text-gray-800 mt-0.5">
                            {usage.voice_memos_count}
                            {!isPro && <span className="text-base font-normal text-gray-400"> / {voiceLimit}</span>}
                            {isPro && <span className="text-base font-normal text-amber-500"> mémos</span>}
                        </p>
                    </div>
                    <div className="text-right">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${isPro ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                            {isPro ? '⭐ Pro' : 'Gratuit'}
                        </span>
                        {!isPro && (
                            <button
                                onClick={() => navigate('/app/subscription')}
                                className="block text-xs text-blue-600 hover:underline mt-1"
                            >
                                Passer en Pro
                            </button>
                        )}
                    </div>
                </div>

                {!isPro && (
                    <div className="mt-3">
                        <div className="h-1.5 rounded-full bg-blue-100 overflow-hidden">
                            <div
                                className="h-full bg-blue-500 rounded-full transition-all"
                                style={{ width: `${Math.min(100, (usage.voice_memos_count / voiceLimit) * 100)}%` }}
                            />
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                            {remainingVoice > 0
                                ? `${remainingVoice} mémo${remainingVoice > 1 ? 's' : ''} restant${remainingVoice > 1 ? 's' : ''} ce mois`
                                : 'Limite atteinte — passez en Pro pour continuer'
                            }
                        </p>
                    </div>
                )}

                {!isPro && (
                    <div className="mt-3 pt-3 border-t border-blue-100">
                        <p className="text-xs text-gray-500 flex items-center gap-1">
                            <AlertCircle size={11} />
                            Plan gratuit : pipeline semi-automatique (formulaires pré-remplis)
                        </p>
                        <p className="text-xs text-blue-600 mt-0.5">
                            Plan Pro : exécution automatique + annulation 30s
                        </p>
                    </div>
                )}
            </div>

            {/* Filter tabs */}
            {memos.length > 0 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                    {[
                        { key: 'all', label: `Tous (${memos.length})` },
                        { key: 'done', label: `Traités (${statusCounts.done || 0})` },
                        { key: 'error', label: `Erreurs (${statusCounts.error || 0})` },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
                                filter === tab.key
                                    ? 'bg-blue-500 text-white'
                                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Memo list */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-blue-400" />
                </div>
            ) : filteredMemos.length === 0 ? (
                <div className="text-center py-12">
                    <Mic size={40} className="mx-auto text-gray-200 mb-3" />
                    <p className="text-gray-400 text-sm">
                        {filter === 'all'
                            ? 'Aucun mémo vocal encore. Appuyez sur le bouton micro pour commencer !'
                            : 'Aucun mémo dans cette catégorie.'
                        }
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredMemos.map(memo => (
                        <VoiceMemoCard key={memo.id} memo={memo} onRetry={handleRetry} />
                    ))}
                </div>
            )}
        </div>
    );
};

export default VoiceMemos;
