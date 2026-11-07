import MailTemplateEditor from './MailTemplateEditor';
import { buildQuoteFollowUpEmail, QUOTE_TEMPLATE_KINDS, quoteTemplate } from '../utils/autopilot';

const PLACEHOLDERS = [
    { tag: '{client}', label: 'Nom du client' },
    { tag: '{devis}', label: 'Intitulé du devis' },
    { tag: '{montant}', label: 'Montant' },
    { tag: '{date}', label: "Date d'envoi" },
    { tag: '{lien}', label: 'Lien pour signer' },
    { tag: '{validite}', label: 'Valable jusqu\'au' },
    { tag: '{telephone}', label: 'Votre téléphone' },
    { tag: '{entreprise}', label: 'Votre entreprise' },
];

// Devis d'exemple pour l'aperçu.
const SAMPLE_QUOTE = {
    id: 1, title: 'Mise aux normes du tableau électrique', total_ttc: 1850, date: '2026-11-02', valid_until: '2027-01-31',
};
const SAMPLE_DUE = {
    first: { index: 0 }, middle: { index: 1 }, last: { index: 3, isLast: true }, resume: { index: 0, resumed: true },
};

/**
 * Les modèles des relances de devis, un par moment de la séquence : l'artisan
 * les écrit une fois, l'appli les remplit pour chaque client et chaque devis.
 */
const QuoteTemplatesEditor = ({ settings, save, profile }) => {
    const saved = settings.quote_templates || {};
    const store = (key, value) => save({ quote_templates: { ...saved, [key]: value } });

    return (
        <ul className="mt-1 space-y-0.5">
            {QUOTE_TEMPLATE_KINDS.map(({ key, label, when }) => {
                const tpl = quoteTemplate(key, settings);
                return (
                    <li key={key}>
                        <MailTemplateEditor
                            buttonLabel={`${label} (${when})`}
                            title={`Relance de devis : ${label.toLowerCase()} (${when})`}
                            customized={tpl.custom}
                            initial={{ subject: tpl.subject, body: tpl.body }}
                            placeholders={PLACEHOLDERS}
                            help="Une ligne dont le repère est vide (pas de lien, pas de téléphone, devis expiré) n'est pas envoyée."
                            renderPreview={({ subject, body }) => buildQuoteFollowUpEmail(SAMPLE_QUOTE, SAMPLE_DUE[key], {
                                client: { name: 'Mme DUPONT' },
                                profile,
                                link: 'https://artisanfacile.fr/q/exemple',
                                settings: { quote_templates: { [key]: { subject, body } } },
                                now: new Date('2026-11-10T09:00:00Z'),
                            })}
                            onSave={(value) => store(key, value)}
                            onReset={() => store(key, null)}
                        />
                    </li>
                );
            })}
        </ul>
    );
};

export default QuoteTemplatesEditor;
