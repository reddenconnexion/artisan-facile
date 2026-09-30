import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTestMode } from '../context/TestModeContext';
import { useConfirm } from '../context/ConfirmContext';
import { useUserProfile } from '../hooks/useDataCache';
import {
    getDueFollowUps,
    recordFollowUp,
    getFollowUpSettings,
    getRelanceContext,
    archiveQuote,
    getOptimalSendWindow,
    getUnpaidInvoiceReminders,
    markInvoicePaid,
} from '../utils/followUpService';
import { buildInvoiceReminderEmail, invoiceReference } from '../utils/unpaidInvoices';
import { generateFollowUpEmail } from '../utils/aiService';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Clock, Send, CheckCircle, Mail, ChevronDown, ChevronUp, Sparkles, Archive, AlertTriangle, Receipt, BadgeCheck } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { EmptyState, LoadingState } from '../components/ui';
import { formatCurrency, formatDate } from '../utils/format';

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
    const { data: profile } = useUserProfile();
    const navigate = useNavigate();
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState('due');
    const [dueQuotes, setDueQuotes] = useState([]);
    const [availableSteps, setAvailableSteps] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [generating, setGenerating] = useState({});
    const [suggestions, setSuggestions] = useState({});
    const [expanded, setExpanded] = useState({});
    const [stepOverrides, setStepOverrides] = useState({});
    const [unpaidInvoices, setUnpaidInvoices] = useState([]);
    const [invoiceDrafts, setInvoiceDrafts] = useState({});
    const sendWindow = useMemo(() => getOptimalSendWindow(), []);
    const invoicesDueNow = unpaidInvoices.filter(inv => inv.reminder.dueNow).length;
    const unpaidTotal = unpaidInvoices.reduce((sum, inv) => sum + (Number(inv.total_ttc) || 0), 0);

    const aiContext = useMemo(() => ({
        companyName: profile?.company_name || '',
        userName: profile?.full_name || profile?.first_name || '',
        persuasionLevel: profile?.follow_up_settings?.persuasion_level || 'soft',
    }), [profile]);

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
        const [data, settings, invoices] = await Promise.all([
            getDueFollowUps(user.id),
            getFollowUpSettings(user.id),
            getUnpaidInvoiceReminders(user.id),
        ]);
        setDueQuotes(data);
        setUnpaidInvoices(invoices);
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

    // Suggestions are generated on demand (button per card) rather than on page
    // load, to avoid burning AI tokens for relances the user may never send.
    const handleGenerate = async (key, quotes) => {
        try {
            setGenerating(prev => ({ ...prev, [key]: true }));
            const step = getEffectiveStep(key, quotes[0]);
            const client = quotes[0].clients || { name: 'Client' };
            // Récupère l'historique client + l'engagement e-mail pour personnaliser la relance.
            const relanceContext = await getRelanceContext(quotes[0], user.id);
            const emailContent = await generateFollowUpEmail(quotes, client, step, { ...aiContext, relanceContext });
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

    const handleArchive = async (quotes) => {
        const labels = quotes.length > 1
            ? `${quotes.length} devis`
            : `le devis "${quotes[0].title || 'sans titre'}"`;
        const confirmed = await confirm({
            title: `Archiver ${labels} ?`,
            message: "Le devis disparaîtra du tableau de bord et du centre de relance, mais restera consultable et restaurable dans l'onglet Archives.",
            confirmLabel: 'Archiver',
        });
        if (!confirmed) return;
        try {
            await Promise.all(quotes.map(q => archiveQuote(q.id, user.id)));
            toast.success(quotes.length > 1 ? 'Devis archivés' : 'Devis archivé');
            fetchDueQuotes();
        } catch (err) {
            toast.error("Erreur d'archivage : " + err.message);
        }
    };

    // Envoi d'une relance : capture en mode test, sinon envoi direct depuis
    // l'adresse pro de l'artisan (Edge Function SMTP, même mécanisme que les
    // devis/factures), avec repli sur le client mail.
    const deliverEmail = async ({ to, subject, body, doc }) => {
        const smtpConfigured = !!profile?.smtp_config?.host && !!profile?.smtp_config?.from_email;
        const mailtoUrl = `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

        if (isTestMode) {
            captureEmail({ email: to, subject, body });
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
                        to,
                        subject,
                        text: body,
                        quote_id: doc.id,
                        client_id: doc.client_id,
                    }),
                });
                const result = await res.json();
                toast.dismiss(sendingToast);
                if (!res.ok) throw new Error(result.error || 'Échec de l\'envoi');
                toast.success(`Relance envoyée à ${to}`);
            } catch (err) {
                toast.dismiss(sendingToast);
                console.error('Direct follow-up send failed:', err);
                toast.error((err.message || 'Échec de l\'envoi direct') + ' — ouverture du client mail');
                window.location.href = mailtoUrl;
            }
        } else {
            window.location.href = mailtoUrl;
        }
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
        await deliverEmail({ to: clientEmail, subject, body, doc: quotes[0] });

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

    const prepareInvoiceReminder = (invoice) => {
        const draft = buildInvoiceReminderEmail(invoice, invoice.reminder, { client: invoice.clients, profile });
        setInvoiceDrafts(prev => ({ ...prev, [invoice.id]: draft }));
    };

    const updateInvoiceDraft = (id, field, value) => {
        setInvoiceDrafts(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }));
    };

    const closeInvoiceDraft = (id) => {
        setInvoiceDrafts(prev => { const n = { ...prev }; delete n[id]; return n; });
    };

    const handleSendInvoiceReminder = async (invoice) => {
        const draft = invoiceDrafts[invoice.id];
        const clientEmail = invoice.clients?.email;
        if (!draft) return;
        if (!clientEmail) {
            toast.error("Le client n'a pas d'email !");
            return;
        }
        await deliverEmail({ to: clientEmail, subject: draft.subject, body: draft.body, doc: invoice });
        try {
            await recordFollowUp(
                invoice, user.id, draft.body, 'email',
                (invoice.follow_up_count || 0) + 1,
                `Rappel de paiement facture ${invoiceReference(invoice)} (${invoice.reminder.label})`,
            );
            toast.success('Rappel enregistré');
            closeInvoiceDraft(invoice.id);
            fetchDueQuotes();
        } catch (err) {
            console.error(err);
            toast.error("Erreur lors de l'enregistrement du rappel");
        }
    };

    const handleMarkInvoicePaid = async (invoice) => {
        const confirmed = await confirm({
            title: `Marquer la facture ${invoiceReference(invoice)} comme payée ?`,
            message: `${formatCurrency(invoice.total_ttc)} encaissés aujourd'hui. La facture sortira des relances et comptera dans votre chiffre d'affaires encaissé.`,
            confirmLabel: 'Marquer payée',
        });
        if (!confirmed) return;
        try {
            await markInvoicePaid(invoice.id, user.id);
            toast.success('Facture marquée payée');
            closeInvoiceDraft(invoice.id);
            fetchDueQuotes();
        } catch (err) {
            toast.error('Erreur : ' + err.message);
        }
    };

    const renderInvoiceCard = (invoice) => {
        const { reminder } = invoice;
        const draft = invoiceDrafts[invoice.id];
        const accent = reminder.level === 2 ? 'border-red-300' : reminder.level === 1 ? 'border-orange-300' : 'border-amber-200';
        return (
            <div key={invoice.id} className={`bg-white dark:bg-gray-900 rounded-xl border-2 ${reminder.dueNow ? accent : 'border-gray-200 dark:border-gray-700'} shadow-sm`}>
                <div className="p-5 flex flex-col md:flex-row md:items-start gap-3">
                    <div className="flex-1 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="bg-red-100 text-red-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                                En retard de {reminder.daysOverdue}j
                            </span>
                            {reminder.exhausted ? (
                                <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-xs font-semibold">
                                    Relances épuisées — appeler le client ou engager le recouvrement
                                </span>
                            ) : reminder.dueNow ? (
                                <span className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                                    {reminder.label} à envoyer
                                </span>
                            ) : (
                                <span className="bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full text-xs font-medium">
                                    {reminder.label} prévu le {formatDate(reminder.nextReminderDate)}
                                </span>
                            )}
                        </div>
                        <h3 className="font-bold text-lg text-gray-900 dark:text-white">
                            {invoice.clients?.name || 'Client'} — Facture {invoiceReference(invoice)}
                        </h3>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                            <span className="font-semibold text-gray-800 dark:text-gray-200">{formatCurrency(invoice.total_ttc)}</span>
                            <span className="flex items-center gap-1">
                                <Clock className="w-4 h-4" />
                                Échéance le {formatDate(reminder.dueDate)}
                            </span>
                            {invoice.follow_up_count > 0 && invoice.last_followup_at && (
                                <span className="text-orange-500">
                                    {invoice.follow_up_count} rappel{invoice.follow_up_count > 1 ? 's' : ''}, dernier le {formatDate(invoice.last_followup_at)}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-start gap-2 shrink-0">
                        <button
                            onClick={() => navigate(`/app/devis/${invoice.id}`)}
                            className="px-3 py-2 text-sm font-medium text-gray-600 bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700"
                        >
                            Voir facture
                        </button>
                        <button
                            onClick={() => handleMarkInvoicePaid(invoice)}
                            className="px-3 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800 flex items-center gap-1.5"
                        >
                            <BadgeCheck className="w-4 h-4" />
                            Marquer payée
                        </button>
                        {!reminder.exhausted && !draft && (
                            <button
                                onClick={() => prepareInvoiceReminder(invoice)}
                                className="px-4 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 shadow-sm bg-red-600 hover:bg-red-700"
                            >
                                <Mail className="w-4 h-4" />
                                Préparer le {reminder.label.toLowerCase()}
                            </button>
                        )}
                    </div>
                </div>

                {draft && (
                    <div className="border-t-2 border-red-100 bg-red-50/50 dark:bg-red-950/10 rounded-b-xl p-5 space-y-3">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                            {reminder.label} — modifiable avant envoi
                        </p>
                        {reminder.level === 2 && (
                            <p className="text-xs text-red-700 dark:text-red-300">
                                Pour valoir preuve, envoyez aussi ce courrier en recommandé avec accusé de réception.
                            </p>
                        )}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Objet</label>
                            <input
                                type="text"
                                value={draft.subject}
                                onChange={(e) => updateInvoiceDraft(invoice.id, 'subject', e.target.value)}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-red-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">Message</label>
                            <textarea
                                value={draft.body}
                                onChange={(e) => updateInvoiceDraft(invoice.id, 'body', e.target.value)}
                                rows={11}
                                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:ring-2 focus:ring-red-500 outline-none font-mono leading-relaxed"
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-1">
                            <button
                                onClick={() => closeInvoiceDraft(invoice.id)}
                                className="px-4 py-2 text-sm text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                            >
                                Annuler
                            </button>
                            <button
                                onClick={() => handleSendInvoiceReminder(invoice)}
                                className="px-5 py-2 text-sm font-semibold text-white rounded-lg flex items-center gap-2 shadow bg-red-600 hover:bg-red-700"
                            >
                                <Send className="w-4 h-4" />
                                Envoyer le rappel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
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
                                        Devis du {formatDate(referenceQuote.date)}
                                    </span>
                                    <span className="font-semibold text-gray-800 dark:text-gray-200">
                                        {referenceQuote.total_ttc} €
                                    </span>
                                    {referenceQuote.last_followup_at && (
                                        <span className="text-orange-500">
                                            Dernière relance : {formatDate(referenceQuote.last_followup_at)}
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
                            <button
                                onClick={() => handleArchive(quotes)}
                                title="Archiver — libère le tableau de bord, restaurable plus tard"
                                className="px-3 py-2 text-sm font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:hover:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-700 flex items-center gap-1.5"
                            >
                                <Archive className="w-4 h-4" />
                                <span className="hidden sm:inline">Archiver</span>
                            </button>
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
                        À Relancer ({dueQuotes.length + invoicesDueNow})
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
                <LoadingState />
            ) : activeTab === 'due' ? (
                <div className="space-y-4">
                    {(groupedDueQuotes.length > 0 || invoicesDueNow > 0) && (
                        <div className={`rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 ${
                            sendWindow.isOptimal
                                ? 'border-emerald-200 bg-emerald-50 dark:bg-emerald-900/10 dark:border-emerald-800/40'
                                : 'border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-800/40'
                        }`}>
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                                {sendWindow.isOptimal ? (
                                    <CheckCircle className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                                ) : (
                                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                                )}
                                <div className="text-sm">
                                    <span className={`font-semibold ${sendWindow.isOptimal ? 'text-emerald-800 dark:text-emerald-200' : 'text-amber-800 dark:text-amber-200'}`}>
                                        {sendWindow.label}
                                    </span>
                                    {sendWindow.suggestion && (
                                        <span className="text-amber-700 dark:text-amber-300 ml-2">— {sendWindow.suggestion}</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                    {unpaidInvoices.length > 0 && (
                        <section className="space-y-3">
                            <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                <Receipt className="w-5 h-5 text-red-600" />
                                Factures impayées
                                <span className="text-sm font-normal text-gray-500">
                                    — {formatCurrency(unpaidTotal)} en retard sur {unpaidInvoices.length} facture{unpaidInvoices.length > 1 ? 's' : ''}
                                </span>
                            </h2>
                            <div className="grid gap-4">
                                {unpaidInvoices.map(renderInvoiceCard)}
                            </div>
                        </section>
                    )}
                    {groupedDueQuotes.length === 0 && unpaidInvoices.length === 0 ? (
                        <EmptyState
                            icon={CheckCircle}
                            title="Tout est à jour !"
                            description="Aucune relance nécessaire pour le moment."
                        />
                    ) : groupedDueQuotes.length > 0 && (
                        <section className="space-y-3">
                            {unpaidInvoices.length > 0 && (
                                <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <Send className="w-5 h-5 text-blue-600" />
                                    Devis en attente de réponse
                                </h2>
                            )}
                            <div className="grid gap-4">
                                {groupedDueQuotes.map(renderCard)}
                            </div>
                        </section>
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
                                        {formatDate(item.created_at)} {new Date(item.created_at).toLocaleTimeString().slice(0, 5)}
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
                        <EmptyState bare title="Aucun historique disponible" />
                    )}
                </div>
            )}
        </div>
    );
};

export default FollowUps;
