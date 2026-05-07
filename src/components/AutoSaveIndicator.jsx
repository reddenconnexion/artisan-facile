import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

const formatRelative = (date) => {
    const seconds = Math.max(0, Math.round((Date.now() - date.getTime()) / 1000));
    if (seconds < 5) return "à l'instant";
    if (seconds < 60) return `il y a ${seconds}s`;
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `il y a ${minutes} min`;
    return `à ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
};

const AutoSaveIndicator = ({ lastSaved, saving = false, label = 'Brouillon sauvegardé' }) => {
    const [, setTick] = useState(0);

    useEffect(() => {
        if (!lastSaved) return undefined;
        const id = setInterval(() => setTick((t) => t + 1), 15_000);
        return () => clearInterval(id);
    }, [lastSaved]);

    if (saving) {
        return (
            <span
                className="inline-flex items-center gap-1.5 text-xs text-gray-500"
                aria-live="polite"
            >
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Sauvegarde…
            </span>
        );
    }

    if (!lastSaved) return null;

    return (
        <span
            className="inline-flex items-center gap-1.5 text-xs text-emerald-600"
            title={`${label} à ${lastSaved.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
            aria-live="polite"
        >
            <Check className="w-3.5 h-3.5" />
            <span>{label} <span className="text-gray-400">{formatRelative(lastSaved)}</span></span>
        </span>
    );
};

export default AutoSaveIndicator;
