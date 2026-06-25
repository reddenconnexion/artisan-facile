import { useState, useMemo } from 'react';
import {
  Sparkles, TrendingUp, Loader2, AlertCircle, Lightbulb, Scale,
  Receipt, ShieldCheck, Info, ArrowRight, Euro, Percent,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid,
} from 'recharts';
import {
  analyzeFinancials, buildAdviceFacts, STATUS_LABELS,
  summarizeCharges, computeStatusComparison,
} from '../utils/accountingAdvisor';
import { generateAccountingAdvice } from '../utils/aiService';
import ChargesManager from './ChargesManager';

const fmtCurrency = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const PRIORITY_STYLES = {
  haute: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  moyenne: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  basse: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
};

const CATEGORY_META = {
  statut: { label: 'Statut juridique', icon: Scale },
  cotisations: { label: 'Cotisations sociales', icon: Percent },
  impot: { label: 'Impôt', icon: Euro },
  tva: { label: 'TVA', icon: Receipt },
  charges: { label: 'Charges déductibles', icon: Receipt },
  tresorerie: { label: 'Trésorerie', icon: TrendingUp },
};

const KpiCard = ({ label, value, sub, accent = 'text-gray-900 dark:text-white' }) => (
  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4">
    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</p>
    <p className={`text-2xl font-bold ${accent}`}>{value}</p>
    {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
  </div>
);

const VERDICT_META = {
  micro: { label: 'Le régime micro reste le plus avantageux', cls: 'text-indigo-700 dark:text-indigo-300' },
  reel: { label: 'Un passage au régime réel serait plus avantageux', cls: 'text-emerald-700 dark:text-emerald-300' },
  comparable: { label: 'Les deux régimes sont proches', cls: 'text-gray-700 dark:text-gray-300' },
};

// Colonne d'un régime dans la comparaison chiffrée.
const RegimeColumn = ({ title, cotisations, base, highlight }) => (
  <div className={`flex-1 rounded-xl p-4 border ${highlight ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20' : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40'}`}>
    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{title}</p>
    <div className="space-y-1.5 text-sm">
      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Cotisations</span><span className="font-medium text-gray-900 dark:text-white">{cotisations}</span></div>
      <div className="flex justify-between"><span className="text-gray-500 dark:text-gray-400">Base imposable</span><span className="font-medium text-gray-900 dark:text-white">{base}</span></div>
    </div>
  </div>
);

const ComparisonCard = ({ comparison, fmtCurrency }) => {
  const meta = VERDICT_META[comparison.verdict] || VERDICT_META.comparable;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-1">
        <Scale className="w-5 h-5 mr-2 text-indigo-600" />
        Micro vs régime réel
      </h3>
      <p className={`text-sm font-medium mb-4 ${meta.cls}`}>{meta.label}</p>
      <div className="flex flex-col sm:flex-row gap-3">
        <RegimeColumn
          title="Régime micro"
          cotisations={fmtCurrency(comparison.micro.cotisations)}
          base={fmtCurrency(comparison.micro.taxable)}
          highlight={comparison.verdict === 'micro'}
        />
        <RegimeColumn
          title="Régime réel (estimé)"
          cotisations={fmtCurrency(comparison.reel.cotisations)}
          base={fmtCurrency(comparison.reel.taxable)}
          highlight={comparison.verdict === 'reel'}
        />
      </div>
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
          <Receipt className="w-3.5 h-3.5" />
          Charges déclarées : {(comparison.chargesRatio * 100).toFixed(0)} % du CA
        </div>
        <div className={`flex items-center gap-1.5 font-medium ${comparison.globalSaving > 0 ? 'text-emerald-600' : 'text-gray-500 dark:text-gray-400'}`}>
          <TrendingUp className="w-3.5 h-3.5" />
          Gain global estimé au réel : {comparison.globalSaving > 0 ? fmtCurrency(comparison.globalSaving) : '—'}
        </div>
      </div>
      {comparison.overMicroCeiling && (
        <p className="mt-3 text-xs text-amber-600 dark:text-amber-400">
          ⚠ Votre CA de référence dépasse le plafond micro : le régime réel devient obligatoire.
        </p>
      )}
      <p className="mt-3 text-[11px] text-gray-400 dark:text-gray-500 leading-relaxed">
        Estimations indicatives (cotisations réel ≈ 45 % du résultat, impôt estimé sur une base neutre). L'analyse IA
        ci-dessous affine ce calcul ; validez tout changement avec un expert-comptable.
      </p>
    </div>
  );
};

const AccountingAdvisor = ({ invoices = [], profile }) => {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [charges, setCharges] = useState([]);

  const prefs = profile?.ai_preferences || {};

  const analysis = useMemo(
    () => analyzeFinancials(invoices, prefs),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [invoices, prefs.artisan_status, prefs.activity_type, prefs.has_acre]
  );

  const chargesSummary = useMemo(() => summarizeCharges(charges), [charges]);
  const comparison = useMemo(
    () => computeStatusComparison(analysis, chargesSummary.annualTotal),
    [analysis, chargesSummary.annualTotal]
  );

  const chartData = useMemo(
    () =>
      analysis.years.map((y) => ({
        annee: String(y.year) + (y.isCurrent ? '*' : ''),
        Services: Math.round(y.caServices),
        Vente: Math.round(y.caVente),
        Charges: y.charges != null ? Math.round(y.charges) : 0,
      })),
    [analysis]
  );

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);
    try {
      const facts = buildAdviceFacts(analysis, { chargesSummary, comparison });
      const result = await generateAccountingAdvice({ facts });
      setAdvice(result);
    } catch (err) {
      const message = err?.message || "Erreur de l'assistant";
      if (/limite|quota|free|monthly/i.test(message)) {
        setError("Vous avez atteint la limite mensuelle de l'assistant IA. Passez au plan Pro pour un accès illimité.");
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!analysis.hasData) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-8 text-center">
          <Lightbulb className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-300 font-medium">Pas encore assez de données à analyser</p>
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
            Marquez quelques factures comme «&nbsp;Payé&nbsp;» pour que le conseiller puisse analyser votre activité et son évolution.
          </p>
        </div>
        {/* La saisie des charges reste accessible pour préparer la comparaison. */}
        <ChargesManager onChange={setCharges} />
      </div>
    );
  }

  const growth = analysis.headlineGrowth;
  const lastYear = analysis.years[analysis.years.length - 1];
  const totalCharges = analysis.years.reduce((s, y) => s + (y.charges || 0), 0);

  return (
    <div className="space-y-6">
      {/* Intro */}
      <div className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-900/20 dark:to-blue-900/20 border border-indigo-100 dark:border-indigo-800/50 rounded-2xl px-5 py-4 flex gap-3 items-start">
        <span className="text-2xl leading-none mt-0.5">🧮</span>
        <div>
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-1">Votre conseiller comptable</p>
          <p className="text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
            Cet outil analyse l'ensemble de vos résultats et leur évolution, puis vous conseille comme un expert-comptable
            sur le statut et les démarches qui vous permettraient de payer le moins possible de cotisations sociales et de
            déduire un maximum de charges, en toute légalité.
          </p>
        </div>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          label={`CA ${lastYear.year}${lastYear.isCurrent ? ' (en cours)' : ''}`}
          value={fmtCurrency(lastYear.caTotal)}
          sub={`${lastYear.count} facture${lastYear.count > 1 ? 's' : ''} encaissée${lastYear.count > 1 ? 's' : ''}`}
        />
        <KpiCard
          label="Tendance"
          value={growth == null ? '—' : `${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(0)} %`}
          sub={analysis.projection ? 'projeté vs année complète' : 'sur la dernière période'}
          accent={growth == null ? 'text-gray-900 dark:text-white' : growth >= 0 ? 'text-green-600' : 'text-red-600'}
        />
        <KpiCard
          label="Cotisations estimées (cumul)"
          value={analysis.isMicro ? fmtCurrency(totalCharges) : 'Régime réel'}
          sub={analysis.isMicro ? 'sur l\'historique' : 'calcul via expert-comptable'}
        />
        <KpiCard
          label="Plafond micro utilisé"
          value={`${analysis.thresholds.caUsedPct.toFixed(0)} %`}
          sub={`sur ${fmtCurrency(analysis.thresholds.caLimit)}`}
          accent={
            analysis.thresholds.caUsedPct >= 100
              ? 'text-red-600'
              : analysis.thresholds.nearCaLimit
                ? 'text-amber-600'
                : 'text-gray-900 dark:text-white'
          }
        />
      </div>

      {/* Graphique d'évolution */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-4">
          <TrendingUp className="w-5 h-5 mr-2 text-indigo-600" />
          Évolution de votre activité
        </h3>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" strokeOpacity={0.4} vertical={false} />
              <XAxis dataKey="annee" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12 }} />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
                width={40}
              />
              <Tooltip
                contentStyle={{ fontSize: '12px', borderRadius: '8px', border: '1px solid #E5E7EB' }}
                formatter={(val, name) => [fmtCurrency(val), name]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Services" stackId="ca" fill="#6366F1" radius={[0, 0, 0, 0]} />
              <Bar dataKey="Vente" stackId="ca" fill="#22C55E" radius={[4, 4, 0, 0]} />
              {analysis.isMicro && <Bar dataKey="Charges" fill="#F59E0B" radius={[4, 4, 0, 0]} />}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
          * Année en cours (incomplète).{' '}
          {analysis.projection &&
            `Projection annuelle ${analysis.currentYear} ≈ ${fmtCurrency(analysis.projection.caProjected)} sur la base de ${analysis.projection.monthsElapsed} mois.`}
        </p>
      </div>

      {/* Saisie des charges déductibles */}
      <ChargesManager onChange={setCharges} />

      {/* Comparaison chiffrée micro vs réel (déterministe, locale) */}
      {comparison && <ComparisonCard comparison={comparison} fmtCurrency={fmtCurrency} />}

      {/* Bouton de génération */}
      {!advice && (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-br from-indigo-100 to-blue-100 dark:from-indigo-900/30 dark:to-blue-900/30 mb-3">
            <Sparkles className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <p className="text-base font-semibold text-gray-900 dark:text-white mb-1">
            Obtenez vos conseils d'optimisation
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            L'IA analyse votre statut actuel ({STATUS_LABELS[analysis.status] || analysis.status}), vos chiffres et leur
            évolution pour vous recommander les démarches les plus profitables.
          </p>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 text-white rounded-xl font-medium shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {loading ? 'Analyse en cours…' : 'Analyser ma situation'}
          </button>
          {error && (
            <div className="mt-4 flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl px-3 py-2.5 text-xs text-red-700 dark:text-red-300 text-left max-w-md mx-auto">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Résultat des conseils */}
      {advice && (
        <div className="space-y-5">
          {/* Synthèse + statut */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
                <Sparkles className="w-5 h-5 mr-2 text-indigo-600" />
                Synthèse
              </h3>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 flex items-center gap-1 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Régénérer
              </button>
            </div>
            {advice.synthese && (
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed mb-4">{advice.synthese}</p>
            )}
            {(advice.statut.actuel || advice.statut.recommande) && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
                <div className="flex items-center flex-wrap gap-2 text-sm">
                  <Scale className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-gray-600 dark:text-gray-300">{advice.statut.actuel || '—'}</span>
                  <ArrowRight className="w-4 h-4 text-indigo-400" />
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                    {advice.statut.recommande || '—'}
                  </span>
                </div>
                {advice.statut.raison && (
                  <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 leading-relaxed">{advice.statut.raison}</p>
                )}
              </div>
            )}
          </div>

          {/* Comparatif micro vs réel détaillé par l'IA */}
          {advice.comparatif_statut && (advice.comparatif_statut.explication || advice.comparatif_statut.micro.cotisations) && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center mb-3">
                <Scale className="w-5 h-5 mr-2 text-indigo-600" />
                Comparaison micro vs réel — analyse
              </h3>
              {advice.comparatif_statut.explication && (
                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-4">{advice.comparatif_statut.explication}</p>
              )}
              <div className="flex flex-col sm:flex-row gap-3">
                {[
                  { key: 'micro', title: 'Régime micro', data: advice.comparatif_statut.micro },
                  { key: 'reel', title: 'Régime réel', data: advice.comparatif_statut.reel },
                ].map(({ key, title, data }) => (
                  <div
                    key={key}
                    className={`flex-1 rounded-xl p-4 border ${
                      advice.comparatif_statut.verdict === key
                        ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50/60 dark:bg-emerald-900/20'
                        : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/40'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 dark:text-white mb-2">{title}</p>
                    {data.cotisations && (
                      <div className="flex justify-between text-sm"><span className="text-gray-500 dark:text-gray-400">Cotisations</span><span className="font-medium text-gray-900 dark:text-white">{data.cotisations}</span></div>
                    )}
                    {data.base_imposable && (
                      <div className="flex justify-between text-sm mt-1"><span className="text-gray-500 dark:text-gray-400">Base imposable</span><span className="font-medium text-gray-900 dark:text-white">{data.base_imposable}</span></div>
                    )}
                    {data.commentaire && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">{data.commentaire}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommandations */}
          {advice.recommandations.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center px-1">
                <Lightbulb className="w-5 h-5 mr-2 text-amber-500" />
                Recommandations ({advice.recommandations.length})
              </h3>
              {advice.recommandations.map((rec, idx) => {
                const meta = CATEGORY_META[rec.categorie] || CATEGORY_META.charges;
                const Icon = meta.icon;
                return (
                  <div
                    key={idx}
                    className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-5"
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-start gap-3">
                        <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white text-sm">{rec.titre}</p>
                          <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">{meta.label}</p>
                        </div>
                      </div>
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${PRIORITY_STYLES[rec.priorite]}`}>
                        {rec.priorite === 'haute' ? 'Priorité haute' : rec.priorite === 'basse' ? 'Priorité basse' : 'Priorité moyenne'}
                      </span>
                    </div>
                    {rec.explication && (
                      <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-3">{rec.explication}</p>
                    )}
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs">
                      {rec.gain_estime && (
                        <span className="inline-flex items-center gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 px-2.5 py-1 rounded-lg font-medium">
                          <TrendingUp className="w-3.5 h-3.5" />
                          {rec.gain_estime}
                        </span>
                      )}
                      {rec.action && (
                        <span className="inline-flex items-center gap-1 text-gray-500 dark:text-gray-400">
                          <ArrowRight className="w-3.5 h-3.5" />
                          {rec.action}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Charges déductibles */}
          {advice.charges_deductibles.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white flex items-center mb-4">
                <Receipt className="w-5 h-5 mr-2 text-green-600" />
                Charges à penser à déduire
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {advice.charges_deductibles.map((c, idx) => (
                  <div key={idx} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{c.poste}</p>
                    {c.exemple && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{c.exemple}</p>}
                    {c.condition && (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">⚠ {c.condition}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Points de vigilance */}
          {advice.points_vigilance.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40 rounded-2xl p-5">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 flex items-center mb-2">
                <ShieldCheck className="w-4 h-4 mr-2" />
                Points de vigilance
              </h3>
              <ul className="space-y-1.5">
                {advice.points_vigilance.map((p, idx) => (
                  <li key={idx} className="text-sm text-amber-800 dark:text-amber-300 flex items-start gap-2">
                    <span className="mt-1.5 w-1 h-1 rounded-full bg-amber-500 flex-shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/40 rounded-xl px-3 py-2.5 text-xs text-red-700 dark:text-red-300">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}
        </div>
      )}

      {/* Avertissement légal */}
      <div className="flex items-start gap-2.5 text-xs text-gray-500 dark:text-gray-400 px-1">
        <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <p className="leading-relaxed">
          {advice?.avertissement ||
            "Ces analyses et conseils sont fournis à titre informatif et ne constituent pas un avis comptable ou fiscal personnalisé. Validez toute démarche importante (changement de statut, option fiscale) avec un expert-comptable."}
        </p>
      </div>
    </div>
  );
};

export default AccountingAdvisor;
