import { supabase } from './supabase';

/**
 * Seed realistic demo data for an anonymous demo session.
 *
 * Creates a complete artisan profile + clients + quotes in various states
 * so the visitor can explore all features without entering any info.
 *
 * Company: "Électricité Moreau" — fictitious electrician based in Lyon.
 */
export const seedDemoData = async (userId) => {
    const today = new Date();
    const d = (daysOffset, monthOffset = 0) => {
        const dt = new Date(today);
        dt.setMonth(dt.getMonth() + monthOffset);
        dt.setDate(dt.getDate() + daysOffset);
        return dt.toISOString().split('T')[0];
    };

    // ── 1. Profil artisan complet ──────────────────────────────────────────
    await supabase.from('profiles').upsert({
        id: userId,
        company_name: 'Électricité Moreau',
        full_name: 'Thomas Moreau',
        phone: '04 78 45 12 36',
        professional_email: 'contact@electricite-moreau.fr',
        address: '24 Rue Ampère',
        city: 'Lyon',
        postal_code: '69003',
        siret: '812 345 678 00019',
        trade: 'electricien',
        iban: 'FR76 1234 5678 9012 3456 7890 123',
        ai_preferences: {
            artisan_status: 'micro_entreprise',
            activity_type: 'services',
            ai_hourly_rate: 60,
        },
    }, { onConflict: 'id' });

    // ── 2. Clients ─────────────────────────────────────────────────────────
    const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .insert([
            {
                user_id: userId,
                name: 'Bernard Dupont',
                email: 'b.dupont@example.com',
                phone: '06 12 34 56 78',
                address: '8 Allée des Roses, 69006 Lyon',
                notes: 'Propriétaire d\'un appartement T4 — rénovation complète.',
            },
            {
                user_id: userId,
                name: 'Sylvie Aubert',
                email: 's.aubert@example.com',
                phone: '06 89 45 23 11',
                address: '3 Impasse des Charmes, 69009 Lyon',
                notes: 'Maison individuelle, vieille installation à remettre aux normes.',
            },
            {
                user_id: userId,
                name: 'Boulangerie Tartine & Co',
                email: 'contact@tartineco.fr',
                phone: '04 72 33 22 11',
                address: '57 Cours Lafayette, 69003 Lyon',
                notes: 'Boulangerie artisanale — mise aux normes + éclairage vitrine.',
            },
        ])
        .select();

    if (clientsError || !clients?.length) {
        console.error('Error seeding clients:', clientsError);
        return;
    }

    const [dupont, aubert, boulangerie] = clients;

    // ── 3. Devis & Factures ────────────────────────────────────────────────

    const quotes = [
        // --- Devis 1 : Payé (M. Dupont) — alimente la compta
        {
            user_id: userId,
            client_id: dupont.id,
            client_name: dupont.name,
            title: 'Mise en conformité tableau électrique',
            date: d(-45),
            status: 'paid',
            type: 'quote',
            payment_method: 'virement',
            paid_at: d(-30),
            total_ht: 1250.00,
            total_tva: 125.00,
            total_ttc: 1375.00,
            items: [
                { id: 1, description: 'Dépose ancien tableau et évacuation', quantity: 1, unit: 'forfait', price: 150, type: 'service' },
                { id: 2, description: 'Fourniture tableau 3 rangées 36 modules', quantity: 1, unit: 'unité', price: 42, type: 'material' },
                { id: 3, description: 'Disjoncteurs et interrupteurs différentiels', quantity: 1, unit: 'forfait', price: 220, type: 'material' },
                { id: 4, description: 'Pose et câblage tableau complet', quantity: 1, unit: 'forfait', price: 480, type: 'service' },
                { id: 5, description: 'Mise en sécurité installation', quantity: 1, unit: 'forfait', price: 358, type: 'service' },
            ],
            notes: 'Travaux réalisés en 2 jours. Consuel délivré.',
        },

        // --- Devis 2 : Payé (Boulangerie) — alimente la compta
        {
            user_id: userId,
            client_id: boulangerie.id,
            client_name: boulangerie.name,
            title: 'Éclairage LED vitrine + enseigne',
            date: d(-60),
            status: 'paid',
            type: 'quote',
            payment_method: 'virement',
            paid_at: d(-45),
            total_ht: 890.00,
            total_tva: 89.00,
            total_ttc: 979.00,
            items: [
                { id: 1, description: 'Spots LED encastrables 10W 3000K (×12)', quantity: 12, unit: 'unité', price: 22, type: 'material' },
                { id: 2, description: 'Câblage et raccordement spots', quantity: 12, unit: 'unité', price: 35, type: 'service' },
                { id: 3, description: 'Alimentation enseigne lumineuse', quantity: 1, unit: 'forfait', price: 154, type: 'service' },
            ],
        },

        // --- Devis 3 : Accepté (Mme Aubert) — en attente de démarrage
        {
            user_id: userId,
            client_id: aubert.id,
            client_name: aubert.name,
            title: 'Remise aux normes installation électrique',
            date: d(-10),
            valid_until: d(20),
            status: 'accepted',
            type: 'quote',
            total_ht: 3200.00,
            total_tva: 320.00,
            total_ttc: 3520.00,
            items: [
                { id: 1, description: 'Diagnostic installation — bilan complet', quantity: 1, unit: 'forfait', price: 120, type: 'service' },
                { id: 2, description: 'Remplacement tableau électrique 4 rangées 48 modules', quantity: 1, unit: 'forfait', price: 1200, type: 'service' },
                { id: 3, description: 'Création circuits dédiés (four, lave-linge, lave-vaisselle)', quantity: 3, unit: 'forfait', price: 180, type: 'service' },
                { id: 4, description: 'Remplacement prises 2P+T — salon et chambres (×14)', quantity: 14, unit: 'unité', price: 55, type: 'service' },
                { id: 5, description: 'Passage gaines ICTA encastrées', quantity: 45, unit: 'ml', price: 8, type: 'service' },
            ],
            notes: 'Démarrage prévu semaine 18. Accès nécessaire toute la journée J1.',
        },

        // --- Devis 4 : Envoyé (Boulangerie) — en attente de réponse
        {
            user_id: userId,
            client_id: boulangerie.id,
            client_name: boulangerie.name,
            title: 'Mise aux normes cuisine professionnelle',
            date: d(-5),
            valid_until: d(25),
            status: 'sent',
            type: 'quote',
            total_ht: 2450.00,
            total_tva: 245.00,
            total_ttc: 2695.00,
            items: [
                { id: 1, description: 'Câble U1000R2V 3G10mm² départ tableau → cuisine (8ml)', quantity: 8, unit: 'ml', price: 4.50, type: 'material' },
                { id: 2, description: 'Disjoncteur 32A bipolaire four professionnel', quantity: 2, unit: 'unité', price: 22, type: 'material' },
                { id: 3, description: 'Prise spécialisée 20A lave-linge', quantity: 1, unit: 'unité', price: 20, type: 'material' },
                { id: 4, description: 'Heure de main d\'œuvre — tirage câbles et raccordement', quantity: 8, unit: 'heure', price: 60, type: 'service' },
                { id: 5, description: 'Rapport de conformité Consuel', quantity: 1, unit: 'forfait', price: 95, type: 'service' },
            ],
        },

        // --- Devis 5 : Brouillon (M. Dupont) — en cours de rédaction
        {
            user_id: userId,
            client_id: dupont.id,
            client_name: dupont.name,
            title: 'Installation domotique — thermostat connecté',
            date: d(0),
            valid_until: d(30),
            status: 'draft',
            type: 'quote',
            total_ht: 580.00,
            total_tva: 58.00,
            total_ttc: 638.00,
            items: [
                { id: 1, description: 'Thermostat connecté filaire', quantity: 1, unit: 'unité', price: 120, type: 'material' },
                { id: 2, description: 'Interrupteur connecté encastré (×3)', quantity: 3, unit: 'unité', price: 55, type: 'material' },
                { id: 3, description: 'Pose et paramétrage — main d\'œuvre', quantity: 4, unit: 'heure', price: 60, type: 'service' },
            ],
        },

        // --- Devis 6 : Refusé (Mme Aubert) — proposition antérieure
        {
            user_id: userId,
            client_id: aubert.id,
            client_name: aubert.name,
            title: 'Installation pompe à chaleur air/air',
            date: d(-90),
            status: 'rejected',
            type: 'quote',
            total_ht: 4800.00,
            total_tva: 480.00,
            total_ttc: 5280.00,
            items: [
                { id: 1, description: 'PAC air/air bi-split 2×3.5kW', quantity: 1, unit: 'unité', price: 2800, type: 'material' },
                { id: 2, description: 'Pose, raccordement frigorifique et électrique', quantity: 1, unit: 'forfait', price: 1200, type: 'service' },
                { id: 3, description: 'Mise en service et paramétrage', quantity: 1, unit: 'forfait', price: 800, type: 'service' },
            ],
            notes: 'Devis refusé — budget client insuffisant. À relancer dans 6 mois.',
        },
    ];

    await supabase.from('quotes').insert(quotes);

    // ── 4. Bibliothèque de prix (sélection électricien) ───────────────────
    const libraryItems = [
        { user_id: userId, description: 'Heure de main d\'œuvre Électricité', price: 60, unit: 'heure', category: 'Main d\'oeuvre' },
        { user_id: userId, description: 'Forfait Déplacement (< 20km)', price: 40, unit: 'forfait', category: 'Main d\'oeuvre' },
        { user_id: userId, description: 'Forfait Installation Prise de courant', price: 55, unit: 'forfait', category: 'Main d\'oeuvre' },
        { user_id: userId, description: 'Forfait Installation Point Lumineux', price: 65, unit: 'forfait', category: 'Main d\'oeuvre' },
        { user_id: userId, description: 'Forfait Remplacement Tableau Complet', price: 1200, unit: 'forfait', category: 'Main d\'oeuvre' },
        { user_id: userId, description: 'Câble RO2V 3G1.5mm² (Couronne 100m)', price: 65, unit: 'couronne', category: 'Câblage' },
        { user_id: userId, description: 'Câble RO2V 3G2.5mm² (Couronne 100m)', price: 95, unit: 'couronne', category: 'Câblage' },
        { user_id: userId, description: 'Disjoncteur 16A Phase+Neutre (Prises)', price: 12, unit: 'unité', category: 'Tableau' },
        { user_id: userId, description: 'Interrupteur Différentiel 40A 30mA Type AC', price: 45, unit: 'unité', category: 'Tableau' },
        { user_id: userId, description: 'Prise de courant 2P+T (Complète)', price: 15, unit: 'unité', category: 'Appareillage' },
        { user_id: userId, description: 'Spot Encastrable LED 7W 4000K', price: 18, unit: 'unité', category: 'Éclairage' },
        { user_id: userId, description: 'Détecteur de Fumée (DAAF — Obligatoire)', price: 22, unit: 'unité', category: 'Sécurité' },
    ];

    await supabase.from('price_library').insert(libraryItems);
};
