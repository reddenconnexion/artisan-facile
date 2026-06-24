import React, { useState } from 'react';
import { X, Bug, Sparkles, Lightbulb, MessageCircle, Send, Star, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../utils/supabase';
import { useAuth } from '../context/AuthContext';
import { useModalA11y } from '../hooks/useModalA11y';

// Catégories de retour proposées à l'artisan. L'ordre suit la fréquence
// attendue (bug d'abord, idée ensuite).
const CATEGORIES = [
  { key: 'bug',     label: 'Un bug',           hint: "Quelque chose ne marche pas",      icon: Bug,           accent: 'text-red-600',    ring: 'ring-red-500',    bg: 'bg-red-50 dark:bg-red-900/20' },
  { key: 'ux',      label: 'Trop compliqué',   hint: 'Un écran peu pratique',            icon: Sparkles,      accent: 'text-violet-600', ring: 'ring-violet-500', bg: 'bg-violet-50 dark:bg-violet-900/20' },
  { key: 'feature', label: 'Une idée',         hint: 'Une fonction qui manque',          icon: Lightbulb,     accent: 'text-amber-600',  ring: 'ring-amber-500',  bg: 'bg-amber-50 dark:bg-amber-900/20' },
  { key: 'other',   label: 'Autre',            hint: 'Une remarque générale',            icon: MessageCircle, accent: 'text-blue-600',   ring: 'ring-blue-500',   bg: 'bg-blue-50 dark:bg-blue-900/20' },
];

const MAX_LEN = 1000;

const FeedbackModal = ({ isOpen, onClose }) => {
  const { user } = useAuth();
  const containerRef = useModalA11y(isOpen, onClose);

  const [category, setCategory] = useState('bug');
  const [message, setMessage] = useState('');
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setCategory('bug');
    setMessage('');
    setRating(0);
  };

  const handleClose = () => {
    if (submitting) return;
    onClose();
    // Laisse l'animation de fermeture se jouer avant de vider le formulaire.
    setTimeout(reset, 200);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) {
      toast.error('Écrivez quelques mots avant d\'envoyer.');
      return;
    }
    if (!user) {
      toast.error('Vous devez être connecté pour envoyer un retour.');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: user.id,
        category,
        message: trimmed,
        rating: rating > 0 ? rating : null,
        // Contexte capturé automatiquement pour aider au triage.
        page: typeof window !== 'undefined' ? window.location.pathname : null,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      });
      if (error) throw error;

      toast.success('Merci pour votre retour ! 🙏', {
        description: 'Il nous aide à améliorer l\'application.',
        duration: 4000,
      });
      handleClose();
    } catch (err) {
      console.error('[feedback] insert failed:', err);
      toast.error('Envoi impossible', {
        description: 'Vérifiez votre connexion et réessayez.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Donner mon avis"
    >
      <div
        ref={containerRef}
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200 max-h-[92vh] flex flex-col"
      >
        {/* En-tête */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-5 text-white relative shrink-0">
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white hover:bg-white/10 rounded-full p-1 transition-colors"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold">Votre avis nous aide</h2>
          <p className="text-blue-100 text-sm mt-0.5">
            Un bug, une idée, un écran trop compliqué ? Dites-nous tout.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5 overflow-y-auto">
          {/* Catégorie */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              De quoi s'agit-il ?
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => {
                const Icon = c.icon;
                const selected = category === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCategory(c.key)}
                    aria-pressed={selected}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? `${c.bg} ring-2 ${c.ring} border-transparent`
                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${c.accent}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-gray-900 dark:text-white leading-tight">{c.label}</span>
                      <span className="block text-[11px] text-gray-500 dark:text-gray-400 leading-tight mt-0.5">{c.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Message */}
          <div>
            <label htmlFor="feedback-message" className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Votre message
            </label>
            <textarea
              id="feedback-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MAX_LEN))}
              rows={4}
              autoFocus
              placeholder={
                category === 'bug'
                  ? "Que s'est-il passé ? Sur quel écran ?"
                  : category === 'feature'
                  ? 'Décrivez la fonction qui vous manque…'
                  : 'Expliquez en quelques mots…'
              }
              className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-800 dark:text-white rounded-xl px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
            <div className="text-right text-[11px] text-gray-400 mt-1">{message.length}/{MAX_LEN}</div>
          </div>

          {/* Note de satisfaction (optionnelle) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
              Votre satisfaction <span className="font-normal normal-case text-gray-400">(optionnel)</span>
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(rating === n ? 0 : n)}
                  className="p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  aria-label={`${n} étoile${n > 1 ? 's' : ''}`}
                >
                  <Star
                    className={`w-6 h-6 transition-colors ${
                      n <= rating ? 'text-amber-400 fill-amber-400' : 'text-gray-300 dark:text-gray-600'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !message.trim()}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Envoi…
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Envoyer mon retour
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default FeedbackModal;
