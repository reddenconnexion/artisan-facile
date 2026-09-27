import React from 'react';
import Button from './Button';

/**
 * État vide partagé : icône, titre, texte d'aide et action optionnelle.
 *
 * - `size="lg"` : premier usage (rien en base) — pastille colorée, appel à
 *   l'action mis en avant.
 * - `size="md"` (défaut) : recherche ou filtre sans résultat.
 * - `bare` : sans fond ni bordure (à l'intérieur d'une carte existante).
 *
 * Usage :
 *   <EmptyState icon={Users} title="Aucun client"
 *     description="Ajoutez votre premier client…"
 *     action={{ label: 'Ajouter un client', icon: Plus, onClick: … }} size="lg" />
 *   <EmptyState icon={Search} title={`Aucun résultat pour « ${q} »`} />
 */
const EmptyState = ({
  icon: Icon,
  title,
  description,
  action,
  size = 'md',
  bare = false,
  className = '',
  children,
}) => {
  const large = size === 'lg';
  return (
    <div
      className={`text-center px-6 ${large ? 'py-16' : 'py-12'} ${
        bare ? '' : 'bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800'
      } ${className}`}
    >
      {Icon &&
        (large ? (
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-full h-20 w-20 flex items-center justify-center mx-auto mb-5">
            <Icon className="h-10 w-10 text-blue-400" aria-hidden="true" />
          </div>
        ) : (
          <Icon className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" aria-hidden="true" />
        ))}
      {title && (
        <h3
          className={
            large
              ? 'text-xl font-semibold text-gray-900 dark:text-white mb-2'
              : 'font-medium text-gray-700 dark:text-gray-200'
          }
        >
          {title}
        </h3>
      )}
      {description && (
        <p
          className={`text-gray-500 dark:text-gray-400 max-w-sm mx-auto ${
            large ? 'mb-6' : 'mt-1 text-sm'
          }`}
        >
          {description}
        </p>
      )}
      {action && (
        <Button
          size={large ? 'lg' : 'md'}
          variant={action.variant || 'primary'}
          onClick={action.onClick}
          className={large ? '' : 'mt-4'}
        >
          {action.icon && <action.icon className="w-4 h-4" />}
          {action.label}
        </Button>
      )}
      {children}
    </div>
  );
};

export default EmptyState;
