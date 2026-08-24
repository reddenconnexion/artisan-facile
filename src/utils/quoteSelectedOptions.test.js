// Aperçu du portail public : le devis affiché doit être celui qui sera signé.
//
// Cas réel (devis n° 223, client Se Ly Sayeen) : 825,00 € de main d'œuvre ferme,
// 1 356,91 € de fournitures fermes et quatre options (100 + 125 + 80 + 50 =
// 355 €) pré-cochées à l'ouverture du lien public. Le PDF affichait alors
// « Sous-total main d'œuvre 825,00 » + « Sous-total fournitures 1 356,91 » sous
// un « TOTAL HT 2 536,91 » — 355 € introuvables dans le détail, parce que les
// options retenues comptaient dans le total mais restaient marquées is_optional
// (donc exclues des sous-totaux et de l'acompte matériel).
//
// Invariant vérifié ici, celui qu'imprime le PDF :
//   Σ main d'œuvre ferme + Σ fournitures fermes = total_ht.

import { describe, expect, it } from 'vitest';
import { quoteWithSelectedOptions } from './quoteSelectedOptions';
import { materialDepositAmounts } from './materialDeposit';

// Reprise du calcul des sous-totaux du générateur de PDF (pdfGenerator.js) :
// les lignes optionnelles en sont exclues.
const subtotal = (items, matches) => items
    .filter(i => !i.is_optional && matches(i))
    .reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.price) || 0), 0);
const laborSubtotal = (items) => subtotal(items, i => i.type === 'service' || !i.type);
const materialSubtotal = (items) => subtotal(items, i => i.type === 'material');

// Devis 223 réduit à sa structure : fermes + quatre options.
const quote223 = () => ({
    id: 271,
    include_tva: false,
    has_material_deposit: true,
    items: [
        { id: 's1', type: 'section', description: 'Prise de terre' },
        { id: '1', type: 'service', description: 'Création de la prise de terre', quantity: 1, price: 50 },
        { id: '2', type: 'service', description: 'Ouverture et remblaiement de la tranchée', quantity: 2, price: 50, is_optional: true },
        { id: '3', type: 'service', description: 'Liaison de terre', quantity: 2.5, price: 50 },
        { id: '4', type: 'service', description: 'Liaison équipotentielle', quantity: 1, price: 50 },
        { id: '5', type: 'service', description: 'Dépose du tableau existant', quantity: 2, price: 50 },
        { id: '6', type: 'service', description: 'Pose et câblage du tableau', quantity: 4, price: 50 },
        { id: '7', type: 'service', description: 'Circuit dédié prises du couloir', quantity: 1.5, price: 50 },
        { id: '8', type: 'service', description: "Suppression de l'interrupteur", quantity: 0.5, price: 50 },
        { id: '9', type: 'service', description: 'Mise en service et réception', quantity: 2, price: 50 },
        { id: '10', type: 'service', description: 'Déplacement', quantity: 2, price: 50 },
        { id: 'm1', type: 'material', description: 'Fournitures fermes (poste unique du test)', quantity: 1, price: 1356.91 },
        { id: 'm2', type: 'material', description: 'Piquet de terre supplémentaire', quantity: 1, price: 125, is_optional: true },
        { id: 'm3', type: 'material', description: 'Reprise mise à la terre du hangar', quantity: 1, price: 80, is_optional: true },
        { id: 'm4', type: 'material', description: 'Reprise du socle de prise du hangar', quantity: 1, price: 50, is_optional: true },
    ],
    total_ht: 2181.91,
    total_tva: 0,
    total_ttc: 2181.91,
});

describe('quoteWithSelectedOptions', () => {
    it('aucune option retenue : le devis ferme est inchangé (825 + 1356,91 = 2181,91)', () => {
        const q = quoteWithSelectedOptions(quote223(), new Set());

        expect(laborSubtotal(q.items)).toBeCloseTo(825, 2);
        expect(materialSubtotal(q.items)).toBeCloseTo(1356.91, 2);
        expect(q.total_ht).toBeCloseTo(2181.91, 2);
        expect(q.items.some(i => i.is_optional)).toBe(false);
    });

    it('options pré-cochées : elles deviennent fermes, sous-totaux et total retombent juste (devis 223)', () => {
        const selected = new Set(['2', 'm2', 'm3', 'm4']);
        const q = quoteWithSelectedOptions(quote223(), selected);

        // Les 355 € d'options sont désormais VISIBLES dans les sous-totaux…
        expect(laborSubtotal(q.items)).toBeCloseTo(925, 2);        // 825 + 100
        expect(materialSubtotal(q.items)).toBeCloseTo(1611.91, 2); // 1356,91 + 255
        // …et le total ne s'écarte plus de leur somme.
        expect(q.total_ht).toBeCloseTo(2536.91, 2);
        expect(laborSubtotal(q.items) + materialSubtotal(q.items)).toBeCloseTo(q.total_ht, 2);
    });

    it("acompte matériel : le solde retombe sur la main d'œuvre, options comprises", () => {
        const q = quoteWithSelectedOptions(quote223(), new Set(['2', 'm2', 'm3', 'm4']));
        const { materialTTC, balanceTTC } = materialDepositAmounts(q);

        expect(materialTTC).toBeCloseTo(1611.91, 2);
        expect(balanceTTC).toBeCloseTo(925, 2);
    });

    it('sélection non initialisée : toutes les options sont retenues et fermes', () => {
        const q = quoteWithSelectedOptions(quote223(), null);

        expect(q.items.some(i => i.is_optional)).toBe(false);
        expect(q.total_ht).toBeCloseTo(2536.91, 2);
    });

    it('option écartée : sa ligne disparaît du devis et du total', () => {
        const q = quoteWithSelectedOptions(quote223(), new Set(['m2']));

        expect(q.items.find(i => i.id === 'm3')).toBeUndefined();
        expect(q.items.find(i => i.id === '2')).toBeUndefined();
        expect(q.total_ht).toBeCloseTo(2306.91, 2); // 2181,91 + 125
    });

    it('TVA appliquée quand le devis y est soumis', () => {
        const q = quoteWithSelectedOptions({ ...quote223(), include_tva: true }, new Set());

        expect(q.total_tva).toBeCloseTo(436.382, 3);
        expect(q.total_ttc).toBeCloseTo(2618.292, 3);
    });

    it('devis externe : les totaux saisis à la main ne sont pas recalculés', () => {
        const q = quoteWithSelectedOptions({ ...quote223(), is_external: true }, new Set());

        expect(q.total_ht).toBeCloseTo(2181.91, 2);
        expect(q.items.some(i => i.is_optional)).toBe(false);
    });

    it('devis absent : rien à imprimer', () => {
        expect(quoteWithSelectedOptions(null, new Set())).toBeNull();
    });
});
