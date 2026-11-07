import { useEffect, useState } from 'react';
import { CalendarClock, Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { formatDate } from '../utils/format';
import { POSTPONE_PRESETS, cancelPostpone, isPostponedNow, postponeDate, postponeFollowUps } from '../utils/followUpPostpone';

const longDate = (value) => formatDate(value, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' });

/**
 * « Projet reporté » : le client a dit que les travaux se feront plus tard.
 * L'artisan choisit la date de reprise ; aucune relance d'ici là, puis un mail
 * « comme convenu, je reviens vers vous… ».
 *
 * `quote` peut ne porter que l'id : l'état du report est alors relu en base.
 */
const FollowUpPostpone = ({ quote, onChange, compact = false }) => {
    const [state, setState] = useState(() => ({
        postponed: Boolean(quote?.relance_postponed),
        until: quote?.relance_snoozed_until ?? null,
    }));
    const [open, setOpen] = useState(false);
    const [custom, setCustom] = useState('');
    const [busy, setBusy] = useState(false);
    const quoteId = quote?.id;
    const known = quote && 'relance_postponed' in quote;

    useEffect(() => {
        if (!quoteId || known) return undefined;
        let alive = true;
        supabase.from('quotes').select('relance_postponed, relance_snoozed_until').eq('id', quoteId).maybeSingle()
            .then(({ data }) => {
                if (alive && data) setState({ postponed: Boolean(data.relance_postponed), until: data.relance_snoozed_until });
            });
        return () => { alive = false; };
    }, [quoteId, known]);

    if (!quoteId) return null;

    const active = isPostponedNow({ relance_postponed: state.postponed, relance_snoozed_until: state.until });

    const choose = async (dateKey) => {
        if (!dateKey) return;
        setBusy(true);
        try {
            await postponeFollowUps(quoteId, dateKey);
            setState({ postponed: true, until: `${dateKey}T06:00:00Z` });
            setOpen(false);
            toast.success(`Projet reporté : aucune relance avant le ${longDate(`${dateKey}T06:00:00Z`)}.`);
            onChange?.();
        } catch (e) {
            toast.error('Report non enregistré : ' + e.message);
        } finally {
            setBusy(false);
        }
    };

    const cancel = async () => {
        setBusy(true);
        try {
            await cancelPostpone(quoteId);
            setState({ postponed: false, until: null });
            toast.success('Report annulé : les relances reprennent normalement.');
            onChange?.();
        } catch (e) {
            toast.error('Annulation impossible : ' + e.message);
        } finally {
            setBusy(false);
        }
    };

    const today = new Date().toISOString().slice(0, 10);

    return (
        <div className={compact ? '' : 'rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 px-4 py-3'}>
            <div className="flex flex-wrap items-center gap-2">
                <CalendarClock size={16} className={active ? 'text-violet-600 dark:text-violet-400 shrink-0' : 'text-gray-400 shrink-0'} />
                {active ? (
                    <>
                        <span className="text-sm text-gray-800 dark:text-gray-100">
                            <strong>Projet reporté</strong> : relance le {longDate(state.until)}
                        </span>
                        <button type="button" disabled={busy} onClick={() => setOpen((v) => !v)} className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                            Changer
                        </button>
                        <button type="button" disabled={busy} onClick={cancel} className="text-sm font-medium text-gray-600 dark:text-gray-300 hover:underline">
                            Annuler le report
                        </button>
                    </>
                ) : (
                    <button type="button" disabled={busy} onClick={() => setOpen((v) => !v)} className="text-left text-sm font-medium text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white">
                        Projet reporté par le client ? <span className="text-blue-600 dark:text-blue-400">Reporter les relances</span>
                    </button>
                )}
                {busy && <Loader2 size={14} className="animate-spin text-gray-400" />}
            </div>

            {open && (
                <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-500 dark:text-gray-400">Relancer dans :</span>
                    {POSTPONE_PRESETS.map((p) => (
                        <button
                            key={p.months}
                            type="button"
                            disabled={busy}
                            onClick={() => choose(postponeDate(p.months))}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 hover:bg-violet-100"
                        >
                            {p.label}
                        </button>
                    ))}
                    <span className="text-xs text-gray-500 dark:text-gray-400">ou le</span>
                    <input
                        type="date"
                        min={today}
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2 py-1 text-sm text-gray-900 dark:text-white"
                    />
                    <button
                        type="button"
                        disabled={busy || !custom}
                        onClick={() => choose(custom)}
                        className="px-3 py-1.5 text-sm font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                        OK
                    </button>
                    <button type="button" onClick={() => setOpen(false)} aria-label="Fermer" className="p-1 text-gray-400 hover:text-gray-600">
                        <X size={14} />
                    </button>
                    <p className="basis-full text-xs text-gray-500 dark:text-gray-400">
                        Aucune relance d'ici là. À la date choisie, l'appli écrit : « Comme convenu, je reviens vers vous au sujet de votre projet… » et propose de mettre le devis à jour.
                    </p>
                </div>
            )}
        </div>
    );
};

export default FollowUpPostpone;
