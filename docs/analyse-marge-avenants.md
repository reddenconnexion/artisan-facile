# Analyse — Calcul de la marge sur les avenants

> Document d'analyse technique. Décrit **comment** la marge est calculée pour un
> avenant aujourd'hui, **où** le comportement est fiable, et **où** il est faux.
> Aucune modification de code n'est induite par ce document : il sert de base de
> décision pour un éventuel correctif.

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

| Zone | Fichier | Nature | Gravité |
|---|---|---|---|
| Marge prévue avenant | `DevisForm.jsx:5083` | — | ✅ correct |
| Marge réalisée avenant (fiche) | `DevisForm.jsx:5124` | Indicateur faux (repli parent) | ⚠️ cosmétique mais trompeur |
| Marge réelle avenant (liste) | `DevisList.jsx:66` | Idem | ⚠️ cosmétique mais trompeur |
| Résultat Net / Dashboard | `realizedMargin.js:182` + `netIncome.js:152` | Coût matière multi-compté | 🔴 fausse un **chiffre financier** |

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

---

*Références de code valables à la date de rédaction ; les numéros de ligne peuvent
avoir bougé depuis.*
