import { Info } from 'lucide-react';
import { WORK_OBJECT_MAX_CHARS, workObjectLength } from '../../utils/workObject';
import ClientSelector from '../../components/ClientSelector';
import { Input, Field } from '../../components/ui';
import QuoteStatusField from './QuoteStatusField';
import { autoGrow } from './quoteHelpers';

/**
 * En-tête du devis : client, titre, objet des travaux, dates, statut,
 * règlement, options avancées et adresse d'intervention.
 */
const QuoteHeaderFields = ({
    canHaveWorkObject,
    clients,
    diffAddress,
    followUpSteps,
    formData,
    handleClientChange,
    handleMarkAsFollowedUp,
    id,
    isCreditNote,
    isLocked,
    markingFollowUp,
    navigate,
    otpTouchedRef,
    setDiffAddress,
    setFormData,
    setShowAdvancedQuoteOptions,
    setShowSpecialStatuses,
    setShowViewHistory,
    setWorkObjectOpen,
    showAdvancedQuoteOptions,
    showSpecialStatuses,
    showWorkObject,
    total,
    viewCount,
}) => {
    return (
        <div id="devis-step-client" className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Client</label>
                    {formData.client_id && (
                        <button
                            type="button"
                            onClick={() => navigate(`/app/clients/${formData.client_id}`)}
                            className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                        >
                            Voir la fiche client
                        </button>
                    )}
                </div>
                <div className="mb-4">
                    <ClientSelector
                        clients={clients}
                        selectedClientId={formData.client_id}
                        onChange={handleClientChange}
                        onCreateNew={() => navigate('/app/clients/new')}
                        disabled={isLocked}
                    />
                </div>

                <Field
                    className="mb-1"
                    label="Titre du devis"
                    hint="Nom court du projet : il sert aussi de nom de dossier et d'intitulé dans les emails au client."
                >
                    <Input
                        id="devis-title"
                        type="text"
                        className="disabled:bg-gray-100 disabled:text-gray-500"
                        placeholder="Ex: Rénovation Salle de Bain"
                        value={formData.title}
                        onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                        disabled={isLocked}
                    />
                </Field>

                {showWorkObject && (
                    <Field
                        className="mb-1 mt-3"
                        label="Objet des travaux (facultatif)"
                        hint={workObjectLength(formData.work_object) <= WORK_OBJECT_MAX_CHARS
                            ? `Le périmètre en quelques phrases : ce qui est compris, ce qui ne l'est pas, les constats qui fixent le prix. ${workObjectLength(formData.work_object)}/${WORK_OBJECT_MAX_CHARS} caractères.`
                            : undefined}
                        error={workObjectLength(formData.work_object) > WORK_OBJECT_MAX_CHARS
                            ? `${workObjectLength(formData.work_object)}/${WORK_OBJECT_MAX_CHARS} caractères : le texte sera tronqué sur le devis pour ne pas repousser le tableau des prestations.`
                            : undefined}
                    >
                        <Input
                            as="textarea"
                            rows={3}
                            className="disabled:bg-gray-100 disabled:text-gray-500"
                            placeholder="Ex : Fourniture et pose d'un interphone vidéo au portail piéton, avec report d'appel sur deux moniteurs. Comprend la liaison enterrée et le circuit d'alimentation dédié. Cheminement entre les deux postes constaté inférieur à 30 m."
                            value={formData.work_object}
                            onChange={(e) => {
                                setFormData({ ...formData, work_object: e.target.value });
                                // Déplie le champ au fil de la saisie pour tout afficher.
                                autoGrow(e.target);
                            }}
                            onFocus={(e) => autoGrow(e.target)}
                            disabled={isLocked}
                        />
                    </Field>
                )}

                {canHaveWorkObject && !showWorkObject && !isLocked && (
                    <button
                        type="button"
                        onClick={() => setWorkObjectOpen(true)}
                        className="mt-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                    >
                        + Décrire l'objet des travaux
                    </button>
                )}


            </div>
            <div className="grid grid-cols-2 gap-4">
                <Field label="Date d'émission">
                    <Input
                        type="date"
                        className="disabled:bg-gray-100 disabled:text-gray-500"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                        disabled={isLocked}
                    />
                </Field>
                {formData.type !== 'invoice' && !isCreditNote && (
                    <Field label="Validité jusqu'au">
                        <Input
                            type="date"
                            className="disabled:bg-gray-100 disabled:text-gray-500"
                            value={formData.valid_until}
                            onChange={(e) => setFormData({ ...formData, valid_until: e.target.value })}
                            disabled={isLocked}
                        />
                    </Field>
                )}
            </div>
            <QuoteStatusField
                followUpSteps={followUpSteps}
                formData={formData}
                handleMarkAsFollowedUp={handleMarkAsFollowedUp}
                id={id}
                isCreditNote={isCreditNote}
                markingFollowUp={markingFollowUp}
                setFormData={setFormData}
                setShowSpecialStatuses={setShowSpecialStatuses}
                setShowViewHistory={setShowViewHistory}
                showSpecialStatuses={showSpecialStatuses}
                viewCount={viewCount}
            />
            {/* Mode de règlement - visible quand statut = Payé */}
            {formData.status === 'paid' && (
                <>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Mode de règlement</label>
                        <select
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                            value={formData.payment_method}
                            onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
                        >
                            <option value="">-- Sélectionner --</option>
                            <option value="virement">Virement bancaire</option>
                            <option value="cheque">Chèque</option>
                            <option value="especes">Espèces</option>
                            <option value="carte">Carte bancaire</option>
                            <option value="paypal">PayPal</option>
                            <option value="wero">Wero</option>
                            <option value="autre">Autre</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date d'encaissement</label>
                        <input
                            type="date"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-ios focus:border-ios dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
                            value={formData.paid_at}
                            onChange={(e) => setFormData({ ...formData, paid_at: e.target.value })}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Obligatoire pour le livre de recettes</p>
                    </div>
                </>
            )}
            {/* Options avancées (Factur-X, TVA, OTP) */}
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3 mt-1">
                <button
                    type="button"
                    onClick={() => setShowAdvancedQuoteOptions(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-medium text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                >
                    <svg className={`w-3.5 h-3.5 transition-transform ${showAdvancedQuoteOptions ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    Options avancées
                </button>
                {showAdvancedQuoteOptions && (
                    <div className="mt-3 space-y-3">
                        <div>
                            <div className="flex items-center gap-2 mt-2">
                                <input
                                    type="checkbox"
                                    id="vat_on_debits"
                                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-ios disabled:opacity-50 dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                                    checked={formData.vat_on_debits}
                                    onChange={(e) => setFormData({ ...formData, vat_on_debits: e.target.checked })}
                                    disabled={isLocked}
                                />
                                <label htmlFor="vat_on_debits" className="text-sm text-gray-700 dark:text-gray-300">
                                    Option TVA sur les débits
                                </label>
                            </div>
                            <div className="mt-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="require_otp"
                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-ios disabled:opacity-50 dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                                        checked={formData.require_otp}
                                        onChange={(e) => {
                                            otpTouchedRef.current = true;
                                            setFormData({ ...formData, require_otp: e.target.checked });
                                        }}
                                        disabled={isLocked}
                                    />
                                    <label htmlFor="require_otp" className="text-sm text-gray-700 dark:text-gray-300">
                                        Exiger la vérification par email (OTP) pour signer
                                    </label>
                                </div>
                                {total >= 3000 && !formData.require_otp && (
                                    <div className="mt-2 ml-6 flex items-start gap-2 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 rounded-lg text-xs text-amber-800 dark:text-amber-400">
                                        <Info className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                                        <div>
                                            <span className="font-semibold">Recommandé pour ce montant.</span>{' '}
                                            Au-delà de 3 000 €, activer l'OTP renforce la valeur juridique de la signature
                                            en cas de contestation (identification du signataire par email).
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Intervention Address Toggle - Full Width */}
            <div className="md:col-span-2 border-t border-gray-100 dark:border-gray-800 pt-4 mt-2">
                <div className="flex items-center mb-2">
                    <input
                        type="checkbox"
                        id="diffAddress"
                        checked={diffAddress}
                        onChange={(e) => setDiffAddress(e.target.checked)}
                        className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-ios disabled:opacity-50 dark:border-gray-700 bg-white dark:bg-gray-800 placeholder-gray-400 dark:placeholder-gray-500"
                        disabled={isLocked}
                    />
                    <label htmlFor="diffAddress" className="ml-2 text-sm text-gray-700 dark:text-gray-300 font-medium">
                        Adresse d'intervention différente (ex: locataire, chantier secondaire)
                    </label>
                </div>

                {diffAddress && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-800 dark:border-gray-700 mt-2">
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Adresse du chantier
                            </label>
                            <input
                                type="text"
                                value={formData.intervention_address}
                                onChange={(e) => setFormData({ ...formData, intervention_address: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-ios focus:border-ios disabled:bg-gray-100 disabled:text-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
                                placeholder="12 rue des Fleurs"
                                disabled={isLocked}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Code Postal
                            </label>
                            <input
                                type="text"
                                value={formData.intervention_postal_code}
                                onChange={(e) => setFormData({ ...formData, intervention_postal_code: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-ios focus:border-ios disabled:bg-gray-100 disabled:text-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
                                placeholder="75001"
                                disabled={isLocked}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Ville
                            </label>
                            <input
                                type="text"
                                value={formData.intervention_city}
                                onChange={(e) => setFormData({ ...formData, intervention_city: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:ring-ios focus:border-ios disabled:bg-gray-100 disabled:text-gray-500 placeholder-gray-400 dark:placeholder-gray-500"
                                placeholder="Paris"
                                disabled={isLocked}
                            />
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default QuoteHeaderFields;
