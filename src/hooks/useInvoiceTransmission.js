/**
 * Hook : useInvoiceTransmission
 *
 * Gère la transmission d'une facture Factur-X vers une PDP ou le PPF.
 *
 * Utilisation :
 *   const { transmit, status, reference, error, loading } = useInvoiceTransmission();
 *   await transmit({ devis, client, userProfile });
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

export const useInvoiceTransmission = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState(null);   // 'sent' | 'rejected' | null
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
      // 1. Générer le PDF Factur-X en mémoire (blob)
      const pdfBlob = await generateDevisPDF(devis, client, userProfile, true, 'blob');
      if (!pdfBlob) throw new Error('Impossible de générer le PDF Factur-X');

      // 2. Convertir en base64
      const pdfBase64 = await blobToBase64(pdfBlob);

      // 3. Récupérer le token d'authentification
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Session expirée, veuillez vous reconnecter');

      // 4. Appeler l'edge function transmit-invoice
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/transmit-invoice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          quote_id: devis.id,
          pdf_base64: pdfBase64,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        throw new Error(body?.error || `Erreur HTTP ${response.status}`);
      }

      setStatus('sent');
      setReference(body.reference ?? null);
    } catch (err) {
      setError(err.message || 'Erreur lors de la transmission');
      setStatus('rejected');
    } finally {
      setLoading(false);
    }
  }, []);

  return { transmit, loading, status, reference, error };
};
