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

## 4. Vérification

- Accédez à l'URL fournie par Vercel (ex: `https://artisan-facile.vercel.app`).
- Testez la connexion et la création d'un devis pour vérifier que la liaison avec Supabase fonctionne.

## Note sur la sécurité

- **Clés API** : La clé `ANON_KEY` est publique par design, elle peut être exposée dans le navigateur. La sécurité est assurée par les règles RLS (Row Level Security) de Supabase que nous avons configurées.
- **Service Role Key** : Ne jamais utiliser la `SERVICE_ROLE_KEY` dans votre application frontend ou dans les variables d'environnement Vercel (sauf pour des Edge Functions spécifiques côté serveur).
