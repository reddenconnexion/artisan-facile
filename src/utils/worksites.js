import { supabase } from './supabase';

// Étapes d'un chantier, du devis signé aux travaux terminés. Partagé par la
// page « Pilotage Chantiers » (Kanban/Planning) et le widget du tableau de bord
// pour garantir des libellés, un ordre et des couleurs cohérents.
export const WORKSITE_STAGES = [
    { id: 'pending_deposit', title: 'Attente acompte',   dot: 'bg-red-400',     badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
    { id: 'material_order',  title: 'Commande matériel', dot: 'bg-indigo-400',  badge: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
    { id: 'planned',         title: 'À planifier',       dot: 'bg-blue-400',    badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
    { id: 'in_progress',     title: 'En cours',          dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
    { id: 'completed',       title: 'Terminé',           dot: 'bg-emerald-400', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' },
];

export const WORKSITE_STAGE_MAP = Object.fromEntries(WORKSITE_STAGES.map(s => [s.id, s]));

// Classe automatiquement un chantier selon son contenu (présence de matériel) et
// ses acomptes payés, sans jamais écrire en base : l'étape est dérivée à
// l'affichage pour éviter les boucles avec l'abonnement temps réel.
function deriveStage(q, depositsMap) {
    let autoStage = q.work_stage;
    const hasMaterial = Array.isArray(q.items) && q.items.some(i => i.type === 'material');
    const deposits = depositsMap[q.id] || [];
    const hasPaidDeposit = deposits.some(d => d.status === 'paid');

    // On n'auto-classe que les étapes « amont » ; en_cours / terminé restent tels quels.
    if (!autoStage || autoStage === 'pending_deposit' || autoStage === 'material_order' || autoStage === 'planned') {
        if (hasMaterial) {
            if (hasPaidDeposit) {
                if (!autoStage || autoStage === 'pending_deposit') autoStage = 'material_order';
            } else {
                autoStage = 'pending_deposit';
            }
        } else if (!autoStage || autoStage === 'pending_deposit' || autoStage === 'material_order') {
            autoStage = 'planned';
        }
    }
    return autoStage;
}

/**
 * Récupère les chantiers (devis acceptés / facturés / payés, hors acomptes) avec
 * leur étape courante auto-classée, ainsi que les heures pointées par chantier.
 *
 * @returns {Promise<{ worksites: object[], spentByQuote: Record<number, number> }>}
 */
export async function fetchWorksites() {
    const { data, error } = await supabase
        .from('quotes')
        .select('*, clients(*)')
        .in('status', ['accepted', 'billed', 'paid'])
        .order('updated_at', { ascending: false });
    if (error) throw error;

    // Enfants (acomptes/factures) pour détecter les acomptes payés, et heures pointées.
    const [{ data: allQuotes }, { data: tracking }] = await Promise.all([
        supabase.from('quotes').select('id, parent_id, status, type, total_ttc'),
        supabase.from('task_tracking').select('quote_id, hours_spent'),
    ]);

    const spentByQuote = {};
    for (const t of tracking || []) {
        if (t.quote_id == null) continue;
        spentByQuote[t.quote_id] = (spentByQuote[t.quote_id] || 0) + (Number(t.hours_spent) || 0);
    }

    const depositsMap = {};
    (allQuotes || []).forEach(q => {
        if (q.parent_id && (q.type === 'invoice' || q.status === 'paid')) {
            (depositsMap[q.parent_id] = depositsMap[q.parent_id] || []).push(q);
        }
    });

    const worksites = (data || [])
        .filter(q => q.type === 'quote' && !q.title?.toLowerCase().includes('acompte'))
        .map(q => ({ ...q, work_stage: deriveStage(q, depositsMap) }))
        // Un chantier terminé ET payé n'a plus rien à piloter : il sort du
        // kanban au lieu de s'accumuler indéfiniment dans « Terminé ».
        .filter(q => !(q.work_stage === 'completed' && q.status === 'paid'));

    return { worksites, spentByQuote };
}
