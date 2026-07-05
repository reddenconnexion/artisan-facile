import React, { useState } from 'react';
import { X } from 'lucide-react';

/**
 * Bandeau d'aide que l'utilisateur peut masquer définitivement une fois
 * compris (petite croix), pour alléger l'interface. Le choix est mémorisé
 * par navigateur, indépendamment pour chaque `storageKey`.
 *
 * Usage :
 *   <DismissibleHelp storageKey="notifications_push">
 *     <div className="bg-blue-50 … pr-10">…</div>
 *   </DismissibleHelp>
 *
 * Pensez à réserver la place de la croix dans l'enfant (ex: `pr-10`).
 */
const STORAGE_PREFIX = 'help_dismissed_';

export const isHelpDismissed = (storageKey) => {
  try { return localStorage.getItem(STORAGE_PREFIX + storageKey) === '1'; } catch { return false; }
};

const DismissibleHelp = ({ storageKey, children, className = '' }) => {
  const [dismissed, setDismissed] = useState(() => isHelpDismissed(storageKey));
  if (dismissed) return null;

  const dismiss = () => {
    try { localStorage.setItem(STORAGE_PREFIX + storageKey, '1'); } catch { /* stockage indisponible */ }
    setDismissed(true);
  };

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Masquer cette aide"
        title="J'ai compris — masquer cette aide"
        className="absolute top-2 right-2 z-10 p-1 rounded-full text-gray-400 hover:text-red-500 hover:bg-white/60 dark:hover:bg-gray-800/60 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
      {children}
    </div>
  );
};

export default DismissibleHelp;
