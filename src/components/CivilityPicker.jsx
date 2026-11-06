import { CIVILITY_OPTIONS } from '../utils/clientGreeting';

/**
 * Choix de la civilité du client (M. / Mme / M. et Mme), utilisée pour la
 * salutation des mails : « Bonjour Mme Lafitte ». « Aucune » : « Bonjour Marie Lafitte ».
 */
const CivilityPicker = ({ value, onChange, id = 'civility' }) => {
    const options = [{ value: '', label: 'Aucune' }, ...CIVILITY_OPTIONS];
    return (
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
            {options.map(option => {
                const selected = (value || '') === option.value;
                return (
                    <button
                        key={option.value || 'none'}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => onChange(option.value)}
                        className={`px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                            selected
                                ? 'border-ios bg-ios/10 text-ios'
                                : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
};

export default CivilityPicker;
