import { Mic, Camera, Sparkles } from 'lucide-react';

// Shared formatting + step configuration for the site-visit AI flow.
// Used by SiteVisitModal and VisiteTechniqueMode.

export const formatDuration = (s) => {
    const m = Math.floor(s / 60), sec = s % 60;
    return m > 0 ? `${m}m${sec.toString().padStart(2, '0')}s` : `${sec}s`;
};

export const fmtEur = (val) => {
    if (!val && val !== 0) return '—';
    if (val >= 10000) return `${Math.round(val / 1000)} k€`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)} k€`;
    return `${Math.round(val)} €`;
};

export const PROCESSING_STEPS = [
    { key: 'voice', label: 'Transcription des notes vocales', Icon: Mic },
    { key: 'photos', label: 'Analyse des photos', Icon: Camera },
    { key: 'quote', label: 'Génération du devis', Icon: Sparkles },
];

export const PHASE_ORDER = { voice: 0, photos: 1, quote: 2, done: 3 };

export const CONFIDENCE_STYLES = {
    high: 'text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-900/30',
    medium: 'text-amber-700 bg-amber-100 dark:text-amber-400 dark:bg-amber-900/30',
    low: 'text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-900/30',
};

export const CONFIDENCE_LABELS = { high: 'Précis', medium: 'Estimé', low: 'Approximatif' };
