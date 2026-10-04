import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, TrendingDown, ShoppingCart, Clock, Check, Pencil, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useInvalidateCache } from '../hooks/useDataCache';
import { useChantierMargins } from '../hooks/useChantierMargins';
import { mergeAiPreferences } from '../utils/aiPreferences';
import { supabase } from '../utils/supabase';
import { formatAmount } from '../utils/format';
import { formatHours } from '../utils/timeTracking';
import { Card } from './ui';

const LEVEL_STYLE = {
    below: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    watch: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    ok: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};

const EMPTY = [];

const pct = (ratio) => `${Math.round((ratio || 0) * 100)} %`;

const reportTooltip = (r) => [
    `Marge réelle ${pct(r.margin)} (prévue ${pct(r.plannedMargin)}), seuil d'alerte ${r.threshold} %.`,
    `CA ${formatAmount(r.revenue)} HT`,
    `Matériel ${formatAmount(r.materialCost)}${r.materialIsReal ? ` (${r.pricedCount}/${r.totalCount} achat${r.totalCount > 1 ? 's' : ''} au prix réel)` : ' (prévu au devis)'}`,
    `Main d'œuvre ${formatAmount(r.laborCost)}${r.laborIsReal ? ` (${formatHours(r.spentHours)} pointées)` : ' (prévue au devis)'}`,
].join(' · ');

/** Pastille « Marge réelle » d'un chantier, rouge sous le seuil. */
export const MarginBadge = ({ report, className = '' }) => {
    if (!report) return null;
    return (
        <span
            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums ${LEVEL_STYLE[report.level] || LEVEL_STYLE.ok} ${className}`}
            title={reportTooltip(report)}
        >
            {report.level === 'below' && <AlertTriangle className="w-3 h-3" aria-hidden="true" />}
            Marge {pct(report.margin)}
        </span>
    );
};

/**
 * Seuil d'alerte de marge, modifiable sur place. Enregistré dans
 * ai_preferences.margin_alert_threshold (synchronisé entre appareils).
 */
export const MarginThresholdEditor = ({ threshold }) => {
    const { user } = useAuth();
    const { invalidateProfile } = useInvalidateCache();
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState(String(threshold));
    const [saving, setSaving] = useState(false);

    useEffect(() => { if (!editing) setValue(String(threshold)); }, [threshold, editing]);

    const save = async (e) => {
        e?.preventDefault();
        const v = parseFloat(String(value).replace(',', '.'));
        if (!Number.isFinite(v) || v < 0 || v >= 100) {
            toast.error('Seuil invalide', { description: 'Indiquez un pourcentage entre 0 et 99.' });
            return;
        }
        if (!user) return;
        setSaving(true);
        try {
            await mergeAiPreferences(user.id, { margin_alert_threshold: v });
            invalidateProfile();
            setEditing(false);
            toast.success(`Alerte de marge sous ${v} %`);
        } catch (err) {
            toast.error('Enregistrement impossible', { description: err?.message });
        } finally {
            setSaving(false);
        }
    };

    if (!editing) {
        return (
            <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600"
                title="Modifier le seuil d'alerte de marge"
            >
                Alerte sous {threshold} % <Pencil className="w-3 h-3" aria-hidden="true" />
            </button>
        );
    }
    return (
        <form onSubmit={save} className="inline-flex items-center gap-1 text-xs">
            <label htmlFor="margin-threshold" className="text-gray-500 dark:text-gray-400">Alerte sous</label>
            <input
                id="margin-threshold"
                type="number"
                inputMode="decimal"
                min="0"
                max="99"
                step="1"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
                className="w-14 px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
            />
            <span className="text-gray-500 dark:text-gray-400">%</span>
            <button type="submit" disabled={saving} className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded" title="Enregistrer">
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button type="button" onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600 px-1">
                Annuler
            </button>
        </form>
    );
};

/**
 * Bandeau des chantiers dont la marge réelle est passée sous le seuil.
 * Rien n'est affiché si aucun chantier n'est en alerte, sauf `showWhenEmpty`
 * (page Pilotage : rappelle le seuil et permet de le régler).
 */
export const MarginAlertBanner = ({ alerts, threshold, trackedCount = 0, showWhenEmpty = false, compact = false }) => {
    const navigate = useNavigate();
    if (!alerts?.length) {
        if (!showWhenEmpty || trackedCount === 0) return null;
        return (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                <span>
                    Marge réelle suivie sur {trackedCount} chantier{trackedCount > 1 ? 's' : ''} : aucun sous le seuil.
                </span>
                <MarginThresholdEditor threshold={threshold} />
            </div>
        );
    }
    const shown = compact ? alerts.slice(0, 3) : alerts;
    return (
        <div role="alert" className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-900/20 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-red-800 dark:text-red-200 flex items-center gap-1.5">
                    <TrendingDown className="w-4 h-4" aria-hidden="true" />
                    {alerts.length} chantier{alerts.length > 1 ? 's' : ''} sous {threshold} % de marge réelle
                </p>
                {!compact && <MarginThresholdEditor threshold={threshold} />}
            </div>
            <ul className="mt-2 space-y-1">
                {shown.map(({ root, report }) => (
                    <li key={root.id}>
                        <button
                            type="button"
                            onClick={() => navigate(`/app/affaires/${root.id}`)}
                            className="w-full flex items-center gap-2 text-left text-sm rounded-lg px-2 py-1 -mx-2 hover:bg-red-100/70 dark:hover:bg-red-900/30"
                            title={reportTooltip(report)}
                        >
                            <span className="flex-1 min-w-0 truncate text-red-900 dark:text-red-100">
                                {root.clients?.name || root.client_name || 'Client'}
                                <span className="text-red-700/70 dark:text-red-300/70">{root.title ? ` · ${root.title}` : ''}</span>
                            </span>
                            <span className="font-semibold tabular-nums text-red-700 dark:text-red-300 whitespace-nowrap">
                                {pct(report.margin)}
                                <span className="font-normal text-xs"> (prévu {pct(report.plannedMargin)})</span>
                            </span>
                        </button>
                    </li>
                ))}
            </ul>
            {compact && alerts.length > shown.length && (
                <p className="text-xs text-red-700 dark:text-red-300 mt-1">
                    + {alerts.length - shown.length} autre{alerts.length - shown.length > 1 ? 's' : ''}
                </p>
            )}
        </div>
    );
};

const Row = ({ icon: Icon, label, planned, real, isReal, hint }) => (
    <tr className="border-t border-gray-100 dark:border-white/10">
        <th scope="row" className="py-2 pr-2 text-left font-normal text-gray-600 dark:text-gray-300">
            <span className="inline-flex items-center gap-1.5">
                <Icon className="w-3.5 h-3.5 text-gray-400" aria-hidden="true" />
                {label}
            </span>
            {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
        </th>
        <td className="py-2 px-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{planned}</td>
        <td className={`py-2 pl-2 text-right tabular-nums ${isReal ? 'font-semibold text-gray-900 dark:text-white' : 'text-gray-400 italic'}`}>
            {real}
        </td>
    </tr>
);

/**
 * Carte « Marge réelle » du suivi d'affaire : rapproche le devis (et ses
 * avenants signés) des achats saisis et des heures pointées, avec l'alerte
 * sous le seuil.
 */
export const ChantierMarginCard = ({ quote }) => {
    const [linkedRows, setLinkedRows] = useState(null);

    useEffect(() => {
        if (!quote?.id) return;
        let active = true;
        (async () => {
            const { data, error } = await supabase
                .from('quotes')
                .select('id, type, status, items, total_ht, parent_quote_id, amendment_details')
                .eq('parent_quote_id', quote.id);
            if (!active) return;
            if (error) console.error('ChantierMarginCard: avenants', error);
            setLinkedRows(data || []);
        })();
        return () => { active = false; };
    }, [quote?.id]);

    const roots = useMemo(() => (quote && linkedRows ? [quote] : []), [quote, linkedRows]);
    const { reports, threshold, laborRate } = useChantierMargins(roots, linkedRows || EMPTY);
    if (!quote || linkedRows === null) return null;
    const r = reports.get(Number(quote.id));

    if (!r) {
        return (
            <Card className="p-4 mb-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold text-gray-900 dark:text-white">Marge réelle</p>
                    <MarginThresholdEditor threshold={threshold} />
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    Rien de réalisé pour l'instant : saisissez vos achats (Matériel à commander) et pointez vos heures
                    pour comparer la marge réelle au devis.
                </p>
            </Card>
        );
    }

    const plannedLaborHours = r.estimatedHours;
    const isBelow = r.level === 'below';
    const border = isBelow
        ? 'border-red-200 dark:border-red-800'
        : r.level === 'watch' ? 'border-amber-200 dark:border-amber-800' : '';

    return (
        <Card className={`p-4 mb-4 ${border}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    Marge réelle
                    <MarginBadge report={r} />
                </p>
                <MarginThresholdEditor threshold={threshold} />
            </div>

            {isBelow && (
                <p className="mt-2 text-sm text-red-700 dark:text-red-300 flex items-start gap-1.5">
                    <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                    <span>
                        Marge passée sous {threshold} % ({r.gapPts} pts). Vérifiez les achats et le temps passé, ou
                        prévoyez un avenant pour les travaux en plus.
                    </span>
                </p>
            )}

            <table className="w-full text-sm mt-3">
                <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-gray-400">
                        <th scope="col" className="text-left font-medium pb-1">
                            {r.docCount > 1 ? `Devis + ${r.docCount - 1} avenant${r.docCount > 2 ? 's' : ''}` : 'Devis'}
                        </th>
                        <th scope="col" className="text-right font-medium pb-1 px-2">Prévu</th>
                        <th scope="col" className="text-right font-medium pb-1">Réel</th>
                    </tr>
                </thead>
                <tbody>
                    <tr className="border-t border-gray-100 dark:border-white/10">
                        <th scope="row" className="py-2 pr-2 text-left font-normal text-gray-600 dark:text-gray-300">Vendu HT</th>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-500 dark:text-gray-400">{formatAmount(r.revenue)}</td>
                        <td className="py-2 pl-2 text-right tabular-nums font-semibold text-gray-900 dark:text-white">{formatAmount(r.revenue)}</td>
                    </tr>
                    <Row
                        icon={ShoppingCart}
                        label="Achats matériel"
                        hint={r.totalCount > 0
                            ? `${r.pricedCount}/${r.totalCount} ligne${r.totalCount > 1 ? 's' : ''} au prix réel`
                            : 'aucun achat saisi'}
                        planned={formatAmount(r.plannedMaterialCost)}
                        real={r.materialIsReal ? formatAmount(r.materialCost) : `${formatAmount(r.materialCost)} (prévu)`}
                        isReal={r.materialIsReal}
                    />
                    <Row
                        icon={Clock}
                        label="Main d'œuvre"
                        hint={laborRate > 0
                            ? `${formatHours(r.spentHours)} pointées / ${formatHours(plannedLaborHours)} prévues × ${formatAmount(laborRate)}/h`
                            : `${formatHours(r.spentHours)} pointées / ${formatHours(plannedLaborHours)} prévues`}
                        planned={laborRate > 0 ? formatAmount(r.plannedLaborCost) : '—'}
                        real={r.laborIsReal ? formatAmount(r.laborCost) : laborRate > 0 ? `${formatAmount(r.laborCost)} (prévu)` : '—'}
                        isReal={r.laborIsReal}
                    />
                    <tr className="border-t border-gray-200 dark:border-white/20">
                        <th scope="row" className="py-2 pr-2 text-left font-semibold text-gray-900 dark:text-white">Marge</th>
                        <td className="py-2 px-2 text-right tabular-nums text-gray-500 dark:text-gray-400">
                            {formatAmount(r.revenue * r.plannedMargin)} · {pct(r.plannedMargin)}
                        </td>
                        <td className={`py-2 pl-2 text-right tabular-nums font-bold ${isBelow ? 'text-red-600 dark:text-red-400' : r.level === 'watch' ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {formatAmount(r.revenue - r.cost)} · {pct(r.margin)}
                        </td>
                    </tr>
                </tbody>
            </table>

            {laborRate <= 0 && (
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex items-start gap-1.5">
                    <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-blue-500" aria-hidden="true" />
                    <span>
                        Main d'œuvre non déduite : <Link to="/app/accounting?tab=conseils" className="text-blue-600 dark:text-blue-400 hover:underline">renseignez votre coût horaire</Link> pour une marge nette.
                    </span>
                </p>
            )}
            {!r.materialIsReal && (
                <p className="mt-1 text-xs text-gray-400">
                    Tant qu'aucun achat n'est saisi au prix réel, le matériel reste au coût prévu au devis.
                </p>
            )}
        </Card>
    );
};
