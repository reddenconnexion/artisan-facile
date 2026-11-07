import MailTemplateEditor from './MailTemplateEditor';
import { buildInvoiceReminderEmail, INVOICE_TEMPLATE_KINDS, invoiceTemplate } from '../utils/unpaidInvoices';

const PLACEHOLDERS = [
    { tag: '{client}', label: 'Nom du client' },
    { tag: '{facture}', label: 'N° de facture' },
    { tag: '{montant}', label: 'Montant' },
    { tag: '{date}', label: 'Date de la facture' },
    { tag: '{echeance}', label: 'Échéance' },
    { tag: '{retard}', label: 'Jours de retard' },
    { tag: '{dernier_rappel}', label: 'Rappel précédent (« du … »)' },
    { tag: '{iban}', label: 'Votre IBAN' },
    { tag: '{indemnite}', label: 'Indemnité 40 € (clients pros)' },
    { tag: '{entreprise}', label: 'Votre entreprise' },
];

// Facture d'exemple pour l'aperçu.
const SAMPLE_INVOICE = { id: 1, invoice_number: 'FAC-2026-0042', date: '2026-10-01', total_ttc: 650, last_followup_at: '2026-11-03T09:00:00Z' };
const SAMPLE_LEVEL = { amiable: 0, ferme: 1, mise_en_demeure: 2 };

/**
 * Les modèles des rappels de factures (aimable, ferme, mise en demeure) :
 * utilisés par le pilote automatique et par les rappels envoyés à la main.
 */
const InvoiceTemplatesEditor = ({ settings, save, profile }) => {
    const saved = settings.invoice_templates || {};
    const store = (key, value) => save({ invoice_templates: { ...saved, [key]: value } });

    return (
        <ul className="mt-1 space-y-0.5">
            {INVOICE_TEMPLATE_KINDS.map(({ key, label, when }) => {
                const tpl = invoiceTemplate(key, settings);
                return (
                    <li key={key}>
                        <MailTemplateEditor
                            buttonLabel={`${label} (${when})`}
                            title={`Rappel de facture : ${label.toLowerCase()} (${when})`}
                            customized={tpl.custom}
                            initial={{ subject: tpl.subject, body: tpl.body }}
                            placeholders={PLACEHOLDERS}
                            help="La ligne de votre IBAN n'est envoyée que s'il est renseigné. L'indemnité de 40 € n'apparaît que pour un client professionnel."
                            renderPreview={({ subject, body }) => buildInvoiceReminderEmail(SAMPLE_INVOICE, {
                                level: SAMPLE_LEVEL[key], daysOverdue: 12, dueDate: new Date('2026-10-31T00:00:00'),
                            }, {
                                client: { name: 'Mme DUPONT' },
                                profile,
                                settings: { invoice_templates: { [key]: { subject, body } } },
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

export default InvoiceTemplatesEditor;
