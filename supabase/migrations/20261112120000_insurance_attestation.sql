-- Attestation d'assurance décennale consultable dans l'espace client.
--
-- L'artisan dépose le PDF remis par son assureur (bucket public `quote_files`,
-- nom de fichier aléatoire) ; l'espace client (/p/:token) l'affiche et permet
-- de le télécharger. L'attestation étant annuelle, sa date de fin de validité
-- est conservée pour l'afficher au client et rappeler le renouvellement à
-- l'artisan.
--
-- get_portal_data et get_my_profile_safe renvoient déjà la ligne `profiles` :
-- aucune RPC à modifier.
alter table profiles
    add column if not exists insurance_attestation_url text,
    add column if not exists insurance_attestation_valid_until date;

comment on column profiles.insurance_attestation_url is 'URL publique du PDF de l''attestation d''assurance décennale (affichée dans l''espace client)';
comment on column profiles.insurance_attestation_valid_until is 'Dernier jour de validité de l''attestation d''assurance (facultatif)';
