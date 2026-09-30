import React from 'react';
import { Save } from 'lucide-react';
import { Button } from '../../components/ui';
import CompanyIdentitySection from './CompanyIdentitySection';
import CompanyAddressSection from './CompanyAddressSection';
import CompanyInsuranceSection from './CompanyInsuranceSection';
import CompanyContactSection from './CompanyContactSection';

// Formulaire « Mon entreprise » : tout ce qui figure sur les devis et factures.
const CompanyForm = ({
    formData,
    setFormData,
    handleChange,
    updateProfile,
    loading,
    siretCheck,
    handleLogoUpload,
    b2bReceiverStatus,
    b2bReceiverError,
    registerB2BReceiver,
}) => {
    return (
        <form onSubmit={updateProfile} className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            {!loading && (!formData.company_name || !formData.siret) && (
                <div className="px-8 pt-6">
                    <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-2xl p-4 text-sm">
                        <span className="text-amber-500 text-lg flex-shrink-0 leading-none mt-0.5">⚠️</span>
                        <div>
                            <p className="font-semibold text-amber-800 mb-1">Complétez ces 2 champs pour valider vos devis légalement</p>
                            <p className="text-amber-700">
                                Le <strong>nom de l'entreprise</strong> et le <strong>SIRET</strong> sont obligatoires sur tous vos documents (devis, factures). Sans eux, vos documents ne sont pas conformes.
                            </p>
                        </div>
                    </div>
                </div>
            )}
            <div className="p-8 space-y-8">
                {/* Identité */}
                <CompanyIdentitySection
                    formData={formData}
                    handleChange={handleChange}
                    siretCheck={siretCheck}
                    b2bReceiverStatus={b2bReceiverStatus}
                    b2bReceiverError={b2bReceiverError}
                    registerB2BReceiver={registerB2BReceiver}
                />

                {/* Coordonnées */}
                <CompanyAddressSection formData={formData} handleChange={handleChange} />

                {/* Assurance décennale / RC pro */}
                <CompanyInsuranceSection formData={formData} handleChange={handleChange} />

                {/* Contact */}
                <CompanyContactSection
                    formData={formData}
                    setFormData={setFormData}
                    handleChange={handleChange}
                    handleLogoUpload={handleLogoUpload}
                />
            </div>

            <div className="px-8 py-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800 flex justify-end">
                <Button type="submit" disabled={loading}>
                    <Save className="w-4 h-4" />
                    {loading ? 'Enregistrement...' : 'Enregistrer les modifications'}
                </Button>
            </div>
        </form>
    );
};

export default CompanyForm;
