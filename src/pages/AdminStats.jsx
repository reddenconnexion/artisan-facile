import React from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart3, Users, UserCheck, UserPlus, FileText, Activity,
  Loader2, RefreshCw, ShieldAlert, Crown,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../constants/admin';

/* ─── Format date courte ─── */
const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

/* ─── « il y a X » pour la dernière connexion ─── */
const relative = (s) => {
  if (!s) return 'jamais';
  const diff = Date.now() - new Date(s).getTime();
  const days = Math.floor(diff / 86400000);
  if (days <= 0) return "aujourd'hui";
  if (days === 1) return 'hier';
  if (days < 30) return `il y a ${days} j`;
  if (days < 365) return `il y a ${Math.floor(days / 30)} mois`;
  return `il y a ${Math.floor(days / 365)} an(s)`;
};

/* ─── Carte KPI ─── */
const Kpi = ({ icon, label, value, sub, accent = 'text-blue-600', bg = 'bg-blue-50 dark:bg-blue-900/20' }) => {
  const Icon = icon;
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${bg}`}>
          <Icon className={`w-4 h-4 ${accent}`} />
        </div>
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-bold text-gray-900 dark:text-white">{value}</div>
      {sub && <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
};

const AdminStats = () => {
  const { user } = useAuth();
  const allowed = isAdmin(user);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_admin_stats');
      if (error) throw error;
      return data;
    },
    enabled: allowed,
    staleTime: 60 * 1000,
  });

  // Garde-fou côté client (le vrai contrôle reste dans la fonction SQL).
  if (!allowed) {
    return <Navigate to="/app" replace />;
  }

  const totals = data?.totals;
  const artisans = data?.artisans || [];

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            Statistiques plateforme
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Combien d'artisans utilisent l'application. Page privée, réservée à l'administrateur.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Impossible de charger les statistiques</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {error?.message?.includes('Accès refusé') || error?.code === '42501'
                ? "Votre compte n'est pas autorisé à consulter cette page."
                : (error?.message || 'Erreur inconnue.')}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* KPIs principaux */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi
              icon={Users} label="Artisans inscrits" value={totals.real_artisans}
              sub={`dont ${totals.other_artisans} autres que vous`}
            />
            <Kpi
              icon={UserCheck} label="Actifs (30 j)" value={totals.active_30d}
              sub={`${totals.active_7d} actifs sur 7 j`}
              accent="text-emerald-600" bg="bg-emerald-50 dark:bg-emerald-900/20"
            />
            <Kpi
              icon={UserPlus} label="Nouveaux (30 j)" value={totals.new_30d}
              sub="inscriptions récentes"
              accent="text-violet-600" bg="bg-violet-50 dark:bg-violet-900/20"
            />
            <Kpi
              icon={Activity} label="Ont créé des données" value={totals.with_activity}
              sub="≥ 1 client ou devis"
              accent="text-amber-600" bg="bg-amber-50 dark:bg-amber-900/20"
            />
          </div>

          {/* KPIs secondaires */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Kpi
              icon={FileText} label="Devis créés (total)" value={totals.total_quotes}
              accent="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/20"
            />
            <Kpi
              icon={Users} label="Clients créés (total)" value={totals.total_clients}
              accent="text-blue-600" bg="bg-blue-50 dark:bg-blue-900/20"
            />
            <Kpi
              icon={BarChart3} label="Comptes au total" value={totals.all_accounts}
              sub="démos/tests inclus"
              accent="text-gray-500" bg="bg-gray-100 dark:bg-gray-800"
            />
          </div>

          {/* Tableau des artisans */}
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
                Détail des artisans inscrits ({artisans.length})
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-400 dark:text-gray-500 border-b border-gray-100 dark:border-gray-800">
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Inscrit</th>
                    <th className="px-4 py-2 font-medium">Dernière connexion</th>
                    <th className="px-4 py-2 font-medium text-right">Clients</th>
                    <th className="px-4 py-2 font-medium text-right">Devis</th>
                  </tr>
                </thead>
                <tbody>
                  {artisans.map((a) => (
                    <tr key={a.email} className="border-b border-gray-50 dark:border-gray-800/50 last:border-0">
                      <td className="px-4 py-2.5 text-gray-900 dark:text-white">
                        <span className="flex items-center gap-1.5">
                          {a.is_owner && <Crown className="w-3.5 h-3.5 text-violet-500 flex-shrink-0" title="Votre compte" />}
                          <span className="truncate max-w-[220px]">{a.email}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{fmtDate(a.created_at)}</td>
                      <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">{relative(a.last_sign_in_at)}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{a.nb_clients}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-gray-700 dark:text-gray-300">{a.nb_quotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-xs text-gray-400 dark:text-gray-500 px-1">
            Les comptes de démonstration et de test sont exclus de ces chiffres.
            {data?.generated_at && ` Données au ${new Date(data.generated_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}.`}
          </p>
        </>
      )}
    </div>
  );
};

export default AdminStats;
