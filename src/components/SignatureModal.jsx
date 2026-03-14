import React, { useRef, useState, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { X, Check, Trash2, Mail, Lock } from 'lucide-react';
import { toast } from 'sonner';

const SignatureModal = ({ isOpen, onClose, onSave, client, artisan }) => {
    const sigCanvas = useRef({});
    const [step, setStep] = useState('email'); // 'email', 'otp', 'signature'
    const [emailInput, setEmailInput] = useState('');
    const [otpInput, setOtpInput] = useState('');
    const [generatedOtp, setGeneratedOtp] = useState('');
    const [isSending, setIsSending] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setStep('email');
            setEmailInput('');
            setOtpInput('');
            setGeneratedOtp('');
            setIsSending(false);
        }
    }, [isOpen]);

    const clear = () => {
        if (sigCanvas.current && sigCanvas.current.clear) {
            sigCanvas.current.clear();
        }
    };

    const save = () => {
        if (sigCanvas.current.isEmpty()) {
            toast.error("Veuillez signer avant de valider.");
            return;
        }
        const dataURL = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
        onSave(dataURL);
    };

    const handleSendOtp = async (e) => {
        e.preventDefault();
        
        if (!client || !client.email) {
            toast.error("Le client n'a pas d'adresse email enregistrée.");
            return;
        }
        
        if (emailInput.toLowerCase().trim() !== client.email.toLowerCase().trim()) {
            toast.error("Cette adresse email ne correspond pas à celle du devis.");
            return;
        }

        setIsSending(true);
        const code = Math.floor(100000 + Math.random() * 900000).toString();
        
        try {
            const res = await fetch('/api/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    toEmail: client.email,
                    otpCode: code,
                    clientName: client.name,
                    companyName: artisan?.company_name || 'Artisan Facile'
                })
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                console.warn("Send OTP error:", data);
                // Fallback for local testing without Vercel API access
                if (import.meta.env.DEV) {
                    console.log("[DEV MODE] MOCKED OTP Code:", code);
                    toast.success(`[DEV MODE] Code généré: ${code}`);
                } else {
                    throw new Error("L'envoi de l'email a échoué. Veuillez réessayer.");
                }
            } else {
                toast.success('Code de vérification envoyé sur votre adresse email !');
            }
            
            setGeneratedOtp(code);
            setStep('otp');
        } catch (error) {
            if (import.meta.env.DEV) {
                console.log("[DEV MODE] MOCKED OTP Code:", code);
                toast.success(`[DEV MODE] Code généré: ${code} (Erreur réseau ignorée en dév)`);
                setGeneratedOtp(code);
                setStep('otp');
            } else {
                toast.error(error.message || "Erreur lors de l'envoi de l'email");
            }
        } finally {
            setIsSending(false);
        }
    };

    const verifyOtp = (e) => {
        e.preventDefault();
        if (otpInput === generatedOtp) {
            setStep('signature');
            toast.success("Authentification réussie");
        } else {
            toast.error("Code de vérification incorrect");
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-900">
                        {step === 'signature' ? 'Signature du devis' : 'Vérification d\'identité'}
                    </h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 p-4 bg-gray-50 flex flex-col items-center justify-center overflow-hidden min-h-[300px]">
                    {step === 'email' && (
                        <form onSubmit={handleSendOtp} className="w-full max-w-sm">
                            <div className="mb-4 text-center">
                                <Mail className="w-12 h-12 text-blue-600 mx-auto mb-2 opacity-80" />
                                <p className="text-gray-600 text-sm">Veuillez confirmer l'adresse email enregistrée sur ce devis pour recevoir un code d'authentification.</p>
                            </div>
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Votre adresse email</label>
                                <input
                                    type="email"
                                    required
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    placeholder="ex: jean.dupont@email.com"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={isSending || !emailInput}
                                className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                            >
                                {isSending ? 'Envoi en cours...' : 'Envoyer le code'}
                            </button>
                        </form>
                    )}

                    {step === 'otp' && (
                        <form onSubmit={verifyOtp} className="w-full max-w-sm">
                            <div className="mb-4 text-center">
                                <Lock className="w-12 h-12 text-blue-600 mx-auto mb-2 opacity-80" />
                                <p className="text-gray-600 text-sm mb-4">Un code à 6 chiffres a été envoyé à <strong>{client?.email}</strong>. Il peut prendre quelques instants pour arriver.</p>
                            </div>
                            <div className="mb-6">
                                <label className="block text-sm font-medium text-gray-700 mb-1 text-center">Code de vérification</label>
                                <input
                                    type="text"
                                    required
                                    value={otpInput}
                                    onChange={(e) => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="123456"
                                    className="w-full px-4 py-3 text-center text-2xl tracking-widest border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono"
                                    autoFocus
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={otpInput.length !== 6}
                                className="w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition-colors font-medium disabled:opacity-50"
                            >
                                Vérifier le code
                            </button>
                            <button
                                type="button"
                                onClick={() => setStep('email')}
                                className="w-full mt-3 text-sm text-gray-500 hover:text-gray-700 underline"
                            >
                                Revenir à l'étape précédente
                            </button>
                        </form>
                    )}

                    {step === 'signature' && (
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
                    )}
                </div>

                {step === 'signature' && (
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
                )}
            </div>
        </div>
    );
};

export default SignatureModal;
