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
        // Extract name if present: "Nouveau client Martin"
        const nameMatch = command.match(/client\s+(.+)/);
        const name = nameMatch ? nameMatch[1] : '';
        // Capitalize first letter
        const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

        navigate('/clients/new', { state: { voiceData: { name: formattedName } } });
        return `Création du client ${formattedName}`;
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
        navigate('/devis/new');
        return 'Création d\'un nouveau devis';
    }

    return null;
};
