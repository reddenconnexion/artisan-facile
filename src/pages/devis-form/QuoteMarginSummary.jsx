import { Layers, Clock, Info, ShoppingCart } from 'lucide-react';
import { estimatedHoursFromItems, formatHours } from '../../utils/timeTracking';

/**
 * Marge — nette (main d'œuvre incluse) si le coût horaire est renseigné,
 * sinon marge matière. Invite contextuelle pour renseigner le coût horaire
 * quand il manque, puis marges réalisées (document et chantier).
 */
const QuoteMarginSummary = ({
    formData,
    navigate,
    quoteMargins,
}) => {
    const { laborRate, planned: m, realized: r, chantier: cr } = quoteMargins;
    const laborHours = estimatedHoursFromItems(formData.items);
    const showPrompt = laborHours > 0 && laborRate <= 0;

    return (
    <>
        {showPrompt && (
            <div className="flex items-start gap-2 pt-2 border-t border-dashed border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-blue-500" />
                <span>
                    {laborHours}h de main d'œuvre non déduites.{' '}
                    <button
                        type="button"
                        onClick={() => navigate('/app/accounting?tab=conseils')}
                        className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                        Calculer mon coût horaire
                    </button>{' '}
                    pour voir votre marge nette.
                </span>
            </div>
        )}
        {m.cost > 0 && m.revenue > 0 && (() => {
            const pct = Math.round(m.margin * 100);
            const color = m.margin >= 0.35 ? 'text-green-600' : m.margin >= 0.20 ? 'text-orange-500' : 'text-red-500';
            const tip = m.hasLabor
                ? `Matière : ${m.materialCost.toFixed(2)} € · Main d'œuvre : ${m.laborHours}h × ${laborRate.toFixed(2)}€ = ${m.laborCost.toFixed(2)} €`
                : `Coût matière : ${m.materialCost.toFixed(2)} €`;
            return (
                <div className="flex justify-between text-sm pt-2 border-t border-dashed border-gray-100 dark:border-gray-800">
                    <span className="text-gray-400">{m.hasLabor ? 'Marge nette' : 'Marge matière'}</span>
                    <span className={`font-semibold ${color}`} title={tip}>
                        {pct} %
                    </span>
                </div>
            );
        })()}
        {/* Marge RÉALISÉE : recalculée avec les prix d'achat
            réels saisis dans « Matériel à commander » et les
            heures réellement pointées sur le chantier.
            Purement informatif : le devis n'est jamais modifié. */}
        {r && (() => {
            const pct = Math.round(r.margin * 100);
            const color = r.margin >= 0.35 ? 'text-green-600' : r.margin >= 0.20 ? 'text-orange-500' : 'text-red-500';
            const deltaPts = Math.round(r.delta * 100);
            const sources = [
                r.materialIsReal ? `matière réelle ${r.materialCost.toFixed(2)} € (${r.pricedCount}/${r.totalCount} achat${r.totalCount > 1 ? 's' : ''} au prix renseigné)` : null,
                r.laborIsReal ? `main d'œuvre pointée ${formatHours(r.spentHours)} × ${laborRate.toFixed(2)} € = ${r.laborCost.toFixed(2)} €` : null,
            ].filter(Boolean).join(' · ');
            const tip = `D'après le terrain : ${sources}. Marge prévue au devis : ${Math.round(r.plannedMargin * 100)} %.`;
            const hoursOver = r.laborIsReal && r.estimatedHours > 0
                ? r.spentHours - r.estimatedHours
                : 0;
            return (
                <>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400 inline-flex items-center gap-1">
                            <ShoppingCart className="w-3.5 h-3.5" />
                            Marge réalisée{r.laborIsReal && r.materialIsReal ? '' : r.laborIsReal ? ' (pointage)' : ' (achats)'}
                        </span>
                        <span className={`font-semibold ${color}`} title={tip}>
                            {pct} %
                            {deltaPts !== 0 && (
                                <span className={`ml-1.5 font-normal text-xs ${deltaPts > 0 ? 'text-green-500' : 'text-red-400'}`}>
                                    ({deltaPts > 0 ? '+' : ''}{deltaPts} pt{Math.abs(deltaPts) > 1 ? 's' : ''})
                                </span>
                            )}
                        </span>
                    </div>
                    {/* Rentabilité main d'œuvre : temps pointé vs heures facturées */}
                    {r.spentHours > 0 && r.estimatedHours > 0 && (
                        <div className="flex justify-between text-xs text-gray-400">
                            <span className="inline-flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                Temps pointé
                            </span>
                            <span title={hoursOver > 0 ? `Dépassement : ${formatHours(hoursOver)} de plus que la main d'œuvre facturée` : 'Dans le temps facturé au devis'}>
                                {formatHours(r.spentHours)} / {formatHours(r.estimatedHours)} facturées
                                {hoursOver > 0 && (
                                    <span className="ml-1 text-red-400 font-medium">(+{formatHours(hoursOver)})</span>
                                )}
                            </span>
                        </div>
                    )}
                </>
            );
        })()}
        {/* Marge RÉALISÉE consolidée du CHANTIER (devis initial +
            avenants signés) : les coûts réels s'accumulent le plus
            souvent sur le seul devis initial alors que le CA est
            réparti entre lui et ses avenants — un indicateur par
            document peut donc être trompeur ou absent (voir
            docs/analyse-marge-avenants.md). N'apparaît que s'il y a
            au moins un avenant signé, sinon identique au bloc ci-dessus. */}
        {cr && (() => {
            const pct = Math.round(cr.margin * 100);
            const color = cr.margin >= 0.35 ? 'text-green-600' : cr.margin >= 0.20 ? 'text-orange-500' : 'text-red-500';
            const deltaPts = Math.round(cr.delta * 100);
            const amendmentCount = cr.docCount - 1;
            const sources = [
                cr.materialIsReal ? `matière réelle ${cr.materialCost.toFixed(2)} € (${cr.pricedCount}/${cr.totalCount} achat${cr.totalCount > 1 ? 's' : ''} au prix renseigné)` : null,
                cr.laborIsReal ? `main d'œuvre pointée ${formatHours(cr.spentHours)} × ${laborRate.toFixed(2)} € = ${cr.laborCost.toFixed(2)} €` : null,
            ].filter(Boolean).join(' · ');
            const tip = `Devis initial + ${amendmentCount} avenant${amendmentCount > 1 ? 's' : ''} signé${amendmentCount > 1 ? 's' : ''}, CA cumulé ${cr.revenue.toFixed(2)} € HT. D'après le terrain : ${sources}. Marge prévue du chantier : ${Math.round(cr.plannedMargin * 100)} %.`;
            return (
                <div className="flex justify-between text-sm pt-2 mt-1 border-t border-dashed border-gray-100 dark:border-gray-800">
                    <span className="text-gray-400 inline-flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5" />
                        Marge réalisée du chantier
                    </span>
                    <span className={`font-semibold ${color}`} title={tip}>
                        {pct} %
                        {deltaPts !== 0 && (
                            <span className={`ml-1.5 font-normal text-xs ${deltaPts > 0 ? 'text-green-500' : 'text-red-400'}`}>
                                ({deltaPts > 0 ? '+' : ''}{deltaPts} pt{Math.abs(deltaPts) > 1 ? 's' : ''})
                            </span>
                        )}
                    </span>
                </div>
            );
        })()}
    </>
    );
};

export default QuoteMarginSummary;
