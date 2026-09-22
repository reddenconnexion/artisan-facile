import { describe, it, expect } from 'vitest';
import { parseQuoteItemVoice, normalizeSpokenNumbers } from './voiceParser';

describe('normalizeSpokenNumbers', () => {
    it('convertit les nombres dictés en lettres', () => {
        expect(normalizeSpokenNumbers('deux prises')).toBe('2 prises');
        expect(normalizeSpokenNumbers('vingt-cinq mètres')).toBe('25 mètres');
        expect(normalizeSpokenNumbers('quatre-vingt-dix euros')).toBe('90 euros');
        expect(normalizeSpokenNumbers('trente et un spots')).toBe('31 spots');
        expect(normalizeSpokenNumbers('deux cent cinquante euros')).toBe('250 euros');
    });

    it('laisse les articles et l’adjectif « neuf »', () => {
        expect(normalizeSpokenNumbers('une prise')).toBe('une prise');
        expect(normalizeSpokenNumbers('tableau neuf à 500 euros')).toBe('tableau neuf à 500 euros');
        expect(normalizeSpokenNumbers('pose de neuf prises')).toBe('pose de 9 prises');
    });
});

describe('parseQuoteItemVoice', () => {
    it('retourne null sur une dictée vide', () => {
        expect(parseQuoteItemVoice('')).toBeNull();
        expect(parseQuoteItemVoice('   ')).toBeNull();
    });

    it('quantité au milieu de la phrase', () => {
        expect(parseQuoteItemVoice('Pose de 10 prises doubles à 45 euros')).toEqual({
            description: 'Pose de prises doubles', quantity: 10, unit: 'u', price: 45, type: 'service',
        });
    });

    it('mètres de câble avec référence et prix au mètre', () => {
        expect(parseQuoteItemVoice('50 mètres de câble 3G2,5 à 1,20 euro le mètre')).toEqual({
            description: 'Câble 3G2,5', quantity: 50, unit: 'ml', price: 1.2, type: 'service',
        });
    });

    it("n'interprète pas les grandeurs techniques comme une quantité", () => {
        const r = parseQuoteItemVoice('Disjoncteur différentiel 30 mA type A à 65 €');
        expect(r).toMatchObject({ quantity: 1, unit: 'u', price: 65 });
        expect(r.description).toBe('Disjoncteur différentiel 30 mA type A');

        expect(parseQuoteItemVoice('2 disjoncteurs 16 A à 12 euros')).toMatchObject({
            quantity: 2, price: 12, description: 'Disjoncteurs 16 A',
        });
        expect(parseQuoteItemVoice('Câble 2,5 mm² 100 mètres à 1 euro')).toMatchObject({
            quantity: 100, unit: 'ml', price: 1,
        });
    });

    it('main d’œuvre à l’heure', () => {
        expect(parseQuoteItemVoice("Main d'œuvre 3 heures à 45 euros de l'heure")).toEqual({
            description: "Main d'œuvre", quantity: 3, unit: 'h', price: 45, type: 'service',
        });
    });

    it('nombres en lettres et prix total réparti', () => {
        expect(parseQuoteItemVoice('Cinq spots LED pour 200 euros en tout')).toMatchObject({
            description: 'Spots LED', quantity: 5, price: 40,
        });
    });

    it('forfait', () => {
        expect(parseQuoteItemVoice('Tableau électrique complet forfait 850 euros')).toMatchObject({
            description: 'Tableau électrique complet', quantity: 1, unit: 'forfait', price: 850,
        });
    });

    it('centimes dits après « euros »', () => {
        expect(parseQuoteItemVoice('Interrupteur va-et-vient à 12 euros 50 pièce')).toMatchObject({
            description: 'Interrupteur va-et-vient', price: 12.5,
        });
    });

    it('fourniture → ligne matériel', () => {
        expect(parseQuoteItemVoice('Fourniture de 2 boîtes de dérivation à 3 euros')).toMatchObject({
            type: 'material', quantity: 2, price: 3,
        });
    });

    it('reste compatible avec les anciens exemples', () => {
        expect(parseQuoteItemVoice('Pose de carrelage 40m2 à 50 euros')).toMatchObject({
            description: 'Pose de carrelage', quantity: 40, unit: 'm²', price: 50,
        });
        expect(parseQuoteItemVoice('3 pots de peinture blanche')).toMatchObject({
            description: 'Pots de peinture blanche', quantity: 3, price: 0,
        });
    });
});
