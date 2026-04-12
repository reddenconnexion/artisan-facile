import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { Mail, CheckCircle, ArrowLeft, Loader2 } from 'lucide-react';

const JOB_OPTIONS = [
    { value: 'electricien', label: 'Électricien' },
    { value: 'plombier', label: 'Plombier' },
    { value: 'chauffagiste', label: 'Chauffagiste' },
    { value: 'peintre', label: 'Peintre' },
    { value: 'carreleur', label: 'Carreleur' },
    { value: 'macon', label: 'Maçon' },
    { value: 'plaquiste', label: 'Plaquiste' },
    { value: 'menuisier', label: 'Menuisier' },
    { value: 'charpentier', label: 'Charpentier' },
    { value: 'paysagiste', label: 'Paysagiste' },
    { value: 'multiservice', label: 'Multi-services / Bricolage' },
    { value: 'autre', label: 'Autre' },
];

const inputClass = "block w-full px-4 py-3 border border-gray-300 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm transition-shadow";

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
                options: { data: { job_type: jobType } }
            });
            if (error) throw error;

            if (data.session) {
                toast.success('Compte créé ! Bienvenue sur Artisan Facile.');
                navigate('/app');
            } else {
                setConfirmedEmail(email);
            }
        } catch (error) {
            console.error('Registration error:', error);
            if (error.message.includes('valid email')) {
                toast.error('Adresse email invalide. Utilisez une adresse réelle.');
            } else if (error.message.includes('already registered')) {
                toast.error('Cette adresse email est déjà utilisée. Connectez-vous.');
            } else {
                toast.error(error.message || "Erreur lors de l'inscription");
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
            toast.error(error.message || "Erreur lors de l'envoi");
        } finally {
            setResendLoading(false);
        }
    };

    if (confirmedEmail) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
                <div className="max-w-md w-full text-center space-y-6">
                    <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                        <Mail className="w-8 h-8 text-green-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-extrabold text-gray-900">Vérifiez votre boîte mail</h2>
                        <p className="mt-3 text-gray-600">
                            Un lien de confirmation a été envoyé à{' '}
                            <strong className="text-gray-900">{confirmedEmail}</strong>.
                        </p>
                        <p className="mt-2 text-sm text-gray-500">
                            Cliquez sur le lien pour activer votre compte. Pensez à vérifier vos spams.
                        </p>
                    </div>
                    <div className="space-y-3">
                        <button
                            onClick={handleResend}
                            disabled={resendLoading}
                            className="w-full py-3 px-4 border border-gray-300 text-sm font-medium rounded-xl text-gray-700 bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                        >
                            {resendLoading ? 'Envoi...' : "Renvoyer l'email de confirmation"}
                        </button>
                        <Link to="/login" className="block text-sm text-blue-600 hover:text-blue-500">
                            Retour à la connexion
                        </Link>
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
                        <div className="flex items-center justify-center gap-2">
                            <img src="/favicon.svg" alt="Logo Artisan Facile" className="w-8 h-8 rounded-md" />
                            <span className="text-3xl font-extrabold text-blue-600">Artisan Facile</span>
                        </div>
                        <div className="mt-3 inline-flex items-center gap-1.5 bg-green-100 text-green-800 text-xs font-bold px-3 py-1.5 rounded-full border border-green-200">
                            <CheckCircle className="w-3.5 h-3.5" />
                            100% Gratuit — sans carte bancaire
                        </div>
                        <h1 className="mt-4 text-2xl font-bold text-gray-900">Créer mon compte</h1>
                        <p className="mt-1 text-sm text-gray-500">
                            Déjà inscrit ?{' '}
                            <Link to="/login" className="text-blue-600 hover:text-blue-500 font-medium">
                                Se connecter
                            </Link>
                        </p>
                    </div>

                    {/* Form card */}
                    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Adresse email
                                </label>
                                <input
                                    id="register-email"
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
                                <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Mot de passe
                                </label>
                                <input
                                    id="register-password"
                                    name="password"
                                    type="password"
                                    required
                                    minLength={8}
                                    autoComplete="new-password"
                                    className={inputClass}
                                    placeholder="8 caractères minimum"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                />
                                {password.length > 0 && password.length < 8 && (
                                    <p className="mt-1.5 text-xs text-red-500">
                                        Encore {8 - password.length} caractère{8 - password.length > 1 ? 's' : ''} requis
                                    </p>
                                )}
                                {password.length >= 8 && (
                                    <p className="mt-1.5 text-xs text-green-600 flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3" /> Mot de passe valide
                                    </p>
                                )}
                            </div>

                            <div>
                                <label htmlFor="register-job" className="block text-sm font-medium text-gray-700 mb-1.5">
                                    Corps de métier
                                </label>
                                <select
                                    id="register-job"
                                    required
                                    className={inputClass + ' bg-white'}
                                    value={jobType}
                                    onChange={(e) => setJobType(e.target.value)}
                                >
                                    <option value="" disabled>Sélectionnez votre métier…</option>
                                    {JOB_OPTIONS.map(({ value, label }) => (
                                        <option key={value} value={value}>{label}</option>
                                    ))}
                                </select>
                                <p className="mt-1.5 text-xs text-gray-400">
                                    Utilisé pour pré-remplir votre bibliothèque de prix
                                </p>
                            </div>

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60 shadow-sm"
                            >
                                {loading ? (
                                    <><Loader2 className="w-4 h-4 animate-spin" /> Création du compte…</>
                                ) : (
                                    'Créer mon compte gratuit'
                                )}
                            </button>
                        </form>

                        <p className="text-xs text-gray-400 text-center leading-relaxed">
                            En créant un compte, vous acceptez nos{' '}
                            <Link to="/mentions-legales" className="underline hover:text-gray-600">mentions légales</Link>
                            {' '}et notre{' '}
                            <Link to="/politique-confidentialite" className="underline hover:text-gray-600">politique de confidentialité</Link>.
                        </p>
                    </div>

                    {/* Value props */}
                    <div className="mt-6 grid grid-cols-3 gap-3 text-center text-xs text-gray-500">
                        <div className="bg-white rounded-xl border border-gray-100 p-3">
                            <p className="font-bold text-gray-700 text-base">0€</p>
                            <p>Sans CB</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 p-3">
                            <p className="font-bold text-gray-700 text-base">2 min</p>
                            <p>Pour un devis</p>
                        </div>
                        <div className="bg-white rounded-xl border border-gray-100 p-3">
                            <p className="font-bold text-gray-700 text-base">5 min</p>
                            <p>Pour démarrer</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Register;
