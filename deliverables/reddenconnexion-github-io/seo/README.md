# SEO — Top 3 pages à travailler (reddenconnexion.github.io)

> Ces fichiers sont à appliquer **dans le repo `reddenconnexion/reddenconnexion.github.io`**.
> Je n'y ai pas accès en écriture depuis la session `artisan-facile`, donc tout est
> fourni ici **prêt à coller**. Chaque snippet indique la page cible et l'endroit où l'insérer.

## Vue d'ensemble

| Priorité | Page | État actuel | Action principale |
|---|---|---|---|
| 🥇 | `depannage-electrique-libourne.html` | 838 impr. · pos 16,4 · CTR 0,24 % | Enrichir : section « coupure », FAQ, maillage, title/meta |
| 🥈 | `renovation-electrique.html` | 584 impr. · pos 8,38 · CTR 0 % | title/meta géolocalisés, maillage villes, « vétuste » |
| 🥉 | `depannage-electrique-coutras.html` | 683 impr. · pos 10,7 | **Ne pas toucher au contenu** — title/meta + fiche Google Business |

---

## 1. `<title>` et `<meta name="description">`

À remplacer dans le `<head>` de chaque page. (Détail aussi dans `titles-meta.html`.)

### depannage-electrique-libourne.html
```html
<title>Dépannage Électrique Libourne 24h/24 — Intervention en 20 min | Red Den</title>
<meta name="description" content="Panne, disjoncteur, coupure de courant à Libourne ? Électricien d'urgence 24h/24, 7j/7, sur place en 20-25 min. 25 ans d'expérience. ☎ 06 95 10 08 23 — devis avant intervention.">
```

### renovation-electrique.html
```html
<title>Rénovation Électrique en Gironde — Mise aux normes NF C 15-100 | Devis gratuit</title>
<meta name="description" content="Rénovation et mise aux normes électriques à Libourne, Coutras, Montpon et toute la Gironde. Tableau, câblage, attestation Consuel. 25 ans d'expérience, devis gratuit sous 48 h.">
```

### depannage-electrique-coutras.html
```html
<title>Électricien Coutras 24h/24 — Dépannage en moins de 2h | Red Den Connexion</title>
<meta name="description" content="Électricien à Coutras (33230) 24h/24, 7j/7. Panne, court-circuit, mise aux normes. Sur place en 15-20 min, 25 ans d'expérience, +7000 dépannages. ☎ 06 95 10 08 23.">
```

> Pensez à mettre à jour aussi les balises Open Graph (`og:title`, `og:description`)
> et la balise `<meta property="og:title">` si elles existent, pour rester cohérent.

---

## 2. Section « Coupure de courant à Libourne »

Fichier : `section-coupure-libourne.html`.
À insérer dans `depannage-electrique-libourne.html`, juste **après le 1er bloc de contenu**
(après l'intro / le H1 et avant les services détaillés). Capte la requête
« coupure electricite libourne » (120 impressions, pos 15,5).

## 3. FAQ Libourne

Fichier : `faq-libourne.html`.
À insérer **en bas** de `depannage-electrique-libourne.html`, avant le footer.
Inclut le balisage `schema.org/FAQPage` (JSON-LD) — Google peut afficher les questions
en rich snippet. Trois questions : tarif de nuit, week-end, que faire avant l'arrivée.

## 4. Maillage interne (texte des liens = mots-clés)

Fichier : `liens-internes.html`. Le **texte exact** du lien compte pour le référencement.

- Depuis `index.html` et `depannage-electrique-urgent.html` → lien
  **« dépannage électrique à Libourne »** vers `depannage-electrique-libourne.html`.
- Depuis `renovation-electrique.html` → liens vers les pages rénovation par ville
  (Libourne, Coutras, Montpon…) avec un texte de lien géolocalisé.

## 5. Requête « installation électrique vétuste »

Sur `renovation-electrique.html` (pos 19,8) : ajouter un sous-titre `<h2>` et un court
paragraphe ciblant l'expression. Snippet dans `renovation-vetuste.html`.

---

## Actions hors-site (manuelles — ne peuvent pas être faites depuis le repo)

- **Google Business Profile** : c'est lui qui récupère les clics du pack local
  (Coutras notamment). Provoquer 2-3 avis mentionnant « Libourne », publier un post
  Google Business sur une intervention récente à Libourne.
- **Coutras** : ne pas modifier le contenu de la page — agir uniquement sur la fiche
  Google Business.

## À ne pas faire

Ne pas chercher à se positionner sur Castelnau-de-Médoc, Parempuyre, Bruges, Hostens,
Thenon, Bassens (positions 25-75, hors zone). Concentrer l'effort sur l'axe
**Libourne – Coutras – Montpon – St Médard – Guîtres**.
