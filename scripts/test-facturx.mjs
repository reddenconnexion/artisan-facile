/**
 * Script de test : génère un fichier factur-x.xml avec des données réalistes
 * et le sauvegarde dans /tmp/test-facturx.xml
 *
 * Usage : node scripts/test-facturx.mjs
 */

import { generateFacturXXML } from '../src/utils/facturxGenerator.js';
import { writeFileSync } from 'fs';

// --- Données de test réalistes ---

const devis = {
  id: 'uuid-test-001',
  quote_number: 42,
  date: '2026-03-15',
  valid_until: '2026-04-15',
  include_tva: true,
  total_ht: 1500.00,
  total_tva: 300.00,
  total_ttc: 1800.00,
  items: [
    { description: 'Installation électrique tableau principal', quantity: 1, price: 800.00, tva_rate: 20 },
    { description: 'Fourniture câbles et disjoncteurs', quantity: 3, price: 150.00, tva_rate: 20 },
    { description: 'Déplacement et mise en service', quantity: 2, price: 75.00, tva_rate: 20 },
  ],
};

const client = {
  name: 'SARL Bâti Construction',
  address: '12 rue de la République',
  postal_code: '75001',
  city: 'Paris',
  siren: '123456789',
  tva_intracom: 'FR12123456789',
};

const userProfile = {
  company_name: 'Électricité Martin',
  full_name: 'Jean Martin',
  address: '5 avenue des Artisans',
  postal_code: '69001',
  city: 'Lyon',
  siret: '98765432100012',
  tva_intracom: 'FR98987654321',
};

// --- Générer et sauvegarder ---

const xml = generateFacturXXML(devis, client, userProfile);
const outputPath = '/tmp/test-facturx.xml';
writeFileSync(outputPath, xml, 'utf-8');
console.log(`✅ XML généré : ${outputPath}`);

// --- Test franchise TVA ---
const devisFranchise = {
  ...devis,
  quote_number: 43,
  include_tva: false,
  total_tva: 0,
  total_ttc: 1500.00,
  items: [
    { description: 'Peinture salon et couloir', quantity: 20, price: 60.00 },
    { description: 'Fournitures peinture', quantity: 1, price: 300.00 },
  ],
};

const xmlFranchise = generateFacturXXML(devisFranchise, client, {
  ...userProfile,
  tva_intracom: null,
  siret: '11122233300045',
  company_name: 'Peinture Dupont',
});
const outputFranchisePath = '/tmp/test-facturx-franchise.xml';
writeFileSync(outputFranchisePath, xmlFranchise, 'utf-8');
console.log(`✅ XML franchise TVA généré : ${outputFranchisePath}`);
