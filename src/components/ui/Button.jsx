import React from 'react';

/**
 * Bouton au style iOS. Variantes : primary (accent système), secondary (gris),
 * plain (texte bleu), danger (rouge). Tailles : sm | md | lg.
 *
 * Usage : <Button onClick={…}>Enregistrer</Button>
 *         <Button variant="secondary" size="sm">Annuler</Button>
 */
const VARIANTS = {
  primary: 'bg-ios text-white hover:bg-ios-dark shadow-sm',
  secondary:
    'bg-gray-100 dark:bg-white/10 text-gray-800 dark:text-gray-100 hover:bg-gray-200 dark:hover:bg-white/15',
  plain: 'text-ios hover:opacity-70',
  danger: 'bg-red-500 text-white hover:bg-red-600 shadow-sm',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm rounded-lg',
  md: 'px-4 py-2 text-sm rounded-xl',
  lg: 'px-5 py-2.5 text-base rounded-2xl',
};

const Button = React.forwardRef(
  ({ variant = 'primary', size = 'md', className = '', children, ...props }, ref) => (
    <button
      ref={ref}
      className={`inline-flex items-center justify-center gap-2 font-semibold transition-colors active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${
        VARIANTS[variant] || VARIANTS.primary
      } ${SIZES[size] || SIZES.md} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = 'Button';

export default Button;
