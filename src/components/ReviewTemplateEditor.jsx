import MailTemplateEditor from './MailTemplateEditor';
import { buildReviewRequestEmail, DEFAULT_REVIEW_BODY, DEFAULT_REVIEW_SUBJECT } from '../utils/autopilot';

const PLACEHOLDERS = [
    { tag: '{client}', label: 'Nom du client' },
    { tag: '{chantier}', label: 'Intitulé du devis' },
    { tag: '{lien}', label: "Lien d'avis" },
    { tag: '{entreprise}', label: 'Votre entreprise' },
    { tag: '{plateforme}', label: 'Google, Facebook ou PagesJaunes' },
    { tag: '{deja_avis}', label: 'Merci pour un avis déjà laissé (ligne retirée sinon)' },
];

/**
 * Message de la demande d'avis envoyée en fin de chantier (Google, ou
 * Facebook / PagesJaunes pour un client déjà sollicité) : l'artisan
 * l'écrit une fois, l'appli remplace les repères pour chaque client.
 */
const ReviewTemplateEditor = ({ settings, save, profile }) => (
    <MailTemplateEditor
        buttonLabel="Modifier le message envoyé au client"
        title="Demande d'avis (fin de chantier)"
        customized={Boolean(settings.review_subject || settings.review_body)}
        initial={{
            subject: settings.review_subject || DEFAULT_REVIEW_SUBJECT,
            body: settings.review_body || DEFAULT_REVIEW_BODY,
        }}
        placeholders={PLACEHOLDERS}
        help="Si vous retirez {lien}, le lien d'avis est remis en bas du message. Pour Facebook ou PagesJaunes, le mot « Google » de votre message est remplacé par la bonne plateforme."
        renderPreview={({ subject, body }) => buildReviewRequestEmail({ title: 'Remplacement du tableau électrique' }, {
            client: { name: 'Mme DUPONT' },
            profile,
            reviewUrl: profile?.google_review_url || 'https://g.page/r/votre-lien/review',
            settings: { review_subject: subject, review_body: body },
        })}
        onSave={({ subject, body }) => save({ review_subject: subject, review_body: body })}
        onReset={() => save({ review_subject: null, review_body: null })}
    />
);

export default ReviewTemplateEditor;
