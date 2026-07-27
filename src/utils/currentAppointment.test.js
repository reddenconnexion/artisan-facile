import { describe, it, expect } from 'vitest';
import {
    eventStart,
    isWorksiteEvent,
    pickCurrentEvent,
    worksiteForEvent,
    eventLabel,
} from './currentAppointment';

const day = '2026-07-27';
const at = (time) => new Date(`${day}T${time}:00`);

const rdv = (time, extra = {}) => ({
    id: `${time}`,
    title: `RDV ${time}`,
    date: `${day}T00:00:00Z`,
    time,
    client_id: 1,
    ...extra,
});

describe('eventStart', () => {
    it('utilise start_time quand il est renseigné', () => {
        const start = eventStart({ start_time: `${day}T08:30:00`, time: '14:00' });
        expect(start.getHours()).toBe(8);
        expect(start.getMinutes()).toBe(30);
    });

    it('combine la date du RDV et son heure', () => {
        const start = eventStart(rdv('09:15'));
        expect(start.getHours()).toBe(9);
        expect(start.getMinutes()).toBe(15);
    });

    it('renvoie null pour un RDV sans heure', () => {
        expect(eventStart({ date: `${day}T00:00:00Z` })).toBeNull();
        expect(eventStart(null)).toBeNull();
    });
});

describe('isWorksiteEvent', () => {
    it('retient les RDV menant à un chantier', () => {
        expect(isWorksiteEvent({ quote_id: 5 })).toBe(true);
        expect(isWorksiteEvent({ client_id: 2 })).toBe(true);
        expect(isWorksiteEvent({ client_name: 'Dupont' })).toBe(true);
    });

    it('écarte les RDV personnels', () => {
        expect(isWorksiteEvent({ title: 'Déjeuner' })).toBe(false);
        expect(isWorksiteEvent(null)).toBe(false);
    });
});

describe('pickCurrentEvent', () => {
    const events = [rdv('08:00'), rdv('11:00'), rdv('15:00')];

    it('prend le RDV commencé le plus récemment', () => {
        expect(pickCurrentEvent(events, at('12:30')).time).toBe('11:00');
    });

    it('prend le RDV suivant dès une heure avant', () => {
        expect(pickCurrentEvent(events, at('10:15')).time).toBe('11:00');
        expect(pickCurrentEvent(events, at('09:45')).time).toBe('08:00');
    });

    it('prend le premier RDV avant le début de journée', () => {
        expect(pickCurrentEvent(events, at('06:00')).time).toBe('08:00');
    });

    it('reste sur le dernier RDV en fin de journée', () => {
        expect(pickCurrentEvent(events, at('19:00')).time).toBe('15:00');
    });

    it('ignore les RDV personnels sans client ni devis', () => {
        const withLunch = [rdv('08:00'), { id: 'x', title: 'Déjeuner', date: `${day}T00:00:00Z`, time: '12:00' }];
        expect(pickCurrentEvent(withLunch, at('13:00')).time).toBe('08:00');
    });

    it('accepte un RDV sans heure faute de mieux, et rien s\'il n\'y a pas d\'agenda', () => {
        const allDay = { id: 'z', client_id: 3, date: `${day}T00:00:00Z` };
        expect(pickCurrentEvent([allDay], at('10:00'))).toBe(allDay);
        expect(pickCurrentEvent([], at('10:00'))).toBeNull();
        expect(pickCurrentEvent(null, at('10:00'))).toBeNull();
    });

    it('ne dépend pas de l\'ordre de l\'agenda', () => {
        const shuffled = [rdv('15:00'), rdv('08:00'), rdv('11:00')];
        expect(pickCurrentEvent(shuffled, at('12:30')).time).toBe('11:00');
    });
});

describe('worksiteForEvent', () => {
    const worksites = [
        { id: 10, title: 'Rénovation', client_id: 1, client_name: 'Dupont' },
        { id: 20, title: 'Tableau', client_id: 2, client_name: 'Martin' },
    ];

    it('privilégie le devis explicitement lié au RDV', () => {
        const event = { quote_id: 20, client_id: 1 };
        expect(worksiteForEvent(worksites, event).id).toBe(20);
    });

    it('retombe sur le chantier du client quand le RDV n\'a pas de devis', () => {
        expect(worksiteForEvent(worksites, { client_id: 2 }).id).toBe(20);
    });

    it('retombe sur le nom du client en dernier recours', () => {
        expect(worksiteForEvent(worksites, { client_name: '  dupont ' }).id).toBe(10);
    });

    it('ne renvoie rien quand le devis lié est absent de la liste', () => {
        // Le composant va alors le charger explicitement.
        expect(worksiteForEvent(worksites, { quote_id: 99 })).toBeNull();
        expect(worksiteForEvent(worksites, null)).toBeNull();
    });
});

describe('eventLabel', () => {
    it('décrit le RDV par son heure et son client', () => {
        expect(eventLabel(rdv('09:00', { client_name: 'Dupont' }))).toBe('RDV 09:00 · Dupont');
    });

    it('se rabat sur le titre et gère l\'absence d\'heure', () => {
        expect(eventLabel({ client_id: 1, title: 'Chantier Martin' })).toBe('RDV · Chantier Martin');
        expect(eventLabel(null)).toBe('');
    });
});
