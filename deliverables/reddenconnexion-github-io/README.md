# Compteur d'interventions par commune — reddenconnexion.github.io

Ces fichiers sont à copier **dans le repo `reddenconnexion/reddenconnexion.github.io`** (je n'y ai pas accès en écriture depuis ici).

## Architecture

```
Supabase (artisan-facile)
       │
       │  RPC get_intervention_counts_by_city()  (anon, agrégats seulement)
       ▼
GitHub Action quotidienne (03:00 UTC)
       │
       │  Géocodage via geo.api.gouv.fr
       ▼
js/interventions.json   ← committed sur main
       │
       ▼
Site statique reddenconnexion.github.io
       │
       ▼
Carte Leaflet (lecture du JSON statique)
```

## Étapes d'installation

### 1. Côté `artisan-facile` (déjà fait sur cette branche)

Appliquer la migration `supabase/migrations/20260512100000_intervention_counts_by_city.sql` (elle sera exécutée automatiquement par votre pipeline Supabase ou via `supabase db push`).

### 2. Côté `reddenconnexion.github.io`

Copier l'arborescence ci-dessous dans le repo :

```
.github/workflows/refresh-interventions.yml
scripts/fetch-interventions.mjs
js/interventions.json        ← sera généré au 1er run de l'Action
```

Et insérer le contenu de `snippet-map.html` dans la page où vous voulez la carte.

### 3. Configurer les secrets GitHub

Sur `reddenconnexion/reddenconnexion.github.io` → **Settings → Secrets and variables → Actions** → ajouter :

| Nom | Valeur |
|---|---|
| `SUPABASE_URL` | `https://<votre-projet>.supabase.co` |
| `SUPABASE_ANON_KEY` | la clé `anon` publique du projet Supabase |

> La clé `anon` est conçue pour être exposée. Elle est néanmoins stockée en secret car cela facilite la rotation et évite de la coller en clair dans le repo.

### 4. Déclencher manuellement le 1er run

Onglet **Actions** → **Refresh interventions data** → **Run workflow**. Vérifier que `js/interventions.json` apparaît dans le commit suivant.

## Personnalisation

- **Fréquence** : modifier `cron: '0 3 * * *'` dans le workflow.
- **Filtrage** : la RPC ne renvoie que les statuts `completed`/`signed`. Pour inclure les brouillons, modifier la migration côté `artisan-facile`.
- **Style de la carte** : couleurs, rayon des cercles, fond de carte → tout est dans `snippet-map.html`.

## Sécurité — points clés

- La RPC `get_intervention_counts_by_city()` est `SECURITY DEFINER` mais ne renvoie que des **agrégats** : ville, code postal, comptage. Aucune donnée client.
- La clé `anon` n'a accès qu'à ce qui est explicitement `GRANT`-é (la RPC + ce que vos politiques RLS autorisent). Elle est donc sans danger côté navigateur ou GitHub Actions.
- Le JSON publié sur `reddenconnexion.github.io` ne contient que ce qui est déjà retourné par la RPC + des coordonnées géographiques publiques.
