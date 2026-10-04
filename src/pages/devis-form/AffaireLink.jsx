import { Link } from 'react-router-dom';
import { Route, ChevronRight } from 'lucide-react';

/**
 * Accès au suivi de l'affaire (devis → signature → acompte → chantier →
 * facture) depuis un devis envoyé ou l'un de ses documents liés : l'écran
 * de suivi remonte de lui-même au devis racine.
 */
const AffaireLink = ({ id }) => (
    <Link
        to={`/app/affaires/${id}`}
        className="tap-target flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-white dark:bg-white/5 border border-gray-200 dark:border-white/10 text-sm font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-white/10"
    >
        <Route className="w-4 h-4 text-ios flex-shrink-0" aria-hidden="true" />
        <span className="flex-1">Suivi de l'affaire : devis, signature, acompte, chantier, facture</span>
        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" aria-hidden="true" />
    </Link>
);

export default AffaireLink;
