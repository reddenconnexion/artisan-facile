import React from 'react';

/**
 * Conteneur de champ de formulaire iOS : label, indice et message d'erreur
 * cohérents autour d'un contrôle (Input, select, etc.).
 *
 * Usage :
 *   <Field label="Email" required hint="Pro de préférence">
 *     <Input type="email" … />
 *   </Field>
 */
const Field = ({ label, hint, error, required, htmlFor, className = '', children }) => (
  <div className={className}>
    {label && (
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
    )}
    {children}
    {hint && !error && <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</p>}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

export default Field;
