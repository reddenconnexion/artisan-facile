import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { MessageSquare, Bug, Sparkles, Lightbulb, MessageCircle, Loader2, Star } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';

/* ─── Métadonnées par catégorie (mêmes libellés que la modale d'envoi) ─── */
const CATEGORY_META = {
  bug:     { label: 'Bug',       icon: Bug,           accent: 'text-red-600',    bg: 'bg-red-50 dark:bg-red-900/20' },
  ux:      { label: 'Ergonomie', icon: Sparkles,      accent: 'text-violet-600', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  feature: { label: 'Idée',      icon: Lightbulb,     accent: 'text-amber-600',  bg: 'bg-amber-50 dark:bg-amber-900/20' },
  other:   { label: 'Autre',     icon: MessageCircle, accent: 'text-blue-600',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
};

const STATUS_LABELS = {
  new:         'Nouveau',
  planned:     'Planifié',
  in_progress: 'En cours',
  done:        'Traité',
  declined:    'Refusé',
};
const STATUS_STYLES = {
  new:         'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  planned:     'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  in_progress: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
  done:        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  declined:    'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const fmtDate = (s) =>
  s ? new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const MyFeedback = () => {
  const { user } = useAuth();

  const { data: items = [], isLoading, isError } = useQuery({
    queryKey: ['myFeedback', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('feedback')
        .select('id, category, message, rating, status, admin_reply, admin_reply_at, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
    staleTime: 30 * 1000,
  });

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <MessageSquare className="w-7 h-7 text-emerald-600" />
          Mes retours
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Les avis, bugs et idées que vous avez envoyés, avec la réponse quand nous vous avons répondu.
        </p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin" />
        </div>
      ) : isError ? (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-5 text-sm text-red-700 dark:text-red-300">
          Impossible de charger vos retours pour le moment.
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-10 text-center text-sm text-gray-500 dark:text-gray-400">
          Vous n'avez envoyé aucun retour pour l'instant. Utilisez « Donner mon avis » dans le menu pour signaler un bug ou proposer une idée.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const meta = CATEGORY_META[it.category] || CATEGORY_META.other;
            const Icon = meta.icon;
            return (
              <div key={it.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 p-4">
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
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[it.status] || STATUS_STYLES.new}`}>
                        {STATUS_LABELS[it.status] || it.status}
                      </span>
                      <span className="text-xs text-gray-400 ml-auto">{fmtDate(it.created_at)}</span>
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line break-words">{it.message}</p>

                    {it.admin_reply && (
                      <div className="mt-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg px-3 py-2">
                        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                          Réponse {it.admin_reply_at ? `· ${fmtDate(it.admin_reply_at)}` : ''}
                        </p>
                        <p className="text-sm text-gray-700 dark:text-gray-200 whitespace-pre-line break-words mt-0.5">{it.admin_reply}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MyFeedback;
