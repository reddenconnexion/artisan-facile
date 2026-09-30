import { useEffect, useMemo, useState } from 'react';
import { Wallet, Hourglass, FileText, Timer } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { computeClientStats } from '../utils/clientStats';
import { formatCurrencyRounded, formatDate } from '../utils/format';

const plural = (n, word) => `${n} ${word}${n > 1 ? 's' : ''}`;

const Tile = ({ icon, label, value, sub, tone = 'default', onClick }) => {
    const Icon = icon;
    const tones = {
        default: 'text-gray-900 dark:text-white',
        good: 'text-green-700 dark:text-green-400',
        warn: 'text-amber-700 dark:text-amber-400',
        bad: 'text-red-700 dark:text-red-400',
    };
    return (
        <button
            type="button"
            onClick={onClick}
            className="text-left p-3 sm:p-4 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-800 transition-colors min-w-0"
        >
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{label}</span>
            </div>
            <div className={`mt-1 text-lg sm:text-xl font-bold tabular-nums truncate ${tones[tone]}`}>{value}</div>
            {sub && <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400 truncate">{sub}</div>}
        </button>
    );
};

/**
 * Indicateurs en tête de fiche client : encaissé, reste dû, devis en
 * attente, rapidité de paiement. Un appui ouvre l'historique du client.
 */
const ClientStats = ({ clientId, onOpenHistory }) => {
    const [docs, setDocs] = useState(null);

    useEffect(() => {
        if (!clientId) return;
        let cancelled = false;
        supabase
            .from('quotes')
            .select('id, type, status, total_ttc, date, created_at, valid_until, paid_at, parent_id, archived_at, signed_at, follow_up_count, last_followup_at, relance_snoozed_until')
            .eq('client_id', clientId)
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error) console.error('ClientStats:', error);
                setDocs(data || []);
            });
        return () => { cancelled = true; };
    }, [clientId]);

    const stats = useMemo(() => (docs ? computeClientStats(docs) : null), [docs]);

    // Rien à montrer pour un client sans aucun devis ni facture.
    if (!stats || stats.docCount === 0) return null;

    const unpaidSub = stats.unpaidCount === 0
        ? 'Rien en attente'
        : stats.overdueCount > 0
            ? `dont ${formatCurrencyRounded(stats.overdueTotal)} en retard`
            : plural(stats.unpaidCount, 'facture');

    const quotesSub = [
        stats.pendingQuotesCount > 0 ? plural(stats.pendingQuotesCount, 'devis') : 'Aucun devis',
        stats.signatureRate != null ? `${Math.round(stats.signatureRate * 100)} % signés` : null,
    ].filter(Boolean).join(' · ');

    const paymentValue = stats.avgPaymentDays == null
        ? '—'
        : stats.avgPaymentDays === 0 ? 'Immédiat' : `${stats.avgPaymentDays} j`;

    return (
        <div className="mb-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
                <Tile
                    icon={Wallet}
                    label="Encaissé"
                    value={formatCurrencyRounded(stats.paidTotal)}
                    sub={stats.paidCount > 0 ? plural(stats.paidCount, 'règlement') : 'Aucun règlement'}
                    tone={stats.paidTotal > 0 ? 'good' : 'default'}
                    onClick={onOpenHistory}
                />
                <Tile
                    icon={Hourglass}
                    label="Reste à encaisser"
                    value={formatCurrencyRounded(stats.unpaidTotal)}
                    sub={unpaidSub}
                    tone={stats.overdueCount > 0 ? 'bad' : stats.unpaidTotal > 0 ? 'warn' : 'default'}
                    onClick={onOpenHistory}
                />
                <Tile
                    icon={FileText}
                    label="Devis en attente"
                    value={formatCurrencyRounded(stats.pendingQuotesTotal)}
                    sub={quotesSub}
                    onClick={onOpenHistory}
                />
                <Tile
                    icon={Timer}
                    label="Délai de paiement"
                    value={paymentValue}
                    sub={stats.paymentSamples > 0
                        ? `moyenne sur ${plural(stats.paymentSamples, 'facture')}`
                        : 'Pas encore de paiement'}
                    tone={stats.avgPaymentDays != null && stats.avgPaymentDays > 30 ? 'warn' : 'default'}
                    onClick={onOpenHistory}
                />
            </div>
            {stats.firstDocDate && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                    Client depuis le {formatDate(stats.firstDocDate)}
                    {stats.lastDocDate && stats.lastDocDate > stats.firstDocDate && ` · dernier document le ${formatDate(stats.lastDocDate)}`}
                    {` · ${plural(stats.docCount, 'document')}`}
                </p>
            )}
        </div>
    );
};

export default ClientStats;
