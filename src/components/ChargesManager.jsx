import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Loader2, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { CHARGE_CATEGORIES, summarizeCharges } from '../utils/accountingAdvisor';

const fmtCurrency = (n) =>
  (Number.isFinite(n) ? n : 0).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

const CATEGORY_KEYS = Object.keys(CHARGE_CATEGORIES);

/**
 * Saisie et gestion des charges professionnelles déductibles de l'artisan.
 * Persistées dans business_charges (RLS : propriétaire uniquement). Remonte la
 * liste au parent via onChange pour alimenter le conseiller comptable.
 */
const ChargesManager = ({ onChange }) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState('materiel');
  const [amount, setAmount] = useState('');
  const [periodicity, setPeriodicity] = useState('annual');

  const { data: charges = [], isLoading } = useQuery({
    queryKey: ['business-charges', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_charges')
        .select('id, label, category, amount, periodicity, created_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  // Remonte la liste courante au parent dès qu'elle change.
  useEffect(() => {
    if (onChange) onChange(charges);
  }, [charges, onChange]);

  const summary = useMemo(() => summarizeCharges(charges), [charges]);

  const addMutation = useMutation({
    mutationFn: async (payload) => {
      const { error } = await supabase.from('business_charges').insert({ ...payload, user_id: user.id });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-charges', user?.id] });
      setLabel('');
      setAmount('');
    },
    onError: (err) => toast.error("Impossible d'ajouter la charge", { description: err?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from('business_charges').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['business-charges', user?.id] }),
    onError: (err) => toast.error('Suppression impossible', { description: err?.message }),
  });

  const handleAdd = (e) => {
    e.preventDefault();
    const value = parseFloat(String(amount).replace(',', '.'));
    if (!label.trim()) {
      toast.error('Donnez un nom à la charge (ex : Assurance décennale).');
      return;
    }
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Indiquez un montant valide.');
      return;
    }
    addMutation.mutate({ label: label.trim(), category, amount: value, periodicity });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
          <Wallet className="w-5 h-5 mr-2 text-indigo-600" />
          Mes charges professionnelles
        </h3>
        <div className="text-right">
          <p className="text-[11px] text-gray-400 dark:text-gray-500 uppercase tracking-wide">Total annuel</p>
          <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{fmtCurrency(summary.annualTotal)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4 leading-relaxed">
        Saisissez vos charges déductibles (loyer, véhicule, assurance décennale, matériel, sous-traitance…). Elles
        servent à comparer votre régime micro à un passage au réel et à estimer vos économies de cotisations et d'impôts.
      </p>

      {/* Formulaire d'ajout */}
      <form onSubmit={handleAdd} className="grid grid-cols-1 sm:grid-cols-12 gap-2 mb-4">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Intitulé (ex : Assurance décennale)"
          className="sm:col-span-4 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="sm:col-span-3 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
        >
          {CATEGORY_KEYS.map((k) => (
            <option key={k} value={k}>{CHARGE_CATEGORIES[k]}</option>
          ))}
        </select>
        <div className="sm:col-span-3 flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Montant €"
            className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none"
          />
          <button
            type="button"
            onClick={() => setPeriodicity((p) => (p === 'annual' ? 'monthly' : 'annual'))}
            title="Basculer mensuel / annuel"
            className="px-2.5 text-xs font-medium bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-500 whitespace-nowrap"
          >
            {periodicity === 'annual' ? '/ an' : '/ mois'}
          </button>
        </div>
        <button
          type="submit"
          disabled={addMutation.isPending}
          className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-60"
        >
          {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          Ajouter
        </button>
      </form>

      {/* Liste */}
      {isLoading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />
        </div>
      ) : charges.length === 0 ? (
        <div className="text-center py-6 text-sm text-gray-400 dark:text-gray-500 flex flex-col items-center gap-2">
          <Receipt className="w-7 h-7 text-gray-300 dark:text-gray-600" />
          Aucune charge saisie pour l'instant.
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700">
          {charges.map((c) => {
            const annual = c.periodicity === 'monthly' ? c.amount * 12 : c.amount;
            return (
              <li key={c.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.label}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{CHARGE_CATEGORIES[c.category] || c.category}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{fmtCurrency(annual)}<span className="text-xs font-normal text-gray-400"> / an</span></p>
                  {c.periodicity === 'monthly' && (
                    <p className="text-[11px] text-gray-400">{fmtCurrency(c.amount)} / mois</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(c.id)}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
                  title="Supprimer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default ChargesManager;
