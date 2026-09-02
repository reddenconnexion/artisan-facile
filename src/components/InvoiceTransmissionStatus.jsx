/**
 * Composant : InvoiceTransmissionStatus
 *
 * Affiche le statut de transmission e-facture d'une facture ou d'un avoir,
 * le bouton de transmission vers la Plateforme Agréée, et un bouton de
 * resynchronisation du statut pour un document déjà transmis.
 *
 * Le bouton n'apparaît que si le document est éligible (émis, client
 * professionnel avec SIREN) ; sinon la raison est affichée à la place.
 *
 * Props :
 *   - devis        : objet facture ou avoir (id, type, invoice_number, transmission_*)
 *   - client       : objet client (type, siren)
 *   - userProfile  : profil de l'artisan
 *   - onSuccess    : callback appelé après une transmission réussie (optionnel)
 *   - onStatusChange : callback({ status, reference, error }) après transmission ou resynchronisation (optionnel)
 */

import React, { useState } from 'react';
import { Send, CheckCircle, XCircle, Clock, Loader2, Info, RefreshCw, Ban } from 'lucide-react';
import { useInvoiceTransmission } from '../hooks/useInvoiceTransmission';
import { getEInvoiceEligibility } from '../utils/einvoiceEligibility';

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
    label: 'Déposée sur la plateforme',
    color: 'text-green-600 bg-green-50 border-green-200',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  acknowledged: {
    label: 'Remise au client',
    color: 'text-green-700 bg-green-100 border-green-300',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  rejected: {
    label: 'Rejetée par la plateforme',
    color: 'text-red-600 bg-red-50 border-red-200',
    icon: <XCircle className="w-4 h-4" />,
  },
};

const InvoiceTransmissionStatus = ({ devis, client, userProfile, onSuccess, onStatusChange }) => {
  const { transmit, sync, loading, syncing, status: hookStatus, reference, error } = useInvoiceTransmission();
  const [showDetail, setShowDetail] = useState(false);

  // Priorité : état local (après une action) → état DB (initial)
  const currentStatus = hookStatus ?? devis?.transmission_status ?? null;
  const currentRef = reference ?? devis?.transmission_ref ?? null;
  const currentError = error ?? devis?.transmission_error ?? null;
  const serviceLabel = devis?.transmission_service
    ? devis.transmission_service.replace('_', ' ').toUpperCase()
    : 'PDP/PPF';

  const isTransmissible = devis?.type === 'invoice' || devis?.type === 'credit_note';
  if (!isTransmissible) return null;

  const docLabel = devis.type === 'credit_note' ? "l'avoir" : 'la facture';
  const eligibility = getEInvoiceEligibility(devis, client);
  const busy = loading || syncing;
  const alreadySent = currentStatus === 'sent' || currentStatus === 'acknowledged';
  const canTransmit = eligibility.eligible && !busy && currentStatus !== 'acknowledged';
  const canSync = !busy && ['sent', 'acknowledged', 'rejected'].includes(currentStatus);

  const handleTransmit = async () => {
    const result = await transmit({ devis, client, userProfile });
    onStatusChange?.(result);
    if (result.ok && onSuccess) onSuccess();
  };

  const handleSync = async () => {
    const result = await sync({ devis });
    onStatusChange?.(result);
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
          {(currentRef || currentError) && (
            <button
              type="button"
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
        <div className="text-xs pl-1 space-y-0.5">
          {currentRef && (
            <p className="text-gray-500">
              Référence {serviceLabel} : <span className="font-mono font-medium">{currentRef}</span>
            </p>
          )}
          {currentError && (
            <p className="text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">{currentError}</p>
          )}
        </div>
      )}

      {/* Document non éligible : on explique pourquoi au lieu de laisser un bouton qui échouera */}
      {!eligibility.eligible && !alreadySent && (
        <p className="flex items-start gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
          <Ban className="w-3.5 h-3.5 shrink-0 mt-px text-gray-400" />
          <span>{eligibility.message}</span>
        </p>
      )}

      <div className="flex gap-2">
        {/* Bouton de transmission */}
        {(eligibility.eligible || alreadySent) && (
          <button
            type="button"
            onClick={handleTransmit}
            disabled={!canTransmit}
            className={`flex items-center justify-center gap-2 flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all
              ${alreadySent
                ? 'bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 disabled:opacity-50 disabled:cursor-not-allowed'
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
              ? 'Retransmettre'
              : `Transmettre ${docLabel}`}
          </button>
        )}

        {/* Resynchronisation du statut auprès de la plateforme */}
        {canSync && (
          <button
            type="button"
            onClick={handleSync}
            disabled={busy}
            title="Relire le statut auprès de la plateforme"
            className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Vérification…' : 'Actualiser le statut'}
          </button>
        )}
      </div>

      {/* Avertissement si PDP non configurée */}
      {currentStatus === 'rejected' && currentError?.includes('non configurée') && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Aucune Plateforme Agréée n'est configurée.{' '}
          <a href="/profile" className="font-medium underline hover:text-amber-700">
            Configurez votre PA dans les paramètres du profil →
          </a>
        </p>
      )}
    </div>
  );
};

export default InvoiceTransmissionStatus;
