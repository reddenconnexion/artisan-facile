import { Loader2 } from 'lucide-react';

/**
 * Indicateur de chargement partagé (spinner centré + libellé accessible).
 *
 * Usage : if (loading) return <LoadingState />;
 *         <LoadingState label="Chargement des devis…" className="h-64" />
 */
const LoadingState = ({ label = 'Chargement…', className = 'py-12' }) => (
  <div
    role="status"
    aria-live="polite"
    className={`flex flex-col items-center justify-center gap-2 text-gray-400 dark:text-gray-500 ${className}`}
  >
    <Loader2 className="w-7 h-7 animate-spin text-ios" aria-hidden="true" />
    <span className="text-sm">{label}</span>
  </div>
);

export default LoadingState;
