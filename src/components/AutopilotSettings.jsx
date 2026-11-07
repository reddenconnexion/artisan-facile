import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bot, FileText, Receipt, Star, BellRing, Loader2, Mail, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { useAutopilot } from '../hooks/useAutopilot';
import { formatCurrencyRounded } from '../utils/format';
import ReviewTemplateEditor from './ReviewTemplateEditor';
import QuoteTemplatesEditor from './QuoteTemplatesEditor';

const ITEMS = [
    { key: 'quotes', icon: FileText, title: 'Relancer mes devis pas encore signés', text: 'À J+7, J+14 et J+21, puis un dernier message avant de classer le devis.' },
    { key: 'invoices', icon: Receipt, title: 'Réclamer mes factures en retard', text: "Rappel aimable 3 jours après l'échéance, puis rappel ferme 10 jours plus tard. La mise en demeure, c'est vous qui décidez." },
    { key: 'reviews', icon: Star, title: 'Demander un avis Google en fin de chantier', text: "Quand vous terminez le chantier et quittez les lieux (après « Je repars » si vous pointez). Un seul message par client." },
    { key: 'summary', icon: BellRing, title: 'Le point du soir à 18 h', text: 'Une notification : signé, payé, relancé.' },
];

const Switch = ({ checked, onChange, disabled, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${checked ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
    >
        <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
);

/**
 * Réglages du pilote automatique (abonnés Pro) : un interrupteur général,
 * un par tâche, et ce qu'il faut savoir sur l'envoi.
 */
const AutopilotSettings = () => {
    const { settings, save, preview, profile, sendsFromOwnAddress, replyTo, failures } = useAutopilot();
    const [saving, setSaving] = useState(false);
    const ref = useRef(null);

    // Lien « Régler » du tableau de bord : /app/subscription#pilote.
    useEffect(() => {
        if (window.location.hash === '#pilote') ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, []);

    const update = async (patch, message) => {
        setSaving(true);
        try {
            await save(patch);
            if (message) toast.success(message);
        } catch (e) {
            toast.error("Réglage non enregistré : " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const ready = preview ? preview.total : 0;
    const readyAmount = preview ? preview.quotes.amount + preview.invoices.amount : 0;
    const noReviewLink = !profile?.google_review_url;

    return (
        <div id="pilote" ref={ref} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm overflow-hidden mb-6">
            <div className={`px-5 py-4 flex items-center justify-between gap-3 ${settings.enabled ? 'bg-green-50 dark:bg-green-900/20' : 'bg-amber-50 dark:bg-amber-900/20'}`}>
                <div className="flex items-start gap-3 min-w-0">
                    <Bot size={22} className={settings.enabled ? 'text-green-600 dark:text-green-400 shrink-0' : 'text-amber-600 dark:text-amber-400 shrink-0'} />
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white">Pilote automatique</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                            {settings.enabled
                                ? "Activé : l'appli relance vos clients à votre place, du lundi au vendredi, de 9 h à 18 h."
                                : ready > 0
                                    ? `En pause. ${ready} relance${ready > 1 ? 's' : ''} ${ready > 1 ? 'sont prêtes' : 'est prête'} à partir${readyAmount > 0 ? ` (${formatCurrencyRounded(readyAmount)} en jeu)` : ''}.`
                                    : "En pause. Activez-le : l'appli s'occupera de vos relances."}
                        </p>
                    </div>
                </div>
                <Switch
                    checked={settings.enabled}
                    disabled={saving}
                    label="Activer le pilote automatique"
                    onChange={(v) => update({ enabled: v }, v ? "Pilote automatique activé : l'appli s'occupe de vos relances." : 'Pilote automatique en pause.')}
                />
            </div>

            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                {ITEMS.map(({ key, icon: Icon, title, text }) => (
                    <li key={key} className="px-5 py-3.5 flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                            <Icon size={18} className="text-gray-400 shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{title}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{text}</p>
                                {key === 'reviews' && noReviewLink && (
                                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                                        Ajoutez d'abord votre lien d'avis Google dans{' '}
                                        <Link to="/app/settings?tab=entreprise" className="underline">Mon entreprise</Link>.
                                    </p>
                                )}
                                {key === 'reviews' && (
                                    <ReviewTemplateEditor settings={settings} save={save} profile={profile} />
                                )}
                                {key === 'quotes' && (
                                    <QuoteTemplatesEditor settings={settings} save={save} profile={profile} />
                                )}
                                {key === 'summary' && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                                        Notifications à autoriser sur ce téléphone dans{' '}
                                        <Link to="/app/settings?tab=envoi" className="underline">Envoi & documents</Link>.
                                    </p>
                                )}
                            </div>
                        </div>
                        <Switch
                            checked={settings[key]}
                            disabled={saving || !settings.enabled}
                            label={title}
                            onChange={(v) => update({ [key]: v })}
                        />
                    </li>
                ))}
            </ul>

            <div className="px-5 py-3.5 bg-gray-50 dark:bg-gray-900/30 text-xs text-gray-600 dark:text-gray-400 space-y-1.5">
                <p className="flex items-start gap-2">
                    <Mail size={14} className="shrink-0 mt-0.5" />
                    <span>
                        {sendsFromOwnAddress
                            ? `Les mails partent de votre adresse : ${profile.smtp_config.from_email}.`
                            : `Les mails partent au nom de ${profile?.company_name || 'votre entreprise'} ; les réponses de vos clients arrivent sur ${replyTo || 'votre e-mail'}. `}
                        {!sendsFromOwnAddress && (
                            <Link to="/app/settings?tab=envoi" className="underline">Envoyer depuis ma propre adresse</Link>
                        )}
                    </span>
                </p>
                <p>
                    <Link to="/app/pilote" className="underline font-medium">Voir les mails prévus</Link> : vous pouvez les relire, les modifier ou les retenir avant leur départ.
                </p>
                <p>Un seul mail par client et par jour. Pour ne jamais relancer un client, ouvrez sa fiche et décochez « Relances automatiques ».</p>
                {failures.length > 0 && (
                    <p className="flex items-start gap-2 text-red-600 dark:text-red-400">
                        <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                        <span>{failures.length} envoi{failures.length > 1 ? 's' : ''} raté{failures.length > 1 ? 's' : ''} cette semaine ({failures[0].error || 'erreur d\'envoi'}). Nouvel essai demain.</span>
                    </p>
                )}
            </div>
            {saving && <Loader2 size={14} className="animate-spin text-gray-400 mx-auto my-2" />}
        </div>
    );
};

export default AutopilotSettings;
