import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
    ArrowLeft, Check, Circle, CircleDot, MinusCircle, XCircle, Loader2, FileText, ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { supabase } from '../utils/supabase';
import { formatAmount, formatDate } from '../utils/format';
import { affaireJourney, affaireAmounts } from '../utils/affaireJourney';
import { markInvoicePaid } from '../utils/followUpService';
import { Card, Button, LoadingState, EmptyState } from '../components/ui';
import DevisProgress from '../components/DevisProgress';
import DepositNextStepCard from '../components/DepositNextStepCard';
import { useDepositActions } from './devis-form/useDepositActions';

const STATUS_LABELS = {
    draft: 'Brouillon',
    sent: 'Envoyé',
    accepted: 'Signé',
    billed: 'Émise',
    paid: 'Payée',
    refused: 'Refusé',
    rejected: 'Refusé',
};

const STEP_ICON = {
    done: { Icon: Check, className: 'bg-emerald-500 text-white' },
    current: { Icon: CircleDot, className: 'bg-ios text-white' },
    todo: { Icon: Circle, className: 'bg-gray-200 dark:bg-white/10 text-gray-400' },
    skipped: { Icon: MinusCircle, className: 'bg-gray-100 dark:bg-white/5 text-gray-400' },
    blocked: { Icon: XCircle, className: 'bg-red-500 text-white' },
};

const docLabel = (doc) => {
    if (doc.type === 'amendment') return doc.title || 'Avenant';
    const ref = doc.invoice_number || doc.quote_number;
    return ref ? `${doc.title || 'Document'} · n°${ref}` : (doc.title || 'Document');
};

const noop = () => {};

/**
 * Suivi d'une affaire, du devis à la facture payée, sur un seul écran.
 *
 * Assemble les briques existantes : la barre d'étapes du devis
 * (DevisProgress), la carte « acompte matériel restant »
 * (DepositNextStepCard) et les actions de facturation du formulaire
 * (useDepositActions). L'artisan voit où en est l'affaire et fait avancer
 * l'étape en cours sans chercher dans quel menu elle se cache.
 */
const Affaire = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const confirm = useConfirm();

    const [quote, setQuote] = useState(null);
    const [children, setChildren] = useState([]);
    const [loading, setLoading] = useState(true);
    const [notFound, setNotFound] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        const quoteId = parseInt(id, 10);
        if (!Number.isFinite(quoteId)) { setNotFound(true); setLoading(false); return; }
        try {
            const { data: doc, error } = await supabase
                .from('quotes')
                .select('*, clients(id, name)')
                .eq('id', quoteId)
                .single();
            if (error || !doc) { setNotFound(true); return; }
            // Une affaire se suit depuis son devis racine : un acompte, un
            // avenant ou une facture de clôture y renvoient.
            if (doc.parent_id) {
                navigate(`/app/affaires/${doc.parent_id}`, { replace: true });
                return;
            }
            const { data: linked, error: linkedError } = await supabase
                .from('quotes')
                .select('id, title, type, status, items, quote_number, invoice_number, total_ht, total_ttc, date, paid_at, signed_at, created_at')
                .eq('parent_id', quoteId)
                .neq('status', 'cancelled')
                .order('created_at', { ascending: true });
            if (linkedError) throw linkedError;
            setQuote(doc);
            setChildren(linked || []);
            setNotFound(false);
        } catch (error) {
            console.error('Error loading affaire:', error);
            toast.error("Impossible de charger le suivi de l'affaire.");
        } finally {
            setLoading(false);
        }
    }, [id, navigate]);

    useEffect(() => { setLoading(true); load(); }, [load]);

    // Actions de facturation du formulaire de devis, appliquées au devis racine.
    const clients = useMemo(() => (quote?.client_id
        ? [{ id: quote.client_id, name: quote.clients?.name || quote.client_name || 'Client' }]
        : []), [quote]);
    const {
        depositNextStep,
        handleCreateDeposit,
        handleCreateMaterialDeposit,
        handleCreateClosingInvoice,
    } = useDepositActions({
        clients,
        confirm,
        formData: quote || {},
        id: quote ? String(quote.id) : null,
        navigate,
        setLoading: setBusy,
        setShowActionsMenu: noop,
        setShowSituationModal: noop,
        total: Number(quote?.total_ttc) || 0,
        user,
    });

    const journey = useMemo(() => (quote ? affaireJourney(quote, children) : null), [quote, children]);
    const amounts = useMemo(() => (quote ? affaireAmounts(quote, children) : null), [quote, children]);

    const runAction = async (action) => {
        if (!action || busy) return;
        switch (action.kind) {
            case 'open_quote':
                navigate(`/app/devis/${quote.id}`);
                return;
            case 'open_doc':
                navigate(`/app/devis/${action.docId}`);
                return;
            case 'create_deposit':
                await handleCreateDeposit();
                return;
            case 'create_material_deposit':
                await handleCreateMaterialDeposit();
                return;
            case 'create_closing':
                await handleCreateClosingInvoice();
                return;
            case 'mark_paid': {
                const ok = await confirm({
                    title: 'Paiement reçu',
                    message: "Marquer cette facture comme payée aujourd'hui ?",
                    confirmLabel: 'Payée',
                });
                if (!ok) return;
                setBusy(true);
                try {
                    await markInvoicePaid(action.docId, user.id);
                    toast.success('Paiement enregistré');
                    await load();
                } catch (error) {
                    console.error('Error marking invoice paid:', error);
                    toast.error("Impossible d'enregistrer le paiement.");
                } finally {
                    setBusy(false);
                }
                return;
            }
            case 'set_stage': {
                setBusy(true);
                try {
                    const { error } = await supabase
                        .from('quotes')
                        .update({ work_stage: action.stage })
                        .eq('id', quote.id);
                    if (error) throw error;
                    toast.success(action.stage === 'completed' ? 'Chantier terminé' : 'Chantier démarré');
                    await load();
                } catch (error) {
                    console.error('Error updating work stage:', error);
                    toast.error("Impossible de mettre à jour le chantier.");
                } finally {
                    setBusy(false);
                }
                return;
            }
            default:
        }
    };

    const scrollToStep = (step) => {
        const el = document.getElementById(`affaire-step-${step.id}`);
        if (!el) return;
        el.style.scrollMarginTop = '128px';
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    if (loading) return <LoadingState label="Chargement de l'affaire…" className="min-h-[50vh]" />;

    if (notFound || !quote || !journey) {
        return (
            <div className="max-w-3xl mx-auto">
                <EmptyState
                    icon={FileText}
                    title="Affaire introuvable"
                    description="Ce devis n'existe plus ou ne vous appartient pas."
                    action={{ label: 'Retour aux devis', onClick: () => navigate('/app/devis') }}
                />
            </div>
        );
    }

    const { steps, current, completed } = journey;
    const amendments = children.filter(d => d.type === 'amendment');
    const clientName = quote.clients?.name || quote.client_name || 'Client';
    const toTTC = (ht) => (depositNextStep?.root?.include_tva ? ht * 1.2 : ht);

    const renderDocs = (docs) => (docs && docs.length > 0 ? (
        <ul className="mt-2 space-y-1">
            {docs.map(doc => (
                <li key={doc.id}>
                    <Link
                        to={`/app/devis/${doc.id}`}
                        className="flex items-center gap-2 text-sm rounded-lg px-2 py-1.5 -mx-2 hover:bg-gray-50 dark:hover:bg-white/5"
                    >
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
                        <span className="flex-1 min-w-0 truncate text-gray-700 dark:text-gray-200">{docLabel(doc)}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                            {formatAmount(doc.total_ttc)} · {STATUS_LABELS[doc.status] || doc.status}
                        </span>
                        <ChevronRight className="w-4 h-4 text-gray-300 flex-shrink-0" aria-hidden="true" />
                    </Link>
                </li>
            ))}
        </ul>
    ) : null);

    return (
        <div className="max-w-3xl mx-auto pb-28 sm:pb-12">
            <button
                type="button"
                onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/app/chantiers'))}
                className="tap-target inline-flex items-center gap-1 text-sm text-ios mb-2"
            >
                <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Retour
            </button>

            <div className="mb-4">
                <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">Suivi de l'affaire</p>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white truncate">{quote.title || 'Sans titre'}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    {quote.client_id
                        ? <Link to={`/app/clients/${quote.client_id}`} className="hover:underline">{clientName}</Link>
                        : clientName}
                    {quote.quote_number ? ` · Devis n°${quote.quote_number}` : ''}
                    {quote.date ? ` · ${formatDate(quote.date)}` : ''}
                </p>
            </div>

            <DevisProgress
                steps={steps.map(s => ({ id: s.id, label: s.label, done: s.state === 'done' || s.state === 'skipped' }))}
                ariaLabel="Progression de l'affaire"
                doneLabel="Affaire soldée"
                mobileOnly={false}
                onStepClick={scrollToStep}
            />

            {/* Montants de l'affaire */}
            <Card className="p-4 mb-4 grid grid-cols-3 gap-2 text-center">
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total chantier</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{formatAmount(amounts.totalTTC)}</p>
                    {amounts.amendmentsTTC !== 0 && (
                        <p className="text-[11px] text-gray-400">dont avenants {formatAmount(amounts.amendmentsTTC)}</p>
                    )}
                </div>
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Encaissé</p>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400">{formatAmount(amounts.paidTTC)}</p>
                </div>
                <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Reste à encaisser</p>
                    <p className={`font-semibold ${amounts.remainingTTC > 0.005 ? 'text-gray-900 dark:text-white' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {formatAmount(amounts.remainingTTC)}
                    </p>
                </div>
            </Card>

            {/* Prochaine étape */}
            {completed ? (
                <Card className="p-4 mb-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20">
                    <p className="font-semibold text-emerald-900 dark:text-emerald-200">Affaire soldée</p>
                    <p className="text-sm text-emerald-800 dark:text-emerald-300/90 mt-1">Devis signé, travaux terminés et facture réglée. Rien d'autre à faire.</p>
                </Card>
            ) : current && (
                <Card className={`p-4 mb-4 ${current.state === 'blocked' ? 'border-red-200 dark:border-red-800' : 'border-ios/40'}`}>
                    <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        {current.state === 'blocked' ? 'Affaire arrêtée' : 'Prochaine étape'}
                    </p>
                    <p className="font-semibold text-gray-900 dark:text-white mt-0.5">{current.label}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{current.detail}</p>
                    {current.action && (
                        <Button className="mt-3 w-full sm:w-auto" onClick={() => runAction(current.action)} disabled={busy}>
                            {busy && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            {current.action.label}
                        </Button>
                    )}
                </Card>
            )}

            {/* Matériel d'avenant signé pas encore couvert par l'acompte */}
            {depositNextStep && (
                <DepositNextStepCard
                    variant="root"
                    rootId={depositNextStep.root.id}
                    rootRef={depositNextStep.root.quote_number || depositNextStep.root.id}
                    amountTTC={toTTC(depositNextStep.remainingHT)}
                    alreadyIssuedTTC={toTTC(depositNextStep.alreadyIssuedHT)}
                    previousLabels={depositNextStep.previous.map(d => d.invoice_number || `n°${d.id}`)}
                    amendmentLabels={depositNextStep.amendmentShare.labels}
                    onGenerate={handleCreateMaterialDeposit}
                    loading={busy}
                />
            )}

            {/* Détail des étapes */}
            <Card as="ol" className="divide-y divide-gray-100 dark:divide-white/10">
                {steps.map((step, i) => {
                    const { Icon, className } = STEP_ICON[step.state] || STEP_ICON.todo;
                    const isCurrent = step === current;
                    const docs = step.id === 'devis'
                        ? [quote]
                        : step.id === 'chantier' ? amendments : step.docs;
                    return (
                        <li key={step.id} id={`affaire-step-${step.id}`} className="p-4 flex gap-3">
                            <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${className}`}>
                                <Icon className="w-4 h-4" aria-hidden="true" />
                            </span>
                            <div className="flex-1 min-w-0">
                                <p className={`font-semibold ${isCurrent ? 'text-ios' : 'text-gray-900 dark:text-white'}`}>
                                    {i + 1}. {step.label}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-300">
                                    {step.detail}
                                    {step.date ? ` (${formatDate(step.date)})` : ''}
                                </p>
                                {step.id === 'chantier' && amendments.length > 0 && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Avenants</p>
                                )}
                                {renderDocs(docs)}
                                {step.action && !isCurrent && (
                                    <Button
                                        variant={step.action.secondary ? 'plain' : 'secondary'}
                                        size="sm"
                                        className="mt-2"
                                        onClick={() => runAction(step.action)}
                                        disabled={busy}
                                    >
                                        {step.action.label}
                                    </Button>
                                )}
                            </div>
                        </li>
                    );
                })}
            </Card>
        </div>
    );
};

export default Affaire;
