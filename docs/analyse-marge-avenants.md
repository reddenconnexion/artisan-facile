# Analyse — Calcul de la marge sur les avenants

> Document d'analyse technique. Décrit **comment** la marge est calculée pour un
> avenant, **où** le comportement était fiable, et **où** il était faux.
>
> **État : les deux défauts décrits en §3.2 et §3.3 ont été corrigés** (voir §7).
> Les extraits de code des sections 3.2 et 3.3 documentent le comportement
> **avant** correctif, conservés pour expliquer le raisonnement.

## 1. Rappel : deux marges bien distinctes

L'application calcule deux marges de nature différente, à ne jamais confondre.

| | Marge **prévue** | Marge **réalisée** |
|---|---|---|
| Aussi affichée comme | « Marge matière » / « Marge nette » | « Marge réelle » / « Marge matériel » |
| Source des données | les lignes du devis (`quotes.items`) | les achats suivis (`procurement_items`) + les heures pointées (`task_tracking`) |
| Fonction | `quoteMargin` (`src/utils/quoteInternalDetail.js:63`) | `realizedQuoteMargin` / `groupMaterialsMargin` / `realizedNetAdjustment` (`src/utils/realizedMargin.js`) |
| Modifie le devis ? | non | non (lecture seule) |

- La **marge prévue** est un simple ratio interne au document : `(CA − coûts prévus) / CA`.
- La **marge réalisée** confronte le CA du document aux **coûts réels du terrain**
  (prix fournisseur saisis au bureau, heures réellement pointées).

## 2. Ce qu'est un avenant dans le modèle de données

Un avenant est un **devis à part entière** :

- `type = 'amendment'` ;
- `parent_id` **et** `parent_quote_id` pointent vers le devis initial
  (`src/pages/DevisForm.jsx:2468` — `handleCreateAvenant`) ;
- il possède ses **propres lignes** (`items`) : uniquement les travaux
  supplémentaires ;
- il a donc son **propre CA** (`total_ht` / `subtotal`), en général petit devant
  celui du chantier initial.

Point structurel essentiel : **les coûts réels d'un chantier (achats de matériel,
heures pointées) sont le plus souvent rattachés à UN SEUL devis — le chantier
principal (le parent)**, alors que le **CA est réparti** entre le devis initial et
chacun de ses avenants / factures de situation.

## 3. Verdict par calcul

### 3.1 Marge PRÉVUE de l'avenant — ✅ correcte

`src/pages/DevisForm.jsx:5083`

```js
const m = quoteMargin(formData.items, subtotal, laborRate);
```

Pour un avenant, `formData.items` = les seules lignes de l'avenant et `subtotal` =
le seul CA de l'avenant. Le ratio porte donc bien sur le périmètre de l'avenant.
**Rien à corriger.**

### 3.2 Marge RÉALISÉE de l'avenant (fiche + liste) — ⚠️ fausse par « repli parent »

Le même motif apparaît à **deux** endroits d'affichage :

- fiche devis : `src/pages/DevisForm.jsx:5124-5130`
- liste des devis (`RealizedMarginBadge`) : `src/pages/DevisList.jsx:66-77`

```js
const agg = procurementCosts.get(Number(id))
    ?? (formData.parent_quote_id ? procurementCosts.get(Number(formData.parent_quote_id)) : undefined);
const spent = spentHoursMap.get(Number(id))
    ?? (formData.parent_quote_id ? spentHoursMap.get(Number(formData.parent_quote_id)) : 0) ?? 0;
const r = realizedQuoteMargin(formData.items, subtotal, laborRate, agg, spent);
```

**Mécanisme du défaut.** Si l'avenant n'a **pas** d'achats/pointages qui lui sont
propres, le code retombe sur ceux du **parent**. `realizedQuoteMargin`
(`src/utils/realizedMargin.js:99`) confronte alors :

- **coût** = `agg.cost` = *tout* le matériel acheté du chantier + *toutes* les
  heures pointées du chantier (celles du parent) ;
- **revenu** = `subtotal` = le seul CA de l'avenant.

soit `marge = (petit CA avenant − gros coût parent) / petit CA avenant`.

**Exemple chiffré.**

- Chantier initial : 10 000 € HT, 4 000 € de matériel réellement acheté (rattaché
  au parent), 40 h pointées.
- Avenant : 800 € HT de travaux supplémentaires, sans achat ni pointage propres.

Résultat affiché sur l'avenant, coût horaire 30 €/h :

```
coût  = 4 000 € (matériel parent) + 40 h × 30 € (1 200 €) = 5 200 €
marge = (800 − 5 200) / 800 = −550 %
```

→ un indicateur **absurde** (−550 %), alors que l'avenant peut être très rentable.

Ce calcul n'est **correct que si** l'artisan a explicitement envoyé le matériel de
l'avenant vers l'approvisionnement **depuis l'avenant** (`quote_id` = id de
l'avenant, via `QuoteSupplyListModal`). Sinon, le repli se déclenche et fausse
l'affichage.

### 3.3 Ajustement « coûts réels » en Comptabilité / Tableau de bord — ⚠️ multi-comptage

`src/utils/realizedMargin.js:182-190` (`realizedNetAdjustment`)

```js
(entries).forEach((e) => {
    const agg = costByQuote.get(Number(e.id))
        ?? (e.parentId != null ? costByQuote.get(Number(e.parentId)) : undefined);
    if (!agg || agg.pricedCount === 0) return;
    coveredCount += 1;
    caMaterielReal += num(e.materialAmount); // ← propre à chaque document : OK
    realMaterialCost += agg.cost;            // ← AUCUNE déduplication : problème
});
```

**Mécanisme du défaut.** `entries` est la liste des **documents payés de la
période** (`periodData.detail`, `src/pages/Accounting.jsx:213-223`). Quand
**plusieurs documents payés partagent le même parent** — un avenant + une facture,
ou surtout **N factures de situation** —, chacun qui n'a pas d'achats propres
retombe sur le **même** `agg` du parent, et `agg.cost` est **additionné N fois**.

- Le **CA** (`caMaterielReal`) reste correct : chaque document apporte son propre
  `materialAmount`.
- Le **coût** (`realMaterialCost`) est **gonflé ×N**.

Ce coût gonflé se propage dans `computeNetIncome` (`src/utils/netIncome.js:152-154`) :

```js
const margeMaterielReelle = mReal - realCost;          // realCost sur-évalué
const margeMateriel = (m - mReal) * rate + margeMaterielReelle;
```

→ la **marge matériel réelle**, donc le **revenu net** de la période, est
**sous-évaluée**.

**Confirmation par les tests.** `src/utils/realizedMargin.test.js:149` couvre
exactement le cas prévu — **une** facture enfant qui retrouve les achats de **son**
parent :

```js
it('retrouve les achats du devis parent pour une facture enfant', () => {
    const entries = [{ id: 123, parentId: 9, materialAmount: 150 }];
    // → realMaterialCost: 100 (le coût du parent, compté une fois)
});
```

Le cas **plusieurs enfants → un même parent** (avenants, situations) **n'est pas
testé** : c'est la lacune. Le repli a été conçu pour la relation *1 devis →
1 facture*, et se comporte mal en *N documents → 1 parent*.

## 4. Cause racine commune

Un seul et même choix de conception explique les trois symptômes :

> **« À défaut de coûts propres, prends ceux du parent. »**

Ce repli est légitime quand il y a **un** document facturé par devis. Il devient
faux dès que **CA et coûts réels ne vivent pas sur le même document** :

- les **coûts réels** s'accumulent sur **un** devis (le chantier parent) ;
- le **CA** est **réparti** entre parent + avenants + situations.

Confronter le coût *total* d'un côté à un CA *partiel* de l'autre — ou réutiliser
le même coût pour plusieurs CA partiels — casse le rapprochement.

## 5. Portée et gravité

| Zone | Fichier | Nature | Gravité | État |
|---|---|---|---|---|
| Marge prévue avenant | `DevisForm.jsx:5083` | — | ✅ correct | inchangé |
| Marge réalisée avenant (fiche) | `DevisForm.jsx:5124` | Indicateur faux (repli parent) | ⚠️ cosmétique mais trompeur | ✅ corrigé (§7.2) |
| Marge réelle avenant (liste) | `DevisList.jsx:66` | Idem | ⚠️ cosmétique mais trompeur | ✅ corrigé (§7.2) |
| Résultat Net / Dashboard | `realizedMargin.js:182` + `netIncome.js:152` | Coût matière multi-compté | 🔴 fausse un **chiffre financier** | ✅ corrigé (§7.1) |

- Les points 3.2 sont **informatifs** (badges) : ils n'entrent pas dans un calcul
  comptable, mais ils affichent des marges négatives aberrantes et minent la
  confiance dans l'outil.
- Le point 3.3 est le plus sérieux : il **dégrade le revenu net réel** affiché en
  Comptabilité et sur le Tableau de bord, dès qu'un chantier facturé par
  **situations** ou par **avenants** a ses achats suivis au prix réel.

## 6. Pistes de correction (pour décision)

### Piste 1 — Correctif ciblé (rapide, sûr)

1. **`realizedNetAdjustment`** : dédupliquer le coût par `agg` déjà consommé. Un
   `agg` de parent ne doit être compté **qu'une fois** par période, même si
   plusieurs enfants y retombent (p. ex. mémoriser les `quote_id` de coût déjà
   ajoutés dans un `Set`). À arbitrer : à quel document imputer ce coût unique.
2. **Badges avenant (fiche + liste)** : ne pas afficher de marge réalisée
   « matière » quand le seul `agg` disponible provient du parent (repli), OU la
   présenter explicitement comme *marge du chantier consolidé* et non de
   l'avenant seul.
3. Ajouter les **tests manquants** : N enfants → 1 parent (non double comptage), et
   avenant sans achats propres (pas de marge réalisée aberrante).

### Piste 2 — Refonte « marge chantier » (plus juste, plus de travail)

Agréger **CA et coûts réels au niveau du chantier** (parent + tous ses avenants et
situations) et n'exposer qu'**un seul** indicateur de marge réalisée par chantier,
au lieu d'un indicateur par document. Supprime la cause racine mais demande de
revoir l'UI (fiche, liste, compta) et la façon de regrouper les documents.

**Recommandation :** Piste 1 pour rétablir la justesse des chiffres rapidement et
sans risque, en gardant la Piste 2 comme évolution de fond.

## 7. Correctif appliqué (Piste 1)

### 7.1 Déduplication du coût parent — corrige §3.3

`src/utils/realizedMargin.js` — `realizedNetAdjustment`

Le coût réel d'un devis n'est désormais imputé **qu'une seule fois par période**,
même si plusieurs documents (avenants, factures de situation) y retombent. Un
`Set` mémorise les devis-source déjà comptés :

```js
const countedSources = new Set();
...
const sourceKey = costByQuote.has(ownKey)
    ? ownKey
    : (parentKey != null && costByQuote.has(parentKey) ? parentKey : null);
...
caMaterielReal += num(e.materialAmount); // CA : propre à chaque document
if (countedSources.has(sourceKey)) return;
countedSources.add(sourceKey);
realMaterialCost += agg.cost;            // coût : une seule fois par chantier
```

Le CA continue de s'additionner document par document (il leur est bien propre) ;
seul le **coût** est dédupliqué. Le cas « le parent est lui-même payé dans la
période » est couvert par la même clé (`ownKey` prioritaire sur `parentKey`).

### 7.2 Garde-fou sur le repli parent — corrige §3.2

Nouveau prédicat partagé `isPartialScopeDoc(doc)` (`src/utils/realizedMargin.js`),
vrai pour les documents qui ne facturent qu'une **part** du chantier :

- avenants (`type = 'amendment'`) ;
- factures de situation (`amendment_details.situation` ou titre « situation »,
  même détection qu'ailleurs dans l'app).

Appliqué aux deux points d'affichage :

- `src/pages/DevisForm.jsx` (fiche devis)
- `src/pages/DevisList.jsx` (`RealizedMarginBadge`)

```js
const canUseParent = devis.parent_id != null && !isPartialScopeDoc(devis);
const agg = costByQuote.get(Number(devis.id))
    ?? (canUseParent ? costByQuote.get(Number(devis.parent_id)) : undefined);
```

Conséquence : un avenant sans achats/pointages propres **n'affiche plus** de marge
réalisée (au lieu d'un −550 % aberrant). Dès que du matériel lui est rattaché
explicitement — envoi vers l'approvisionnement **depuis l'avenant** —, sa marge
réalisée s'affiche normalement, sur son propre périmètre.

Le repli parent reste actif pour le cas légitime *1 devis → 1 facture*, où la
facture reprend le périmètre complet.

### 7.3 Couverture de tests

`src/utils/realizedMargin.test.js` — ajouts :

- N enfants → 1 parent : CA additionné (150), coût compté une fois (100, et non 300) ;
- parent payé + avenant sur la même période : coût non dupliqué ;
- chantiers **distincts** : coûts bien additionnés (non-régression du cas normal) ;
- `isPartialScopeDoc` : avenants, situations (contexte + titre), documents complets.

Suite complète : **328 tests / 28 fichiers au vert**, aucune régression. Le lint
ne remonte aucune nouvelle erreur (les erreurs restantes sur ces fichiers sont
préexistantes).

### 7.4 Ce qui n'est PAS traité

La cause racine structurelle demeure (Piste 2) : coûts réels concentrés sur le
parent, CA réparti sur les enfants. Le correctif empêche les chiffres faux, mais
n'offre toujours pas de vision consolidée « marge du chantier » regroupant le
devis initial et tous ses avenants/situations.

---

*Références de code valables à la date de rédaction ; les numéros de ligne peuvent
avoir bougé depuis.*
