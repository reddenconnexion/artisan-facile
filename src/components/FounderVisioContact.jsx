import { Phone, MessageSquare, Mail } from 'lucide-react';
import {
    FOUNDER_CONTACT_EMAIL, FOUNDER_CONTACT_PHONE,
    founderVisioTel, founderVisioSms, founderVisioMailto,
} from '../utils/founderOffer';

/**
 * Réservation de la visio d'accueil des membres fondateurs : appel, SMS ou
 * e-mail. Le numéro et l'adresse restent affichés en clair, pour le cas où
 * l'appareil n'ouvre pas le lien (pas d'application de messagerie, etc.).
 */
const FounderVisioContact = ({ name, company }) => {
    const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-semibold rounded-lg transition-colors';
    return (
        <div className="mb-3 rounded-lg bg-white/70 dark:bg-gray-900/30 border border-green-200 dark:border-green-800/50 p-3">
            <p className="text-sm font-semibold text-green-800 dark:text-green-300">
                Réservez votre visio de 30 min avec Denis
            </p>
            <p className="text-xs text-green-700/90 dark:text-green-400/80 mt-0.5 mb-2.5">
                Appelez, envoyez un SMS ou un e-mail avec vos disponibilités.
            </p>
            <div className="grid grid-cols-3 gap-2">
                <a href={founderVisioTel()} className={`${btn} bg-green-600 text-white hover:bg-green-700`}>
                    <Phone size={14} />
                    Appeler
                </a>
                <a href={founderVisioSms({ name, company })} className={`${btn} bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-gray-700`}>
                    <MessageSquare size={14} />
                    SMS
                </a>
                <a href={founderVisioMailto({ name, company })} className={`${btn} bg-white dark:bg-gray-800 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700 hover:bg-green-50 dark:hover:bg-gray-700`}>
                    <Mail size={14} />
                    E-mail
                </a>
            </div>
            <p className="text-xs text-green-700 dark:text-green-400 mt-2.5 select-all">
                {FOUNDER_CONTACT_PHONE} · {FOUNDER_CONTACT_EMAIL}
            </p>
        </div>
    );
};

export default FounderVisioContact;
