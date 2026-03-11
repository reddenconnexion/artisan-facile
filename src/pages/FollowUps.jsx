import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { getDueFollowUps, recordFollowUp, getFollowUpSettings } from '../utils/followUpService';
import { generateFollowUpEmail } from '../utils/aiService';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Clock, Send, CheckCircle, Mail, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STEP_STYLES = [
    { badge: 'bg-blue-100 text-blue-700', activeBadge: 'bg-blue-600 text-white', border: 'border-blue-200', panel: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20', btn: 'bg-blue-600 hover:bg-blue-700' },
    { badge: 'bg-amber-100 text-amber-700', activeBadge: 'bg-amber-500 text-white', border: 'border-amber-200', panel: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20', btn: 'bg-amber-600 hover:bg-amber-700' },
    { badge: 'bg-orange-100 text-orange-700', activeBadge: 'bg-orange-500 text-white', border: 'border-orange-200', panel: 'border-orange-200 bg-orange-50 dark:bg-orange-950/20', btn: 'bg-orange-600 hover:bg-orange-700' },
    { badge: 'bg-gray-100 text-gray-600', activeBadge: 'bg-gray-600 text-white', border: 'border-gray-300', panel: 'border-gray-200 bg-gray-50 dark:bg-gray-800/50', btn: 'bg-gray-600 hover:bg-gray-700' },
];

const getStyle = (idx) => STEP_STYLES[Math.min(idx, STEP_STYLES.length - 1)];

const FollowUps = ({ embedded = false }) => {
    const { user } = useAuth();
    const { isTestMode, captureEmail } = useTestMode();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('due');
    const [dueQuotes, setDueQuotes] = useState([]);
    const [availableSteps, setAvailableSteps] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState({});
    const [suggestions, setSuggestions] = useState({});
    const [expanded, setExpanded] = useState({});
    const [stepOverrides, setStepOverrides] = useState({});

    // Group due quotes by client — clients with multiple quotes get a single grouped card
    const groupedDueQuotes = useMemo(() => {
        const groups = {};
        dueQuotes.forEach(q => {
            const cid = q.client_id || q.id; // fallback to quote id if no client_id
            if (!groups[cid]) groups[cid] = { clientId: cid, client: q.clients, quotes: [] };
            groups[cid].quotes.push(q);
        });
        return Object.values(groups);
    }, [dueQuotes]);

    useEffect(() => {
        if (user) refreshData();
    }, [user, activeTab]);

    const refreshData = () => {
        if (activeTab === 'due') fetchDueQuotes();
        else fetchHistory();
    };

    const fetchDueQuotes = async () => {
        setLoading(true);
        const [data, settings] = await Promise.all([
            getDueFollowUps(user.id),
            getFollowUpSettings(user.id),
        ]);
        setDueQuotes(data);
        setAvailableSteps(settings.steps || []);
        // Initialise les overrides à l'étape automatique de chaque devis
        const initialOverrides = {};
        data.forEach(q => { initialOverrides[q.id] = q.next_step?.index ?? 0; });
        setStepOverrides(initialOverrides);
        setLoading(false);
    };

    const fetchHistory = async () => {
        setLoading(true);
        const { data, error } = await supabase
            .from('quote_follow_ups')
            .select(`*, quotes (id, title, total_ttc, clients (name))`)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });
        if (error) toast.error("Erreur chargement historique");
        else setHistory(data || []);
        setLoading(false);
    };

    const handleStepChange = (key, idx) => {
        setStepOverrides(prev => ({ ...prev, [key]: idx }));
        setSuggestions(prev => { const n = { ...prev }; delete n[key]; return n; });
        setExpanded(prev => { const n = { ...prev }; delete n[key]; return n; });
    };

    const getEffectiveStep = (key, referenceQuote) => {
        const idx = stepOverrides[key] ?? referenceQuote?.next_step?.index ?? 0;
        const stepData = availableSteps[idx] ?? referenceQuote?.next_step;
        return { ...stepData, index: idx };
    };

    const handleGenerate = async (key, quotes) => {
        try {
            setGenerating(prev => ({ ...prev, [key]: true }));
            const step = getEffectiveStep(key, quotes[0]);
            const client = quotes[0].clients || { name: 'Client' };
            const emailContent = await generateFollowUpEmail(quotes, client, step, {});
            setSuggestions(prev => ({ ...prev, [key]: emailContent }));
            setExpanded(prev => ({ ...prev, [key]: true }));
        } catch (error) {
            toast.error("Erreur génération IA: " + error.message);
        } finally {
            setGenerating(prev => ({ ...prev, [key]: false }));
        }
    };

    const updateSuggestion = (key, field, value) => {
        setSuggestions(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));
    };

    const dismissSuggestion = (key) => {
        setSuggestions(prev => { const n = { ...prev }; delete n[key]; return n; });
        setExpanded(prev => { const n = { ...prev }; delete n[key]; return n; });
    };

    const handleSend = async (key, quotes) => {
        const suggestion = suggestions[key];
        if (!suggestion) return;

        const clientEmail = quotes[0].clients?.email;
        if (!clientEmail) {
            toast.error("Le client n'a pas d'email !");
            return;
        }

        const { subject, body } = suggestion;
        if (isTestMode) {
            captureEmail({ email: clientEmail, subject, body });
            toast.success('📬 Relance capturée dans l\'inbox test', { duration: 4000 });
        } else {
            window.location.href = `mailto:${clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        }

        try {
            // Record follow-up for each quote in the group
            for (const quote of quotes) {
                const overrideIdx = stepOverrides[key] ?? quote.next_step?.index ?? 0;
                await recordFollowUp(quote, user.id, body, 'email', overrideIdx + 1);
            }
            toast.success("Relance enregistrée !");
            dismissSuggestion(key);
            fetchDueQuotes();
        } catch (err) {
            console.error(err);
            toast.error("Erreur lors de l'enregistrement du suivi");
        }
    };

    const getDaysOverdue = (dueDate) =>
        Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24));

    const renderCard = (group) => {
        const { clientId, client, quotes } = group;
        const isGrouped = quotes.length > 1;
        const cardKey = isGrouped ? `group_${clientId}` : quotes[0].id;
        const referenceQuote = quotes[0];

        const activeIdx = stepOverrides[cardKey] ?? referenceQuote.next_step?.index ?? 0;
        const style = getStyle(activeIdx);
        const suggestion = suggestions[cardKey];
        const isExpanded = !!expanded[cardKey];
        const isGenerating = !!generating[cardKey];

        // For single quote, show overdue badge
        const daysOverdue = !isGrouped ? getDaysOverdue(referenceQuote.next_step?.due_date) : 0;

        return (
            <div key={cardKey} className={`bg-white dark:bg-gray-900 rounded-xl border-2 ${style.border} shadow-sm transition-shadow hover:shadow-md`}>

                {/* ── Card header ── */}
                <div className="p-5 flex flex-col gap-3">
                    <div className="flex flex-col md:flex-row md:items-start gap-3">
                        <div className="flex-1 space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                                {!isGrouped && daysOverdue > 0 && (
                                    <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                                        En retard de {daysOverdue}j
                                    </span>
                                )}
                                {isGrouped && (
                                    <span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                                        {quotes.length} devis — 1 email groupé
                                    </span>
                                )}
                            </div>
                            <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                {client?.name || 'Client'}
                                {!isGrouped && ` — ${referenceQuote.title}`}
                            </h3>

                            {isGrouped ? (
                                // Grouped: list all quotes
                                <ul className="space-y-0.5">
                                    {quotes.map(q => (
                                        <li key={q.id} className="flex items-center gap-2 text-sm text-gray-500">
                                            <span className="text-gray-300">•</span>
                                            <span>{q.title}</span>
                                            <span className="font-semibold text-gray-700 dark:text-gray-300">{q.total_ttc} €</span>
                                            <button
                                                onClick={() => navigate(`/app/devis/${q.id}`)}
                                                className="text-blue-500 hover:underline text-xs ml-1"
                                            >
                                                voir
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                // Single: show date, amount, last follow-up
                                <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                    <span className="flex items-center gap-1">
                                        <Clock className="w-4 h-4" />
                                        Devis du {new Date(referenceQuote.date).toLocaleDateString('fr-FR')}
                                    </span>
                                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                                        {referenceQuote.total_ttc} €
                                    </span>
                                    {referenceQuote.last_followup_at && (
                                        <span className="text-orange-500">
                                            Dernière relance : {new Date(referenceQuote.last_followup_at).toLocaleDateString('fr-FR')}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ── Action buttons ── */}
                        <div className="flex items-start gap-2 shrink-0">
                            {!isGrouped && (
                                <button
                                    onClick={() => navigate(`/app/devis/${referenceQuote.id}`)}
                                    className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                                >
                                    Voir devis
                                </button>
                            )}
                            {!suggestion ? (
                                <button
                                    onClick={() => handleGenerate(cardKey, quotes)}
                                    disabled={isGenerating}
                                    className={`px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 shadow-sm disabled:opacity-60 transition-opacity ${style.btn}`}
                                >
                                    <Sparkles className="w-4 h-4" />
                                    {isGenerating ? 'Génération…' : 'Suggérer un message'}
                                </button>
                            ) : (
                                <button
                                    onClick={() => setExpanded(prev => ({ ...prev, [cardKey]: !isExpanded }))}
                                    className={`px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 shadow-sm ${style.btn}`}
                                >
                                    <Mail className="w-4 h-4" />
                                    Message prêt
                                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* ── Sélecteur d'étape ── */}
                    {availableSteps.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-xs text-gray-400 mr-1">Étape :</span>
                            {availableSteps.map((step, idx) => {
                                const s = getStyle(idx);
                                const isActive = activeIdx === idx;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleStepChange(cardKey, idx)}
                                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                                            isActive
                                                ? s.activeBadge + ' shadow-sm'
                                                : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        {step.label}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── Inline email suggestion panel ── */}
                {suggestion && isExpanded && (
                    <div className={`border-t-2 ${style.panel} rounded-b-xl p-5 space-y-3`}>
                        <div className="flex justify-between items-center">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                                <Sparkles className="w-3.5 h-3.5" />
                                Suggestion IA — modifiable avant envoi
                            </p>
                            <button
                                onClick={() => handleGenerate(cardKey, quotes)}
                                disabled={isGenerating}
                                className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-50"
                            >
                                {isGenerating ? 'Régénération…' : '↺ Régénérer'}
                            </button>
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Objet</label>
                            <input
                                type="text"
                                value={suggestion.subject}
                                onChange={(e) => updateSuggestion(cardKey, 'subject', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
                            <textarea
                                value={suggestion.body}
                                onChange={(e) => updateSuggestion(cardKey, 'body', e.target.value)}
                                rows={9}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono leading-relaxed"
                            />
                        </div>

                        <div className="flex justify-end gap-3 pt-1">
                            <button
                                onClick={() => dismissSuggestion(cardKey)}
                                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => handleSend(cardKey, quotes)}
                                className={`px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 shadow ${style.btn}`}
                            >
                                <Send className="w-4 h-4" />
                                Envoyer l'email
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={embedded ? 'space-y-6' : 'max-w-6xl mx-auto space-y-6'}>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {!embedded && (
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Send className="w-6 h-6 text-blue-600" />
                        Centre de Relance
                    </h1>
                )}
                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('due')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'due'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        À Relancer ({dueQuotes.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'history'
                            ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Historique
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-12 text-gray-500">Chargement...</div>
            ) : activeTab === 'due' ? (
                <div className="space-y-4">
                    {groupedDueQuotes.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 rounded-xl p-12 text-center border border-gray-100 dark:border-gray-800">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Tout est à jour !</h3>
                            <p className="text-gray-500">Aucune relance nécessaire pour le moment.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {groupedDueQuotes.map(renderCard)}
                        </div>
                    )}
                </div>
            ) : (
                <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Client</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Devis</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-800">
                            {history.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString().slice(0, 5)}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white font-medium">
                                        {item.quotes?.clients?.name || '-'}
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        N°{item.quote_id} - {item.quotes?.total_ttc}€
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                                            {item.method === 'email' ? 'Email' : item.method} (Niv. {item.follow_up_number})
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-sm text-gray-500">
                                        <button onClick={() => navigate(`/app/devis/${item.quote_id}`)} className="text-blue-600 hover:underline">
                                            Voir
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {history.length === 0 && (
                        <div className="p-8 text-center text-gray-500">Aucun historique disponible</div>
                    )}
                </div>
            )}
        </div>
    );
};

export default FollowUps;
