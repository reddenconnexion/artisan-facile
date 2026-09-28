# Scripts SQL historiques

Scripts appliqués à la main sur la base de production, avant la mise en place de
`supabase/migrations/` ou à côté. Ils sont déjà en base et ne doivent pas être rejoués.

Ils sont conservés pour l'historique : certains ont créé des objets qui existent
encore aujourd'hui (`access_logs`, `get_admin_stats`, les buckets de stockage…).

**Source de vérité pour toute nouvelle modification du schéma : `supabase/migrations/`.**
