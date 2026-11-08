import { useState } from 'react';
import { Bot, BellRing, Star, Check, Loader2, ChevronDown, ChevronUp, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useInvalidateCache } from '../hooks/useDataCache';
import { usePushNotifications } from '../hooks/usePushNotifications';

import { dismissSetup, isAutopilotSetupDone, isSetupDismissed } from '../utils/autopilotSetup';

const isUrl = (v) => /^https?:\/\/\S+\.\S+/i.test(String(v || '').trim());


const Step = ({ n, done, icon: Icon, title, children }) => (
    <li className="flex items-start gap-3 py-3">
        <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${done ? 'bg-green-500 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>
            {done ? <Check size={15} /> : n}
        </span>
        <div className="min-w-0 flex-1">
            <p className={`text-sm font-semibold flex items-center gap-1.5 ${done ? 'text-gray-500 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`}>
                <Icon size={15} className="shrink-0" /> {title}
            </p>
            {children}
        </div>
    </li>
);

/**
 * Mise en route du pilote en 3 étapes (abonnés Pro) : l'activer, donner son
 * lien d'avis Google, recevoir le point du soir sur son téléphone (sinon par
 * mail). Disparaît une fois les deux premières faites.
 */
const AutopilotSetup = ({ settings, save, profile, welcome = false, compact = false }) => {
    const { user } = useAuth();
    const { invalidateProfile } = useInvalidateCache();
    const push = usePushNotifications();
    const [link, setLink] = useState('');
    const [help, setHelp] = useState(false);
    const [busy, setBusy] = useState('');
    const [dismissed, setDismissed] = useState(isSetupDismissed);

    const enabled = Boolean(settings?.enabled);
    const hasLink = Boolean(profile?.google_review_url);
    const pushOn = push.isSubscribed;
    const doneCount = [enabled, hasLink, pushOn].filter(Boolean).length;

    if (isAutopilotSetupDone(settings, profile) && (pushOn || !push.isSupported || dismissed)) return null;
    if (compact && dismissed && !welcome) return null;

    const run = async (key, fn) => {
        setBusy(key);
        try { await fn(); } catch (e) { toast.error(e.message); } finally { setBusy(''); }
    };

    const activate = () => run('enable', async () => {
        await save({ enabled: true });
        toast.success("Pilote activé : l'appli s'occupe de vos relances.");
    });

    const saveLink = () => run('link', async () => {
        const url = link.trim();
        if (!isUrl(url)) throw new Error('Collez le lien complet, qui commence par https://');
        const { error } = await supabase.from('profiles').update({ google_review_url: url }).eq('id', user.id);
        if (error) throw error;
        invalidateProfile?.();
        toast.success("Lien d'avis enregistré.");
    });

    const enablePush = () => run('push', async () => {
        const res = await push.subscribe();
        if (!res?.success) throw new Error(res?.error || 'Notifications non activées');
        toast.success('Le point du soir arrivera sur ce téléphone.');
    });

    const dismiss = () => {
        setDismissed(true);
        dismissSetup();
    };

    return (
        <section className="relative rounded-xl border-2 border-blue-200 dark:border-blue-800/60 bg-white dark:bg-gray-800 p-4 sm:p-5 mb-5">
            {!welcome && (
                <button type="button" onClick={dismiss} aria-label="Plus tard" className="absolute top-2 right-2 p-1.5 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">
                    <X size={15} />
                </button>
            )}
            {welcome && <p className="text-sm font-semibold text-green-700 dark:text-green-400">🎉 Bienvenue dans le Pro !</p>}
            <p className="text-base font-bold text-gray-900 dark:text-white pr-6">Mise en route : 2 minutes</p>
            <p className="text-sm text-gray-600 dark:text-gray-300 mt-0.5">
                3 étapes, et l'appli relance vos clients pendant que vous êtes sur le chantier. <span className="font-semibold">{doneCount}/3</span>
            </p>

            <ol className="mt-1 divide-y divide-gray-100 dark:divide-gray-700">
                <Step n={1} done={enabled} icon={Bot} title="Activer le pilote automatique">
                    {!enabled && (
                        <>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Relances de devis, rappels de factures, demandes d'avis : du lundi au vendredi, 9 h – 18 h. Vous pouvez tout relire avant envoi.</p>
                            <button type="button" onClick={activate} disabled={busy === 'enable'} className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 bg-green-600 text-white text-sm font-bold rounded-lg hover:bg-green-700 disabled:opacity-60">
                                {busy === 'enable' && <Loader2 size={14} className="animate-spin" />} Activer
                            </button>
                        </>
                    )}
                </Step>

                <Step n={2} done={hasLink} icon={Star} title="Votre lien d'avis Google">
                    {!hasLink && (
                        <>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">L'appli l'envoie à vos clients en fin de chantier. Sans lui, pas de demande d'avis.</p>
                            <div className="mt-2 flex gap-2">
                                <input
                                    value={link}
                                    onChange={(e) => setLink(e.target.value)}
                                    placeholder="https://g.page/r/…/review"
                                    inputMode="url"
                                    className="flex-1 min-w-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
                                />
                                <button type="button" onClick={saveLink} disabled={busy === 'link' || !link.trim()} className="shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-60">
                                    {busy === 'link' && <Loader2 size={14} className="animate-spin" />} OK
                                </button>
                            </div>
                            <button type="button" onClick={() => setHelp((v) => !v)} className="mt-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5">
                                Où trouver ce lien ? {help ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                            </button>
                            {help && (
                                <ol className="mt-1.5 text-xs text-gray-600 dark:text-gray-300 list-decimal pl-4 space-y-0.5">
                                    <li>Sur votre téléphone, cherchez le nom de votre entreprise sur Google (connecté à votre compte Google).</li>
                                    <li>Dans votre fiche, appuyez sur « Demander des avis » (ou « Lire les avis » puis « Partager le formulaire d'avis »).</li>
                                    <li>Appuyez sur « Copier le lien », puis collez-le ici.</li>
                                </ol>
                            )}
                        </>
                    )}
                </Step>

                <Step n={3} done={pushOn} icon={BellRing} title="Le point du soir sur votre téléphone">
                    {!pushOn && (
                        <>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                À 18 h : signé, payé, relancé. {push.isSupported ? "Sinon, il vous arrive par mail." : "Ce navigateur ne gère pas les notifications : il vous arrivera par mail."}
                            </p>
                            {push.isSupported && (
                                <button type="button" onClick={enablePush} disabled={busy === 'push' || push.isLoading} className="mt-2 inline-flex items-center gap-1.5 px-3.5 py-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-sm font-bold rounded-lg hover:opacity-90 disabled:opacity-60">
                                    {(busy === 'push' || push.isLoading) && <Loader2 size={14} className="animate-spin" />} Recevoir sur ce téléphone
                                </button>
                            )}
                        </>
                    )}
                </Step>
            </ol>
        </section>
    );
};

export default AutopilotSetup;
