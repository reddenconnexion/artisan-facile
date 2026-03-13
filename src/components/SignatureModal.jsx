import React, { useRef, useState } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { X, Check, Trash2, Mail, ArrowRight } from 'lucide-react';

/**
 * Two-step signature modal:
 *  1. Email confirmation (only when clientEmail is provided)
 *  2. Signature pad
 *
 * onSave(signatureDataURL, confirmedEmail) is called on success.
 */
const SignatureModal = ({ isOpen, onClose, onSave, clientEmail }) => {
    const sigCanvas = useRef({});
    const [step, setStep] = useState('email'); // 'email' | 'sign'
    const [emailInput, setEmailInput] = useState('');
    const [emailError, setEmailError] = useState('');

    const requiresEmail = Boolean(clientEmail);

    const handleClose = () => {
        setStep('email');
        setEmailInput('');
        setEmailError('');
        onClose();
    };

    const handleEmailSubmit = (e) => {
        e.preventDefault();
        if (emailInput.trim().toLowerCase() !== clientEmail.trim().toLowerCase()) {
            setEmailError("L'adresse email ne correspond pas au destinataire de ce devis.");
            return;
        }
        setEmailError('');
        setStep('sign');
    };

    const clear = () => sigCanvas.current.clear();

    const save = () => {
        if (sigCanvas.current.isEmpty()) {
            alert("Veuillez signer avant de valider.");
            return;
        }
        const dataURL = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
        onSave(dataURL, requiresEmail ? emailInput.trim() : null);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-900">
                        {step === 'email' ? 'Confirmer votre identité' : 'Signature du client'}
                    </h3>
                    <button onClick={handleClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                {/* ── Step 1: Email verification ── */}
                {step === 'email' && requiresEmail && (
                    <form onSubmit={handleEmailSubmit} className="flex-1 p-6 flex flex-col gap-4">
                        <p className="text-sm text-gray-600">
                            Pour signer ce devis, veuillez confirmer l'adresse email associée à votre dossier.
                        </p>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                                Votre adresse email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <input
                                    type="email"
                                    value={emailInput}
                                    onChange={(e) => { setEmailInput(e.target.value); setEmailError(''); }}
                                    placeholder="votre@email.com"
                                    required
                                    className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                                />
                            </div>
                            {emailError && (
                                <p className="mt-1.5 text-xs text-red-600">{emailError}</p>
                            )}
                        </div>
                        <button
                            type="submit"
                            className="mt-2 flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium"
                        >
                            Continuer
                            <ArrowRight className="w-4 h-4" />
                        </button>
                    </form>
                )}

                {/* ── Step 1 skipped: no email on file ── */}
                {step === 'email' && !requiresEmail && (
                    // Jump directly to sign step when no email to verify
                    (() => { setStep('sign'); return null; })()
                )}

                {/* ── Step 2: Signature pad ── */}
                {step === 'sign' && (
                    <>
                        <div className="flex-1 p-4 bg-gray-50 flex items-center justify-center overflow-hidden">
                            <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white w-full h-64 relative">
                                <SignatureCanvas
                                    ref={sigCanvas}
                                    penColor="black"
                                    canvasProps={{
                                        className: 'w-full h-full cursor-crosshair'
                                    }}
                                />
                                <div className="absolute bottom-2 left-2 text-xs text-gray-400 pointer-events-none">
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
