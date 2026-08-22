-- Assurance professionnelle (décennale / RC pro) sur les devis et factures.
-- Loi Pinel (art. 22-2 de la loi n° 96-603 du 5 juillet 1996) : les artisans
-- soumis à l'obligation d'assurance décennale doivent mentionner sur leurs
-- devis et factures l'assurance souscrite, les coordonnées de l'assureur
-- et la couverture géographique du contrat.
alter table profiles
    add column if not exists insurance_company text,
    add column if not exists insurance_contract_number text,
    add column if not exists insurance_company_address text,
    add column if not exists insurance_coverage_area text;

comment on column profiles.insurance_company is 'Nom de la compagnie d''assurance décennale/RC pro (mention obligatoire devis + factures)';
comment on column profiles.insurance_contract_number is 'Numéro du contrat d''assurance (recommandé, non obligatoire)';
comment on column profiles.insurance_company_address is 'Adresse de l''assureur (mention obligatoire)';
comment on column profiles.insurance_coverage_area is 'Couverture géographique du contrat (mention obligatoire)';
