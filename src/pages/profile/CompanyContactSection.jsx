import React from 'react';
import { Phone } from 'lucide-react';

const CompanyContactSection = ({ formData, setFormData, handleChange, handleLogoUpload }) => {
    return (
        <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                <Phone className="w-5 h-5 mr-2 text-blue-600" />
                Contact & Web
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email Professionnel (pour les devis)</label>
                    <input
                        type="email"
                        name="professional_email"
                        value={formData.professional_email}
                        onChange={handleChange}
                        placeholder="contact@monentreprise.com"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Si vide, l'email de connexion ({formData.email}) sera utilisé.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Téléphone</label>
                    <input
                        type="tel"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Site Web</label>
                    <input
                        type="text"
                        name="website"
                        value={formData.website}
                        onChange={handleChange}
                        onBlur={(e) => {
                            let val = e.target.value.trim();
                            if (val && !val.startsWith('http://') && !val.startsWith('https://')) {
                                setFormData(prev => ({ ...prev, website: 'https://' + val }));
                            }
                        }}
                        placeholder="monentreprise.com"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lien Avis Google</label>
                    <input
                        type="url"
                        name="google_review_url"
                        value={formData.google_review_url}
                        onChange={handleChange}
                        placeholder="https://g.page/r/..."
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lien direct pour laisser un avis sur votre fiche Google Business.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lien Avis Facebook</label>
                    <input
                        type="url"
                        name="facebook_review_url"
                        value={formData.facebook_review_url}
                        onChange={handleChange}
                        placeholder="https://www.facebook.com/.../reviews"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lien direct vers la page d'avis de votre page Facebook.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Lien Avis Pages Jaunes</label>
                    <input
                        type="url"
                        name="pages_jaunes_review_url"
                        value={formData.pages_jaunes_review_url}
                        onChange={handleChange}
                        placeholder="https://www.pagesjaunes.fr/..."
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Lien direct vers votre fiche Pages Jaunes pour laisser un avis.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">IBAN (pour factures)</label>
                    <input
                        type="text"
                        name="iban"
                        value={formData.iban}
                        onChange={handleChange}
                        placeholder="FR76 ..."
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Numéro Wero / Paylib</label>
                    <input
                        type="tel"
                        name="wero_phone"
                        value={formData.wero_phone}
                        onChange={handleChange}
                        placeholder="06 00 00 00 00"
                        className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Si différent du téléphone de contact. Utile pour les paiements instantanés.</p>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Logo</label>
                    <div className="flex items-center space-x-4">
                        {formData.logo_url && (
                            <img src={formData.logo_url} alt="Logo" className="h-12 w-12 object-contain rounded-2xl border border-gray-200 dark:border-gray-700" />
                        )}
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleLogoUpload}
                            className="block w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                    </div>
                    {formData.logo_url && (
                        <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, logo_url: '' }))}
                            className="mt-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
                        >
                            Supprimer le logo
                        </button>
                    )}
                    <input
                        type="hidden"
                        name="logo_url"
                        value={formData.logo_url}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Couleur de marque (PDF)</label>
                    <div className="flex items-center space-x-3">
                        <input
                            type="color"
                            value={formData.brand_color || '#2563EB'}
                            onChange={(e) => setFormData(prev => ({ ...prev, brand_color: e.target.value }))}
                            className="h-10 w-14 p-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 cursor-pointer"
                            title="Couleur d'accent de vos devis et factures PDF"
                        />
                        {formData.brand_color && (
                            <button
                                type="button"
                                onClick={() => setFormData(prev => ({ ...prev, brand_color: '' }))}
                                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline"
                            >
                                Revenir à la couleur par défaut
                            </button>
                        )}
                    </div>
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Couleur d'accent de vos PDF (en-tête, totaux, sections). Par défaut : bleu pour les devis, vert pour les factures.</p>
                </div>
            </div>
        </div>
    );
};

export default CompanyContactSection;
