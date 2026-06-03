import React from 'react';

/**
 * En-tête de page au style iOS : grand titre (« large title ») à gauche,
 * action optionnelle à droite. Uniformise les en-têtes d'écrans.
 *
 * Usage :
 *   <PageHeader title="Devis" action={<button>…</button>} />
 *   <PageHeader title="Clients" subtitle="12 fiches" />
 */
const PageHeader = ({ title, subtitle, action, className = '' }) => (
  <div className={`flex items-end justify-between gap-3 ${className}`}>
    <div className="min-w-0">
      <h1 className="ios-title truncate">{title}</h1>
      {subtitle && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{subtitle}</p>
      )}
    </div>
    {action && <div className="flex-shrink-0">{action}</div>}
  </div>
);

export default PageHeader;
