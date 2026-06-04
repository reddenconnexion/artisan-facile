// Comptes autorisés à voir la page « Statistiques plateforme ».
// Doit rester synchronisé avec l'allowlist de la fonction SQL
// public.get_admin_stats() (fichier add_admin_stats_function.sql).
// Le contrôle réel est fait côté base ; cette liste ne sert qu'à
// afficher/masquer l'entrée de menu et la route.
export const ADMIN_EMAILS = [
  'rotvener97@gmail.com',
  'reddenconnexion@gmail.com',
];

export const isAdmin = (user) =>
  !!user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase());
