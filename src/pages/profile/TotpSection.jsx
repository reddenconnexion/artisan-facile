import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui';
import { useConfirm } from '../../context/ConfirmContext';
import { formatTotpSecret, isValidTotpCode, sanitizeTotpCode } from '../../utils/mfa';
import { useTotp } from './useTotp';

// Double authentification facultative : elle n'apparaît ni à l'inscription ni à
// la connexion tant que l'artisan ne l'a pas activée ici.
const TotpSection = ({ user }) => {
    const { enabled, loading, busy, enrollment, startEnroll, cancelEnroll, confirmEnroll, disable } = useTotp();
    const confirm = useConfirm();
    const [code, setCode] = useState('');

    // Les comptes de démonstration (anonymes) n'ont pas de vrai compte à protéger.
    if (user?.is_anonymous) return null;

    const handleDisable = async () => {
        const ok = await confirm({
            title: 'Désactiver la double authentification ?',
            message: 'Votre compte ne sera plus protégé que par votre mot de passe.',
            confirmLabel: 'Désactiver',
            danger: true,
        });
        if (ok) disable();
    };

    const handleConfirm = async (e) => {
        e.preventDefault();
        const done = await confirmEnroll(code);
        if (done) setCode('');
    };

    return (
        <div className="mt-8 bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 overflow-hidden">
            <div className="p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1 flex items-center">
                    <ShieldCheck className="w-5 h-5 mr-2 text-blue-600" />
                    Double authentification
                    {enabled && (
                        <span className="ml-3 text-xs font-semibold text-green-700 bg-green-100 rounded-full px-2 py-0.5">
                            Activée
                        </span>
                    )}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                    Protégez vos clients et vos factures avec un code à 6 chiffres demandé à la connexion.
                    C’est facultatif.
                </p>

                {loading ? (
                    <p className="text-sm text-gray-400">Chargement…</p>
                ) : enrollment ? (
                    <form onSubmit={handleConfirm} className="space-y-4 max-w-md">
                        <ol className="text-sm text-gray-700 dark:text-gray-300 list-decimal list-inside space-y-1">
                            <li>Installez une application d’authentification (Google Authenticator, Microsoft Authenticator, Authy…).</li>
                            <li>Scannez ce QR code, ou saisissez la clé ci-dessous.</li>
                            <li>Entrez le code à 6 chiffres affiché.</li>
                        </ol>
                        <img
                            src={enrollment.qrCode}
                            alt="QR code de double authentification"
                            className="w-44 h-44 bg-white border border-gray-200 rounded-lg p-2"
                        />
                        <div>
                            <p className="text-xs text-gray-500 mb-1">
                                Clé de configuration — conservez-la (gestionnaire de mots de passe) : elle permet de
                                retrouver vos codes si vous changez de téléphone.
                            </p>
                            <code className="block text-sm break-all bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2 select-all">
                                {formatTotpSecret(enrollment.secret)}
                            </code>
                        </div>
                        <input
                            type="text"
                            inputMode="numeric"
                            autoComplete="one-time-code"
                            maxLength={7}
                            aria-label="Code à 6 chiffres"
                            placeholder="000000"
                            value={code}
                            onChange={(e) => setCode(sanitizeTotpCode(e.target.value))}
                            className="block w-full px-4 py-3 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl text-center text-xl tracking-[0.4em]"
                        />
                        <div className="flex gap-3">
                            <Button type="submit" disabled={busy || !isValidTotpCode(code)}>
                                {busy ? 'Vérification…' : 'Activer'}
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => { setCode(''); cancelEnroll(); }}>
                                Annuler
                            </Button>
                        </div>
                    </form>
                ) : enabled ? (
                    <Button variant="secondary" onClick={handleDisable} disabled={busy}>
                        Désactiver
                    </Button>
                ) : (
                    <Button onClick={startEnroll} disabled={busy}>
                        {busy ? 'Préparation…' : 'Activer la double authentification'}
                    </Button>
                )}
            </div>
        </div>
    );
};

export default TotpSection;
