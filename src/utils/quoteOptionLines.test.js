import { describe, expect, it } from 'vitest';
import { splitQuoteOptionLines } from './quoteOptionLines';

const section = (description) => ({ type: 'section', description });
const line = (description, extra = {}) => ({
    type: 'service', description, quantity: 1, price: 100, ...extra,
});

describe('splitQuoteOptionLines', () => {
    it('sort les options des tableaux et garde les lignes fermes', () => {
        const { firmItems, offeredOptions } = splitQuoteOptionLines([
            line('Pose du tableau'),
            line('Tranchée', { is_optional: true }),
            line('Mise en service'),
        ]);

        expect(firmItems.map(i => i.description)).toEqual(['Pose du tableau', 'Mise en service']);
        expect(offeredOptions.map(i => i.description)).toEqual(['Tranchée']);
    });

    it("préserve l'ordre voulu par l'artisan de chaque côté", () => {
        const { firmItems, offeredOptions } = splitQuoteOptionLines([
            line('A'), line('opt 1', { is_optional: true }),
            line('B'), line('opt 2', { is_optional: true }), line('C'),
        ]);

        expect(firmItems.map(i => i.description)).toEqual(['A', 'B', 'C']);
        expect(offeredOptions.map(i => i.description)).toEqual(['opt 1', 'opt 2']);
    });

    it('rattache chaque option à la section où elle est placée', () => {
        const { offeredOptions } = splitQuoteOptionLines([
            section('Prise de terre'),
            line('Piquet supplémentaire', { is_optional: true }),
            section('Prises et couloir'),
            line('Socle du hangar', { is_optional: true }),
        ]);

        expect(offeredOptions.map(i => [i.description, i.option_section])).toEqual([
            ['Piquet supplémentaire', 'Prise de terre'],
            ['Socle du hangar', 'Prises et couloir'],
        ]);
    });

    it('laisse option_section absent hors de toute section', () => {
        const { offeredOptions } = splitQuoteOptionLines([line('Tranchée', { is_optional: true })]);
        expect(offeredOptions[0]).not.toHaveProperty('option_section');
    });

    // Une option retenue a perdu son flag is_optional (RPC select_quote_options)
    // et redevient une ligne ferme : elle est due, elle reste au tableau.
    it('garde une option retenue du côté ferme', () => {
        const { firmItems, offeredOptions } = splitQuoteOptionLines([
            line('Tranchée', { option_accepted: true }),
        ]);

        expect(firmItems.map(i => i.description)).toEqual(['Tranchée']);
        expect(offeredOptions).toEqual([]);
    });

    // Une option écartée garde is_optional : elle n'est pas due, mais le devis
    // signé doit garder la trace de ce qui avait été proposé.
    it('envoie une option écartée au bloc des options', () => {
        const { firmItems, offeredOptions } = splitQuoteOptionLines([
            line('Tranchée', { is_optional: true, option_declined: true }),
        ]);

        expect(firmItems).toEqual([]);
        expect(offeredOptions.map(i => i.description)).toEqual(['Tranchée']);
    });

    it('conserve les titres de section du côté ferme', () => {
        const { firmItems } = splitQuoteOptionLines([section('Prise de terre'), line('Piquets')]);
        expect(firmItems.map(i => i.type)).toEqual(['section', 'service']);
    });

    it('ne modifie pas les lignes reçues', () => {
        const option = line('Tranchée', { is_optional: true });
        const items = [section('Prise de terre'), option];
        const { offeredOptions } = splitQuoteOptionLines(items);

        expect(offeredOptions[0]).not.toBe(option);
        expect(option).not.toHaveProperty('option_section');
    });

    it('accepte un devis sans lignes', () => {
        expect(splitQuoteOptionLines(undefined)).toEqual({ firmItems: [], offeredOptions: [] });
        expect(splitQuoteOptionLines([])).toEqual({ firmItems: [], offeredOptions: [] });
    });
});
