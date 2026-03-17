import React, { useRef, useState, useEffect, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { X, Check, Trash2, Mail, KeyRound, ArrowRight, RefreshCw, Loader2 } from 'lucide-react';

/**
 * Signature modal en 3 étapes :
 *  1. Saisie email  → appelle onRequestOtp(email) → serveur envoie le code
 *  2. Saisie OTP    → code à 6 chiffres reçu par email
 *  3. Signature     → pad de signature manuscrite
 *
 * Props :
 *  - onSave(signatureDataURL, otpCode)  appelé à la validation finale
 *  - onRequestOtp(email) : async () => { success, error }
 *  - requiresOtp : bool  – si false, saute les étapes email/OTP
 */
const SignatureModal = ({ isOpen, onClose, onSave, onRequestOtp, requiresOtp }) => {
    const sigCanvas = useRef({});
    const canvasContainerRef = useRef(null);

    // Tous les useState déclarés en premier pour éviter le TDZ après minification esbuild
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    const [step, setStep] = useState(() => requiresOtp ? 'email' : 'sign');  // 'email' | 'otp' | 'sign'
    const [emailInput, setEmailInput] = useState('');
    const [emailError, setEmailError] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [otpError, setOtpError] = useState('');
    const [loadingOtp, setLoadingOtp] = useState(false);
    const [confirmedEmail, setConfirmedEmail] = useState('');

    // Mesure le container pour dimensionner le canvas en px absolus (fix iOS)
    const measureCanvas = useCallback(() => {
        if (canvasContainerRef.current) {
            const { width, height } = canvasContainerRef.current.getBoundingClientRect();
            if (width > 0 && height > 0) {
                setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
            }
        }
    }, []);

    useEffect(() => {
        if (step !== 'sign') return;
        // Petit délai pour que le DOM soit rendu avant de mesurer
        const t = setTimeout(measureCanvas, 50);
        window.addEventListener('resize', measureCanvas);
        return () => {
            clearTimeout(t);
            window.removeEventListener('resize', measureCanvas);
        };
    }, [step, measureCanvas]);

    // Réinitialise et positionne la bonne étape à chaque ouverture
    useEffect(() => {
        if (isOpen) {
            setStep(requiresOtp ? 'email' : 'sign');
            setEmailInput('');
            setEmailError('');
            setOtpInput('');
            setOtpError('');
            setLoadingOtp(false);
            setConfirmedEmail('');
        }
    }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

    const reset = () => {
        setStep('email');
        setEmailInput('');
        setEmailError('');
        setOtpInput('');
        setOtpError('');
        setLoadingOtp(false);
        setConfirmedEmail('');
    };

    const handleClose = () => {
        reset();
        onClose();
    };

    // ── Étape 1 : envoi de l'OTP ─────────────────────────────────────────────
    const handleEmailSubmit = async (e) => {
        e.preventDefault();
        if (!onRequestOtp) return;
        setEmailError('');
        setLoadingOtp(true);

        const { success: otpSent, error: otpSendErr } = await onRequestOtp(emailInput.trim());

        setLoadingOtp(false);
        if (!otpSent) {
            setEmailError(otpSendErr || "Erreur lors de l'envoi du code.");
            return;
        }
        setConfirmedEmail(emailInput.trim());
        setStep('otp');
    };

    // ── Étape 2 : vérification OTP (côté UI uniquement – le vrai check est serveur) ─
    const handleOtpSubmit = (e) => {
        e.preventDefault();
        setOtpError('');
        if (!/^\d{6}$/.test(otpInput.trim())) {
            setOtpError('Le code doit être composé de 6 chiffres.');
            return;
        }
        setStep('sign');
    };

    const handleResendOtp = async () => {
        setOtpError('');
        setLoadingOtp(true);
        const { success: resendOk, error: resendErr } = await onRequestOtp(confirmedEmail);
        setLoadingOtp(false);
        if (!resendOk) {
            setOtpError(resendErr || "Erreur lors du renvoi du code.");
        } else {
            setOtpInput('');
            setOtpError('');
        }
    };

    // ── Étape 3 : signature ──────────────────────────────────────────────────
    const clear = () => sigCanvas.current.clear();

    const save = () => {
        if (sigCanvas.current.isEmpty()) {
            alert('Veuillez signer avant de valider.');
            return;
        }
        const dataURL = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
        onSave(dataURL, requiresOtp ? otpInput.trim() : null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col" style={{ maxHeight: 'min(90vh, 90dvh)' }}>

                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-900">
                        {step === 'email' && 'Confirmer votre identité'}
                        {step === 'otp'   && 'Vérification par email'}
                        {step === 'sign'  && 'Signature du devis'}
                    </h3>
                    <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* Indicateur d'étapes (seulement avec OTP) */}
                {requiresOtp && (
                    <div className="flex items-center gap-2 px-6 pt-4">
                        {['email', 'otp', 'sign'].map((s, i) => (
                            <React.Fragment key={s}>
                                <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-semibold transition-colors ${
                                    step === s
                                        ? 'bg-blue-600 text-white'
                                        : ['email', 'otp', 'sign'].indexOf(step) > i
                                        ? 'bg-green-500 text-white'
                                        : 'bg-gray-200 text-gray-500'
                                }`}>
                                    {['email', 'otp', 'sign'].indexOf(step) > i ? <Check className="w-3.5 h-3.5" /> : i + 1}
                                </div>
                                {i < 2 && <div className={`flex-1 h-0.5 rounded transition-colors ${['email', 'otp', 'sign'].indexOf(step) > i ? 'bg-green-500' : 'bg-gray-200'}`} />}
                            </React.Fragment>
                        ))}
                    </div>
                )}

                {/* ── Étape 1 : email ── */}
                {step === 'email' && (
                    <form onSubmit={handleEmailSubmit} className="flex-1 p-6 flex flex-col gap-4">
                        <p className="text-sm text-gray-600">
                            Pour signer ce devis, un code de vérification sera envoyé à votre adresse email.
                        </p>
                        <div>
                            <label htmlFor="sig-email" className="block text-sm font-medium text-gray-700 mb-1">
                                Votre adresse email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    id="sig-email"
                                    name="email"
                                    type="email"
                                    value={emailInput}
                                    onChange={(e) => { setEmailInput(e.target.value); setEmailError(''); }}
                                    placeholder="votre@email.com"
                                    required
                                    autoFocus
                                    autoComplete="email"
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {emailError && (
                                <p className="mt-1.5 text-xs text-red-600">{emailError}</p>
                            )}
                        </div>
                        <button
                            type="submit"
                            disabled={loadingOtp}
                            className="mt-2 flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60 rounded-lg transition-colors font-medium"
                        >
                            {loadingOtp
                                ? <><Loader2 className="w-4 h-4 animate-spin" /> Envoi en cours…</>
                                : <><ArrowRight className="w-4 h-4" /> Recevoir le code</>
                            }
                        </button>
                    </form>
                )}

                {/* ── Étape 2 : OTP ── */}
                {step === 'otp' && (
                    <form onSubmit={handleOtpSubmit} className="flex-1 p-6 flex flex-col gap-4">
                        <p className="text-sm text-gray-600">
                            Un code à 6 chiffres a été envoyé à <strong>{confirmedEmail}</strong>.<br />
                            Ce code est valable 15 minutes.
                        </p>
                        <div>
                            <label htmlFor="sig-otp" className="block text-sm font-medium text-gray-700 mb-1">
                                Code de vérification
                            </label>
                            <div className="relative">
                                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    id="sig-otp"
                                    name="otp"
                                    type="text"
                                    inputMode="numeric"
                                    pattern="\d{6}"
                                    maxLength={6}
                                    value={otpInput}
                                    onChange={(e) => { setOtpInput(e.target.value.replace(/\D/g, '')); setOtpError(''); }}
                                    placeholder="123456"
                                    required
                                    autoFocus
                                    autoComplete="one-time-code"
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {otpError && (
                                <p className="mt-1.5 text-xs text-red-600">{otpError}</p>
                            )}
                        </div>
                        <button
                            type="submit"
                            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium"
                        >
                            <ArrowRight className="w-4 h-4" />
                            Valider le code
                        </button>
                        <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={loadingOtp}
                            className="flex items-center justify-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 disabled:opacity-50 transition-colors"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            {loadingOtp ? 'Renvoi en cours…' : 'Renvoyer le code'}
                        </button>
                    </form>
                )}

                {/* ── Étape 3 : signature ── */}
                {step === 'sign' && (
                    <>
                        <div className="flex-1 p-4 bg-gray-50 flex items-center justify-center overflow-hidden">
                            <div
                                ref={canvasContainerRef}
                                className="border-2 border-dashed border-gray-300 rounded-lg bg-white w-full h-56 relative"
                                style={{ touchAction: 'none' }}
                            >
                                {canvasSize.width > 0 && (
                                    <SignatureCanvas
                                        ref={sigCanvas}
                                        penColor="black"
                                        canvasProps={{
                                            width: canvasSize.width,
                                            height: canvasSize.height,
                                            style: { width: '100%', height: '100%', cursor: 'crosshair', touchAction: 'none' },
                                        }}
                                    />
                                )}
                                <div className="absolute bottom-2 left-2 text-xs text-gray-400 pointer-events-none select-none">
                                    Signez ici
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t flex justify-between gap-4">
                            <button
                                onClick={clear}
                                className="flex items-center px-4 py-2 text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
                            >
                                <Trash2 className="w-4 h-4 mr-2" />
                                Effacer
                            </button>
                            <button
                                onClick={save}
                                className="flex items-center px-6 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium"
                            >
                                <Check className="w-4 h-4 mr-2" />
                                Valider la signature
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default SignatureModal;
