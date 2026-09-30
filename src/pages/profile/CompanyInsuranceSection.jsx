import React from 'react';
import { Shield } from 'lucide-react';

const CompanyInsuranceSection = ({ formData, handleChange }) => {
    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <Shield className="w-5 h-5 mr-2 text-blue-600" />
                Assurance décennale / RC pro
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                Mention obligatoire sur vos devis et factures (loi Pinel) : nom et adresse de l'assureur + couverture géographique.
                Dès que la compagnie est renseignée, la mention apparaît automatiquement dans les mentions légales de vos documents.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Compagnie d'assurance</label>
                    <input
                        type="text"
                        name="insurance_company"
                        value={formData.insurance_company}
                        onChange={handleChange}
                        placeholder="Ex: AXERIA IARD"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">N° de contrat</label>
                    <input
                        type="text"
                        name="insurance_contract_number"
                        value={formData.insurance_contract_number}
                        onChange={handleChange}
                        placeholder="Ex: 26046688419"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Facultatif mais recommandé : permet au client de vérifier votre attestation.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Adresse de l'assureur</label>
                    <input
                        type="text"
                        name="insurance_company_address"
                        value={formData.insurance_company_address}
                        onChange={handleChange}
                        placeholder="Ex: 129 avenue Félix Faure, 69003 Lyon"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Couverture géographique</label>
                    <input
                        type="text"
                        name="insurance_coverage_area"
                        value={formData.insurance_coverage_area}
                        onChange={handleChange}
                        placeholder="Ex: France métropolitaine"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
            </div>
        </div>
    );
};

export default CompanyInsuranceSection;
