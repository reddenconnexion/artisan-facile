-- ──────────────────────────────────────────────────────────────────────────────
-- Stockage : empêcher un robot de saturer l'espace de fichiers
--
-- Constat (15/10/2026) : base 29 Mo, fichiers 295 Mo. Le poids est dans le
-- stockage, pas dans les lignes. Or :
--   - les buckets publics logos / project-photos / quote_files n'avaient
--     aucune limite de taille par fichier ;
--   - tout utilisateur connecté pouvait y déposer, y compris un compte démo
--     anonyme (bouton « Essayer la démo », sans email). Un robot pouvait
--     enchaîner sessions démo et envois de fichiers.
--
-- 1. Comptes démo anonymes : aucun dépôt de fichier. Politique RESTRICTIVE :
--    elle s'ajoute (ET) aux politiques d'envoi existantes sans les modifier ;
--    les vrais comptes ne sont pas concernés.
-- 2. Taille maximale par fichier, au-dessus des plus gros fichiers actuels
--    (logo 2,3 Mo, photo/PDF chantier 13 Mo, devis importé 7,6 Mo) pour ne
--    bloquer aucun usage réel.
-- ──────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "No uploads for anonymous demo accounts" ON storage.objects;
CREATE POLICY "No uploads for anonymous demo accounts"
    ON storage.objects
    AS RESTRICTIVE
    FOR INSERT
    TO authenticated
    WITH CHECK (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

DROP POLICY IF EXISTS "No overwrites for anonymous demo accounts" ON storage.objects;
CREATE POLICY "No overwrites for anonymous demo accounts"
    ON storage.objects
    AS RESTRICTIVE
    FOR UPDATE
    TO authenticated
    USING (COALESCE((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

UPDATE storage.buckets SET file_size_limit = 5 * 1024 * 1024  WHERE id = 'logos';
UPDATE storage.buckets SET file_size_limit = 25 * 1024 * 1024 WHERE id = 'project-photos';
UPDATE storage.buckets SET file_size_limit = 20 * 1024 * 1024 WHERE id = 'quote_files';
