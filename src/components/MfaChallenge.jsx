import { useState } from 'react';
import { ShieldCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../utils/supabase';
import { AUTH_INPUT_CLASS as inputClass } from '../constants/ui';
import { isValidTotpCode, pickVerifiedTotpFactor, sanitizeTotpCode } from '../utils/mfa';

// Écran affiché à la place de l'application quand le compte a la double
// authentification activée et que la session n'a pas encore saisi le code.
const MfaChallenge = () => {
    const { refreshMfa, signOut } = useAuth();
    const [code, setCode] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isValidTotpCode(code)) return;
        setLoading(true);
        setError('');
        try {
            const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
            if (listError) throw listError;
            const factor = pickVerifiedTotpFactor(factors);
            if (!factor) throw new Error('Aucune double authentification trouvée sur ce compte.');
            const { error: verifyError } = await supabase.auth.mfa.challengeAndVerify({
                factorId: factor.id,
                code,
            });
            if (verifyError) throw verifyError;
            await refreshMfa();
        } catch (err) {
            setCode('');
            setError(
                /invalid|expired/i.test(err.message || '')
                    ? 'Code incorrect ou expiré. Saisissez le code actuel de votre application.'
                    : 'Vérification impossible pour le moment. Réessayez.',
            );
        } finally {
            setLoading(false);
        }
    };

    const handleSignOut = async () => {
        try {
            await signOut();
        } catch {
            toast.error('Déconnexion impossible, réessayez.');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
            <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-6">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <ShieldCheck className="w-7 h-7 text-blue-600" />
                    </div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">Vérification en deux étapes</h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Saisissez le code à 6 chiffres affiché dans votre application d&apos;authentification.
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        autoFocus
                        maxLength={7}
                        aria-label="Code à 6 chiffres"
                        className={`${inputClass} text-center text-2xl tracking-[0.4em]`}
                        placeholder="000000"
                        value={code}
                        onChange={(e) => setCode(sanitizeTotpCode(e.target.value))}
                    />
                    {error && (
                        <p role="alert" className="text-sm text-red-600">
                            {error}
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={loading || !isValidTotpCode(code)}
                        className="w-full flex items-center justify-center gap-2 py-3 px-4 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors disabled:opacity-60"
                    >
                        {loading ? <><Loader2 className="w-4 h-4 animate-spin" /> Vérification…</> : 'Valider'}
                    </button>
                </form>

                <button
                    type="button"
                    onClick={handleSignOut}
                    className="mt-4 w-full text-sm text-gray-500 hover:text-gray-700"
                >
                    Se déconnecter
                </button>
            </div>
        </div>
    );
};

export default MfaChallenge;
