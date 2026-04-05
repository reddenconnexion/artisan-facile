import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Mail, ArrowLeft, Loader2 } from 'lucide-react';

const inputClass = "block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-shadow";

const Login = () => {
    const navigate = useNavigate();
    const { signIn } = useAuth();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const [showForgot, setShowForgot] = useState(false);
    const [resetEmail, setResetEmail] = useState('');
    const [resetSent, setResetSent] = useState(false);
    const [resetLoading, setResetLoading] = useState(false);

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
            toast.success('Email de confirmation renvoyé !');
            setUnconfirmedEmail(null);
        } catch (error) {
            toast.error(error.message || "Erreur lors de l'envoi");
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
            toast.error(error.message || "Erreur lors de l'envoi");
        } finally {
            setResetLoading(false);
        }
    };

    if (showForgot) {
        return (
            <div className="min-h-screen flex flex-col bg-gray-50">
                <div className="px-6 pt-6">
                    <button
                        onClick={() => { setShowForgot(false); setResetSent(false); setResetEmail(''); }}
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        Retour à la connexion
                    </button>
                </div>

                <div className="flex-1 flex items-center justify-center py-10 px-4">
                    <div className="w-full max-w-md">
                        <div className="text-center mb-8">
                            <span className="text-3xl font-extrabold text-blue-600">Artisan Facile</span>
                            <h1 className="mt-4 text-2xl font-bold text-gray-900">Mot de passe oublié</h1>
                            <p className="mt-1 text-sm text-gray-500">
                                Entrez votre email pour recevoir un lien de réinitialisation.
                            </p>
                        </div>

                        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
                            {resetSent ? (
                                <div className="text-center space-y-4">
                                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                                        <Mail className="w-7 h-7 text-green-600" />
                                    </div>
                                    <div>
                                        <p className="font-semibold text-gray-900 mb-1">Email envoyé !</p>
                                        <p className="text-sm text-gray-500">
                                            Un lien a été envoyé à <strong className="text-gray-700">{resetEmail}</strong>.
                                            Vérifiez vos spams si vous ne le trouvez pas.
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => { setShowForgot(false); setResetSent(false); }}
                                        className="text-sm text-blue-600 hover:text-blue-500"
                                    >
                                        Retour à la connexion
                                    </button>
                                </div>
                            ) : (
                                <form onSubmit={handleForgotPassword} className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1.5">
                                            Adresse email
                                        </label>
                                        <input
                                            type="email"
                                            required
                                            autoComplete="email"
                                            className={inputClass}
                                            placeholder="votre@email.fr"
                                            value={resetEmail}
                                            onChange={(e) => setResetEmail(e.target.value)}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={resetLoading}
                                        className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60"
                                    >
                                        {resetLoading ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> Envoi…</>
                                        ) : 'Envoyer le lien'}
                                    </button>
                                </form>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            {/* Header */}
            <div className="px-6 pt-6">
                <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Retour à l'accueil
                </Link>
            </div>

            <div className="flex-1 flex items-center justify-center py-10 px-4">
                <div className="w-full max-w-md">
                    {/* Branding */}
                    <div className="text-center mb-8">
                        <span className="text-3xl font-extrabold text-blue-600">Artisan Facile</span>
                        <h1 className="mt-4 text-2xl font-bold text-gray-900">Connexion</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Pas encore de compte ?{' '}
                            <Link to="/register" className="text-blue-600 hover:text-blue-500 font-medium">
                                Créer un compte gratuit
                            </Link>
                        </p>
                    </div>

                    {/* Form card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                        {unconfirmedEmail && (
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                                <p className="text-sm text-amber-800 mb-2">
                                    <strong>{unconfirmedEmail}</strong> n'a pas encore été confirmé.
                                </p>
                                <button
                                    onClick={handleResendConfirmation}
                                    disabled={resendLoading}
                                    className="text-sm font-medium text-amber-700 underline hover:text-amber-900 disabled:opacity-50"
                                >
                                    {resendLoading ? 'Envoi...' : "Renvoyer l'email de confirmation"}
                                </button>
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Adresse email
                                </label>
                                <input
                                    id="login-email"
                                    name="email"
                                    type="email"
                                    required
                                    autoComplete="email"
                                    className={inputClass}
                                    placeholder="votre@email.fr"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1.5">
                                    <label htmlFor="login-password" className="block text-sm font-medium text-gray-700">
                                        Mot de passe
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => { setShowForgot(true); setResetEmail(email); }}
                                        className="text-xs text-blue-600 hover:text-blue-500"
                                    >
                                        Mot de passe oublié ?
                                    </button>
                                </div>
                                <input
                                    id="login-password"
                                    name="password"
                                    type="password"
                                    required
                                    autoComplete="current-password"
                                    className={inputClass}
                                    placeholder="Votre mot de passe"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Connexion…</>
                                ) : 'Se connecter'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
