import { User, AlertCircle } from 'lucide-react';
import { Input, Field } from '../../components/ui';
import { formatDate } from '../../utils/format';

// Client : recherche, nom libre et devis / facture lié(e).
export const ClientSection = ({
    formData, setFormData, updateField, isSiteVisit,
    clients, clientSearch, setClientSearch,
    showClientDropdown, setShowClientDropdown, clientDropdownRef,
    handleClientChange, clientQuotes, handleQuoteChange,
}) => (
    <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <User className="w-5 h-5 text-blue-500" />
            Client
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="relative" ref={clientDropdownRef}>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Rechercher un client
                </label>
                <Input
                    type="text"
                    value={clientSearch}
                    onChange={e => {
                        setClientSearch(e.target.value);
                        setShowClientDropdown(true);
                        if (!e.target.value) {
                            setFormData(prev => ({ ...prev, client_id: '', client_name: '', quote_id: '' }));
                        }
                    }}
                    onFocus={() => setShowClientDropdown(true)}
                    placeholder="Tapez pour rechercher..."
                />
                {showClientDropdown && (
                    <ul className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        <li
                            className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                            onMouseDown={() => handleClientChange('')}
                        >
                            — Aucun client —
                        </li>
                        {clients
                            .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                            .map(c => (
                                <li
                                    key={c.id}
                                    onMouseDown={() => handleClientChange(String(c.id))}
                                    className="px-3 py-2 text-sm text-gray-900 dark:text-white cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/30"
                                >
                                    {c.name}
                                </li>
                            ))
                        }
                    </ul>
                )}
            </div>
            <Field label="Nom du client (libre)">
                <Input
                    type="text"
                    value={formData.client_name}
                    onChange={e => updateField('client_name', e.target.value)}
                    placeholder="Ou saisir un nom manuellement"
                />
            </Field>
        </div>
        {/* Visite faite avant d'avoir créé le client : le dire ici, là où
            on peut y remédier, plutôt que de laisser chercher pourquoi la
            fiche du client reste sans photos. */}
        {isSiteVisit && !formData.client_id && (formData.photos || []).length > 0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                    Aucun client rattaché à cette visite. Choisissez-le ci-dessus :
                    ses {(formData.photos || []).length} photo(s) rejoindront son dossier
                    photo (« avant travaux ») dès l'enregistrement.
                </p>
            </div>
        )}
        <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Devis / Facture lié(e)
            </label>
            <select
                value={formData.quote_id}
                onChange={e => handleQuoteChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-2 focus:ring-ios"
            >
                <option value="">— Aucun devis lié —</option>
                {clientQuotes.map(q => (
                    <option key={q.id} value={q.id}>
                        {q.title || `Devis #${q.id}`}
                        {q.date ? ` — ${formatDate(q.date)}` : ''}
                        {q.total_ttc ? ` — ${parseFloat(q.total_ttc).toFixed(2)} €` : ''}
                    </option>
                ))}
            </select>
            {formData.quote_id && (
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    L'adresse du devis a été pré-remplie si le champ était vide.
                </p>
            )}
        </div>
    </div>
);
