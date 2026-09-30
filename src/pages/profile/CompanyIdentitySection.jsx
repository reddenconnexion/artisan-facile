import { Building, CheckCircle, XCircle } from 'lucide-react';
import { TRADE_CONFIG } from '../../constants/trades';
import B2BReceiverStatus from './B2BReceiverStatus';

const CompanyIdentitySection = ({ formData, handleChange, siretCheck, b2bReceiverStatus, b2bReceiverError, registerB2BReceiver }) => {
    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <Building className="w-5 h-5 mr-2 text-blue-600" />
                Identité de l'entreprise
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Nom de l'entreprise <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        name="company_name"
                        value={formData.company_name}
                        onChange={handleChange}
                        placeholder="Ex: Martin Rénovation"
                        className={`block w-full px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 ${!formData.company_name ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20' : 'border-gray-300 dark:border-gray-600'}`}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Votre nom complet</label>
                    <input
                        type="text"
                        name="full_name"
                        value={formData.full_name}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Numéro SIRET <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        name="siret"
                        value={formData.siret}
                        onChange={handleChange}
                        placeholder="14 chiffres"
                        inputMode="numeric"
                        autoComplete="off"
                        aria-invalid={siretCheck.level === 'error'}
                        aria-describedby="siret-help"
                        className={`block w-full px-3 py-2 border bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500 ${
                            siretCheck.level === 'error'
                                ? 'border-red-400 bg-red-50 dark:bg-red-900/20'
                                : !formData.siret
                                    ? 'border-amber-400 bg-amber-50 dark:bg-amber-900/20'
                                    : 'border-gray-300 dark:border-gray-600'
                        }`}
                    />
                    {/* Le numéro finit imprimé sur un document légal : on nomme
                        l'erreur (SIREN saisi à la place du SIRET, chiffre manquant,
                        clé fausse) plutôt que de dire « invalide ». */}
                    <div id="siret-help" aria-live="polite">
                        {siretCheck.level === 'error' && (
                            <p className="mt-1 flex items-start gap-1.5 text-xs text-red-600 dark:text-red-400">
                                <XCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                                <span>{siretCheck.message}</span>
                            </p>
                        )}
                        {siretCheck.level === 'ok' && (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                                <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>{siretCheck.message}</span>
                            </p>
                        )}
                        {siretCheck.level !== 'ok' && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                14 chiffres — trouvez-le sur votre Kbis ou sur{' '}
                                <a href="https://autoentrepreneur.urssaf.fr" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">autoentrepreneur.urssaf.fr</a>
                            </p>
                        )}
                    </div>
                    {/* Statut enregistrement annuaire DGFIP */}
                    <B2BReceiverStatus
                        b2bReceiverStatus={b2bReceiverStatus}
                        b2bReceiverError={b2bReceiverError}
                        registerB2BReceiver={registerB2BReceiver}
                        siretCheck={siretCheck}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Métier principal</label>
                    <select
                        name="trade"
                        value={formData.trade}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                        {Object.entries(TRADE_CONFIG).map(([key, config]) => (
                            <option key={key} value={key}>
                                {config.label}
                            </option>
                        ))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Statut juridique</label>
                    <select
                        name="artisan_status"
                        value={formData.artisan_status}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="micro_entreprise">Micro-entreprise (Auto-entrepreneur)</option>
                        <option value="ei">Entreprise Individuelle (EI)</option>
                        <option value="eirl">EIRL</option>
                        <option value="eurl">EURL</option>
                        <option value="sasu">SASU</option>
                        <option value="sarl">SARL</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Utilisé pour le calcul des charges URSSAF</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Type d'activité principale</label>
                    <select
                        name="activity_type"
                        value={formData.activity_type}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="services">Prestations de services (peinture, plomberie, électricité…)</option>
                        <option value="vente">Vente de produits / fournitures</option>
                        <option value="mixte">Les deux : services ET vente de produits</option>
                        <option value="liberal">Profession libérale</option>
                    </select>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Détermine votre taux de cotisations URSSAF</p>
                </div>
            </div>
        </div>
    );
};

export default CompanyIdentitySection;
