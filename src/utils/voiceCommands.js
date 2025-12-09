import { addDays, nextDay, setDate, setMonth, startOfToday, isBefore, addYears, addMonths } from 'date-fns';
import { fr } from 'date-fns/locale';

export const processVoiceCommand = (transcript, navigate) => {
    const command = transcript.toLowerCase();
    console.log('Processing command:', command);

    // Navigation
    if (command.includes('aller à') || command.includes('ouvrir')) {
        if (command.includes('agenda') || command.includes('calendrier')) {
            navigate('/app/agenda');
            return 'Ouverture de l\'agenda';
        }
        if (command.includes('client')) {
            navigate('/app/clients');
            return 'Ouverture des clients';
        }
        if (command.includes('devis') || command.includes('facture')) {
            navigate('/app/devis');
            return 'Ouverture des devis';
        }
        if (command.includes('crm') || command.includes('suivi')) {
            navigate('/app/crm');
            return 'Ouverture du CRM';
        }
        if (command.includes('accueil') || command.includes('tableau de bord')) {
            navigate('/app');
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

        navigate('/app/clients/new', { state: { voiceData: data } });
        return `Création du client ${data.name}`;
    }

    if (command.includes('rendez-vous') || command.includes('rdv')) {
        let remainingText = command.replace('rendez-vous', '').replace('rdv', '').trim();
        const data = { title: '', time: '', clientName: '', location: '', dateISO: null };

        // 1. Extract Date
        let targetDate = startOfToday();
        let dateFound = false;

        // Relative dates
        if (remainingText.includes('après-demain')) {
            targetDate = addDays(targetDate, 2);
            remainingText = remainingText.replace('après-demain', '');
            dateFound = true;
        } else if (remainingText.includes('demain')) {
            targetDate = addDays(targetDate, 1);
            remainingText = remainingText.replace('demain', '');
            dateFound = true;
        } else if (remainingText.includes("aujourd'hui")) {
            // Already today
            remainingText = remainingText.replace("aujourd'hui", '');
            dateFound = true;
        }

        // Days of week (lundi, mardi...)
        if (!dateFound) {
            const days = {
                'dimanche': 0, 'lundi': 1, 'mardi': 2, 'mercredi': 3, 'jeudi': 4, 'vendredi': 5, 'samedi': 6
            };
            for (const [dayName, dayIndex] of Object.entries(days)) {
                if (remainingText.includes(dayName)) {
                    // Find next occurrence of this day
                    // If today is Monday and user says "Monday", assume next Monday? Or today?
                    // Let's use nextDay from date-fns which gives next occurrence
                    // But we need to handle "ce lundi" vs "lundi prochain". 
                    // For simplicity, let's just find the next occurrence (or today if it matches and it's early?)
                    // actually nextDay always returns next occurrence.

                    // Simple logic: use nextDay.
                    targetDate = nextDay(targetDate, dayIndex);
                    remainingText = remainingText.replace(dayName, '');
                    dateFound = true;
                    break;
                }
            }
        }

        // Absolute dates "le 12", "le 12 janvier"
        if (!dateFound) {
            const dateMatch = remainingText.match(/le\s+(\d{1,2})(?:\s+([a-zéû]+))?/i);
            if (dateMatch) {
                const day = parseInt(dateMatch[1]);
                const monthName = dateMatch[2];

                if (monthName) {
                    const months = {
                        'janvier': 0, 'février': 1, 'mars': 2, 'avril': 3, 'mai': 4, 'juin': 5,
                        'juillet': 6, 'août': 7, 'septembre': 8, 'octobre': 9, 'novembre': 10, 'décembre': 11
                    };
                    const monthIndex = months[monthName.toLowerCase()];
                    if (monthIndex !== undefined) {
                        targetDate = setMonth(targetDate, monthIndex);
                        targetDate = setDate(targetDate, day);

                        // If date passed, assume next year
                        if (isBefore(targetDate, startOfToday())) {
                            targetDate = addYears(targetDate, 1);
                        }
                    }
                } else {
                    // Just "le 12" -> assume current month, or next month if passed
                    let tempDate = setDate(targetDate, day);
                    if (isBefore(tempDate, startOfToday())) {
                        tempDate = addMonths(tempDate, 1);
                    }
                    targetDate = tempDate;
                }
                remainingText = remainingText.replace(dateMatch[0], '');
                dateFound = true;
            }
        }

        if (dateFound) {
            data.dateISO = targetDate.toISOString();
        }

        // 2. Extract Time (e.g. "14h", "14h30", "14 heures")
        const timeMatch = remainingText.match(/(?:à|vers)?\s*(\d{1,2})\s*(?:h|heure|heures)(?:(\d{2}))?/i);
        if (timeMatch) {
            data.time = `${timeMatch[1].padStart(2, '0')}:${timeMatch[2] || '00'}`;
            remainingText = remainingText.replace(timeMatch[0], '');
        }

        // 3. Extract Client (e.g. "avec Martin", "client Martin")
        const clientMatch = remainingText.match(/(?:avec|client)\s+([^\s]+)(?=\s+(?:à|au|aux|lieu|adresse)|$)/i);
        if (clientMatch) {
            data.clientName = clientMatch[1];
            // Capitalize client name
            data.clientName = data.clientName.charAt(0).toUpperCase() + data.clientName.slice(1);
            remainingText = remainingText.replace(clientMatch[0], '');
        }

        // 4. Extract Location (e.g. "à Paris", "au bureau", "adresse 10 rue...")
        // We look for "à", "au", "aux", "lieu", "adresse" NOT followed by a digit (to avoid confusion with time if regex failed or other numbers)
        const locationMatch = remainingText.match(/(?:à|au|aux|lieu|adresse)\s+(.+?)(?=\s+(?:avec|client)|$)/i);
        if (locationMatch) {
            // Check if it's not a time that slipped through (basic check)
            if (!/^\d/.test(locationMatch[1])) {
                data.location = locationMatch[1].trim();
                remainingText = remainingText.replace(locationMatch[0], '');
            }
        }

        // 5. Title is what remains, cleaned up
        data.title = remainingText.replace(/\s+/g, ' ').trim();
        if (!data.title) {
            data.title = data.clientName ? `RDV avec ${data.clientName}` : 'Nouveau RDV';
        } else {
            // Capitalize title
            data.title = data.title.charAt(0).toUpperCase() + data.title.slice(1);
        }

        navigate('/app/agenda', { state: { voiceData: data } });
        return `Création du rendez-vous${data.clientName ? ` avec ${data.clientName}` : ''}`;
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

        navigate('/app/devis/new', { state: { voiceData: data } });
        return `Nouveau devis${data.clientName ? ` pour ${data.clientName}` : ''}`;
    }

    return null;
};
