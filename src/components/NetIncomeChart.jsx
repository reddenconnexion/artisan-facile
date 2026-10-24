import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine, Cell } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '../utils/format';

const MONTH_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const POSITIVE = '#059669';
const NEGATIVE = '#EF4444';

const TooltipContent = ({ active, payload, isMicro }) => {
  if (!active || !payload?.length) return null;
  const m = payload[0].payload;
  const row = (label, value, cls = '') => (
    <div className={`flex justify-between gap-4 ${cls}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-sm px-3 py-2 text-xs text-gray-600 dark:text-gray-300 space-y-0.5">
      <p className="font-semibold text-gray-900 dark:text-white mb-1">{m.label}</p>
      {row('CA encaissé', formatCurrency(m.caTotal))}
      {row('Marge chantier', formatCurrency(m.margeChantier))}
      {isMicro && (
        <>
          {row(`URSSAF${m.hasAcre ? ' (ACRE)' : ''}`, `− ${formatCurrency(m.urssafCharges)}`)}
          {row('Charges pro', `− ${formatCurrency(m.proChargesForPeriod)}`)}
          {row('Impôt estimé', `− ${formatCurrency(m.incomeTax)}`)}
          {row('Revenu net', formatCurrency(m.revenuNet), 'pt-1 mt-1 border-t border-gray-100 dark:border-gray-700 font-semibold text-gray-900 dark:text-white')}
        </>
      )}
    </div>
  );
};

/**
 * Courbe du revenu net mois par mois (Comptabilité). Un clic sur une barre
 * ouvre le détail de ce mois dans le bloc « Revenu net ».
 *
 * @param {object} props
 * @param {Array} props.series        Résultat de monthlyNetIncomeSeries.
 * @param {number} props.year
 * @param {boolean} props.isMicro     Hors micro : marge chantier seulement.
 * @param {string} props.acreEndMonth 'YYYY-MM' ou ''.
 * @param {(value: string) => void} props.onAcreEndMonthChange
 * @param {(month: number) => void} props.onSelectMonth
 */
const NetIncomeChart = ({ series, year, isMicro, acreEndMonth, onAcreEndMonthChange, onSelectMonth }) => {
  const valueKey = isMicro ? 'revenuNet' : 'margeChantier';
  const data = series.map(m => ({ ...m, label: `${MONTH_SHORT[m.month]} ${year}`, short: MONTH_SHORT[m.month] }));
  const total = data.reduce((sum, m) => sum + m[valueKey], 0);
  const average = data.length ? total / data.length : 0;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-4">
        <TrendingUp className="w-5 h-5 mr-2 text-emerald-600" />
        {isMicro ? 'Revenu net' : 'Marge chantier'} mois par mois — {year}
      </h3>

      {data.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Aucun encaissement sur {year}.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Cumul {year}</p>
              <p className={`text-xl font-bold ${total < 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{formatCurrency(total)}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Moyenne par mois ({data.length} mois)</p>
              <p className={`text-xl font-bold ${average < 0 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>{formatCurrency(average)}</p>
            </div>
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.4} vertical={false} />
                <XAxis dataKey="short" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 11 }} interval={0} />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  tickFormatter={(v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })}k` : v)}
                  width={40}
                />
                <ReferenceLine y={0} stroke="#9CA3AF" />
                <Tooltip content={<TooltipContent isMicro={isMicro} />} cursor={{ fill: 'rgba(156, 163, 175, 0.12)' }} />
                <Bar
                  dataKey={valueKey}
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(entry) => onSelectMonth(entry?.payload?.month ?? entry?.month)}
                >
                  {data.map(m => (
                    <Cell key={m.key} fill={m[valueKey] < 0 ? NEGATIVE : POSITIVE} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Même calcul que le bloc « Revenu net » ci-dessus, avec tes réglages de marge matériel et d'impôt.
            Touche un mois pour voir son détail. Un mois sans encaissement reste négatif de tes charges pro.
          </p>
        </>
      )}

      {isMicro && (
        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700 flex flex-col sm:flex-row sm:items-center gap-2">
          <label htmlFor="acre-end-month" className="text-sm text-gray-700 dark:text-gray-300">
            Dernier mois sous ACRE
          </label>
          <input
            id="acre-end-month"
            type="month"
            value={acreEndMonth}
            onChange={(e) => onAcreEndMonthChange(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
          />
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {acreEndMonth
              ? 'Taux réduit jusqu’à ce mois inclus, taux normal ensuite.'
              : 'Vide : la case ACRE ci-dessus s’applique à tous les mois.'}
          </span>
        </div>
      )}
    </div>
  );
};

export default NetIncomeChart;
