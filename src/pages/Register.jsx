import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

const Register = () => {
    const navigate = useNavigate();
    const { signUp } = useAuth();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [jobType, setJobType] = useState('');
    const [confirmedEmail, setConfirmedEmail] = useState(null);
    const [resendLoading, setResendLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (password.length < 8) {
            toast.error('Le mot de passe doit contenir au moins 8 caractères.');
            return;
        }

        setLoading(true);
        try {
            const { data, error } = await signUp({
                email,
                password,
                options: {
                    data: {
                        job_type: jobType
                    }
                }
            });
            if (error) throw error;

            if (data.session) {
                toast.success('Inscription réussie ! Vous êtes connecté.');
                navigate('/app');
            } else {
                setConfirmedEmail(email);
            }
        } catch (error) {
            console.error('Registration error:', error);
            if (error.message.includes('valid email')) {
                toast.error('Adresse email invalide. Veuillez utiliser une adresse réelle.');
            } else {
                toast.error(error.message || 'Erreur lors de l\'inscription');
            }
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        setResendLoading(true);
        try {
            const { error } = await supabase.auth.resend({ type: 'signup', email: confirmedEmail });
            if (error) throw error;
            toast.success('Email renvoyé ! Vérifiez votre boîte mail.');
        } catch (error) {
            toast.error(error.message || 'Erreur lors de l\'envoi');
        } finally {
            setResendLoading(false);
        }
    };

    if (confirmedEmail) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                        <Mail className="w-8 h-8 text-blue-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-extrabold text-gray-900">Vérifiez votre boîte mail</h2>
                        <p className="mt-3 text-gray-600">
                            Un email de confirmation a été envoyé à{' '}
                            <strong className="text-gray-900">{confirmedEmail}</strong>.
                        </p>
                        <p className="mt-2 text-sm text-gray-500">
                            Cliquez sur le lien dans l'email pour activer votre compte.
                            Pensez à vérifier vos spams.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <button
                            onClick={handleResend}
                            disabled={resendLoading}
                            className="w-full py-2 px-4 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {resendLoading ? 'Envoi...' : 'Renvoyer l\'email de confirmation'}
                        </button>
                        <Link
                            to="/login"
                            className="block text-sm text-blue-600 hover:text-blue-500"
                        >
                            Retour à la connexion
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Créer un compte
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Déjà inscrit ?{' '}
                        <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
                            Se connecter
                        </Link>
                    </p>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-blue-700">
                                Une adresse email valide est requise. Vous devrez cliquer sur le lien de confirmation envoyé par email avant de pouvoir vous connecter.
                            </p>
                        </div>
                    </div>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <label htmlFor="register-email" className="sr-only">Adresse email</label>
                            <input
                                id="register-email"
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
                            <label htmlFor="register-password" className="sr-only">Mot de passe</label>
                            <input
                                id="register-password"
                                name="password"
                                type="password"
                                required
                                minLength={8}
                                autoComplete="new-password"
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Mot de passe (8 caractères minimum)"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            {password.length > 0 && password.length < 8 && (
                                <p className="mt-1 text-xs text-red-500">
                                    Encore {8 - password.length} caractère(s) requis
                                </p>
                            )}
                        </div>
                        <div>
                            <select
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                value={jobType}
                                onChange={(e) => setJobType(e.target.value)}
                            >
                                <option value="" disabled>Quel est votre corps de métier ?</option>
                                <option value="plombier">Plombier</option>
                                <option value="chauffagiste">Chauffagiste</option>
                                <option value="electricien">Électricien</option>
                                <option value="peintre">Peintre</option>
                                <option value="carreleur">Carreleur</option>
                                <option value="macon">Maçon</option>
                                <option value="plaquiste">Plaquiste</option>
                                <option value="menuisier">Menuisier</option>
                                <option value="charpentier">Charpentier</option>
                                <option value="paysagiste">Paysagiste</option>
                                <option value="multiservice">Multi-services / Bricolage</option>
                                <option value="autre">Autre (Partir de zéro)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {loading ? 'Inscription...' : 'S\'inscrire & Configurer mon espace'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Register;
