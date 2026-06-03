import React from 'react';

/**
 * Carte au style iOS « inset grouped » (fond, coins arrondis 2xl, bordure fine,
 * ombre douce). Surcouche fine au-dessus de la classe utilitaire `.ios-card`
 * définie dans index.css, pour éviter de répéter les mêmes classes partout.
 *
 * Usage : <Card className="p-4">…</Card> ou <Card as="button" onClick={…} />
 */
const Card = React.forwardRef(({ as = 'div', className = '', children, ...props }, ref) =>
  React.createElement(as, { ref, className: `ios-card ${className}`, ...props }, children)
);

Card.displayName = 'Card';

export default Card;
