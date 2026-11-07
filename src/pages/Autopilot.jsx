import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
    Bot, FileText, Receipt, Star, Clock, PauseCircle, PlayCircle, Pencil, RotateCcw, Loader2,
    ChevronDown, ChevronUp, AlertTriangle, CheckCircle, Send, Settings,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';
import { toast } from 'sonner';
import { useAutopilot } from '../hooks/useAutopilot';
import { usePlanLimits } from '../hooks/usePlanLimits';
import { formatCurrencyRounded } from '../utils/format';
import { TRIAL_DAYS } from '../utils/founderOffer';
import FollowUpPostpone from '../components/FollowUpPostpone';
import ReviewTemplateEditor from '../components/ReviewTemplateEditor';
import QuoteTemplatesEditor from '../components/QuoteTemplatesEditor';

const KINDS = {
    quote_followup: { icon: FileText, label: 'Relance de devis', color: 'text-blue-600 dark:text-blue-400' },
    invoice_reminder: { icon: Receipt, label: 'Rappel de facture', color: 'text-orange-600 dark:text-orange-400' },
    review_request: { icon: Star, label: "Demande d'avis Google", color: 'text-amber-500' },
};

const card = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-100 dark:border-gray-700 shadow-sm';

/** Un mail prévu : lecture, modification, « Ne pas envoyer ». */
const QueuedMail = ({ item, canEdit, onSave, onHold, onReset, onPostponed }) => {
    const kind = KINDS[item.kind] || KINDS.quote_followup;
    const Icon = kind.icon;
    const [open, setOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const [subject, setSubject] = useState(item.subject);
    const [body, setBody] = useState(item.body);
    const [busy, setBusy] = useState(false);

    const run = async (fn, okMessage) => {
        setBusy(true);
        try {
            await fn();
            if (okMessage) toast.success(okMessage);
        } catch (e) {
            toast.error('Non enregistré : ' + e.message);
        } finally {
            setBusy(false);
        }
    };

    const startEdit = () => {
        setSubject(item.subject);
        setBody(item.body);
        setEditing(true);
        setOpen(true);
    };

    return (
        <li className={`${card} p-4 ${item.skipped ? 'opacity-60' : ''}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5 min-w-0">
                    <Icon size={18} className={`${kind.color} shrink-0 mt-0.5`} />
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            {kind.label}{item.label && item.kind !== 'review_request' ? ` · ${item.label}` : ''}
                        </p>
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                            {item.client_name} <span className="font-normal text-gray-500 dark:text-gray-400">· {item.to}</span>
                        </p>
                        {(item.doc_title || item.amount > 0) && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {item.doc_title}{item.doc_title && item.amount > 0 ? ' · ' : ''}{item.amount > 0 ? formatCurrencyRounded(item.amount) : ''}
                            </p>
                        )}
                    </div>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                    {item.skipped ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Retenu, ne partira pas</span>
                    ) : (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 flex items-center gap-1">
                            <Clock size={11} /> {item.whenLabel}
                        </span>
                    )}
                    {item.edited && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300">Modifié par vous</span>
                    )}
                </div>
            </div>

            {editing ? (
                <div className="mt-3 space-y-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                        Objet
                        <input
                            value={subject}
                            onChange={(e) => setSubject(e.target.value)}
                            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white"
                        />
                    </label>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-300">
                        Message
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={12}
                            className="mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-white font-sans"
                        />
                    </label>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            disabled={busy || !body.trim()}
                            onClick={() => run(async () => { await onSave(item.key, { subject: subject.trim(), body: body.trim() }); setEditing(false); }, 'Mail modifié : c\'est cette version qui partira.')}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-60"
                        >
                            {busy && <Loader2 size={14} className="animate-spin" />} Enregistrer
                        </button>
                        <button type="button" onClick={() => setEditing(false)} className="px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
                            Annuler
                        </button>
                    </div>
                </div>
            ) : (
                <div className="mt-3">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{item.subject}</p>
                    <p className={`mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line ${open ? '' : 'line-clamp-3'}`}>{item.body}</p>
                    <button type="button" onClick={() => setOpen((v) => !v)} className="mt-1 text-xs font-medium text-blue-600 dark:text-blue-400 inline-flex items-center gap-0.5">
                        {open ? <>Réduire <ChevronUp size={13} /></> : <>Lire tout le mail <ChevronDown size={13} /></>}
                    </button>
                </div>
            )}

            {canEdit && !editing && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 flex flex-wrap gap-2">
                    {!item.skipped && (
                        <button type="button" onClick={startEdit} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-gray-600">
                            <Pencil size={14} /> Modifier
                        </button>
                    )}
                    {item.skipped ? (
                        <button type="button" disabled={busy} onClick={() => run(() => onHold(item.key, false, item), 'Remis dans la file : il partira au prochain envoi.')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-100">
                            <PlayCircle size={14} /> Remettre dans la file
                        </button>
                    ) : (
                        <button type="button" disabled={busy} onClick={() => run(() => onHold(item.key, true, item), 'Ce mail ne partira pas.')} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <PauseCircle size={14} /> Ne pas envoyer
                        </button>
                    )}
                    {item.edited && !item.skipped && (
                        <button type="button" disabled={busy} onClick={() => run(() => onReset(item.key), "Texte d'origine rétabli.")} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700">
                            <RotateCcw size={14} /> Texte d'origine
                        </button>
                    )}
                    <Link to={`/app/devis/${item.quote_id}`} className="ml-auto inline-flex items-center px-3 py-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        Ouvrir {item.doc_type === 'invoice' ? 'la facture' : 'le devis'}
                    </Link>
                    {item.kind === 'quote_followup' && !item.skipped && (
                        <div className="basis-full">
                            <FollowUpPostpone compact quote={{ id: item.quote_id, relance_postponed: false, relance_snoozed_until: null }} onChange={onPostponed} />
                        </div>
                    )}
                </div>
            )}
        </li>
    );
};

/** Un mail déjà parti (journal des 7 derniers jours). */
const SentMail = ({ row }) => {
    const [open, setOpen] = useState(false);
    const kind = KINDS[row.kind] || KINDS.quote_followup;
    const Icon = kind.icon;
    return (
        <li className="py-2.5">
            <button type="button" onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-2 text-left min-w-0">
                <Icon size={15} className={`${kind.color} shrink-0`} />
                <span className="text-sm text-gray-800 dark:text-gray-100 truncate">{kind.label} · {row.recipient}</span>
                <span className="ml-auto text-xs text-gray-400 shrink-0">{formatDistanceToNow(new Date(row.created_at), { addSuffix: true, locale: fr })}</span>
            </button>
            {open && (
                <div className="mt-2 ml-6 rounded-lg bg-gray-50 dark:bg-gray-900/40 p-3">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{row.subject}</p>
                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line">{row.body}</p>
                </div>
            )}
        </li>
    );
};

/**
 * Pilote automatique, en un coup d'œil : les prochains mails (à relire,
 * modifier ou retenir), les décisions qui reviennent à l'artisan, et ce qui
 * est déjà parti.
 */
const Autopilot = () => {
    const navigate = useNavigate();
    const { isPro, loading: planLoading } = usePlanLimits();
    const { settings, save, profile, preview, recent, loading, reload, saveDraft, holdDraft, resetDraft } = useAutopilot();

    if (planLoading || loading || !preview) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
        );
    }

    const queue = preview.queue || [];
    const active = queue.filter((q) => !q.skipped);
    const held = queue.filter((q) => q.skipped);
    const onHold = (key, value, item) => holdDraft(key, value, item.edited ? { subject: item.subject, body: item.body } : {});

    return (
        <div className="max-w-2xl mx-auto px-4 py-6">
            <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <Bot size={22} className="text-green-600 dark:text-green-400" />
                        Pilote automatique
                    </h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                        Ce que l'appli va envoyer à vos clients, et ce qu'elle a déjà fait.
                    </p>
                </div>
                {isPro && (
                    <Link to="/app/subscription#pilote" className="shrink-0 inline-flex items-center gap-1 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900">
                        <Settings size={15} /> Réglages
                    </Link>
                )}
            </div>

            {!isPro ? (
                <div className="rounded-xl border border-blue-100 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 p-4 mb-5">
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Aperçu : voici les mails que l'appli enverrait pour vous.</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">Avec le Pro, ils partent tout seuls, et vous pouvez les modifier ou les retenir ici avant leur départ.</p>
                    <button type="button" onClick={() => navigate('/app/subscription')} className="mt-3 px-3.5 py-2 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700">
                        Essayer {TRIAL_DAYS} jours gratuits
                    </button>
                </div>
            ) : !settings.enabled ? (
                <div className="rounded-xl border border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20 p-4 mb-5 flex items-start gap-2">
                    <PauseCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                        Le pilote est en pause : rien ne part. <Link to="/app/subscription#pilote" className="underline font-medium">L'activer</Link>
                    </p>
                </div>
            ) : (
                <div className="rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 p-4 mb-5 flex items-start gap-2">
                    <CheckCircle size={18} className="text-green-600 shrink-0 mt-0.5" />
                    <p className="text-sm text-gray-700 dark:text-gray-200">
                        Activé. Les mails partent du lundi au vendredi entre 9 h et 18 h. Relisez-les ci-dessous : vous pouvez en modifier le texte ou les retenir.
                    </p>
                </div>
            )}

            <section className="mb-6">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                    <Send size={15} /> Prochains mails ({active.length})
                </h2>
                {queue.length === 0 ? (
                    <p className={`${card} p-4 text-sm text-gray-600 dark:text-gray-300`}>
                        Rien à envoyer pour l'instant. Dès qu'un devis attend une réponse depuis 7 jours ou qu'une facture passe l'échéance, le mail apparaîtra ici avant de partir.
                    </p>
                ) : (
                    <ul className="space-y-3">
                        {[...active, ...held].map((item) => (
                            <QueuedMail
                                key={`${item.key}:${item.edited ? 'e' : ''}${item.skipped ? 's' : ''}`}
                                item={item}
                                canEdit={isPro}
                                onSave={saveDraft}
                                onHold={onHold}
                                onReset={resetDraft}
                                onPostponed={reload}
                            />
                        ))}
                    </ul>
                )}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                    Les demandes d'avis Google partent aussi quand vous terminez un chantier et quittez les lieux (après « Je repars » si vous pointez).
                </p>
            </section>

            {isPro && (
                <section className={`${card} p-4 mb-6`}>
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                        <Pencil size={15} /> Vos modèles de mails
                    </h2>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                        Écrits une fois, remplis par l'appli pour chaque client. Pour retoucher un seul mail, utilisez « Modifier » dans la liste ci-dessus.
                    </p>
                    <div className="mt-3">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-2">
                            <FileText size={15} className="text-blue-600 dark:text-blue-400" /> Relances de devis
                        </p>
                        <div className="ml-6"><QuoteTemplatesEditor settings={settings} save={save} profile={profile} /></div>
                    </div>
                    <div className="mt-3">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-2">
                            <Star size={15} className="text-amber-500" /> Demande d'avis Google (fin de chantier)
                        </p>
                        <div className="ml-6"><ReviewTemplateEditor settings={settings} save={save} profile={profile} /></div>
                    </div>
                </section>
            )}

            {preview.postponed?.length > 0 && (
                <section className="mb-6">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                        <Clock size={15} className="text-violet-600" /> Projets reportés ({preview.postponed.length})
                    </h2>
                    <ul className="space-y-2">
                        {preview.postponed.map((q) => (
                            <li key={q.id} className={`${card} p-3`}>
                                <div className="flex items-center gap-2 min-w-0 mb-1.5">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                        {q.client_name}{q.title ? ` · ${q.title}` : ''}{q.amount > 0 ? ` · ${formatCurrencyRounded(q.amount)}` : ''}
                                    </p>
                                    <Link to={`/app/devis/${q.id}`} className="ml-auto shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Ouvrir</Link>
                                </div>
                                {isPro ? (
                                    <FollowUpPostpone compact quote={q} onChange={reload} />
                                ) : null}
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {preview.needsArtisan.length > 0 && (
                <section className="mb-6">
                    <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                        <AlertTriangle size={15} className="text-red-500" /> À vous de décider ({preview.needsArtisan.length})
                    </h2>
                    <ul className="space-y-2">
                        {preview.needsArtisan.map((n) => (
                            <li key={n.quote_id} className={`${card} p-3 flex items-center gap-3`}>
                                <Receipt size={16} className="text-red-500 shrink-0" />
                                <div className="min-w-0">
                                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">Facture {n.reference} · {formatCurrencyRounded(n.amount)}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{n.daysOverdue} jours de retard · prochaine étape : {n.label.toLowerCase()}. L'appli ne l'envoie pas seule.</p>
                                </div>
                                <Link to={`/app/devis/${n.quote_id}`} className="ml-auto shrink-0 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">Ouvrir</Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            <section className={`${card} p-4`}>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                    <CheckCircle size={15} className="text-green-600" /> Déjà envoyés (7 derniers jours)
                </h2>
                {recent.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Aucun mail envoyé par le pilote cette semaine.</p>
                ) : (
                    <ul className="divide-y divide-gray-100 dark:divide-gray-700 mt-1">
                        {recent.map((row) => <SentMail key={row.id} row={row} />)}
                    </ul>
                )}
            </section>
        </div>
    );
};

export default Autopilot;
