import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { getDueFollowUps, recordFollowUp } from '../utils/followUpService';
import { generateFollowUpEmail } from '../utils/aiService';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Clock, Send, CheckCircle, Mail, AlertTriangle, ChevronRight, History } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const FollowUps = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState('due'); // 'due' or 'history'
    const [dueQuotes, setDueQuotes] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState(null); // ID of quote being generated
    const [preview, setPreview] = useState(null); // { quoteId, subject, body }

    useEffect(() => {
        if (user) {
            refreshData();
        }
    }, [user, activeTab]);

    const refreshData = () => {
        if (activeTab === 'due') {
            fetchDueQuotes();
        } else {
            fetchHistory();
        }
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
            .select(`
                *,
                quotes (id, title, total_ttc),
                quotes:quotes (clients (name))
            `)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error(error);
            toast.error("Erreur chargement historique");
        } else {
            setHistory(data || []);
        }
        setLoading(false);
    };

    const handleGenerateEmail = async (quote) => {
        try {
            setGenerating(quote.id);
            setPreview(null); // Clear previous
            const step = quote.next_step;

            // Generate content
            const client = quote.clients || { name: 'Client' };
            const emailContent = await generateFollowUpEmail(quote, client, step, {}); // Pass user settings context if needed (handled in aiService via localStorage fallback)

            setPreview({
                quoteId: quote.id,
                quote,
                step,
                subject: emailContent.subject,
                body: emailContent.body
            });

        } catch (error) {
            toast.error("Erreur gnration IA: " + error.message);
        } finally {
            setGenerating(null);
        }
    };

    const handleSend = async () => {
        if (!preview) return;

        const { quote, subject, body, step } = preview;
        const clientEmail = quote.clients?.email;

        if (!clientEmail) {
            toast.error("Le client n'a pas d'email !");
            return;
        }

        // 1. Open Mail Client
        const mailtoUrl = `mailto:${clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.location.href = mailtoUrl;

        // 2. Record Action (Optimistic update or confirm dialog? 
        // For simplicity, we assume user sends it. 
        // Could ask "Did you send it?" but better flow is auto-log for MVP.)

        // Let's add a small confirmation toast with "Undo" or just direct record.
        // Or better: record it now.
        try {
            await recordFollowUp(quote, user.id, body, 'email');
            toast.success("Relance enregistrée !");
            setPreview(null);
            fetchDueQuotes(); // Refresh list
        } catch (err) {
            console.error(err);
            toast.error("Erreur lors de l'enregistrement du suivi");
        }
    };

    const closePreview = () => setPreview(null);

    return (
        <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Send className="w-6 h-6 text-blue-600" />
                    Centre de Relance
                </h1>

                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
                    <button
                        onClick={() => setActiveTab('due')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'due'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        À Relancer ({dueQuotes.length})
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all ${activeTab === 'history'
                                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700'
                            }`}
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
                            {dueQuotes.map((quote) => (
                                <div key={quote.id} className="bg-white dark:bg-gray-900 p-6 rounded-xl border border-gray-200 dark:border-gray-800 shadow-sm flex flex-col md:flex-row gap-6 hover:shadow-md transition-shadow">
                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center justify-between">
                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold uppercase tracking-wide">
                                                {quote.next_step?.label}
                                            </span>
                                            <span className="text-sm text-gray-500 flex items-center">
                                                <Clock className="w-4 h-4 mr-1" />
                                                Devis du {new Date(quote.date).toLocaleDateString()}
                                            </span>
                                        </div>
                                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                                            {quote.clients?.name} - {quote.title}
                                        </h3>
                                        <div className="text-sm text-gray-500">
                                            Montant: <span className="font-medium text-gray-900 dark:text-white">{quote.total_ttc}€</span>
                                            {quote.last_followup_at && (
                                                <span className="ml-4 text-orange-600">
                                                    Dernière relance : {new Date(quote.last_followup_at).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={() => navigate(`/app/devis/${quote.id}`)}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                                        >
                                            Voir le devis
                                        </button>
                                        <button
                                            onClick={() => handleGenerateEmail(quote)}
                                            disabled={generating === quote.id}
                                            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center shadow-sm disabled:opacity-50"
                                        >
                                            {generating === quote.id ? 'Génération...' : 'Relancer par Email'}
                                            <Send className="w-4 h-4 ml-2" />
                                        </button>
                                    </div>
                                </div>
                            ))}
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

            {/* Modal Preview */}
            {preview && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 w-full max-w-2xl rounded-xl shadow-2xl flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex justify-between items-center">
                            <h3 className="text-xl font-bold dark:text-white">Aperçu de l'Email</h3>
                            <button onClick={closePreview} className="text-gray-400 hover:text-gray-600">
                                <AlertTriangle className="w-6 h-6 rotate-45" /> {/* Using generic icon as close X substitute or just X */}
                                Fermer
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Objet</label>
                                <input
                                    type="text"
                                    value={preview.subject}
                                    onChange={(e) => setPreview({ ...preview, subject: e.target.value })}
                                    className="w-full border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-500 mb-1">Message</label>
                                <textarea
                                    value={preview.body}
                                    onChange={(e) => setPreview({ ...preview, body: e.target.value })}
                                    rows={10}
                                    className="w-full border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-700 dark:text-white font-sans"
                                />
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex justify-end gap-3">
                            <button onClick={closePreview} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg dark:text-gray-300 dark:hover:bg-gray-800">
                                Annuler
                            </button>
                            <button onClick={handleSend} className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 flex items-center">
                                <Send className="w-4 h-4 mr-2" />
                                Envoyer (Ouvrir Mail)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FollowUps;
