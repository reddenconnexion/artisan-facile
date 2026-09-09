import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { getUrgency, nextUrgency } from '../../utils/urgency';

// Indicateur d'urgence client sur un devis accepté (chantier à préparer /
// planifier). En lecture seule il ne s'affiche que si l'urgence a été
// signalée (le cas "normal" ne doit pas ajouter du bruit dans des listes déjà
// denses). Avec `onChange`, il devient un bouton cliquable qui fait tourner
// vers le niveau suivant — un tri rapide, sans menu déroulant à ouvrir.
const UrgencyBadge = ({ value, onChange, className = '' }) => {
    const level = getUrgency(value);

    if (!onChange && level.id === 'normal') return null;

    const content = (
        <>
            {level.id !== 'normal' && <AlertTriangle className="w-2.5 h-2.5" />}
            {level.shortLabel}
        </>
    );

    if (!onChange) {
        return (
            <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${level.badge} ${className}`}>
                {content}
            </span>
        );
    }

    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(nextUrgency(level.id)); }}
            title="Urgence client — cliquer pour changer"
            className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full transition-colors hover:opacity-80 ${level.badge} ${className}`}
        >
            {content}
        </button>
    );
};

export default UrgencyBadge;
