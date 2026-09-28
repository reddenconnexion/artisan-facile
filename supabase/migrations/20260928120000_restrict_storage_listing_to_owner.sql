-- Les buckets `project-photos`, `quote_files` et `logos` restent publics :
-- l'affichage direct par URL connue (photos dans le portail client, PDF
-- depuis un lien de devis public, logo sur les documents) doit continuer à
-- fonctionner sans session — Supabase sert un objet d'un bucket public par
-- son chemin exact sans jamais vérifier les policies RLS de storage.objects
-- pour cette route-là.
--
-- Le problème n'est pas cette route, mais la policy SELECT de chacun de ces
-- buckets : `USING (bucket_id = 'xxx')`, sans aucune restriction de
-- propriétaire. Cette policy est aussi celle qui gouverne le LISTING
-- (`storage.from(bucket).list()`) et le téléchargement/la génération d'URL
-- signée via l'API authentifiée. Résultat : n'importe qui (anon compris,
-- avec la seule clé anon déjà publique dans le bundle) peut lister
-- l'intégralité du contenu d'un bucket, tous artisans confondus — photos de
-- chantier prises chez des clients pour `project-photos`, PDF de devis,
-- factures et rapports d'intervention pour `quote_files`.
--
-- On restreint donc SELECT au propriétaire de l'objet. Ça bloque le listing
-- et le téléchargement par un tiers, sans rien changer à l'affichage
-- existant (qui repose sur l'URL publique connue, jamais sur `.list()`).
-- `quote_files` a déjà une policy "Users can view own quote files" scopée au
-- propriétaire : on ne fait que retirer le doublon permissif qui la rendait
-- inopérante (les policies RLS s'additionnent en OR).

DROP POLICY IF EXISTS "Project photos are publicly accessible" ON storage.objects;
CREATE POLICY "Project photos owner can list via API"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-photos' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Quote files are publicly accessible." ON storage.objects;

DROP POLICY IF EXISTS "Logo images are publicly accessible." ON storage.objects;
CREATE POLICY "Logos owner can list via API"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'logos' AND auth.uid() = owner);
