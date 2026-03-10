import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { getDueFollowUps, recordFollowUp } from '../utils/followUpService';
import { generateFollowUpEmail } from '../utils/aiService';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Clock, Send, CheckCircle, Mail, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const STEP_STYLES = [
    { badge: 'bg-blue-100 text-blue-700', border: 'border-blue-200', panel: 'border-blue-200 bg-blue-50 dark:bg-blue-950/20', btn: 'bg-blue-600 hover:bg-blue-700' },
    { badge: 'bg-amber-100 text-amber-700', border: 'border-amber-200', panel: 'border-amber-200 bg-amber-50 dark:bg-amber-950/20', btn: 'bg-amber-600 hover:bg-amber-700' },
    { badge: 'bg-orange-100 text-orange-700', border: 'border-orange-200', panel: 'border-orange-200 bg-orange-50 dark:bg-orange-950/20', btn: 'bg-orange-600 hover:bg-orange-700' },
    { badge: 'bg-gray-100 text-gray-600', border: 'border-gray-300', panel: 'border-gray-200 bg-gray-50 dark:bg-gray-800/50', btn: 'bg-gray-600 hover:bg-gray-700' },
];

const FollowUps = ({ embedded = false }) => {
    const { user } = useAuth();
    const { isTestMode, captureEmail } = useTestMode();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('due');
    const [dueQuotes, setDueQuotes] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState({});   // { [quoteId]: true }
    const [suggestions, setSuggestions] = useState({}); // { [quoteId]: { subject, body } }
    const [expanded, setExpanded] = useState({});       // { [quoteId]: true }

    useEffect(() => {
        if (user) refreshData();
    }, [user, activeTab]);

    const refreshData = () => {
        if (activeTab === 'due') fetchDueQuotes();
        else fetchHistory();
    };

    const fetchDueQuotes = async () => {
        setLoading(true);
        const data = await getDueFollowUps(user.id);
        setDueQuotes(data);
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

    const handleGenerate = async (quote) => {
        try {
            setGenerating(prev => ({ ...prev, [quote.id]: true }));
            const step = quote.next_step;
            const client = quote.clients || { name: 'Client' };
            const emailContent = await generateFollowUpEmail(quote, client, step, {});
            setSuggestions(prev => ({ ...prev, [quote.id]: emailContent }));
            setExpanded(prev => ({ ...prev, [quote.id]: true }));
        } catch (error) {
            toast.error("Erreur génération IA: " + error.message);
        } finally {
            setGenerating(prev => ({ ...prev, [quote.id]: false }));
        }
    };

    const updateSuggestion = (quoteId, field, value) => {
        setSuggestions(prev => ({ ...prev, [quoteId]: { ...prev[quoteId], [field]: value } }));
    };

    const dismissSuggestion = (quoteId) => {
        setSuggestions(prev => { const n = { ...prev }; delete n[quoteId]; return n; });
        setExpanded(prev => { const n = { ...prev }; delete n[quoteId]; return n; });
    };

    const handleSend = async (quote) => {
        const suggestion = suggestions[quote.id];
        if (!suggestion) return;

        const clientEmail = quote.clients?.email;
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
            await recordFollowUp(quote, user.id, body, 'email');
            toast.success("Relance enregistrée !");
            dismissSuggestion(quote.id);
            fetchDueQuotes();
        } catch (err) {
            console.error(err);
            toast.error("Erreur lors de l'enregistrement du suivi");
        }
    };

    const getDaysOverdue = (dueDate) =>
        Math.floor((new Date() - new Date(dueDate)) / (1000 * 60 * 60 * 24));

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
                    {dueQuotes.length === 0 ? (
                        <div className="bg-white dark:bg-gray-900 rounded-xl p-12 text-center border border-gray-100 dark:border-gray-800">
                            <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">Tout est à jour !</h3>
                            <p className="text-gray-500">Aucune relance nécessaire pour le moment.</p>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {dueQuotes.map((quote) => {
                                const stepIdx = quote.next_step?.index ?? 0;
                                const style = STEP_STYLES[Math.min(stepIdx, STEP_STYLES.length - 1)];
                                const daysOverdue = getDaysOverdue(quote.next_step?.due_date);
                                const suggestion = suggestions[quote.id];
                                const isExpanded = !!expanded[quote.id];
                                const isGenerating = !!generating[quote.id];

                                return (
                                    <div key={quote.id} className={`bg-white dark:bg-gray-900 rounded-xl border-2 ${style.border} shadow-sm transition-shadow hover:shadow-md`}>

                                        {/* ── Card header ── */}
                                        <div className="p-5 flex flex-col md:flex-row gap-4">
                                            <div className="flex-1 space-y-2">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className={`${style.badge} px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide`}>
                                                        {quote.next_step?.label}
                                                    </span>
                                                    {daysOverdue > 0 && (
                                                        <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                                                            En retard de {daysOverdue}j
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                                    {quote.clients?.name} — {quote.title}
                                                </h3>
                                                <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-4 h-4" />
                                                        Devis du {new Date(quote.date).toLocaleDateString('fr-FR')}
                                                    </span>
                                                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                                                        {quote.total_ttc} €
                                                    </span>
                                                    {quote.last_followup_at && (
                                                        <span className="text-orange-500">
                                                            Dernière relance : {new Date(quote.last_followup_at).toLocaleDateString('fr-FR')}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ── Action buttons ── */}
                                            <div className="flex items-start gap-2 pt-1 shrink-0">
                                                <button
                                                    onClick={() => navigate(`/app/devis/${quote.id}`)}
                                                    className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                                                >
                                                    Voir devis
                                                </button>

                                                {!suggestion ? (
                                                    <button
                                                        onClick={() => handleGenerate(quote)}
                                                        disabled={isGenerating}
                                                        className={`px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 shadow-sm disabled:opacity-60 transition-opacity ${style.btn}`}
                                                    >
                                                        <Sparkles className="w-4 h-4" />
                                                        {isGenerating ? 'Génération…' : 'Suggérer un message'}
                                                    </button>
                                                ) : (
                                                    <button
                                                        onClick={() => setExpanded(prev => ({ ...prev, [quote.id]: !isExpanded }))}
                                                        className={`px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 shadow-sm ${style.btn}`}
                                                    >
                                                        <Mail className="w-4 h-4" />
                                                        Message prêt
                                                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                    </button>
                                                )}
                                            </div>
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
                                                        onClick={() => handleGenerate(quote)}
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
                                                        onChange={(e) => updateSuggestion(quote.id, 'subject', e.target.value)}
                                                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                    />
                                                </div>

                                                <div>
                                                    <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
                                                    <textarea
                                                        value={suggestion.body}
                                                        onChange={(e) => updateSuggestion(quote.id, 'body', e.target.value)}
                                                        rows={9}
                                                        className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none font-mono leading-relaxed"
                                                    />
                                                </div>

                                                <div className="flex justify-end gap-3 pt-1">
                                                    <button
                                                        onClick={() => dismissSuggestion(quote.id)}
                                                        className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                                                    >
                                                        Annuler
                                                    </button>
                                                    <button
                                                        onClick={() => handleSend(quote)}
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
                            })}
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
