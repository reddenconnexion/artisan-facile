import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, FileText, Receipt, Star, ChevronRight, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { useAutopilot } from '../hooks/useAutopilot';
import { useConfirm } from '../context/ConfirmContext';
import { formatCurrencyRounded } from '../utils/format';
import { TRIAL_DAYS } from '../utils/founderOffer';
import AutopilotSetup from './AutopilotSetup';
import { isAutopilotSetupDone, isSetupDismissed } from '../utils/autopilotSetup';

const KIND_ICONS = { quote_followup: FileText, invoice_reminder: Receipt, review_request: Star };
const KIND_TEXT = {
    quote_followup: 'Devis relancé',
    invoice_reminder: 'Facture réclamée',
    review_request: 'Avis demandé',
};

const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;

/** Phrase « 3 devis (4 200 €) et 1 facture en retard (650 €) ». */
const pendingSentence = (p) => {
    const parts = [];
    if (p.quotes.count) parts.push(`${plural(p.quotes.count, 'devis', 'devis')} sans réponse (${formatCurrencyRounded(p.quotes.amount)})`);
    if (p.invoices.count) parts.push(`${plural(p.invoices.count, 'facture en retard', 'factures en retard')} (${formatCurrencyRounded(p.invoices.amount)})`);
    if (p.reviews.count) parts.push(`${plural(p.reviews.count, 'client à qui demander un avis', 'clients à qui demander un avis')}`);
    return parts.join(', ');
};

const Stat = ({ icon: Icon, value, label }) => (
    <div className="flex-1 min-w-0 rounded-xl bg-gray-50 dark:bg-white/5 px-3 py-2.5">
        <Icon size={15} className="text-green-600 dark:text-green-400 mb-1" />
        <p className="text-lg font-bold text-gray-900 dark:text-white leading-tight">{value}</p>
        <p className="text-[11px] text-gray-500 dark:text-gray-400">{label}</p>
    </div>
);

/**
 * Tableau de bord : ce que le pilote automatique a fait cette semaine (Pro),
 * ou ce qu'il ferait aujourd'hui, chiffré avec les vrais devis et factures
 * de l'artisan (Pro pas encore activé, plan gratuit).
 */
const AutopilotCard = () => {
    const navigate = useNavigate();
    const confirm = useConfirm();
    const { isPro, loading: planLoading } = usePlanLimits();
    const { settings, save, profile, preview, gains, recent, week, loading } = useAutopilot();
    const [activating, setActivating] = useState(false);

    if (planLoading || loading || !preview) return null;

    const pending = pendingSentence(preview);

    if (!isPro) {
        if (!preview.total) return null;
        return (
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <Bot size={22} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white">À relancer aujourd'hui : {pending}.</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            Avec le Pro, l'appli envoie ces relances toute seule, dès aujourd'hui, pendant que vous êtes sur le chantier.
                        </p>
                        <button
                            type="button"
                            onClick={() => navigate('/app/subscription')}
                            className="mt-3 inline-flex items-center gap-1 px-3.5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
                        >
                            Essayer {TRIAL_DAYS} jours gratuits <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // Pro pas encore installé : la mise en route (activer, lien d'avis, notifications).
    // Repoussée (« plus tard ») : on revient aux encarts habituels.
    if (!isAutopilotSetupDone(settings, profile) && !isSetupDismissed()) {
        return <AutopilotSetup compact settings={settings} save={save} profile={profile} />;
    }

    if (!settings.enabled) {
        const activate = async () => {
            const ok = await confirm({
                title: 'Activer le pilote automatique ?',
                message: `L'appli relancera vos clients à votre place, du lundi au vendredi entre 9 h et 18 h${pending ? ` (aujourd'hui : ${pending})` : ''}. Vous pouvez tout couper à tout moment.`,
                confirmLabel: 'Activer',
            });
            if (!ok) return;
            setActivating(true);
            try {
                await save({ enabled: true });
                toast.success("C'est parti : l'appli s'occupe de vos relances.");
            } catch (e) {
                toast.error('Activation impossible : ' + e.message);
            } finally {
                setActivating(false);
            }
        };
        return (
            <div className="rounded-2xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-4 sm:p-5">
                <div className="flex items-start gap-3">
                    <Bot size={22} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                        <p className="font-bold text-gray-900 dark:text-white">Votre pilote automatique est en pause</p>
                        <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                            {pending
                                ? `Il relancerait aujourd'hui : ${pending}.`
                                : "Activez-le : dès qu'un devis attend une réponse ou qu'une facture est en retard, l'appli s'en occupe."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={activate}
                                disabled={activating}
                                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-60"
                            >
                                {activating && <Loader2 size={14} className="animate-spin" />}
                                Activer maintenant
                            </button>
                            <button
                                type="button"
                                onClick={() => navigate('/app/pilote')}
                                className="px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30"
                            >
                                Voir les mails prévus
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-[#1c1c1e] rounded-2xl border border-green-200/70 dark:border-green-800/40 shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={() => navigate('/app/pilote')}
                className="w-full px-5 py-3.5 flex items-center justify-between gap-2 bg-green-50 dark:bg-green-900/20 text-left"
            >
                <span className="flex items-center gap-2.5 min-w-0">
                    <Bot size={18} className="text-green-600 dark:text-green-400 shrink-0" />
                    <span className="font-semibold text-sm text-gray-900 dark:text-white truncate">
                        Ce que l'appli a fait pour vous cette semaine
                    </span>
                </span>
                <ChevronRight size={16} className="text-gray-400 shrink-0" />
            </button>
            <div className="p-4 sm:p-5">
                {gains?.total > 0 && (
                    <p className="mb-3 text-sm font-semibold text-green-700 dark:text-green-300">
                        💶 Depuis l'activation : {formatCurrencyRounded(gains.signed.amount)} signés et {formatCurrencyRounded(gains.paid.amount)} encaissés après les relances de l'appli.
                    </p>
                )}
                {week.total === 0 ? (
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        Rien à relancer pour l'instant. Dès qu'un devis attend une réponse ou qu'une facture passe l'échéance, l'appli s'en occupe.
                    </p>
                ) : (
                    <>
                        <div className="flex gap-2">
                            <Stat icon={FileText} value={week.quotes.count} label={`devis relancés${week.quotes.amount ? ` · ${formatCurrencyRounded(week.quotes.amount)}` : ''}`} />
                            <Stat icon={Receipt} value={week.invoices.count} label={`factures réclamées${week.invoices.amount ? ` · ${formatCurrencyRounded(week.invoices.amount)}` : ''}`} />
                            <Stat icon={Star} value={week.reviews.count} label="avis demandés" />
                        </div>
                        <ul className="mt-3 space-y-1.5">
                            {recent.slice(0, 4).map((r) => {
                                const Icon = KIND_ICONS[r.kind] || FileText;
                                return (
                                    <li key={r.id} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 min-w-0">
                                        <Icon size={13} className="shrink-0 text-gray-400" />
                                        <span className="truncate">
                                            {KIND_TEXT[r.kind]} · {r.recipient}
                                        </span>
                                        <span className="ml-auto shrink-0 text-gray-400">
                                            {formatDistanceToNow(new Date(r.created_at), { addSuffix: true, locale: fr })}
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </>
                )}
                {pending && (
                    <button type="button" onClick={() => navigate('/app/pilote')} className="mt-3 text-xs text-left text-blue-600 dark:text-blue-400 hover:underline">
                        Prochains mails : {pending}. Les relire ou les modifier →
                    </button>
                )}
            </div>
        </div>
    );
};

export default AutopilotCard;
