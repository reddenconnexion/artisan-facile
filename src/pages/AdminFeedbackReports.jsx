import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Sparkles, Loader2, RefreshCw, ShieldAlert, Star,
  Bug, Lightbulb, MessageCircle, Mail, MailCheck, Zap, ChevronDown, ChevronUp,
  CalendarDays, ListChecks,
} from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { isAdmin } from '../constants/admin';
import { toast } from 'sonner';

/* ─── Métadonnées par catégorie (alignées sur AdminFeedback) ─── */
const CATEGORY_META = {
  bug:     { label: 'Bug',       icon: Bug,           accent: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20' },
  ux:      { label: 'Ergonomie', icon: Sparkles,      accent: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  feature: { label: 'Idée',      icon: Lightbulb,     accent: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20' },
  other:   { label: 'Autre',     icon: MessageCircle, accent: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
};

const LEVEL_LABEL = { high: 'Fort', medium: 'Moyen', low: 'Faible' };
const IMPACT_STYLE = {
  high:   'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  low:    'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};
const EFFORT_STYLE = {
  low:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  high:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
};

const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const Pill = ({ children, className = '' }) => (
  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${className}`}>{children}</span>
);

/* ─── Rendu d'un rapport ─── */
const ReportCard = ({ report, defaultOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen);
  const a = report.analysis || {};
  const themes = Array.isArray(a.themes) ? a.themes : [];
  const plan = Array.isArray(a.action_plan) ? a.action_plan : [];
  const quickWins = Array.isArray(a.quick_wins) ? a.quick_wins : [];
  const avgRating = a.satisfaction?.avg_rating;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden">
      {/* En-tête cliquable */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-blue-50 dark:bg-blue-900/20">
          <CalendarDays className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              {fmtDate(report.period_start)} → {fmtDate(report.period_end)}
            </span>
            <Pill className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300">
              {report.feedback_count} retour{report.feedback_count > 1 ? 's' : ''}
            </Pill>
            {avgRating != null && (
              <span className="flex items-center gap-0.5 text-amber-500 text-xs font-medium">
                <Star className="w-3.5 h-3.5 fill-current" /> {avgRating}/5
              </span>
            )}
            {report.email_sent ? (
              <Pill className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 inline-flex items-center gap-1">
                <MailCheck className="w-3 h-3" /> Envoyé
              </Pill>
            ) : (
              <Pill className="bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400 inline-flex items-center gap-1">
                <Mail className="w-3 h-3" /> Non envoyé
              </Pill>
            )}
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">{report.summary}</p>
        </div>
        {open ? <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" /> : <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />}
      </button>

      {/* Détail */}
      {open && (
        <div className="px-4 pb-5 pt-1 border-t border-gray-100 dark:border-gray-800 space-y-5">
          {a.satisfaction?.comment && (
            <p className="text-xs text-gray-500 dark:text-gray-400 italic mt-3">{a.satisfaction.comment}</p>
          )}

          {/* Thèmes */}
          {themes.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Thèmes
              </h4>
              <ul className="space-y-2">
                {themes.map((t, i) => {
                  const meta = CATEGORY_META[t.category] || CATEGORY_META.other;
                  return (
                    <li key={i} className="flex items-start gap-2">
                      <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 ${meta.bg}`}>
                        <meta.icon className={`w-3.5 h-3.5 ${meta.accent}`} />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{t.title}</span>
                        {t.mentions > 0 && <span className="text-xs text-gray-400 ml-1.5">· {t.mentions} mention{t.mentions > 1 ? 's' : ''}</span>}
                        {t.insight && <p className="text-xs text-gray-600 dark:text-gray-400">{t.insight}</p>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Plan d'action priorisé */}
          {plan.length > 0 && (
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2 flex items-center gap-1.5">
                <ListChecks className="w-3.5 h-3.5" /> Plan d'amélioration priorisé
              </h4>
              <ol className="space-y-2">
                {plan.map((act, i) => (
                  <li key={i} className="flex items-start gap-2.5 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center flex-shrink-0">
                      {act.priority ?? i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{act.title}</p>
                      {act.rationale && <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{act.rationale}</p>}
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {act.impact && <Pill className={IMPACT_STYLE[act.impact] || IMPACT_STYLE.low}>Impact : {LEVEL_LABEL[act.impact] || act.impact}</Pill>}
                        {act.effort && <Pill className={EFFORT_STYLE[act.effort] || EFFORT_STYLE.medium}>Effort : {LEVEL_LABEL[act.effort] || act.effort}</Pill>}
                        {act.category && CATEGORY_META[act.category] && (
                          <Pill className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">{CATEGORY_META[act.category].label}</Pill>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Quick wins */}
          {quickWins.length > 0 && (
            <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 rounded-lg p-3">
              <h4 className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-1.5 flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" /> Quick wins
              </h4>
              <ul className="list-disc pl-5 space-y-0.5">
                {quickWins.map((q, i) => (
                  <li key={i} className="text-xs text-emerald-800 dark:text-emerald-200">{q}</li>
                ))}
              </ul>
            </div>
          )}

          {plan.length === 0 && themes.length === 0 && (
            <p className="text-sm text-gray-500 dark:text-gray-400">Aucun élément à signaler sur cette période.</p>
          )}
        </div>
      )}
    </div>
  );
};

const AdminFeedbackReports = () => {
  const { user } = useAuth();
  const allowed = isAdmin(user);
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['admin-feedback-reports'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_feedback_reports', { p_limit: 26 });
      if (error) throw error;
      return data || [];
    },
    enabled: allowed,
    staleTime: 60 * 1000,
  });

  const generate = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('weekly-feedback-report', {
        body: { period_days: 7 },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (res) => {
      const n = res?.feedback_count ?? 0;
      toast.success('Rapport généré', {
        description: res?.email_sent
          ? `${n} retour(s) analysé(s) · email envoyé.`
          : `${n} retour(s) analysé(s) · email non envoyé.`,
      });
      queryClient.invalidateQueries({ queryKey: ['admin-feedback-reports'] });
    },
    onError: (err) => {
      toast.error('Génération impossible', { description: err?.message });
    },
  });

  // Garde-fou côté client (le vrai contrôle reste dans la fonction SQL).
  if (!allowed) {
    return <Navigate to="/app" replace />;
  }

  const reports = Array.isArray(data) ? data : [];

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <LineChart className="w-7 h-7 text-blue-600" />
            Rapports hebdomadaires
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Synthèse IA des retours artisans, générée chaque lundi et envoyée par email. Page privée, réservée à l'administrateur.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Actualiser</span>
          </button>
          <button
            onClick={() => generate.mutate()}
            disabled={generate.isPending}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60"
          >
            {generate.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Générer maintenant
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-blue-600 animate-spin" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">Impossible de charger les rapports</p>
            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
              {error?.message?.includes('Accès refusé') || error?.code === '42501'
                ? "Votre compte n'est pas autorisé à consulter cette page."
                : (error?.message || 'Erreur inconnue.')}
            </p>
          </div>
        </div>
      ) : reports.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-10 text-center">
          <LineChart className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Aucun rapport pour l'instant. Le premier sera généré automatiquement lundi prochain,
            ou cliquez sur <strong>« Générer maintenant »</strong> pour en produire un tout de suite.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r, i) => (
            <ReportCard key={r.id} report={r} defaultOpen={i === 0} />
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminFeedbackReports;
