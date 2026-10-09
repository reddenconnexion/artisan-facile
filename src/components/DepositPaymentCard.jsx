import { useState } from 'react';
import { Copy, CheckCircle, Send, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import {
    compactIban, formatIban, formatEuros, plainAmount, paymentMessage,
} from '../utils/depositPayment';

// Ligne « libellé + valeur + bouton Copier » : un toucher suffit pour coller
// la valeur dans l'appli bancaire, sans la recopier de tête.
const CopyRow = ({ label, display, copyValue }) => {
    const [copied, setCopied] = useState(false);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(copyValue);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Copie impossible : sélectionnez la valeur à la main.');
        }
    };

    return (
        <div className="flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl px-3 py-2.5">
            <div className="min-w-0 text-left">
                <p className="text-[11px] text-gray-500 font-semibold uppercase">{label}</p>
                <p className="text-sm font-mono text-gray-900 break-all select-all">{display}</p>
            </div>
            <button
                type="button"
                onClick={copy}
                aria-label={`Copier : ${label}`}
                className={`flex-shrink-0 flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg text-sm font-semibold transition-colors ${copied ? 'text-green-700 bg-green-50' : 'text-blue-700 bg-blue-50 hover:bg-blue-100'}`}
            >
                {copied ? <CheckCircle className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copié' : 'Copier'}
            </button>
        </div>
    );
};

/**
 * Règlement de l'acompte par virement, pensé pour un client qui signe sur son
 * téléphone : valeurs copiables une à une, et envoi des coordonnées par
 * message / e-mail pour les retrouver en ouvrant l'appli de sa banque.
 */
const DepositPaymentCard = ({ artisan, amount, reference, clientEmail }) => {
    const iban = compactIban(artisan?.iban);
    if (!iban || !(amount > 0)) return null;

    const beneficiary = artisan.company_name || artisan.full_name || '';
    const message = paymentMessage({ beneficiary, iban, amount, reference });

    const send = async () => {
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Coordonnées de virement', text: message });
                return;
            } catch (err) {
                if (err?.name === 'AbortError') return;
            }
        }
        const subject = encodeURIComponent(`Virement de l'acompte - ${reference}`);
        window.location.assign(`mailto:${encodeURIComponent(clientEmail || '')}?subject=${subject}&body=${encodeURIComponent(message)}`);
    };

    return (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 space-y-3 text-left">
            <div className="flex items-center gap-2">
                <Landmark className="w-5 h-5 text-blue-700" />
                <h3 className="text-base font-bold text-blue-900">Régler l’acompte par virement</h3>
            </div>
            <p className="text-sm text-blue-800">
                Copiez les trois valeurs ci-dessous dans l’application de votre banque.
                Aucun frais de paiement en ligne.
            </p>
            <CopyRow label="Montant" display={formatEuros(amount)} copyValue={plainAmount(amount)} />
            <CopyRow label={`IBAN${beneficiary ? ` - ${beneficiary}` : ''}`} display={formatIban(iban)} copyValue={iban} />
            <CopyRow label="Référence à indiquer" display={reference} copyValue={reference} />
            <button
                type="button"
                onClick={send}
                className="w-full flex items-center justify-center gap-2 min-h-[48px] px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-colors"
            >
                <Send className="w-4 h-4" />
                M’envoyer ces coordonnées
            </button>
        </div>
    );
};

export default DepositPaymentCard;
