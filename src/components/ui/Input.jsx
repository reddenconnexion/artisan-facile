import React from 'react';

/**
 * Champ de saisie au style iOS (coins arrondis, focus-ring accent système).
 *
 * Usage : <Input value={…} onChange={…} placeholder="Nom" />
 *         <Input as="textarea" rows={4} />
 */
const Input = React.forwardRef(({ as = 'input', className = '', ...props }, ref) =>
  React.createElement(as, {
    ref,
    className: `w-full px-3 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-ios focus:border-ios transition ${className}`,
    ...props,
  })
);

Input.displayName = 'Input';

export default Input;
