import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquarePlus, Bug, Sparkles, Lightbulb, MessageCircle,
  Loader2, RefreshCw, ShieldAlert, Star,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../constants/admin';
import { toast } from 'sonner';

/* ─── Métadonnées par catégorie ─── */
const CATEGORY_META = {
  bug:     { label: 'Bug',    icon: Bug,           accent: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20' },
  ux:      { label: 'Ergonomie', icon: Sparkles,   accent: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  feature: { label: 'Idée',   icon: Lightbulb,     accent: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20' },
  other:   { label: 'Autre',  icon: MessageCircle, accent: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
};

/* ─── Statuts de triage ─── */
const STATUSES = [
  { key: 'new',         label: 'Nouveau' },
  { key: 'planned',     label: 'Planifié' },
  { key: 'in_progress', label: 'En cours' },
  { key: 'done',        label: 'Traité' },
  { key: 'declined',    label: 'Refusé' },
];
const STATUS_STYLES = {
  new:         'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  planned:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  in_progress: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  done:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  declined:    'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

/* ─── Carte compteur ─── */
const Counter = ({ label, value, accent = 'text-gray-900 dark:text-white' }) => (
  <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3">
    <div className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</div>
    <div className={`text-2xl font-bold ${accent}`}>{value ?? 0}</div>
  </div>
);

const AdminFeedback = () => {
  const { user } = useAuth();
  const allowed = isAdmin(user);
  const queryClient = useQueryClient();

  const [catFilter, setCatFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('open'); // 'open' = tout sauf done/declined

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-feedback'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_all_feedback');
      if (error) throw error;
      return data;
    },
    enabled: allowed,
    staleTime: 30 * 1000,
  });

  const mutation = useMutation({
    mutationFn: async ({ id, status }) => {
      const { error } = await supabase.rpc('set_feedback_status', { p_id: id, p_status: status });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Statut mis à jour');
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
      // Rafraîchit la pastille de navigation (un retour quittant le statut
      // 'new' doit décrémenter le compteur).
      queryClient.invalidateQueries({ queryKey: ['newFeedbackCount'] });
    },
    onError: (err) => {
      toast.error('Mise à jour impossible', { description: err?.message });
    },
  });

  // Garde-fou côté client (le vrai contrôle reste dans la fonction SQL).
  if (!allowed) {
    return <Navigate to="/app" replace />;
  }

  const counts = data?.counts;
  const items = data?.items || [];
  const filtered = items.filter((it) => {
    if (catFilter !== 'all' && it.category !== catFilter) return false;
    if (statusFilter === 'open') return it.status !== 'done' && it.status !== 'declined';
    if (statusFilter !== 'all') return it.status === statusFilter;
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <MessageSquarePlus className="w-7 h-7 text-emerald-600" />
            Retours des artisans
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Bugs, idées et remarques envoyés depuis l'application. Page privée, réservée à l'administrateur.
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
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Impossible de charger les retours</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {error?.message?.includes('Accès refusé') || error?.code === '42501'
                ? "Votre compte n'est pas autorisé à consulter cette page."
                : (error?.message || 'Erreur inconnue.')}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Compteurs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Counter label="Total" value={counts?.total} />
            <Counter label="Nouveaux" value={counts?.new} accent="text-blue-600" />
            <Counter label="Bugs ouverts" value={counts?.bug} accent="text-red-600" />
            <Counter label="Ergonomie" value={counts?.ux} accent="text-violet-600" />
            <Counter label="Idées" value={counts?.feature} accent="text-amber-600" />
          </div>

          {/* Filtres */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5">
              {['all', 'bug', 'ux', 'feature', 'other'].map((c) => (
                <button
                  key={c}
                  onClick={() => setCatFilter(c)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    catFilter === c
                      ? 'bg-gray-900 text-white border-gray-900 dark:bg-white dark:text-gray-900 dark:border-white'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {c === 'all' ? 'Toutes catégories' : CATEGORY_META[c].label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5 md:ml-auto">
              {[{ key: 'open', label: 'À traiter' }, { key: 'all', label: 'Tous' }, ...STATUSES].map((s) => (
                <button
                  key={s.key}
                  onClick={() => setStatusFilter(s.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-full border transition-colors ${
                    statusFilter === s.key
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Liste */}
          {filtered.length === 0 ? (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
              Aucun retour pour ce filtre.
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map((it) => {
                const meta = CATEGORY_META[it.category] || CATEGORY_META.other;
                const Icon = meta.icon;
                return (
                  <div
                    key={it.id}
                    className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.bg}`}>
                        <Icon className={`w-5 h-5 ${meta.accent}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className="text-sm font-semibold text-gray-900 dark:text-white">{meta.label}</span>
                          {it.rating > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-500">
                              {Array.from({ length: it.rating }).map((_, i) => (
                                <Star key={i} className="w-3.5 h-3.5 fill-current" />
                              ))}
                            </span>
                          )}
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[it.status]}`}>
                            {STATUSES.find((s) => s.key === it.status)?.label || it.status}
                          </span>
                          <span className="text-xs text-gray-400 ml-auto">{fmtDate(it.created_at)}</span>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line break-words">{it.message}</p>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-gray-400">
                          {it.author_email && <span>{it.author_email}</span>}
                          {it.page && <span className="font-mono">{it.page}</span>}
                        </div>

                        {/* Changement de statut */}
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {STATUSES.map((s) => (
                            <button
                              key={s.key}
                              disabled={mutation.isPending || it.status === s.key}
                              onClick={() => mutation.mutate({ id: it.id, status: s.key })}
                              className={`px-2.5 py-1 text-[11px] font-medium rounded-md border transition-colors disabled:opacity-40 disabled:cursor-default ${
                                it.status === s.key
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700'
                              }`}
                            >
                              {s.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AdminFeedback;
