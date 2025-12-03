import React, { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { X, Check, Trash2 } from 'lucide-react';

const SignatureModal = ({ isOpen, onClose, onSave }) => {
    const sigCanvas = useRef({});

    const clear = () => sigCanvas.current.clear();

    const save = () => {
        if (sigCanvas.current.isEmpty()) {
            alert("Veuillez signer avant de valider.");
            return;
        }
        const dataURL = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
        onSave(dataURL);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-lg font-bold text-gray-900">Signature du client</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
                        <X className="w-6 h-6" />
                    </button>
                </div>

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
            </div>
        </div>
    );
};

export default SignatureModal;
