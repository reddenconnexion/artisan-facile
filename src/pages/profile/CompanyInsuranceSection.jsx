import { Shield, FileCheck, Eye, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import { attestationValidity } from '../../utils/insuranceAttestation';

const CompanyInsuranceSection = ({ formData, handleChange, attestation }) => {
    const hasAttestation = Boolean(formData.insurance_attestation_url);
    const validity = attestationValidity(formData.insurance_attestation_valid_until);

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

            {/* Attestation (PDF) : visible et téléchargeable dans l'espace client */}
            <div className="mt-6 rounded-2xl border border-gray-200 dark:border-gray-700 p-4">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Attestation d'assurance décennale (PDF)</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Déposez l'attestation remise par votre assureur : vos clients peuvent la consulter et la télécharger depuis leur espace client.
                    Elle est en ligne dès le dépôt, sans passer par « Enregistrer ».
                </p>

                {hasAttestation && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 px-3 py-2">
                        <FileCheck className="w-4 h-4 text-green-600 flex-shrink-0" />
                        <span className="text-sm text-green-800 dark:text-green-300 flex-1 min-w-0">Attestation en ligne dans l'espace client</span>
                        <a
                            href={formData.insurance_attestation_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700"
                        >
                            <Eye className="w-4 h-4" /> Voir
                        </a>
                        <button
                            type="button"
                            onClick={attestation.removeAttestation}
                            disabled={attestation.busy}
                            className="inline-flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 disabled:opacity-40"
                        >
                            <Trash2 className="w-4 h-4" /> Retirer
                        </button>
                    </div>
                )}

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label htmlFor="insurance-attestation-file" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            {hasAttestation ? 'Remplacer le fichier' : 'Fichier'}
                        </label>
                        <div className="flex items-center gap-2">
                            <input
                                id="insurance-attestation-file"
                                type="file"
                                accept="application/pdf"
                                onChange={attestation.handleAttestationUpload}
                                disabled={attestation.busy}
                                className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-40"
                            />
                            {attestation.busy && <Loader2 className="w-4 h-4 text-blue-600 animate-spin flex-shrink-0" />}
                        </div>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">PDF, 20 Mo maximum.</p>
                    </div>
                    <div>
                        <label htmlFor="insurance-attestation-valid-until" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Valable jusqu'au</label>
                        <input
                            id="insurance-attestation-valid-until"
                            type="date"
                            name="insurance_attestation_valid_until"
                            value={formData.insurance_attestation_valid_until}
                            onChange={handleChange}
                            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Facultatif : la date est affichée au client à côté de l'attestation.</p>
                    </div>
                </div>

                {hasAttestation && (validity.status === 'expired' || validity.status === 'expiring') && (
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                        <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span>
                            {validity.status === 'expired'
                                ? 'Cette attestation est arrivée à échéance : déposez celle de la nouvelle période et mettez la date à jour.'
                                : validity.daysLeft === 0
                                    ? 'Cette attestation arrive à échéance aujourd\'hui : pensez à déposer la suivante.'
                                    : `Cette attestation arrive à échéance dans ${validity.daysLeft} jour${validity.daysLeft > 1 ? 's' : ''} : pensez à déposer la suivante.`}
                        </span>
                    </p>
                )}
            </div>
        </div>
    );
};

export default CompanyInsuranceSection;
