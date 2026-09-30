import { Save, Mail, Send, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { Button } from '../../components/ui';

const SmtpSection = ({
    smtpForm,
    smtpPasswordConfigured,
    savingSmtp,
    testingSmtp,
    showSmtpPanel,
    setShowSmtpPanel,
    handleSmtpFieldChange,
    handleSmtpPreset,
    handleSaveSmtp,
    handleTestSmtp,
    handleDeleteSmtp,
}) => {
    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 flex items-center">
                    <Send className="w-5 h-5 mr-2 text-blue-600" />
                    Envoi direct des documents par email
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    Connectez votre adresse email professionnelle pour envoyer devis et factures directement depuis l'application, sans ouvrir votre client mail. L'expéditeur visible par vos clients sera votre vraie adresse pro.
                </p>

                {smtpPasswordConfigured && (
                    <div className="mb-4 flex items-center gap-2 text-sm text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-lg px-3 py-2">
                        <CheckCircle className="w-4 h-4" />
                        <span>Envoi configuré — expéditeur : <strong>{smtpForm.from_email}</strong></span>
                    </div>
                )}

                {!showSmtpPanel && !smtpPasswordConfigured ? (
                    <Button type="button" onClick={() => setShowSmtpPanel(true)}>
                        <Mail className="w-4 h-4" />
                        Configurer mon mail pro
                    </Button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setShowSmtpPanel(v => !v)}
                        className="text-sm text-blue-600 hover:text-blue-700 mb-4"
                    >
                        {showSmtpPanel ? 'Masquer' : 'Modifier la configuration'}
                    </button>
                )}

                {showSmtpPanel && (
                    <div className="space-y-4 mt-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Fournisseur (raccourcis)
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {[
                                    { key: 'gmail',   label: 'Gmail' },
                                    { key: 'outlook', label: 'Outlook / Microsoft 365' },
                                    { key: 'ovh',     label: 'OVH' },
                                    { key: 'ionos',   label: 'IONOS' },
                                    { key: 'orange',  label: 'Orange' },
                                    { key: 'free',    label: 'Free' },
                                ].map(p => (
                                    <button
                                        key={p.key}
                                        type="button"
                                        onClick={() => handleSmtpPreset(p.key)}
                                        className="px-3 py-1 text-xs rounded-full border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                                ⚠️ Pour Gmail et Outlook, utilisez un <strong>mot de passe d'application</strong> (pas votre mot de passe principal). Cherchez "mot de passe d'application Google" / "Microsoft" pour le générer.
                            </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Serveur SMTP</label>
                                <input
                                    type="text"
                                    value={smtpForm.host}
                                    onChange={(e) => handleSmtpFieldChange('host', e.target.value)}
                                    placeholder="smtp.exemple.com"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Port</label>
                                <input
                                    type="number"
                                    value={smtpForm.port}
                                    onChange={(e) => handleSmtpFieldChange('port', e.target.value)}
                                    placeholder="465"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Identifiant SMTP</label>
                                <input
                                    type="text"
                                    value={smtpForm.username}
                                    onChange={(e) => handleSmtpFieldChange('username', e.target.value)}
                                    placeholder="contact@monentreprise.com"
                                    autoComplete="off"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Mot de passe {smtpPasswordConfigured && <span className="text-xs font-normal text-gray-500">(laissez vide pour conserver)</span>}
                                </label>
                                <input
                                    type="password"
                                    value={smtpForm.password}
                                    onChange={(e) => handleSmtpFieldChange('password', e.target.value)}
                                    placeholder={smtpPasswordConfigured ? '••••••••' : 'Mot de passe d\'application'}
                                    autoComplete="new-password"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email expéditeur (le mail visible par vos clients)</label>
                                <input
                                    type="email"
                                    value={smtpForm.from_email}
                                    onChange={(e) => handleSmtpFieldChange('from_email', e.target.value)}
                                    placeholder="contact@monentreprise.com"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nom expéditeur</label>
                                <input
                                    type="text"
                                    value={smtpForm.from_name}
                                    onChange={(e) => handleSmtpFieldChange('from_name', e.target.value)}
                                    placeholder="Mon Entreprise"
                                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <input
                                type="checkbox"
                                checked={smtpForm.secure}
                                onChange={(e) => handleSmtpFieldChange('secure', e.target.checked)}
                                className="rounded"
                            />
                            Connexion SSL/TLS implicite (port 465). Décochez pour STARTTLS (port 587).
                        </label>

                        <div className="flex flex-wrap gap-2 pt-2">
                            <Button type="button" onClick={handleSaveSmtp} disabled={savingSmtp}>
                                {savingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                Enregistrer
                            </Button>
                            {smtpPasswordConfigured && (
                                <>
                                    <button
                                        type="button"
                                        onClick={handleTestSmtp}
                                        disabled={testingSmtp}
                                        className="inline-flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm font-medium text-gray-900 dark:text-gray-100"
                                    >
                                        {testingSmtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                                        Envoyer un email de test
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleDeleteSmtp}
                                        disabled={savingSmtp}
                                        className="inline-flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Supprimer
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SmtpSection;
