import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Calculator, TrendingUp, Calendar, AlertCircle, CheckCircle, Info, Euro, FileText, Settings, ChevronDown, ChevronUp } from 'lucide-react';
import { Link } from 'react-router-dom';

// Taux URSSAF 2024/2025 pour micro-entrepreneurs
const URSSAF_RATES = {
  micro_entreprise: {
    services: { normal: 0.212, acre: 0.106, label: 'Prestations de services artisanaux (BIC)' },
    vente: { normal: 0.123, acre: 0.062, label: 'Achat/revente de marchandises (BIC)' },
    liberal: { normal: 0.211, acre: 0.106, label: 'Profession libérale (BNC)' },
    mixte: {
      services: { normal: 0.212, acre: 0.106 },
      vente: { normal: 0.123, acre: 0.062 }
    }
  },
  // Pour les autres statuts, les calculs sont plus complexes
  // On affiche un message informatif
  ei: null,
  eirl: null,
  eurl: null,
  sasu: null,
  sarl: null
};

const STATUS_LABELS = {
  micro_entreprise: 'Micro-entreprise (Auto-entrepreneur)',
  ei: 'Entreprise Individuelle (EI)',
  eirl: 'EIRL',
  eurl: 'EURL',
  sasu: 'SASU',
  sarl: 'SARL'
};

const ACTIVITY_LABELS = {
  services: 'Prestations de services artisanaux',
  vente: 'Achat/revente de marchandises',
  mixte: 'Activité mixte',
  liberal: 'Profession libérale'
};

// Plafonds de CA micro-entreprise 2024
const CA_LIMITS = {
  services: 77700,
  vente: 188700,
  liberal: 77700
};

// Seuils Franchise en base de TVA 2024
// Base: seuil standard. Majoré: seuil de tolérance (passage immédiat si dépassé)
const VAT_LIMITS = {
  services: { base: 36800, majore: 39100 },
  vente: { base: 91900, majore: 101000 },
  liberal: { base: 36800, majore: 39100 }
};

const Accounting = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedPeriod, setSelectedPeriod] = useState('month'); // 'month' ou 'quarter'
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedQuarter, setSelectedQuarter] = useState(Math.floor(new Date().getMonth() / 3));
  const [hasAcre, setHasAcre] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // CA manuel (pour saisie directe)
  const [manualCa, setManualCa] = useState('');

  // Pour activité mixte
  const [caVente, setCaVente] = useState('');
  const [caServices, setCaServices] = useState('');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);

      // Charger le profil
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle(); // Use maybeSingle to avoid 406 error if not found

      if (profileError) console.error('Error fetching profile', profileError);
      if (profileData) setProfile(profileData);

      // Charger tous les documents (avec les items pour le calcul précis)
      // items est une colonne JSON, pas une relation, donc '*' suffit
      const { data: invoiceData, error: invoiceError } = await supabase
        .from('quotes')
        .select('*')
        .eq('user_id', user.id);

      if (invoiceError) throw invoiceError;
      setInvoices(invoiceData || []);

    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Erreur lors du chargement des données. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  // Calcul du CA détaillé pour la période sélectionnée (factures payées uniquement)
  // Retourne { total, services, vente }
  const periodData = useMemo(() => {
    if (!invoices.length) return { total: 0, services: 0, vente: 0 };

    const filtered = invoices.filter(invoice => {
      // Filtrer par statut payé (comme le Dashboard)
      const status = (invoice.status || '').toLowerCase();
      // Inclure 'paid' et les factures (type=invoice) non annulées/brouillon (selon logique comptable préférée)
      // Ici on reste strict : 'paid'
      if (status !== 'paid') return false;

      const invoiceDate = new Date(invoice.date || invoice.created_at);
      if (isNaN(invoiceDate.getTime())) return false;

      const invoiceYear = invoiceDate.getFullYear();
      const invoiceMonth = invoiceDate.getMonth();

      if (invoiceYear !== selectedYear) return false;

      if (selectedPeriod === 'month') {
        return invoiceMonth === selectedMonth;
      } else {
        const invoiceQuarter = Math.floor(invoiceMonth / 3);
        return invoiceQuarter === selectedQuarter;
      }
    });

    let totalService = 0;
    let totalMaterial = 0;

    filtered.forEach(inv => {
      if (inv.items && Array.isArray(inv.items) && inv.items.length > 0) {
        inv.items.forEach(item => {
          const price = parseFloat(item.price) || 0;
          const qty = parseFloat(item.quantity) || 0;
          const lineTotal = price * qty;

          // Detection type
          if (item.type === 'material') {
            totalMaterial += lineTotal;
          } else {
            totalService += lineTotal;
          }
        });
      } else {
        // Fallback si pas d'items: Tout en service par défaut (ou selon type d'activité du profil ?)
        // On utilise total_ht
        const amount = inv.total_ht || (inv.total_ttc ? inv.total_ttc / 1.2 : 0);
        totalService += amount;
      }
    });

    return {
      total: totalService + totalMaterial,
      services: totalService,
      vente: totalMaterial
    };

  }, [invoices, selectedYear, selectedPeriod, selectedMonth, selectedQuarter]);

  // Mettre à jour les champs "Auto-remplis" quand calculés
  useEffect(() => {
    setManualCa(periodData.total > 0 ? periodData.total.toFixed(2) : '');
    setCaServices(periodData.services > 0 ? periodData.services.toFixed(2) : '');
    setCaVente(periodData.vente > 0 ? periodData.vente.toFixed(2) : '');
  }, [periodData]);

  // Calcul du CA annuel (factures payées uniquement)
  const yearlyRevenue = useMemo(() => {
    return invoices
      .filter(invoice => {
        const status = (invoice.status || '').toLowerCase();
        if (status !== 'paid') return false;
        const invoiceDate = new Date(invoice.date || invoice.created_at);
        return !isNaN(invoiceDate.getTime()) && invoiceDate.getFullYear() === selectedYear;
      })
      .reduce((sum, invoice) => {
        const amount = invoice.total_ht || (invoice.total_ttc ? invoice.total_ttc / 1.2 : 0);
        return sum + amount;
      }, 0);
  }, [invoices, selectedYear]);

  // Récupération des préférences depuis ai_preferences
  // Valeurs par défaut si pas encore configurées
  const artisanStatus = profile?.ai_preferences?.artisan_status || 'micro_entreprise';
  const activityType = profile?.ai_preferences?.activity_type || 'mixte'; // Default to Mixte to show both fields if unsure

  // CA effectif (manuel ou calculé depuis factures)
  // On utilise les valeurs des inputs (qui sont pré-remplies par useEffect)
  // Cela permet à l'utilisateur de corriger manuellement si besoin
  const effectiveCa = manualCa !== '' ? parseFloat(manualCa) || 0 : periodData.total;
  const effectiveCaService = caServices !== '' ? parseFloat(caServices) || 0 : periodData.services;
  const effectiveCaVente = caVente !== '' ? parseFloat(caVente) || 0 : periodData.vente;

  // Calcul des charges URSSAF
  const calculateCharges = useMemo(() => {
    if (artisanStatus !== 'micro_entreprise') {
      return null;
    }
    const rates = URSSAF_RATES.micro_entreprise;

    // Logique pour Activité Mixte (Services + Vente)
    // OU si l'utilisateur est en "Services" mais a rempli du CA Vente (cas hybride non déclaré mais réel)
    // On force le mode mixte si on détecte les deux types de CA et que l'activité le permet ou pour affichage
    const useMixteCalculation = activityType === 'mixte' || (activityType === 'services' && effectiveCaVente > 0) || (activityType === 'vente' && effectiveCaService > 0);

    if (useMixteCalculation) {
      const servicesRate = hasAcre ? rates.mixte.services.acre : rates.mixte.services.normal;
      const venteRate = hasAcre ? rates.mixte.vente.acre : rates.mixte.vente.normal;

      const chargesServices = effectiveCaService * servicesRate;
      const chargesVente = effectiveCaVente * venteRate;

      return {
        total: chargesServices + chargesVente,
        details: {
          services: { ca: effectiveCaService, rate: servicesRate, charges: chargesServices },
          vente: { ca: effectiveCaVente, rate: venteRate, charges: chargesVente }
        }
      };
    }

    const rateConfig = rates[activityType] || rates.services;
    const rate = hasAcre ? rateConfig.acre : rateConfig.normal;

    return {
      total: effectiveCa * rate,
      rate: rate,
      ca: effectiveCa
    };
  }, [artisanStatus, activityType, effectiveCa, effectiveCaService, effectiveCaVente, hasAcre]);

  // Calcul du CA Services annuel pour le plafond mixte
  const yearlyRevenueServices = useMemo(() => {
    return invoices
      .filter(invoice => {
        const status = (invoice.status || '').toLowerCase();
        if (status !== 'paid') return false;
        const invoiceDate = new Date(invoice.date || invoice.created_at);
        if (isNaN(invoiceDate.getTime()) || invoiceDate.getFullYear() !== selectedYear) return false;
        return true;
      })
      .reduce((sum, invoice) => {
        // Somme des items service
        let sDiff = 0;
        if (invoice.items && Array.isArray(invoice.items) && invoice.items.length > 0) {
          invoice.items.forEach(item => {
            if (item.type !== 'material') {
              sDiff += (parseFloat(item.price) || 0) * (parseFloat(item.quantity) || 0);
            }
          });
        } else {
          // Fallback: si ce n'est pas spécifié, on assume tout service SAUF si l'activité est pure vente
          if (activityType !== 'vente') {
            sDiff += (invoice.total_ht || (invoice.total_ttc ? invoice.total_ttc / 1.2 : 0));
          }
        }
        return sum + sDiff;
      }, 0);
  }, [invoices, selectedYear, activityType]);


  // Vérification du dépassement de plafond
  const limitStatus = useMemo(() => {
    // Cas Mixte :
    // 1. Le CA total ne doit pas dépasser 188 700 €
    // 2. La part Services ne doit pas dépasser 77 700 €

    if (activityType === 'mixte') {
      const globalLimit = CA_LIMITS.vente; // 188 700
      const serviceLimit = CA_LIMITS.services; // 77 700

      const globalPercentage = (yearlyRevenue / globalLimit) * 100;
      const servicePercentage = (yearlyRevenueServices / serviceLimit) * 100;

      // On prend le pire des deux cas pour l'affichage principal
      const isServiceWorse = servicePercentage > globalPercentage;

      return {
        limit: isServiceWorse ? serviceLimit : globalLimit,
        percentage: isServiceWorse ? servicePercentage : globalPercentage,
        isNearLimit: servicePercentage >= 80 || globalPercentage >= 80,
        isOverLimit: servicePercentage >= 100 || globalPercentage >= 100,
        label: isServiceWorse ? "Plafond Services (Mixte)" : "Plafond Global (Mixte)"
      };
    }

    const limitActivityType = activityType;
    const limit = CA_LIMITS[limitActivityType] || CA_LIMITS.services;
    const percentage = (yearlyRevenue / limit) * 100;

    return {
      limit,
      percentage,
      isNearLimit: percentage >= 80,
      isOverLimit: percentage >= 100,
      label: `Plafond ${ACTIVITY_LABELS[activityType] || 'Standard'}`
    };
  }, [profile, yearlyRevenue, yearlyRevenueServices, activityType]);

  // Vérification du seuil de TVA
  const vatLimitStatus = useMemo(() => {
    // Logique similaire au plafond CA
    if (activityType === 'mixte') {
      const globalLimit = VAT_LIMITS.vente.base;
      const serviceLimit = VAT_LIMITS.services.base;

      const globalPercentage = (yearlyRevenue / globalLimit) * 100;
      const servicePercentage = (yearlyRevenueServices / serviceLimit) * 100;

      const isServiceWorse = servicePercentage > globalPercentage;

      return {
        limit: isServiceWorse ? serviceLimit : globalLimit,
        percentage: isServiceWorse ? servicePercentage : globalPercentage,
        isNearLimit: servicePercentage >= 80 || globalPercentage >= 80,
        isOverLimit: servicePercentage >= 100 || globalPercentage >= 100,
        label: isServiceWorse ? "Seuil TVA Services (Mixte)" : "Seuil TVA Global (Mixte)",
        type: isServiceWorse ? 'services' : 'vente'
      };
    }

    const limitType = activityType;
    const limit = VAT_LIMITS[limitType]?.base || VAT_LIMITS.services.base;
    const percentage = (yearlyRevenue / limit) * 100;

    return {
      limit,
      percentage,
      isNearLimit: percentage >= 80,
      isOverLimit: percentage >= 100,
      label: `Seuil TVA ${ACTIVITY_LABELS[activityType] || 'Standard'}`,
      type: activityType
    };
  }, [yearlyRevenue, yearlyRevenueServices, activityType]);

  const months = [
    'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
  ];

  const quarters = ['T1 (Jan-Mar)', 'T2 (Avr-Jun)', 'T3 (Jul-Sep)', 'T4 (Oct-Déc)'];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  const isMicroEntreprise = artisanStatus === 'micro_entreprise';

  return (
    <div className="max-w-4xl mx-auto pb-12">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <Calculator className="w-8 h-8 text-blue-600" />
          Comptabilité & Charges URSSAF
        </h2>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Calculez vos charges sociales à déclarer selon votre statut
        </p>
      </div>

      {/* Statut actuel */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <FileText className="w-5 h-5 mr-2 text-blue-600" />
            Votre statut
          </h3>
          <Link
            to="/app/settings/activity"
            className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
          >
            <Settings className="w-4 h-4 mr-1" />
            Modifier
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Statut juridique</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {STATUS_LABELS[artisanStatus] || 'Non défini'}
            </p>
          </div>
          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Type d'activité</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {ACTIVITY_LABELS[activityType] || 'Non défini'}
            </p>
          </div>
        </div>
      </div>

      {/* Message pour les statuts non micro-entreprise */}
      {!isMicroEntreprise && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-6 mb-6">
          <div className="flex items-start">
            <Info className="w-6 h-6 text-blue-600 dark:text-blue-400 mr-3 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Calcul des charges pour {STATUS_LABELS[artisanStatus]}
              </h3>
              <p className="text-blue-800 dark:text-blue-400 mb-4">
                Pour les statuts autres que micro-entreprise, le calcul des cotisations sociales est plus complexe
                et dépend de nombreux facteurs (rémunération, dividendes, régime fiscal, etc.).
              </p>
              <p className="text-blue-800 dark:text-blue-400">
                Nous vous recommandons de consulter votre expert-comptable ou de vous rendre sur le site de l'URSSAF
                pour obtenir un calcul précis de vos cotisations.
              </p>
              <a
                href="https://www.urssaf.fr/portail/home/independant.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block mt-4 text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Accéder au site URSSAF →
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Calcul des charges - uniquement pour micro-entreprise */}
      {isMicroEntreprise && (
        <>
          {/* Sélection de la période */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-4">
              <Calendar className="w-5 h-5 mr-2 text-blue-600" />
              Période de déclaration
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Année</label>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {[2024, 2025, 2026].map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type de période</label>
                <select
                  value={selectedPeriod}
                  onChange={(e) => setSelectedPeriod(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="month">Mensuel</option>
                  <option value="quarter">Trimestriel</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {selectedPeriod === 'month' ? 'Mois' : 'Trimestre'}
                </label>
                <select
                  value={selectedPeriod === 'month' ? selectedMonth : selectedQuarter}
                  onChange={(e) => {
                    if (selectedPeriod === 'month') {
                      setSelectedMonth(parseInt(e.target.value));
                    } else {
                      setSelectedQuarter(parseInt(e.target.value));
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {selectedPeriod === 'month'
                    ? months.map((month, idx) => <option key={idx} value={idx}>{month}</option>)
                    : quarters.map((quarter, idx) => <option key={idx} value={idx}>{quarter}</option>)
                  }
                </select>
              </div>
            </div>

            <div className="flex items-center mt-4">
              <input
                type="checkbox"
                id="acre"
                checked={hasAcre}
                onChange={(e) => setHasAcre(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="acre" className="ml-2 text-sm text-gray-700 dark:text-gray-300">
                Je bénéficie de l'ACRE (1ère année d'activité - taux réduit de 50%)
              </label>
            </div>
          </div>

          {/* Chiffre d'affaires et charges */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-4">
              <Calculator className="w-5 h-5 mr-2 text-blue-600" />
              Calcul des charges
            </h3>

            {/* Affiche TOUJOURS le mode mixte si détection de items séparés ou si configuré comme tel */}
            {/* Mais pour simplifier, on affiche le bloc mixte si activityType est mixte OU si on a des données dans les deux colonnes */}
            {(activityType === 'mixte' || (effectiveCaService > 0 && effectiveCaVente > 0)) ? (
              <div className="space-y-4 mb-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Le CA est calculé automatiquement d'après vos factures payées. Vous pouvez corriger les montants si nécessaire.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      CA Prestations de services (HT)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={caServices}
                        onChange={(e) => setCaServices(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-2 text-gray-400">€</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Taux: {hasAcre ? '10.6%' : '21.2%'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      CA Vente de marchandises (HT)
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        value={caVente}
                        onChange={(e) => setCaVente(e.target.value)}
                        className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        placeholder="0"
                      />
                      <span className="absolute right-3 top-2 text-gray-400">€</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Taux: {hasAcre ? '6.2%' : '12.3%'}</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Chiffre d'affaires HT de la période
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={manualCa}
                      onChange={(e) => setManualCa(e.target.value)}
                      className="w-full pl-3 pr-8 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-blue-500 focus:border-blue-500 text-lg"
                      placeholder={periodData.total > 0 ? periodData.total.toString() : "Saisissez votre CA"}
                    />
                    <span className="absolute right-3 top-2.5 text-gray-400">€</span>
                  </div>
                  {periodData.total > 0 && manualCa !== periodData.total.toFixed(2) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Calculé: {formatCurrency(periodData.total)}
                      <button
                        type="button"
                        onClick={() => setManualCa(periodData.total.toFixed(2))}
                        className="ml-2 text-blue-600 hover:text-blue-700 underline"
                      >
                        Réinitialiser
                      </button>
                    </p>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Taux applicable : {hasAcre ? (activityType === 'vente' ? '6.2%' : '10.6%') : (activityType === 'vente' ? '12.3%' : '21.2%')}
                  </p>
                </div>
              </div>
            )}

            {/* Résultat du calcul */}
            {calculateCharges && (
              <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-blue-100">Charges URSSAF à déclarer</p>
                  <button
                    onClick={() => setShowDetails(!showDetails)}
                    className="text-blue-200 hover:text-white flex items-center text-sm"
                  >
                    {showDetails ? 'Masquer' : 'Détails'}
                    {showDetails ? <ChevronUp className="w-4 h-4 ml-1" /> : <ChevronDown className="w-4 h-4 ml-1" />}
                  </button>
                </div>
                <p className="text-4xl font-bold">{formatCurrency(calculateCharges.total)}</p>

                {showDetails && (
                  <div className="mt-4 pt-4 border-t border-blue-400">
                    {calculateCharges.details ? (
                      <>
                        <div className="flex justify-between text-sm mb-2">
                          <span>Services: {formatCurrency(calculateCharges.details.services.ca)} × {(calculateCharges.details.services.rate * 100).toFixed(1)}%</span>
                          <span>{formatCurrency(calculateCharges.details.services.charges)}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span>Vente: {formatCurrency(calculateCharges.details.vente.ca)} × {(calculateCharges.details.vente.rate * 100).toFixed(1)}%</span>
                          <span>{formatCurrency(calculateCharges.details.vente.charges)}</span>
                        </div>
                      </>
                    ) : (
                      <div className="flex justify-between text-sm">
                        <span>{formatCurrency(calculateCharges.ca)} × {(calculateCharges.rate * 100).toFixed(1)}%</span>
                        <span>{formatCurrency(calculateCharges.total)}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Suivi annuel */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-4">
              <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
              Suivi annuel {selectedYear}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">CA cumulé {selectedYear}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(yearlyRevenue)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">{limitStatus?.label || 'Plafond micro-entreprise'}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(limitStatus?.limit || CA_LIMITS.services)}
                </p>
              </div>
            </div>

            {/* Barre de progression */}
            {limitStatus && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Progression vers le plafond</span>
                  <span className={`font-medium ${limitStatus.isOverLimit ? 'text-red-600' : limitStatus.isNearLimit ? 'text-amber-600' : 'text-gray-900 dark:text-white'}`}>
                    {limitStatus.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${limitStatus.isOverLimit ? 'bg-red-500' : limitStatus.isNearLimit ? 'bg-amber-500' : 'bg-green-500'
                      }`}
                    style={{ width: `${Math.min(limitStatus.percentage, 100)}%` }}
                  ></div>
                </div>
              </div>
            )}

            {limitStatus?.isNearLimit && !limitStatus.isOverLimit && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-amber-800 dark:text-amber-300 font-medium">Attention : Approche du plafond</p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    Vous approchez du plafond de chiffre d'affaires pour le régime micro-entreprise.
                    Si vous dépassez ce seuil 2 années consécutives, vous basculerez automatiquement vers le régime réel.
                  </p>
                </div>
              </div>
            )}

            {limitStatus?.isOverLimit && (
              <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-red-800 dark:text-red-300 font-medium">Plafond dépassé</p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-1">
                    Vous avez dépassé le plafond de CA micro-entreprise.
                    Si ce dépassement se confirme une seconde année, vous devrez changer de statut.
                    Consultez un expert-comptable pour anticiper ce changement.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Suivi Franchise TVA */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center mb-4">
              <Euro className="w-5 h-5 mr-2 text-purple-600" />
              Franchise en base de TVA {selectedYear}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">CA applicable TVA</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(yearlyRevenue)}</p>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-500 dark:text-gray-400">{vatLimitStatus?.label || 'Seuil TVA'}</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatCurrency(vatLimitStatus?.limit || VAT_LIMITS.services.base)}
                </p>
                <p className="text-xs text-gray-400 mt-1">Seuil de base (franchise)</p>
              </div>
            </div>

            {/* Barre de progression TVA */}
            {vatLimitStatus && (
              <div className="mb-4">
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-gray-600 dark:text-gray-400">Progression vers le seuil TVA</span>
                  <span className={`font-medium ${vatLimitStatus.isOverLimit ? 'text-purple-600' : vatLimitStatus.isNearLimit ? 'text-purple-600' : 'text-gray-900 dark:text-white'}`}>
                    {vatLimitStatus.percentage.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${vatLimitStatus.isOverLimit ? 'bg-purple-600' : vatLimitStatus.isNearLimit ? 'bg-purple-500' : 'bg-purple-400'
                      }`}
                    style={{ width: `${Math.min(vatLimitStatus.percentage, 100)}%` }}
                  ></div>
                </div>
              </div>
            )}

            {vatLimitStatus?.isNearLimit && !vatLimitStatus.isOverLimit && (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-purple-800 dark:text-purple-300 font-medium">Approche du seuil de TVA</p>
                  <p className="text-sm text-purple-700 dark:text-purple-400 mt-1">
                    Attention, vous approchez du seuil de franchise en base de TVA.
                    Si vous le dépassez, vous devrez facturer la TVA dès le 1er jour du mois de dépassement (si seuil majoré) ou l'année suivante (si seuil base dépassé mais &lt; majoré).
                  </p>
                </div>
              </div>
            )}

            {vatLimitStatus?.isOverLimit && (
              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg flex items-start">
                <AlertCircle className="w-5 h-5 text-purple-600 dark:text-purple-400 mr-3 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-purple-800 dark:text-purple-300 font-medium">Seuil de base dépassé</p>
                  <p className="text-sm text-purple-700 dark:text-purple-400 mt-1">
                    Vous avez dépassé le seuil de franchise en base de TVA.
                    Vérifiez si vous avez également dépassé le seuil majoré ({formatCurrency(VAT_LIMITS[vatLimitStatus.type]?.majore || 0)}).
                    Si c'est le cas, vous devez facturer la TVA immédiatement.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Informations utiles */}
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6">
            <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-300 mb-4 flex items-center">
              <Info className="w-5 h-5 mr-2" />
              Informations utiles
            </h3>

            <div className="space-y-4 text-sm text-blue-800 dark:text-blue-400">
              <div className="flex items-start">
                <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-2 mt-0.5 flex-shrink-0" />
                <p>
                  <strong>Déclaration mensuelle ou trimestrielle :</strong> Vous pouvez choisir de déclarer votre CA
                  chaque mois ou chaque trimestre auprès de l'URSSAF.
                </p>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-2 mt-0.5 flex-shrink-0" />
                <p>
                  <strong>ACRE :</strong> L'Aide aux Créateurs et Repreneurs d'Entreprise permet une exonération
                  partielle de charges (50%) la première année d'activité.
                </p>
              </div>
              <div className="flex items-start">
                <CheckCircle className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-2 mt-0.5 flex-shrink-0" />
                <p>
                  <strong>Versement libératoire :</strong> Option permettant de payer l'impôt sur le revenu
                  en même temps que les cotisations (+1% à 2.2% selon l'activité).
                </p>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-blue-200 dark:border-blue-800">
              <a
                href="https://www.autoentrepreneur.urssaf.fr/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
              >
                Accéder à mon compte URSSAF Auto-entrepreneur →
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Accounting;
