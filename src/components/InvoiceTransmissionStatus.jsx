/**
 * Composant : InvoiceTransmissionStatus
 *
 * Affiche le statut de transmission e-facture et un bouton pour
 * transmettre la facture à la PDP/PPF configurée.
 *
 * Props :
 *   - devis        : objet facture (doit avoir id, type === 'invoice', quote_number)
 *   - client       : objet client
 *   - userProfile  : profil de l'artisan
 *   - onSuccess    : callback appelé après une transmission réussie (optionnel)
 */

import React, { useState } from 'react';
import { Send, CheckCircle, XCircle, Clock, Loader2, Info } from 'lucide-react';
import { useInvoiceTransmission } from '../hooks/useInvoiceTransmission';

// Libellés et couleurs par statut DB
const STATUS_CONFIG = {
  pending: {
    label: 'En attente de transmission',
    color: 'text-yellow-600 bg-yellow-50 border-yellow-200',
    icon: <Clock className="w-4 h-4" />,
  },
  sending: {
    label: 'Transmission en cours…',
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    icon: <Loader2 className="w-4 h-4 animate-spin" />,
  },
  sent: {
    label: 'Transmise à la PDP/PPF',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  acknowledged: {
    label: 'Accusée de réception',
    color: 'text-green-700 bg-green-100 border-green-300',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  rejected: {
    label: 'Rejetée par la PDP/PPF',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: <XCircle className="w-4 h-4" />,
  },
};

const InvoiceTransmissionStatus = ({ devis, client, userProfile, onSuccess }) => {
  const { transmit, loading, status: hookStatus, reference, error } = useInvoiceTransmission();
  const [showDetail, setShowDetail] = useState(false);

  // Priorité : état local (après une action) → état DB (initial)
  const currentStatus = hookStatus ?? devis?.transmission_status ?? null;
  const currentRef = reference ?? devis?.transmission_ref ?? null;
  const currentError = error ?? devis?.transmission_error ?? null;
  const serviceLabel = devis?.transmission_service
    ? devis.transmission_service.replace('_', ' ').toUpperCase()
    : 'PDP/PPF';

  const isInvoice = devis?.type === 'invoice';
  if (!isInvoice) return null;

  const canTransmit = !loading && currentStatus !== 'acknowledged';
  const alreadySent = currentStatus === 'sent' || currentStatus === 'acknowledged';

  const handleTransmit = async () => {
    await transmit({ devis, client, userProfile });
    if (hookStatus === 'sent' && onSuccess) onSuccess();
  };

  const statusCfg = currentStatus ? STATUS_CONFIG[currentStatus] : null;

  return (
    <div className="mt-3 space-y-2">
      {/* Badge de statut (si déjà transmis ou en cours) */}
      {statusCfg && (
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium ${statusCfg.color}`}
        >
          {statusCfg.icon}
          <span>{statusCfg.label}</span>
          {currentRef && (
            <button
              onClick={() => setShowDetail(!showDetail)}
              className="ml-1 opacity-60 hover:opacity-100"
              title="Voir le détail"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Détail de la référence PDP / erreur */}
      {showDetail && (currentRef || currentError) && (
        <div className="text-xs text-gray-500 pl-1 space-y-0.5">
          {currentRef && (
            <p>
              Référence {serviceLabel} : <span className="font-mono font-medium">{currentRef}</span>
            </p>
          )}
          {currentError && (
            <p className="text-red-500">Erreur : {currentError}</p>
          )}
        </div>
      )}

      {/* Bouton de transmission */}
      <button
        type="button"
        onClick={handleTransmit}
        disabled={!canTransmit}
        className={`flex items-center gap-2 w-full px-4 py-2.5 rounded-lg text-sm font-medium transition-all
          ${alreadySent
            ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100'
            : 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed'
          }`}
      >
        {loading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : alreadySent ? (
          <CheckCircle className="w-4 h-4" />
        ) : (
          <Send className="w-4 h-4" />
        )}
        {loading
          ? 'Transmission en cours…'
          : alreadySent
          ? 'Retransmettre à la PDP/PPF'
          : 'Transmettre à la PDP/PPF'}
      </button>

      {/* Avertissement si PDP non configurée */}
      {!import.meta.env.VITE_PDP_CONFIGURED && currentStatus === 'rejected' && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          La PDP n'est pas encore configurée. Renseignez les variables{' '}
          <code className="font-mono">PDP_API_URL</code> et{' '}
          <code className="font-mono">PDP_API_KEY</code> dans les secrets Supabase.
        </p>
      )}
    </div>
  );
};

export default InvoiceTransmissionStatus;
