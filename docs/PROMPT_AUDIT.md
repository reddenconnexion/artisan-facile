# Audit des prompts (`/claude-api prompt-audit`): 2026-10-03

## Hypothèses (Step 0)

- **Périmètre :** tout ce qui, dans le dépôt, part vers un modèle sous forme de texte. Le dépôt ne contient **aucun fichier de configuration d'agent** (pas de `CLAUDE.md`, `AGENTS.md`, `.claude/`, skill, commande ni sous-agent). Les skills installés au niveau du compte (devis-electrique, facebook-post, etc.) sont hors du dépôt et **n'ont pas été audités**.
- **Modèle cible :** **Claude Opus 5.5** (`claude-opus-5-5`) pour tout ce qui passe par la voie Anthropic. Le code épingle `claude-opus-5`, mais la demande porte sur les nouveaux modèles et Opus 5.5 succède directement à Opus 5.
- **Fournisseurs autres qu'Anthropic :** l'application appelle aussi Gemini (`gemini-2.5-flash`) et OpenAI (`gpt-4o`, `gpt-4o-mini`, `whisper-1`) dans `ai-proxy`, `plan-vision`, `voice-transcribe` et `weekly-feedback-report`. Ces voies ne sont **pas** concernées par les recommandations ci-dessous, et rien ne propose de les passer sur Claude. Les prompts de génération de devis (`ai-proxy`) ne partent jamais vers Claude : ils sont hors cible.
- **Point d'attention :** les prompts envoyés à `plan-vision` sont **partagés** entre trois fournisseurs. Claude les reçoit pour un compte Pro sans clé personnelle. Gemini ou GPT-4o les reçoivent quand l'utilisateur a configuré sa propre clé, ou quand la clé serveur Anthropic est absente. Les consignes JSON du prompt sont donc conservées, car elles restent utiles à Gemini et OpenAI.

## Résumé

Les trois constats qui comptent le plus :

1. **`plan-vision` épingle encore `claude-opus-5`.** Opus 5.5 est 20 % moins cher et n'est concerné par aucune des quatre ruptures d'API pour cette requête (pas de `thinking` explicite, pas de `tool_choice`, un seul tour, pas d'outil). Le commentaire sur l'effort « par défaut (high) » devient faux : sur Opus 5.5, la valeur par défaut est `medium`. L'effort `low` explicite reste correct.
2. **Le JSON est obtenu en le demandant poliment, puis en le nettoyant** (« Réponds UNIQUEMENT avec le tableau JSON brut… », retrait des balises ```` ``` ````, recherche de `[`…`]`). Sur la voie Anthropic, les sorties structurées (`output_config.format`) garantissent un JSON valide et une `category` limitée aux valeurs autorisées.
3. **Le prompt d'import de plan impose au modèle un découpage « ÉTAPE 1 → 4 » et un calcul d'arrondi** que le code fait déjà (`snap()` sur toutes les coordonnées).

Décompte par groupe : Groupe 1 (texte des prompts) : 2 · Groupe 2 (fichiers de configuration) : non applicable · Groupe 3 (descriptions d'outils) : non applicable · Groupe 4 (configuration des requêtes) : 4.

## Constats

### 1. Modèle épinglé sur la génération précédente

| | |
|---|---|
| **Emplacement** | `supabase/functions/plan-vision/index.ts:149-154` |
| **Extrait** | `model: 'claude-opus-5'`, `// Effort par défaut (high) : la réflexion dépassait…`, `output_config: { effort: 'low' }` |
| **Catégorie** | Groupe 4 : fossiles d'API / modèle cible |
| **Pourquoi c'est daté** | Opus 5.5 remplace Opus 5 à 4 $/20 $ par million de tokens, contre 5 $/25 $. Aucune des ruptures (désactivation du thinking, `tool_choice` forcé, historique modifié, outil computer) ne touche cette requête. Le commentaire attribue l'effort par défaut `high` à un modèle dont la valeur par défaut est `medium`. |
| **Confiance** | Haute |
| **Action** | `rewrite` : `claude-opus-5-5` et commentaire reformulé, `effort: 'low'` conservé |

### 2. JSON forcé par le prompt plutôt que par l'API

| | |
|---|---|
| **Emplacement** | `src/components/EtiquettesPhotoModal.jsx:26` et `:33-42`, `public/plan-electrique.html:5300`, `:5392` et `:5436-5437` |
| **Extrait** | « Réponds UNIQUEMENT avec le tableau JSON brut, sans texte autour, sans bloc markdown. », « retourner UNIQUEMENT un objet JSON valide… », `raw.replace(/```json\|```/g, '')` puis `JSON.parse(clean)` |
| **Catégorie** | Groupe 1b : échafaudage remplacé par une fonction de l'API (sorties structurées) |
| **Pourquoi c'est daté** | `output_config.format` contraint la réponse au schéma. Sur le plan électrique, un `JSON.parse` qui échoue fait aujourd'hui tomber tout l'import. |
| **Confiance** | Moyenne (le prompt reste partagé avec Gemini et OpenAI) |
| **Action** | `replace-with-API-feature` : `plan-vision` accepte un `outputSchema` optionnel, qu'il ne transmet qu'à la voie Anthropic. Les deux appelants envoient leur schéma. Le texte du prompt et l'analyse tolérante restent en place pour les autres fournisseurs. Pour les étiquettes, la racine du schéma est `{ circuits: [...] }` : `parseCircuitsResponse` retrouve déjà le tableau à l'intérieur, sans modification. |

### 3. Arrondi à la grille demandé au modèle alors que le code le fait

| | |
|---|---|
| **Emplacement** | `public/plan-electrique.html:5304` et `:5372` |
| **Extrait** | « TOUTES les coordonnées doivent être des multiples de 20 », « 1. Coordonnées multiples de 20 UNIQUEMENT — arrondis au multiple le plus proche » |
| **Catégorie** | Groupe 1b : calcul que le modèle doit faire alors qu'il appartient au code (et Groupe 1a : majuscules) |
| **Pourquoi c'est daté** | `snap()` (`plan-electrique.html:5442-5458`) arrondit déjà toutes les coordonnées des pièces, murs, éléments et câbles. La consigne fait faire au modèle un calcul inutile, en majuscules, qui peut le détourner de la précision du placement. |
| **Confiance** | Moyenne (le code contredit l'utilité de la règle) |
| **Action** | `rewrite` : « L'application aligne ensuite les coordonnées sur sa grille, inutile de les arrondir. » La règle sur les bornes [0, 1000] × [0, 800] est conservée : le code ne la vérifie pas. |

### 4. Découpage imposé « étape par étape » pour lire un plan

| | |
|---|---|
| **Emplacement** | `public/plan-electrique.html:5381-5386` |
| **Extrait** | « Analyse ce plan électrique manuscrit étape par étape : ÉTAPE 1 — Vue d'ensemble… ÉTAPE 4 — Équipements… (optionnel, skip si non coché) » |
| **Catégorie** | Groupe 1b (« think step by step ») + Groupe 1c (chorégraphie) + Groupe 1d (échafaudage de lecture d'image) |
| **Pourquoi c'est daté** | Sur Opus 5.5, le thinking est toujours actif et la lecture de schémas est nettement plus précise. Un script d'étapes contraint le modèle au lieu de l'aider, et les couches non cochées sont déjà exclues par les lignes « Ne retourne PAS… ». |
| **Confiance** | Moyenne. À re-tester aussi sur Gemini 2.5 Flash et GPT-4o, qui reçoivent le même texte. |
| **Action** | `rewrite` : énoncer seulement les couches demandées (pièces, murs, équipements), sans numérotation |

### 5. Pas de repli en cas de refus

| | |
|---|---|
| **Emplacement** | `supabase/functions/plan-vision/index.ts:141-174` |
| **Extrait** | `if (data.stop_reason === 'refusal') throw new Error("L'IA a refusé d'analyser cette image…")` |
| **Catégorie** | Groupe 4 : configuration des requêtes (refus et repli) |
| **Pourquoi** | Opus 5.5 élargit les classifieurs de sécurité (`bio` rejoint `cyber` et `reasoning_extraction`). `fallbacks: "default"` (en-tête `server-side-fallback-2026-07-01`) relance automatiquement une requête refusée sur le modèle de repli recommandé, au lieu de renvoyer l'erreur à l'artisan. La vérification `refusal` existante reste en place pour le cas où toute la chaîne refuse. |
| **Confiance** | Moyenne |
| **Action** | `add` : en-tête bêta et `fallbacks: 'default'` |

### 6. Aucun suivi des tokens consommés

| | |
|---|---|
| **Emplacement** | `supabase/functions/plan-vision/index.ts:171` |
| **Catégorie** | Groupe 4 : pas de suivi des coûts |
| **Pourquoi** | La clé serveur Anthropic paie les analyses de tous les comptes Pro, mais rien n'enregistre `usage`. Sans ces chiffres, impossible de mesurer l'effet de ce changement ou du passage à Opus 5.5. |
| **Confiance** | Moyenne |
| **Action** | `add` : une ligne `console.log` avec le modèle, les tokens d'entrée et de sortie et `stop_reason`, lisible dans les logs Supabase |

### Signalés, sans modification proposée (confiance basse)

- `public/plan-electrique.html:5305` : « IMPORTANT : Utilise tout l'espace disponible… ». La consigne est en majuscules, mais sa raison est donnée juste à côté (le cadrage sur le canevas). On la garde.
- `public/plan-electrique.html:5371` : le titre « RÈGLES STRICTES » donne un ton insistant. C'est un simple registre, sans effet documenté.
- `src/components/EtiquettesPhotoModal.jsx:24` : « EXACTEMENT une de : … ». Devient redondant sur la voie Anthropic avec l'`enum` du schéma, mais reste utile aux autres fournisseurs.
- La description de photo de chantier, identique dans `VisiteTechniqueMode.jsx:820` et `SiteVisitModal.jsx:120`, est saine : une ligne de rôle suivie du contexte métier. La duplication fonctionne, rien à changer.

## Correctif

Les six constats ci-dessus sont **appliqués** dans cette même PR (`plan-vision/index.ts`, `EtiquettesPhotoModal.jsx`, `plan-electrique.html`). Le fichier de correctif a été retiré une fois appliqué.

## Vérifications à faire après application

1. Déployer `plan-vision` et importer une photo d'étiquettes et un plan manuscrit avec un compte Pro sans clé personnelle (voie Anthropic). Comparer le nombre d'éléments détectés et le temps de réponse avec la version actuelle.
2. Refaire les deux imports avec une clé Gemini personnelle : le prompt modifié (constats 3 et 4) part aussi vers Gemini.
3. Lire les logs Supabase de `plan-vision` pour obtenir le premier relevé de tokens.
