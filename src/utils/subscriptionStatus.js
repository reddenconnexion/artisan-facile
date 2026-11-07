import { formatDate } from './format';

/**
 * Libellé d'un abonnement Pro résilié : « Résilié · actif jusqu'au 7 décembre 2026 ».
 * Renvoie null si aucune résiliation n'est programmée (date absente ou passée).
 * @param {string|Date|null|undefined} cancelAt  profiles.subscription_cancel_at
 * @param {Date} [now]
 */
export const cancellationNotice = (cancelAt, now = new Date()) => {
    if (!cancelAt) return null;
    const end = new Date(cancelAt);
    if (Number.isNaN(end.getTime()) || end <= now) return null;
    const date = formatDate(end, {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Europe/Paris',
    });
    return `Résilié · actif jusqu'au ${date}`;
};
