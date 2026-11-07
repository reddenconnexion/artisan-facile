# Guide de Déploiement - Artisan Facile

Ce guide vous explique comment mettre en ligne votre application "Artisan Facile" de manière sécurisée et gratuite.

## 1. Prérequis

- Un compte [GitHub](https://github.com/) (pour héberger votre code).
- Un compte [Vercel](https://vercel.com/) (recommandé pour le déploiement) ou Netlify.
- Vos identifiants Supabase (URL et Clé Anonyme).

## 2. Sécurité avant déploiement

Assurez-vous que :
- [x] Le fichier `.env` est bien ignoré par git (vérifiez qu'il est dans `.gitignore`).
- [x] Vos règles de sécurité (RLS) sont actives sur Supabase (c'est le cas par défaut dans votre projet).

## 3. Déployer sur Vercel (Recommandé)

1.  **Poussez votre code sur GitHub** :
    - Créez un nouveau dépôt sur GitHub.
    - Poussez votre code local vers ce dépôt.

2.  **Connectez Vercel à GitHub** :
    - Allez sur [Vercel Dashboard](https://vercel.com/dashboard).
    - Cliquez sur "Add New..." > "Project".
    - Importez votre dépôt GitHub "artisan-facile".

3.  **Configuration du projet** :
    - Framework Preset : Vite (devrait être détecté automatiquement).
    - Root Directory : `./` (par défaut).

4.  **Variables d'environnement (Environment Variables)** :
    - C'est l'étape la plus importante pour la sécurité !
    - Ajoutez les variables suivantes (copiez les valeurs depuis votre fichier `.env` local) :
        - `VITE_SUPABASE_URL` : Votre URL Supabase.
        - `VITE_SUPABASE_ANON_KEY` : Votre clé publique (anon) Supabase.

5.  **Déployer** :
    - Cliquez sur "Deploy".
    - Attendez quelques secondes... Votre site est en ligne !

### CORS des Edge Functions

Pour n'autoriser que votre app à appeler les Edge Functions depuis un navigateur, définissez le secret :

```
supabase secrets set ALLOWED_ORIGIN=https://app.artisan-facile.fr
```

Sans valeur, les fonctions acceptent toutes les origines (`*`). Une seule origine est supportée.

## 4. Vérification

- Accédez à l'URL fournie par Vercel (ex: `https://artisan-facile.vercel.app`).
- Testez la connexion et la création d'un devis pour vérifier que la liaison avec Supabase fonctionne.

## Note sur la sécurité

- **Clés API** : La clé `ANON_KEY` est publique par design, elle peut être exposée dans le navigateur. La sécurité est assurée par les règles RLS (Row Level Security) de Supabase que nous avons configurées.
- **Service Role Key** : Ne jamais utiliser la `SERVICE_ROLE_KEY` dans votre application frontend ou dans les variables d'environnement Vercel (sauf pour des Edge Functions spécifiques côté serveur).

## 5. Pilote automatique (plan Pro)

L'Edge Function `autopilot-run` relance seule les devis non signés, rappelle les
factures en retard, demande un avis Google après paiement (du lundi au vendredi,
9 h – 18 h, heure de Paris) et envoie le résumé du soir à 18 h. Elle se déploie
avec les autres fonctions ; il reste à la planifier une fois.

1. Secrets (déjà présents si le rapport hebdo des retours tourne) :

```bash
supabase secrets set CRON_SECRET=<une longue valeur aléatoire>
```

```bash
supabase secrets set APP_URL=https://app.artisanfacile.fr
```

   `RESEND_API_KEY` sert de repli pour les artisans sans SMTP : le mail part au
   nom de leur entreprise depuis `AUTOPILOT_EMAIL_FROM` (par défaut l'adresse de
   `EMAIL_FROM`, domaine vérifié chez Resend), et les réponses arrivent dans leur
   boîte. `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` servent au résumé du soir.

2. Planification, dans l'éditeur SQL de Supabase (une seule fois) :

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
select vault.create_secret('<même valeur que CRON_SECRET>', 'cron_secret');
select cron.schedule('autopilot-hourly', '5 * * * *', $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/autopilot-run',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
$$);
```

3. Vérifier sans rien envoyer (affiche ce qui partirait pour chaque artisan) :

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/autopilot-run" -H "x-cron-secret: <CRON_SECRET>" -H "Content-Type: application/json" -d '{"dry_run": true}'
```

Garde-fous : rien ne part tant que l'artisan n'a pas activé le pilote ; un mail
par client et par jour, 15 au plus par artisan et par jour ; pas de relance d'un
devis expiré ou de plus de 60 jours ; la mise en demeure et les retards de plus
de 90 jours restent à l'artisan ; un client peut être exclu depuis sa fiche.
