// Jalons de maîtrise : petites récompenses débloquées silencieusement au fil de
// l'activité (premier client, devis signés, factures payées...). Volontairement
// discret — un simple toast au déblocage, consultable ensuite dans le Profil.
// Chaque jalon est adossé à une métrique dérivée du cache (clients, devis, factures)
// et à un seuil. Pas de points ni de classement : uniquement du renforcement positif.

export const ACHIEVEMENTS = [
    { id: 'first_client', emoji: '🤝', label: 'Premier client',        description: 'Votre premier client ajouté au carnet.', metric: 'clients', target: 1 },
    { id: 'clients_25',   emoji: '📇', label: 'Carnet bien rempli',    description: '25 clients dans votre carnet.',           metric: 'clients', target: 25 },
    { id: 'first_signed', emoji: '✍️', label: 'Premier devis signé',   description: 'Votre premier devis accepté par un client.', metric: 'signed', target: 1 },
    { id: 'signed_10',    emoji: '🏆', label: '10 devis signés',       description: 'Dix devis acceptés, ça roule !',           metric: 'signed',  target: 10 },
    { id: 'signed_50',    emoji: '🎯', label: '50 devis signés',       description: 'Un demi-cent de devis signés.',            metric: 'signed',  target: 50 },
    { id: 'first_paid',   emoji: '💶', label: 'Première facture payée', description: 'Votre premier encaissement.',             metric: 'paid',    target: 1 },
    { id: 'paid_50',      emoji: '💰', label: '50 factures payées',    description: 'Cinquante factures encaissées.',           metric: 'paid',    target: 50 },
];

// stats : { clients, signed, paid } — nombres bruts dérivés du cache.
// Renvoie les jalons enrichis (unlocked + progression), triés : à débloquer d'abord.
export function computeAchievements(stats = {}) {
    return ACHIEVEMENTS.map(a => {
        const current = stats[a.metric] || 0;
        return {
            ...a,
            current,
            unlocked: current >= a.target,
            progress: Math.min(current / a.target, 1),
        };
    });
}
