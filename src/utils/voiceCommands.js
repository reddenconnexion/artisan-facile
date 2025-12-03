export const processVoiceCommand = (transcript, navigate) => {
    const command = transcript.toLowerCase();
    console.log('Processing command:', command);

    // Navigation
    if (command.includes('aller à') || command.includes('ouvrir')) {
        if (command.includes('agenda') || command.includes('calendrier')) {
            navigate('/agenda');
            return 'Ouverture de l\'agenda';
        }
        if (command.includes('client')) {
            navigate('/clients');
            return 'Ouverture des clients';
        }
        if (command.includes('devis') || command.includes('facture')) {
            navigate('/devis');
            return 'Ouverture des devis';
        }
        if (command.includes('crm') || command.includes('suivi')) {
            navigate('/crm');
            return 'Ouverture du CRM';
        }
        if (command.includes('accueil') || command.includes('tableau de bord')) {
            navigate('/');
            return 'Retour à l\'accueil';
        }
    }

    // Actions
    if (command.includes('nouveau client') || command.includes('ajouter client')) {
        let remainingText = command.replace('nouveau client', '').replace('ajouter client', '').trim();

        const data = { name: '', email: '', phone: '', address: '' };

        // Extract Email
        // Handle "email c'est...", "mail...", and spaces in email (e.g. "martin @ gmail point com")
        const emailMatch = remainingText.match(/(?:email|mail)(?:\s+c'est)?\s+(.+?)(?=\s+(?:téléphone|tel|adresse|habite)|$)/i);
        if (emailMatch) {
            let rawEmail = emailMatch[1];
            // Clean up common voice artifacts in email
            let cleanEmail = rawEmail
                .toLowerCase()
                .replace(/\s+arobase\s+|\s*@\s*/g, '@')
                .replace(/\s+point\s+|\s*\.\s*/g, '.')
                .replace(/\s+/g, ''); // Remove all remaining spaces

            data.email = cleanEmail;
            remainingText = remainingText.replace(emailMatch[0], '');
        }

        // Extract Phone
        const phoneMatch = remainingText.match(/(?:téléphone|tel)(?:\s+c'est)?\s+([\d\s\+\.]+)(?=\s+(?:email|mail|adresse|habite)|$)/i);
        if (phoneMatch) {
            data.phone = phoneMatch[1].trim();
            remainingText = remainingText.replace(phoneMatch[0], '');
        }

        // Extract Address
        // Address is often long and contains spaces, so we take everything until the next keyword or end
        const addressMatch = remainingText.match(/(?:adresse|habite)(?:\s+(?:à|au|aux))?\s+(.+?)(?=\s+(?:email|mail|téléphone|tel)|$)/i);
        if (addressMatch) {
            data.address = addressMatch[1].trim();
            remainingText = remainingText.replace(addressMatch[0], '');
        }

        // The rest is likely the name
        // We clean up any lingering keywords just in case
        data.name = remainingText.replace(/email|mail|téléphone|tel|adresse|habite à/g, '').trim();

        // Capitalize name
        if (data.name) {
            data.name = data.name.charAt(0).toUpperCase() + data.name.slice(1);
        }

        navigate('/clients/new', { state: { voiceData: data } });
        return `Création du client ${data.name}`;
    }

    if (command.includes('rendez-vous') || command.includes('rdv')) {
        // Try to extract time: "Rendez-vous demain à 14h" or "Rendez-vous chantier à 10h"
        // This is a simple parser, could be improved with regex
        const timeMatch = command.match(/(\d{1,2})h(\d{2})?/);
        const time = timeMatch ? `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}` : '';

        // Extract title (everything after "rendez-vous" excluding time)
        let title = command.replace('rendez-vous', '').replace('rdv', '').replace(/à\s*\d{1,2}h(\d{2})?/, '').trim();
        if (!title) title = 'Nouveau RDV';

        navigate('/agenda', { state: { voiceData: { title, time } } });
        return 'Création du rendez-vous';
    }

    if (command.includes('nouveau devis')) {
        let remainingText = command.replace('nouveau devis', '').trim();
        const data = { clientName: '', notes: '' };

        // Check for "pour" or "client" to find client name
        // Example: "Nouveau devis pour Martin peinture"
        const clientMatch = remainingText.match(/(?:pour|client)\s+([^\s]+)(.*)/);

        if (clientMatch) {
            data.clientName = clientMatch[1]; // The word after "pour"
            data.notes = clientMatch[2].trim(); // Everything else is notes/description
        } else {
            // If no "pour", maybe the whole text is notes? Or just open empty.
            // Let's assume if they say "Nouveau devis peinture", "peinture" is notes.
            if (remainingText) {
                data.notes = remainingText;
            }
        }

        // Capitalize client name
        if (data.clientName) {
            data.clientName = data.clientName.charAt(0).toUpperCase() + data.clientName.slice(1);
        }

        navigate('/devis/new', { state: { voiceData: data } });
        return `Nouveau devis${data.clientName ? ` pour ${data.clientName}` : ''}`;
    }

    return null;
};
