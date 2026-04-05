import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Mail, ArrowLeft } from 'lucide-react';

const Login = () => {
    const navigate = useNavigate();
    const { signIn } = useAuth();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Forgot password state
    const [showForgot, setShowForgot] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetSent, setResetSent] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);

    // Resend confirmation state
    const [unconfirmedEmail, setUnconfirmedEmail] = useState(null);
    const [resendLoading, setResendLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setUnconfirmedEmail(null);
        try {
            const { error } = await signIn({ email, password });
            if (error) throw error;
            toast.success('Connexion réussie !');
            navigate('/app');
        } catch (error) {
            console.error('Login error:', error);
            if (error.message.includes('Email not confirmed')) {
                setUnconfirmedEmail(email);
                toast.error('Veuillez confirmer votre email avant de vous connecter.');
            } else if (error.message.includes('Invalid login credentials')) {
                toast.error('Email ou mot de passe incorrect.');
            } else {
                toast.error(error.message || 'Erreur lors de la connexion');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResendConfirmation = async () => {
        setResendLoading(true);
        try {
            const { error } = await supabase.auth.resend({ type: 'signup', email: unconfirmedEmail });
            if (error) throw error;
            toast.success('Email de confirmation renvoyé ! Vérifiez votre boîte mail.');
            setUnconfirmedEmail(null);
        } catch (error) {
            toast.error(error.message || 'Erreur lors de l\'envoi');
        } finally {
            setResendLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setResetLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
                redirectTo: `${window.location.origin}/reset-password`,
            });
            if (error) throw error;
            setResetSent(true);
        } catch (error) {
            toast.error(error.message || 'Erreur lors de l\'envoi');
        } finally {
            setResetLoading(false);
        }
    };

    if (showForgot) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8">
                    <div>
                        <button
                            onClick={() => { setShowForgot(false); setResetSent(false); setResetEmail(''); }}
                            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
                        >
                            <ArrowLeft className="w-4 h-4" /> Retour à la connexion
                        </button>
                        <h2 className="text-3xl font-extrabold text-gray-900">
                            Mot de passe oublié
                        </h2>
                        <p className="mt-2 text-sm text-gray-600">
                            Entrez votre adresse email pour recevoir un lien de réinitialisation.
                        </p>
                    </div>

                    {resetSent ? (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                            <Mail className="w-10 h-10 text-green-500 mx-auto mb-3" />
                            <p className="font-semibold text-green-800 mb-1">Email envoyé !</p>
                            <p className="text-sm text-green-700">
                                Un lien de réinitialisation a été envoyé à <strong>{resetEmail}</strong>.
                                Vérifiez votre boîte mail (et vos spams).
                            </p>
                        </div>
                    ) : (
                        <form onSubmit={handleForgotPassword} className="space-y-4">
                            <input
                                type="email"
                                required
                                autoComplete="email"
                                className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="votre@email.fr"
                                value={resetEmail}
                                onChange={(e) => setResetEmail(e.target.value)}
                            />
                            <button
                                type="submit"
                                disabled={resetLoading}
                                className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                            >
                                {resetLoading ? 'Envoi...' : 'Envoyer le lien'}
                            </button>
                        </form>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Connexion à Artisan Facile
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Ou{' '}
                        <Link to="/register" className="font-medium text-blue-600 hover:text-blue-500">
                            créer un nouveau compte
                        </Link>
                    </p>
                </div>

                {unconfirmedEmail && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <p className="text-sm text-amber-800 mb-3">
                            L'adresse <strong>{unconfirmedEmail}</strong> n'a pas encore été confirmée.
                            Vérifiez votre boîte mail ou renvoyez l'email de confirmation.
                        </p>
                        <button
                            onClick={handleResendConfirmation}
                            disabled={resendLoading}
                            className="text-sm font-medium text-amber-700 underline hover:text-amber-900 disabled:opacity-50"
                        >
                            {resendLoading ? 'Envoi...' : 'Renvoyer l\'email de confirmation'}
                        </button>
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="login-email" className="sr-only">Adresse email</label>
                            <input
                                id="login-email"
                                name="email"
                                type="email"
                                required
                                autoComplete="email"
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Adresse email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <label htmlFor="login-password" className="sr-only">Mot de passe</label>
                            <input
                                id="login-password"
                                name="password"
                                type="password"
                                required
                                autoComplete="current-password"
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Mot de passe"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={() => { setShowForgot(true); setResetEmail(email); }}
                            className="text-sm text-blue-600 hover:text-blue-500"
                        >
                            Mot de passe oublié ?
                        </button>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {loading ? 'Connexion...' : 'Se connecter'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Login;
