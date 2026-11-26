# Design system iOS

Petite bibliothèque d'UI au style iOS / iPadOS, utilisée dans toute l'app
(navigation, écrans, formulaires). Objectif : un rendu cohérent sans répéter
les mêmes classes Tailwind partout.

```js
import { Card, PageHeader, Button, SegmentedControl, Input, Field, EmptyState, LoadingState, OverflowMenu } from '../components/ui';
```

## Tokens de couleur

Définis dans `src/index.css` via `@theme`, ils génèrent des utilitaires
Tailwind standards (`bg-…`, `text-…`, `border-…`, `ring-…`) :

| Token        | Valeur    | Exemples d'utilitaires                     |
| ------------ | --------- | ------------------------------------------ |
| `ios`        | `#007AFF` | `bg-ios`, `text-ios`, `border-ios`, `ring-ios` |
| `ios-light`  | `#4da2ff` | `bg-ios-light`                             |
| `ios-dark`   | `#0a84ff` | `hover:bg-ios-dark`                        |

> Préférez ces tokens à un `#007AFF` codé en dur.

## Classes utilitaires

Définies dans `src/index.css` (`@layer components`) :

- **`.ios-card`** — carte « inset grouped » : fond blanc / `#1c1c1e` en sombre,
  coins `rounded-2xl`, bordure fine, ombre douce.
- **`.ios-title`** — grand titre de page (« large title », 34px).

## Primitives

### `Card`
Carte iOS. Polymorphe via `as`.
```jsx
<Card className="p-4">…</Card>
<Card as="button" onClick={…} className="p-4 text-left">…</Card>
```

### `PageHeader`
En-tête d'écran : grand titre + action optionnelle.
```jsx
<PageHeader title="Devis" subtitle="12 documents" action={<Button>Nouveau</Button>} />
```

### `Button`
Bouton iOS. `variant` : `primary` (défaut) · `secondary` · `plain` · `danger`.
`size` : `sm` · `md` (défaut) · `lg`.
```jsx
<Button onClick={…}><Plus className="w-5 h-5" /> Nouveau client</Button>
<Button variant="secondary" size="sm">Annuler</Button>
```

### `SegmentedControl`
Contrôle segmenté iOS.
```jsx
<SegmentedControl
  options={[{ id: 'a', label: 'A', icon: IconA }, { id: 'b', label: 'B' }]}
  value={active}
  onChange={setActive}
/>
```

### `Input`
Champ de saisie (focus-ring accent système). Polymorphe via `as`.
```jsx
<Input value={v} onChange={…} placeholder="Nom" />
<Input as="textarea" rows={4} />
```

### `Field`
Conteneur de champ : label + indice + erreur.
```jsx
<Field label="Email" required hint="Pro de préférence">
  <Input type="email" … />
</Field>
```

### `EmptyState`
État vide de liste. `size="lg"` pour le premier usage (pastille colorée +
appel à l'action), taille par défaut pour une recherche / un filtre sans
résultat, `bare` à l'intérieur d'une carte existante.
```jsx
<EmptyState size="lg" icon={Users} title="Vous n'avez pas encore de clients"
  description="Ajoutez votre premier client…"
  action={{ label: 'Ajouter un client', icon: Plus, onClick: () => navigate('/app/clients/new') }} />
<EmptyState icon={Search} title="Aucun résultat" />
```

### `LoadingState`
Chargement d'une page ou d'une liste (spinner + libellé, `role="status"`).
```jsx
if (loading) return <LoadingState className="h-64" />;
```

### `OverflowMenu`
Bouton « ⋯ » qui range les actions secondaires (export, import, suppression,
options rares…) pour ne laisser en vue que l'action principale de l'écran.
Le menu s'ouvre par-dessus la page (jamais coupé par une liste), sous le
bouton ou au-dessus s'il manque de place, et se ferme au toucher à côté, sur
Échap ou au défilement. Navigation clavier ↑ ↓.
```jsx
<OverflowMenu items={[
  { label: 'Exporter en CSV', description: 'Pour Excel ou votre comptable', icon: Download, onClick: exporter },
  { label: 'Ouvrir Google Lens', icon: ExternalLink, href: 'https://lens.google.com/', external: true },
  { divider: true },
  { label: 'Supprimer', icon: Trash2, danger: true, onClick: supprimer },
]} />
<OverflowMenu variant="ghost" orientation="vertical" items={…} /> {/* ligne de liste */}
```
Options : `variant` (`outline` · `ghost`), `size` (`sm` · `md` · `lg`),
`orientation` (`horizontal` ⋯ · `vertical` ⋮), `badge` (pastille d'alerte sur
le bouton), `width` (classe Tailwind du menu). Une entrée peut être
`disabled`, `hidden` ou falsy (ignorée) : pratique pour les actions
conditionnelles.

**Règle** : en vue, l'action principale (et au plus une ou deux actions
fréquentes) ; tout le reste dans « ⋯ ». La suppression va toujours dans le
menu, en dernier, en rouge.

## Zones tactiles (44 px)

Sur écran tactile (`pointer: coarse`), toute cible doit faire au moins
44×44 px. `Button` et `Input` l'appliquent d'office ; pour un `<button>` brut,
ajoutez l'utilitaire **`tap-target`** (défini dans `src/index.css`) plutôt
qu'un `min-h-[44px]` au cas par cas. L'affichage souris reste compact.

## Convention

- Écrans : titre via `.ios-title` (ou `PageHeader`), cartes via `.ios-card`
  (ou `Card`), accent interactif via les tokens `ios` / `ios-dark`.
- Mode sombre : géré automatiquement par les classes/tokens — rien de spécial
  à faire au niveau des écrans.
