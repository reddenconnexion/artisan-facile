import React from 'react';
import { Mail, KeyRound } from 'lucide-react';
import { Button } from '../../components/ui';

const LoginEmailSection = ({ user, newEmail, setNewEmail, emailChanging, emailChangeSent, handleEmailChange }) => {
    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
                    <Mail className="w-5 h-5 mr-2 text-blue-600" />
                    Email de connexion
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Email actuel : <strong>{user?.email}</strong>
                    <br />Vos données ne seront pas perdues — elles sont liées à votre compte, pas à votre adresse email.
                </p>

                {emailChangeSent ? (
                    <div className="flex items-start gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 rounded-lg text-sm text-green-800">
                        <Mail className="w-5 h-5 mt-0.5 flex-shrink-0" />
                        <div>
                            <p className="font-medium">Email de confirmation envoyé à <strong>{newEmail}</strong></p>
                            <p className="mt-1 text-green-700">Cliquez sur le lien dans cet email pour finaliser le changement. Une fois confirmé, utilisez votre nouvelle adresse pour vous connecter.</p>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleEmailChange} className="flex flex-col sm:flex-row gap-3 max-w-lg">
                        <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nouvelle adresse email</label>
                            <input
                                type="email"
                                value={newEmail}
                                onChange={(e) => setNewEmail(e.target.value)}
                                placeholder="contact@monentreprise.com"
                                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                                required
                            />
                        </div>
                        <div className="flex items-end">
                            <Button type="submit" disabled={emailChanging || !newEmail.trim()}>
                                <KeyRound className="w-4 h-4" />
                                {emailChanging ? 'Envoi...' : 'Changer'}
                            </Button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
};

export default LoginEmailSection;
