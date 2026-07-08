import { useEffect, useMemo, useRef, useState } from 'react';
import { Timer, Loader2, Info } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useInvalidateCache } from '../hooks/useDataCache';
import { computeHourlyCost, DEFAULT_BILLABLE_HOURS } from '../utils/laborCost';
import { DismissibleHelp } from './ui';

const fmtCurrency = (n) =>
    (Number.isFinite(n) ? n : 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Calculateur du coût horaire de revient de l'artisan, à sa place logique dans
 * la Comptabilité (onglet « Bilan & Conseils »). Pré-remplit ce qu'on connaît
 * déjà (charges professionnelles saisies, cotisations micro estimées) pour
 * limiter la saisie, puis enregistre le résultat dans ai_preferences.labor_cost_rate
 * afin que la marge des devis puisse déduire la main d'œuvre (marge nette).
 *
 * @param {object}  profile          Profil complet (pour lire/écrire ai_preferences).
 * @param {number}  chargesAnnual    Charges pro annualisées (summarizeCharges.annualTotal).
 * @param {?number} cotisationsAnnual Cotisations sociales annuelles estimées (ou null).
 * @param {?number} billingRate      Taux facturé actuel (ai_preferences.ai_hourly_rate).
 */
const HourlyCostCalculator = ({ profile, chargesAnnual = 0, cotisationsAnnual = null, billingRate = null }) => {
    const { user } = useAuth();
    const { invalidateProfile } = useInvalidateCache();
    const prefs = profile?.ai_preferences || {};
    const saved = prefs.labor_cost_inputs || {};

    // Valeurs initiales : dernière saisie mémorisée, sinon pré-remplissage depuis
    // les données comptables déjà disponibles.
    const [netMonthly, setNetMonthly] = useState(() => saved.netMonthly ?? '');
    const [cotisations, setCotisations] = useState(
        () => saved.cotisations ?? (cotisationsAnnual != null ? Math.round(cotisationsAnnual) : '')
    );
    const [fixedCharges, setFixedCharges] = useState(
        () => saved.fixedCharges ?? (chargesAnnual > 0 ? Math.round(chargesAnnual) : '')
    );
    const [billableHours, setBillableHours] = useState(() => saved.billableHours ?? DEFAULT_BILLABLE_HOURS);
    const [saving, setSaving] = useState(false);

    // Les charges/cotisations sont chargées en asynchrone par le parent : on
    // complète le pré-remplissage quand elles arrivent, sans écraser une valeur
    // déjà mémorisée ni une saisie de l'utilisateur (champ resté vide).
    const cotisationsTouched = useRef(saved.cotisations != null);
    const fixedTouched = useRef(saved.fixedCharges != null);
    useEffect(() => {
        if (!cotisationsTouched.current && cotisations === '' && cotisationsAnnual != null && cotisationsAnnual > 0) {
            setCotisations(Math.round(cotisationsAnnual));
        }
    }, [cotisationsAnnual]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (!fixedTouched.current && fixedCharges === '' && chargesAnnual > 0) {
            setFixedCharges(Math.round(chargesAnnual));
        }
    }, [chargesAnnual]); // eslint-disable-line react-hooks/exhaustive-deps

    const netAnnual = (parseFloat(netMonthly) || 0) * 12;
    const result = useMemo(
        () => computeHourlyCost({ netAnnual, cotisations, fixedCharges, billableHours }),
        [netAnnual, cotisations, fixedCharges, billableHours]
    );

    const savedRate = prefs.labor_cost_rate;
    const rate = result.hourlyCost;
    const billing = parseFloat(billingRate) || 0;
    const laborMarginPct = billing > 0 && rate > 0 ? Math.round(((billing - rate) / billing) * 100) : null;

    const handleSave = async () => {
        if (!user || rate <= 0) return;
        setSaving(true);
        try {
            // Lecture-modification-écriture : ne pas écraser les autres clés de
            // ai_preferences (clé API, zones, taux facturé…).
            const nextPrefs = {
                ...prefs,
                labor_cost_rate: round2(rate),
                labor_cost_inputs: {
                    netMonthly: parseFloat(netMonthly) || 0,
                    cotisations: parseFloat(cotisations) || 0,
                    fixedCharges: parseFloat(fixedCharges) || 0,
                    billableHours: parseFloat(billableHours) || 0,
                },
            };
            const { error } = await supabase.from('profiles').update({ ai_preferences: nextPrefs }).eq('id', user.id);
            if (error) throw error;
            invalidateProfile();
            toast.success('Coût horaire enregistré', {
                description: 'Vos devis afficheront désormais une marge nette (main d\'œuvre incluse).',
            });
        } catch (err) {
            toast.error('Enregistrement impossible', { description: err?.message });
        } finally {
            setSaving(false);
        }
    };

    const inputCls =
        'w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500';

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-1">
                <Timer className="w-5 h-5 mr-2 text-blue-600" />
                Mon coût horaire
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
                Ce que vous coûte réellement une heure de travail. Il sert de repère pour fixer vos prix et permet à vos
                devis d'afficher une <strong>marge nette</strong> (main d'œuvre déduite, pas seulement la matière).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Rémunération nette souhaitée
                    </label>
                    <div className="relative">
                        <input type="number" inputMode="decimal" min="0" value={netMonthly}
                            onChange={(e) => setNetMonthly(e.target.value)} placeholder="ex : 2000" className={inputCls} />
                        <span className="absolute right-3 top-2 text-gray-400 text-sm">€/mois</span>
                    </div>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Cotisations sociales
                    </label>
                    <div className="relative">
                        <input type="number" inputMode="decimal" min="0" value={cotisations}
                            onChange={(e) => { cotisationsTouched.current = true; setCotisations(e.target.value); }} placeholder="ex : 11000" className={inputCls} />
                        <span className="absolute right-3 top-2 text-gray-400 text-sm">€/an</span>
                    </div>
                    {cotisationsAnnual != null && (
                        <p className="text-xs text-gray-400 mt-1">Estimé depuis votre CA</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Autres charges pro
                    </label>
                    <div className="relative">
                        <input type="number" inputMode="decimal" min="0" value={fixedCharges}
                            onChange={(e) => { fixedTouched.current = true; setFixedCharges(e.target.value); }} placeholder="ex : 12000" className={inputCls} />
                        <span className="absolute right-3 top-2 text-gray-400 text-sm">€/an</span>
                    </div>
                    {chargesAnnual > 0 && (
                        <p className="text-xs text-gray-400 mt-1">Repris de vos charges saisies</p>
                    )}
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Heures facturables
                    </label>
                    <div className="relative">
                        <input type="number" inputMode="decimal" min="0" value={billableHours}
                            onChange={(e) => setBillableHours(e.target.value)} placeholder="1200" className={inputCls} />
                        <span className="absolute right-3 top-2 text-gray-400 text-sm">h/an</span>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">Pas 1607 h : retirez congés, trajets, devis, gestion…</p>
                </div>
            </div>

            {/* Résultat */}
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-6 text-white">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-blue-100">Votre coût horaire de revient</p>
                        <p className="text-4xl font-bold">
                            {rate > 0 ? `${round2(rate).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €/h` : '—'}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || rate <= 0}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/15 hover:bg-white/25 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {savedRate ? 'Mettre à jour' : 'Enregistrer'}
                    </button>
                </div>
                {rate > 0 && (
                    <p className="text-sm text-blue-100 mt-3 pt-3 border-t border-blue-400">
                        {fmtCurrency(result.annualTotal)} à couvrir ÷ {Math.round(result.billableHours)} h
                        {laborMarginPct != null && (
                            <> · vous facturez {fmtCurrency(billing)}/h → marge sur main d'œuvre ≈ <strong>{laborMarginPct} %</strong></>
                        )}
                    </p>
                )}
            </div>

            <DismissibleHelp storageKey="cout_horaire_intro">
                <div className="flex items-start gap-2.5 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/40 rounded-lg px-4 py-3 pr-10 mt-3 text-sm">
                    <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-blue-800 dark:text-blue-200 leading-relaxed">
                        <strong>Méthode</strong> — additionnez ce que vous devez gagner (rémunération nette), vos cotisations
                        et vos charges professionnelles annuelles, puis divisez par les heures réellement facturées dans
                        l'année. Facturez ensuite <em>au-dessus</em> de ce coût pour dégager une marge.
                    </p>
                </div>
            </DismissibleHelp>
        </div>
    );
};

export default HourlyCostCalculator;
