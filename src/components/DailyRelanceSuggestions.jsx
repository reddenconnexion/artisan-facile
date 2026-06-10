import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { useUserProfile, useInvalidateCache } from '../hooks/useDataCache';
import {
    getDueFollowUps,
    getFollowUpSettings,
    getRelanceContext,
    recordFollowUp,
    snoozeRelance,
    archiveQuote,
} from '../utils/followUpService';
import { generateFollowUpEmail } from '../utils/aiService';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import {
    Sparkles, Send, Mail, Clock, ChevronRight, MailOpen, Eye, EyeOff, Loader2, CalendarClock, Trash2, History,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import QuoteViewHistory from './QuoteViewHistory';
import RelanceHistory from './RelanceHistory';

const SNOOZE_OPTIONS = [
    { label: '3 jours', days: 3 },
    { label: '1 semaine', days: 7 },
    { label: '2 semaines', days: 14 },
];

/**
 * « Suggestions de relance du jour » — panneau du tableau de bord.
 *
 * Présente chaque jour les relances dues sous forme de suggestions prêtes à
 * traiter : Valider (rédiger puis envoyer), Modifier (éditer le brouillon
 * avant envoi) ou Reporter (snooze). Les brouillons sont générés à la demande
 * (au clic) pour ne pas consommer de quota IA inutilement.
 *
 * Réutilise toute la mécanique du Centre de Relance (génération IA enrichie de
 * l'historique client, envoi SMTP via l'edge function avec repli mailto,
 * enregistrement du suivi). Ne s'affiche pas quand il n'y a rien à relancer.
 */
const DailyRelanceSuggestions = () => {
    const { user } = useAuth();
    const { isTestMode, captureEmail } = useTestMode();
    const { data: profile } = useUserProfile();
    const { invalidateQuotes } = useInvalidateCache();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [dueQuotes, setDueQuotes] = useState([]);
    const [openMap, setOpenMap] = useState({}); // quote_id -> { opened, openCount }
    const [generating, setGenerating] = useState({});
    const [drafts, setDrafts] = useState({});
    const [expanded, setExpanded] = useState({});
    const [sending, setSending] = useState({});
    const [snoozing, setSnoozing] = useState({});
    const [snoozeMenu, setSnoozeMenu] = useState(null); // { key, quotes, top, right }
    const [archiving, setArchiving] = useState({});
    const [historyQuoteId, setHistoryQuoteId] = useState(null);
    const [relanceHistoryIds, setRelanceHistoryIds] = useState(null); // quote ids du groupe

    const aiContext = useMemo(() => ({
        companyName: profile?.company_name || '',
        userName: profile?.full_name || profile?.first_name || '',
        persuasionLevel: profile?.follow_up_settings?.persuasion_level || 'soft',
    }), [profile]);

    const isTestQuote = useCallback(
        (q) => !isTestMode && q.clients?.name?.includes('⚗️'),
        [isTestMode],
    );

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [data] = await Promise.all([
                getDueFollowUps(user.id),
                getFollowUpSettings(user.id), // amorce les réglages par défaut si absents
            ]);
            const filtered = (data || []).filter(q => !isTestQuote(q));
            setDueQuotes(filtered);

            // Engagement e-mail : une seule requête pour tous les devis dus.
            const ids = filtered.map(q => q.id);
            if (ids.length > 0) {
                const { data: stats } = await supabase
                    .from('email_send_stats')
                    .select('quote_id, open_count')
                    .in('quote_id', ids);
                const map = {};
                (stats || []).forEach(s => {
                    const cur = map[s.quote_id] || { opened: false, openCount: 0 };
                    cur.openCount += s.open_count || 0;
                    cur.opened = cur.openCount > 0;
                    map[s.quote_id] = cur;
                });
                setOpenMap(map);
            } else {
                setOpenMap({});
            }
        } catch (e) {
            console.error('DailyRelanceSuggestions load failed', e);
        } finally {
            setLoading(false);
        }
    }, [user, isTestQuote]);

    useEffect(() => {
        if (user) load();
    }, [user, load]);

    // Regroupe les devis dus par client (un client = une carte, même s'il a
    // plusieurs devis en attente → e-mail groupé).
    const groups = useMemo(() => {
        const g = {};
        dueQuotes.forEach(q => {
            const cid = q.client_id || `q_${q.id}`;
            if (!g[cid]) g[cid] = { key: String(cid), client: q.clients, quotes: [] };
            g[cid].quotes.push(q);
        });
        return Object.values(g);
    }, [dueQuotes]);

    const handleGenerate = async (key, quotes) => {
        try {
            setGenerating(prev => ({ ...prev, [key]: true }));
            const ref = quotes[0];
            const step = { ...(ref.next_step || {}), index: ref.next_step?.index ?? 0 };
            const client = ref.clients || { name: 'Client' };
            const relanceContext = await getRelanceContext(ref, user.id);
            const draft = await generateFollowUpEmail(quotes, client, step, { ...aiContext, relanceContext });
            setDrafts(prev => ({ ...prev, [key]: draft }));
            setExpanded(prev => ({ ...prev, [key]: true }));
        } catch (e) {
            toast.error('Erreur génération IA : ' + e.message);
        } finally {
            setGenerating(prev => ({ ...prev, [key]: false }));
        }
    };

    const updateDraft = (key, field, value) => {
        setDrafts(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    };

    const removeGroup = (key) => {
        setDueQuotes(prev => prev.filter(q => String(q.client_id || `q_${q.id}`) !== key));
    };

    const handleSnooze = async (key, quotes, days) => {
        setSnoozing(prev => ({ ...prev, [key]: true }));
        try {
            await Promise.all(quotes.map(q => snoozeRelance(q.id, user.id, days)));
            toast.success(`Relance reportée de ${days} jour${days > 1 ? 's' : ''}`);
            removeGroup(key);
            invalidateQuotes(); // rafraîchit le compteur "Devis à relancer" du tableau de bord
        } catch (e) {
            toast.error('Report impossible : ' + e.message);
        } finally {
            setSnoozing(prev => ({ ...prev, [key]: false }));
            setSnoozeMenu(null);
        }
    };

    // Ouvre/ferme le menu « Reporter ». Positionné via portail (fixed) pour ne
    // pas être rogné par l'overflow du panneau ni sortir de l'écran sur mobile.
    const toggleSnoozeMenu = (e, key, quotes) => {
        if (snoozeMenu?.key === key) {
            setSnoozeMenu(null);
            return;
        }
        const r = e.currentTarget.getBoundingClientRect();
        setSnoozeMenu({
            key,
            quotes,
            top: r.bottom + 4,
            right: Math.max(8, window.innerWidth - r.right),
        });
    };

    const handleArchive = async (key, quotes) => {
        const label = quotes.length > 1
            ? `${quotes.length} devis seront archivés et ne seront plus relancés. Continuer ?`
            : 'Ce devis sera archivé et ne sera plus relancé. Continuer ?';
        if (!window.confirm(label)) return;

        setArchiving(prev => ({ ...prev, [key]: true }));
        try {
            await Promise.all(quotes.map(q => archiveQuote(q.id, user.id)));
            toast.success(quotes.length > 1 ? 'Devis archivés' : 'Devis archivé');
            removeGroup(key);
            invalidateQuotes(); // rafraîchit le compteur "Devis à relancer" du tableau de bord
        } catch (e) {
            toast.error('Archivage impossible : ' + e.message);
        } finally {
            setArchiving(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleSend = async (key, quotes) => {
        const draft = drafts[key];
        if (!draft) return;
        const clientEmail = quotes[0].clients?.email;
        if (!clientEmail) {
            toast.error("Le client n'a pas d'email !");
            return;
        }

        const { subject, body } = draft;
        const smtpConfigured = !!profile?.smtp_config?.host && !!profile?.smtp_config?.from_email;
        const mailtoUrl = `mailto:${clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        setSending(prev => ({ ...prev, [key]: true }));

        if (isTestMode) {
            captureEmail({ email: clientEmail, subject, body });
            toast.success('📬 Relance capturée dans l\'inbox test', { duration: 4000 });
        } else if (smtpConfigured) {
            const sendingToast = toast.loading('Envoi de la relance depuis votre adresse pro...');
            try {
                const { data: { session } } = await supabase.auth.getSession();
                const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
                const res = await fetch(`${supabaseUrl}/functions/v1/send-document-email`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`,
                    },
                    body: JSON.stringify({
                        to: clientEmail,
                        subject,
                        text: body,
                        quote_id: quotes[0].id,
                        client_id: quotes[0].client_id,
                    }),
                });
                const result = await res.json();
                toast.dismiss(sendingToast);
                if (!res.ok) throw new Error(result.error || 'Échec de l\'envoi');
                toast.success(`Relance envoyée à ${clientEmail}`);
            } catch (err) {
                toast.dismiss(sendingToast);
                console.error('Direct follow-up send failed:', err);
                toast.error((err.message || 'Échec de l\'envoi direct') + ' — ouverture du client mail');
                window.location.href = mailtoUrl;
            }
        } else {
            window.location.href = mailtoUrl;
        }

        try {
            for (const quote of quotes) {
                const stepIdx = quote.next_step?.index ?? 0;
                await recordFollowUp(quote, user.id, body, 'email', stepIdx + 1);
            }
            toast.success('Relance enregistrée !');
            removeGroup(key);
            invalidateQuotes(); // rafraîchit le compteur "Devis à relancer" du tableau de bord
        } catch (err) {
            console.error(err);
            toast.error("Erreur lors de l'enregistrement du suivi");
        } finally {
            setSending(prev => ({ ...prev, [key]: false }));
        }
    };

    // Rien à relancer (ou chargement) → on n'affiche pas le widget.
    if (loading || groups.length === 0) return null;

    const totalCount = groups.length;

    return (
        <>
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-amber-200/70 dark:border-amber-700/30 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-amber-100 dark:border-amber-900/30 bg-gradient-to-r from-amber-50 to-orange-50/40 dark:from-amber-900/20 dark:to-orange-900/10 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/40">
                        <Sparkles className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                            Suggestions de relance du jour
                        </h3>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400">
                            {totalCount} suggestion{totalCount > 1 ? 's' : ''} — validez, modifiez ou reportez
                        </p>
                    </div>
                </div>
                <button
                    onClick={() => navigate('/app/devis', { state: { filter: 'followups' } })}
                    className="text-xs text-amber-700 dark:text-amber-400 hover:opacity-70 flex items-center gap-0.5 font-medium"
                >
                    Centre de relance <ChevronRight size={13} />
                </button>
            </div>

            <div className="divide-y divide-gray-100 dark:divide-white/10">
                {groups.map(({ key, client, quotes }) => {
                    const ref = quotes[0];
                    const isGrouped = quotes.length > 1;
                    const draft = drafts[key];
                    const isExpanded = !!expanded[key];
                    const isGenerating = !!generating[key];
                    const isSending = !!sending[key];
                    const isSnoozing = !!snoozing[key];
                    const isArchiving = !!archiving[key];
                    const stepLabel = ref.next_step?.label || 'Relance';
                    const engagement = openMap[ref.id];
                    const dueDate = ref.next_step?.due_date ? new Date(ref.next_step.due_date) : null;
                    const daysOverdue = dueDate
                        ? Math.floor((new Date() - dueDate) / (1000 * 60 * 60 * 24))
                        : 0;
                    const totalAmount = quotes.reduce((s, q) => s + (Number(q.total_ttc) || 0), 0);
                    const pastRelances = quotes.reduce((s, q) => s + (q.follow_up_count || 0), 0);

                    return (
                        <div key={key} className="p-4">
                            <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                                <div className="flex-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2 mb-1">
                                        <span className="font-semibold text-gray-900 dark:text-white truncate">
                                            {client?.name || 'Client'}
                                        </span>
                                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                            {stepLabel}
                                        </span>
                                        {isGrouped && (
                                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                                {quotes.length} devis
                                            </span>
                                        )}
                                        {daysOverdue > 0 && (
                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 flex items-center gap-0.5">
                                                <Clock className="w-2.5 h-2.5" /> +{daysOverdue}j
                                            </span>
                                        )}
                                        {engagement && (
                                            engagement.opened ? (
                                                <button
                                                    type="button"
                                                    onClick={() => setHistoryQuoteId(ref.id)}
                                                    className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 hover:bg-emerald-200 dark:hover:bg-emerald-900/60 flex items-center gap-0.5 cursor-pointer transition-colors"
                                                    title="Voir l'historique des ouvertures"
                                                >
                                                    <Eye className="w-2.5 h-2.5" /> consulté
                                                </button>
                                            ) : (
                                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 flex items-center gap-0.5" title="Aucune ouverture détectée">
                                                    <EyeOff className="w-2.5 h-2.5" /> non ouvert
                                                </span>
                                            )
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                        {isGrouped
                                            ? quotes.map(q => q.title || 'Travaux').join(' · ')
                                            : (ref.title || 'Travaux')}
                                        <span className="font-semibold text-gray-700 dark:text-gray-300"> — {totalAmount.toFixed(0)} €</span>
                                    </p>
                                    {pastRelances > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setRelanceHistoryIds(quotes.map(q => q.id))}
                                            className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline"
                                            title="Voir l'historique des relances passées"
                                        >
                                            <History className="w-3 h-3" />
                                            {pastRelances} relance{pastRelances > 1 ? 's' : ''} envoyée{pastRelances > 1 ? 's' : ''} — voir l'historique
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {/* Archiver */}
                                    <button
                                        onClick={() => handleArchive(key, quotes)}
                                        disabled={isArchiving}
                                        className="p-1.5 text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 bg-gray-50 dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-60"
                                        title={quotes.length > 1 ? 'Archiver ces devis' : 'Archiver ce devis'}
                                    >
                                        {isArchiving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                                    </button>

                                    {/* Reporter */}
                                    <button
                                        onClick={(e) => toggleSnoozeMenu(e, key, quotes)}
                                        disabled={isSnoozing}
                                        className="px-2.5 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-1"
                                        title="Reporter la relance"
                                    >
                                        {isSnoozing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarClock className="w-3.5 h-3.5" />}
                                        <span className="hidden sm:inline">Reporter</span>
                                    </button>

                                    {/* Préparer / Modifier */}
                                    {!draft ? (
                                        <button
                                            onClick={() => handleGenerate(key, quotes)}
                                            disabled={isGenerating}
                                            className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                                        >
                                            {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                                            {isGenerating ? 'Rédaction…' : 'Préparer'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={() => setExpanded(prev => ({ ...prev, [key]: !isExpanded }))}
                                            className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center gap-1.5 shadow-sm"
                                        >
                                            <Mail className="w-3.5 h-3.5" />
                                            {isExpanded ? 'Réduire' : 'Modifier'}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Éditeur du brouillon */}
                            {draft && isExpanded && (
                                <div className="mt-3 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/10 p-3 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide flex items-center gap-1">
                                            <MailOpen className="w-3 h-3" /> Brouillon — personnalisé selon l'historique
                                        </span>
                                        <button
                                            onClick={() => handleGenerate(key, quotes)}
                                            disabled={isGenerating}
                                            className="text-[11px] text-amber-600 dark:text-amber-400 hover:opacity-70 disabled:opacity-50"
                                        >
                                            {isGenerating ? 'Régénération…' : '↺ Régénérer'}
                                        </button>
                                    </div>
                                    <input
                                        type="text"
                                        value={draft.subject || ''}
                                        onChange={(e) => updateDraft(key, 'subject', e.target.value)}
                                        placeholder="Objet"
                                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none"
                                    />
                                    <textarea
                                        value={draft.body || ''}
                                        onChange={(e) => updateDraft(key, 'body', e.target.value)}
                                        rows={8}
                                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 dark:bg-gray-800 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none leading-relaxed"
                                    />
                                    <div className="flex justify-end">
                                        <button
                                            onClick={() => handleSend(key, quotes)}
                                            disabled={isSending}
                                            className="px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg flex items-center gap-2 shadow disabled:opacity-60"
                                        >
                                            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                            Valider et envoyer
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>

        {snoozeMenu && createPortal(
            <>
                {/* Fond transparent pour fermer au clic en dehors */}
                <div className="fixed inset-0 z-40" onClick={() => setSnoozeMenu(null)} />
                <div
                    className="fixed z-50 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[130px]"
                    style={{ top: snoozeMenu.top, right: snoozeMenu.right }}
                >
                    {SNOOZE_OPTIONS.map(opt => (
                        <button
                            key={opt.days}
                            onClick={() => handleSnooze(snoozeMenu.key, snoozeMenu.quotes, opt.days)}
                            className="w-full text-left px-3 py-2 text-xs text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </>,
            document.body
        )}

        {historyQuoteId && createPortal(
            <QuoteViewHistory
                quoteId={historyQuoteId}
                onClose={() => setHistoryQuoteId(null)}
            />,
            document.body
        )}

        {relanceHistoryIds && createPortal(
            <RelanceHistory
                quoteIds={relanceHistoryIds}
                onClose={() => setRelanceHistoryIds(null)}
            />,
            document.body
        )}
        </>
    );
};

export default DailyRelanceSuggestions;
