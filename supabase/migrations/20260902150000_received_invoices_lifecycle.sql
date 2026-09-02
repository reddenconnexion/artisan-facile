-- ──────────────────────────────────────────────────────────────────────────────
-- Factures reçues : PDF conservé chez nous + cycle de vie renvoyé au fournisseur.
--
-- Jusqu'ici le webhook ne stockait que les métadonnées d'une facture reçue :
-- pas de PDF consultable, et les boutons « intégrée / rejetée » ne changeaient
-- qu'un repère local (que la RLS, sans policy UPDATE, n'enregistrait d'ailleurs
-- jamais). La réforme impose de renvoyer les statuts de cycle de vie
-- (approuvée / refusée avec motif) au fournisseur via la plateforme.
--
--   - pdf_path          : chemin du PDF dans le bucket privé received-invoices
--                         (un dossier par artisan, lecture réservée au propriétaire,
--                         écriture réservée au service role depuis les Edge Functions) ;
--   - refusal_reason    : motif de refus transmis au fournisseur ;
--   - lifecycle_sent_at : horodatage du dernier statut transmis à la plateforme ;
--   - lifecycle_error   : dernier échec de transmission du statut.
--
-- Nettoyage : la première facture transmise via B2BRouter a été enregistrée
-- avec la chaîne « undefined » en guise de référence (l'identifiant n'était
-- pas lu au bon endroit dans la réponse). On efface ces fausses références pour
-- que la resynchronisation par numéro puisse les rétablir.
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE received_invoices
  ADD COLUMN IF NOT EXISTS pdf_path          TEXT,
  ADD COLUMN IF NOT EXISTS refusal_reason    TEXT,
  ADD COLUMN IF NOT EXISTS lifecycle_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS lifecycle_error   TEXT;

COMMENT ON COLUMN received_invoices.pdf_path          IS 'Chemin du PDF dans le bucket privé received-invoices ({user_id}/{id}.pdf)';
COMMENT ON COLUMN received_invoices.refusal_reason    IS 'Motif de refus transmis au fournisseur via la plateforme';
COMMENT ON COLUMN received_invoices.lifecycle_sent_at IS 'Dernier statut de cycle de vie transmis à la plateforme (accept/refuse)';
COMMENT ON COLUMN received_invoices.lifecycle_error   IS 'Dernier échec de transmission du statut à la plateforme';

-- Bucket privé : PDF des factures fournisseurs (20 Mo max, PDF uniquement).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('received-invoices', 'received-invoices', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE SET public = false;

-- Lecture : uniquement le dossier de l'artisan connecté (URL signée créée côté client).
-- Aucune policy INSERT/UPDATE/DELETE : seules les Edge Functions (service role) écrivent.
DROP POLICY IF EXISTS "Received invoice PDFs readable by owner" ON storage.objects;
CREATE POLICY "Received invoice PDFs readable by owner"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'received-invoices'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Références plateforme inexploitables (chaîne « undefined » sérialisée).
UPDATE quotes
   SET transmission_ref = NULL
 WHERE transmission_ref IN ('undefined', 'null', '');
