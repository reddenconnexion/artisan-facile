# Design system iOS

Petite bibliothèque d'UI au style iOS / iPadOS, utilisée dans toute l'app
(navigation, écrans, formulaires). Objectif : un rendu cohérent sans répéter
les mêmes classes Tailwind partout.

```js
import { Card, PageHeader, Button, SegmentedControl, Input, Field } from '../components/ui';
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

## Convention

- Écrans : titre via `.ios-title` (ou `PageHeader`), cartes via `.ios-card`
  (ou `Card`), accent interactif via les tokens `ios` / `ios-dark`.
- Mode sombre : géré automatiquement par les classes/tokens — rien de spécial
  à faire au niveau des écrans.
