import { supabase } from './supabase';

export const seedDemoData = async (userId) => {
    const today = new Date();

    // 1. Create a Fake Client
    const { data: client, error: clientError } = await supabase
        .from('clients')
        .insert([{
            user_id: userId,
            name: 'Jean Martin',
            email: 'jean.martin@example.com',
            phone: '06 12 34 56 78',
            address: '15 Rue des Lilas, 75011 Paris',
            status: 'signed',
            notes: 'Client très sympathique, intéressé par d\'autres travaux.'
        }])
        .select()
        .single();

    if (clientError) {
        console.error('Error seeding client:', clientError);
        return;
    }

    // 2. Create Quotes
    // Quote 1: Accepted (contributes to CA if logic sums accepted/paid) - 12 450 €
    const quote1 = {
        user_id: userId,
        client_id: client.id,
        client_name: client.name,
        title: 'Rénovation Complète Appartement',
        date: new Date(today.getFullYear(), today.getMonth(), 5).toISOString().split('T')[0], // 5th of current month
        status: 'accepted', // Accepted
        type: 'quote',
        total_ht: 10375,
        total_tva: 2075,
        total_ttc: 12450,
        items: [
            { id: 1, description: 'Démolition cloison et évacuation', quantity: 1, unit: 'forfait', price: 1500 },
            { id: 2, description: 'Pose carrelage sol (60m2)', quantity: 60, unit: 'm2', price: 45 },
            { id: 3, description: 'Peinture murs et plafonds', quantity: 120, unit: 'm2', price: 35 },
            { id: 4, description: 'Fourniture et pose cuisine équipée', quantity: 1, unit: 'forfait', price: 1975 }
        ],
        notes: "Démarrage des travaux le 15 du mois."
    };

    // Quote 2: Pending - 3 200 €
    const quote2 = {
        user_id: userId,
        client_id: client.id,
        client_name: client.name,
        title: 'Aménagement Terrasse Bois',
        date: new Date(today.getFullYear(), today.getMonth(), 10).toISOString().split('T')[0],
        status: 'sent', // Pending
        type: 'quote',
        total_ht: 2666.67,
        total_tva: 533.33,
        total_ttc: 3200,
        items: [
            { id: 1, description: 'Structure lambourdes exotiques', quantity: 20, unit: 'm2', price: 40 },
            { id: 2, description: 'Lames de terrasse IPE', quantity: 20, unit: 'm2', price: 93.33 }
        ]
    };

    // Quote 3: Refused - 850 €
    const quote3 = {
        user_id: userId,
        client_id: client.id,
        client_name: client.name,
        title: 'Remplacement Ballon d\'eau chaude',
        date: new Date(today.getFullYear(), today.getMonth() - 1, 20).toISOString().split('T')[0], // Last month
        status: 'rejected',
        type: 'quote',
        total_ht: 708.33,
        total_tva: 141.67,
        total_ttc: 850,
        items: [
            { id: 1, description: 'Chauffe-eau 200L Stéatite', quantity: 1, unit: 'unité', price: 450 },
            { id: 2, description: 'Main d\'oeuvre et raccords', quantity: 1, unit: 'forfait', price: 258.33 }
        ]
    };

    // Insert Quotes
    await supabase.from('quotes').insert([quote1, quote2, quote3]);
};
