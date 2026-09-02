/**
 * Hook : useInvoiceTransmission
 *
 * Gère la transmission d'une facture ou d'un avoir Factur-X vers la
 * Plateforme Agréée, et la resynchronisation du statut d'un document déjà
 * transmis.
 *
 * Utilisation :
 *   const { transmit, sync, status, reference, error, loading } = useInvoiceTransmission();
 *   const result = await transmit({ devis, client, userProfile });
 *   const result = await sync({ devis });
 *
 * Chaque action renvoie { ok, status, reference, error } en plus de mettre à
 * jour l'état local — le composant appelant n'a pas à relire un état React
 * potentiellement périmé.
 */

import { useState, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import { generateDevisPDF } from '../utils/pdfGenerator';

/**
 * Convertit un Blob en chaîne base64.
 */
const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result); // "data:application/pdf;base64,..."
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const callTransmitFunction = async (body) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Session expirée, veuillez vous reconnecter');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const response = await fetch(`${supabaseUrl}/functions/v1/transmit-invoice`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload?.error || `Erreur HTTP ${response.status}`);
    err.payload = payload;
    throw err;
  }
  return payload;
};

export const useInvoiceTransmission = () => {
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState(null);   // 'sent' | 'acknowledged' | 'rejected' | null
  const [reference, setReference] = useState(null);
  const [error, setError] = useState(null);

  /**
   * Lance la transmission.
   * @param {{ devis: object, client: object, userProfile: object }} params
   */
  const transmit = useCallback(async ({ devis, client, userProfile }) => {
    setLoading(true);
    setError(null);
    setStatus(null);
    setReference(null);

    try {
      // 1. Générer le PDF Factur-X en mémoire (blob) — utilisé par le mode PDP générique
      const pdfBlob = await generateDevisPDF(devis, client, userProfile, true, 'blob');
      if (!pdfBlob) throw new Error('Impossible de générer le PDF Factur-X');

      // 2. Convertir en base64
      const pdfBase64 = await blobToBase64(pdfBlob);

      // 3. Appeler l'edge function transmit-invoice
      const body = await callTransmitFunction({ quote_id: devis.id, pdf_base64: pdfBase64 });

      const ref = body.reference ?? null;
      const nextStatus = body.status ?? 'sent';
      setStatus(nextStatus);
      setReference(ref);
      if (body.warning) setError(body.warning);
      return { ok: true, status: nextStatus, reference: ref, error: body.warning ?? null };
    } catch (err) {
      const message = err.message || 'Erreur lors de la transmission';
      setError(message);
      setStatus('rejected');
      return { ok: false, status: 'rejected', reference: null, error: message };
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Relit l'état du document chez la plateforme et met à jour le statut.
   * @param {{ devis: object }} params
   */
  const sync = useCallback(async ({ devis }) => {
    setSyncing(true);
    setError(null);

    try {
      const body = await callTransmitFunction({ quote_id: devis.id, action: 'sync' });
      const nextStatus = body.status ?? null;
      const ref = body.reference ?? null;
      setStatus(nextStatus);
      setReference(ref);
      if (body.error) setError(body.error);
      return { ok: true, status: nextStatus, reference: ref, rawState: body.raw_state ?? null, error: body.error ?? null };
    } catch (err) {
      const message = err.message || 'Erreur lors de la resynchronisation';
      setError(message);
      // Document introuvable côté plateforme : le serveur a effacé le faux
      // statut « déposée », on reflète cette remise à zéro localement.
      const reset = err.payload?.reset === true;
      if (reset) {
        setStatus(null);
        setReference(null);
      }
      return { ok: false, status: null, reference: null, error: message, reset };
    } finally {
      setSyncing(false);
    }
  }, []);

  return { transmit, sync, loading, syncing, status, reference, error };
};
