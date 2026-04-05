import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { toast } from 'sonner';
import { KeyRound, CheckCircle } from 'lucide-react';

const ResetPassword = () => {
    const navigate = useNavigate();
    const [password, setPassword] = useState('');
    const [confirm, setConfirm] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [validSession, setValidSession] = useState(false);
    const [checking, setChecking] = useState(true);

    useEffect(() => {
        // Supabase exchanges the token from the URL hash automatically.
        // Listen for the PASSWORD_RECOVERY event which fires when the recovery
        // link is opened, confirming we have a valid recovery session.
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setValidSession(true);
                setChecking(false);
            }
        });

        // Also check if there's already an active session (user refreshed the page)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setValidSession(true);
            }
            setChecking(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (password !== confirm) {
            toast.error('Les mots de passe ne correspondent pas.');
            return;
        }
        if (password.length < 8) {
            toast.error('Le mot de passe doit contenir au moins 8 caractères.');
            return;
        }
        setLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({ password });
            if (error) throw error;
            setDone(true);
            setTimeout(() => navigate('/app'), 2500);
        } catch (error) {
            toast.error(error.message || 'Erreur lors de la réinitialisation');
        } finally {
            setLoading(false);
        }
    };

    if (checking) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!validSession) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <p className="text-gray-600">Ce lien de réinitialisation est invalide ou a expiré.</p>
                    <Link to="/login" className="text-blue-600 hover:text-blue-500 text-sm font-medium">
                        Retourner à la connexion
                    </Link>
                </div>
            </div>
        );
    }

    if (done) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
                <div className="max-w-md w-full text-center space-y-4">
                    <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
                    <h2 className="text-2xl font-extrabold text-gray-900">Mot de passe mis à jour !</h2>
                    <p className="text-sm text-gray-500">Vous allez être redirigé vers votre tableau de bord…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div className="text-center">
                    <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <KeyRound className="w-7 h-7 text-blue-600" />
                    </div>
                    <h2 className="text-3xl font-extrabold text-gray-900">Nouveau mot de passe</h2>
                    <p className="mt-2 text-sm text-gray-600">Choisissez un mot de passe sécurisé (8 caractères minimum).</p>
                </div>

                <form className="space-y-4" onSubmit={handleSubmit}>
                    <div>
                        <label htmlFor="new-password" className="sr-only">Nouveau mot de passe</label>
                        <input
                            id="new-password"
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="Nouveau mot de passe"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                        />
                    </div>
                    <div>
                        <label htmlFor="confirm-password" className="sr-only">Confirmer le mot de passe</label>
                        <input
                            id="confirm-password"
                            type="password"
                            required
                            minLength={8}
                            autoComplete="new-password"
                            className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="Confirmer le mot de passe"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                        />
                        {confirm.length > 0 && confirm !== password && (
                            <p className="mt-1 text-xs text-red-500">Les mots de passe ne correspondent pas</p>
                        )}
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        {loading ? 'Enregistrement...' : 'Enregistrer le nouveau mot de passe'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPassword;
