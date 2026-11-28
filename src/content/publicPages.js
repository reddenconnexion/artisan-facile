// Pages publiques de contenu (référencement Google et assistants IA).
//
// Source unique : ces données servent à la fois
//   - au composant React (src/pages/ContentPage.jsx) pour les humains,
//   - au pré-rendu HTML statique à la construction (src/content/prerender.js,
//     branché dans vite.config.js) pour les robots qui n'exécutent pas JS,
//   - au sitemap, au llms.txt et aux tests (src/utils/landingSeo.test.js).
//
// Syntaxe en ligne dans les textes : **gras** et [libellé](/lien).
// Fichier sans React ni import.meta.env : vite.config.js l'importe en Node.

export const SITE_URL = 'https://artisanfacile.fr';
export const SITE_NAME = 'Artisan Facile';
export const DEFAULT_TITLE = 'Artisan Facile | Logiciel Gratuit pour Artisans — Devis, Facturation & Gestion';
export const DEFAULT_DESCRIPTION = "Logiciel 100% gratuit pour artisans débutants et auto-entrepreneurs. Devis pro en 2 min, facturation conforme Factur-X 2026, agenda, CRM — tout en un. Démarrez sans carte bancaire, sans engagement.";

// Titres et descriptions des pages React existantes (point d'entrée unique
// pour usePageMeta ; les pages de contenu ci-dessous ont les leurs).
export const ROUTE_META = {
    '/': { title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
    '/login': {
        title: 'Connexion | Artisan Facile',
        description: "Connectez-vous à votre espace Artisan Facile : devis, factures, agenda et clients, depuis votre téléphone ou votre ordinateur.",
    },
    '/register': {
        title: 'Créer un compte gratuit | Artisan Facile',
        description: "Inscription gratuite en 30 secondes, sans carte bancaire. Créez votre premier devis professionnel d'artisan dès aujourd'hui.",
    },
    '/mentions-legales': {
        title: 'Mentions légales | Artisan Facile',
        description: "Éditeur, hébergement, propriété intellectuelle et données personnelles du site artisanfacile.fr.",
    },
    '/politique-confidentialite': {
        title: 'Politique de confidentialité | Artisan Facile',
        description: "Quelles données Artisan Facile collecte, pourquoi, combien de temps, et vos droits RGPD.",
    },
};

const CTA_DEFAULT = {
    title: 'Essayez gratuitement, sans carte bancaire',
    text: "Le plan Essentiel est gratuit pour toujours : devis et factures illimités, agenda, clients, bibliothèque de prix, mode hors ligne. Compte créé en 30 secondes.",
    button: 'Créer mon compte gratuit',
    href: '/register',
};

export const PUBLIC_PAGES = [
    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'logiciel-devis-electricien',
        kind: 'trade',
        title: 'Logiciel de devis et facture pour électricien, gratuit | Artisan Facile',
        description: "Devis d'électricien en 2 minutes depuis le chantier : bibliothèque tableau, appareillage, câblage pré-remplie, mentions légales automatiques, facture Factur-X 2026. Gratuit, sans carte bancaire.",
        kicker: 'Pour les électriciens',
        h1: "Le logiciel de devis et de facturation pensé pour les électriciens",
        lead: "Conçu par un électricien en activité depuis 25 ans, Artisan Facile vous fait chiffrer une mise aux normes, un tableau ou un dépannage depuis le chantier, en 2 minutes, avec une bibliothèque de prix déjà remplie pour votre métier. Gratuit, sans carte bancaire.",
        published: '2026-11-27',
        updated: '2026-11-27',
        sections: [
            {
                heading: "Un devis d'électricien, ce n'est pas un devis comme les autres",
                paragraphs: [
                    "Entre le tableau, les circuits, l'appareillage, les gaines, le câblage et la main-d'œuvre, un devis électrique compte vite trente lignes. Le client, lui, veut un prix tout de suite — souvent pendant que vous êtes encore chez lui. Les logiciels généralistes vous obligent à tout ressaisir ; les devis sur papier ou sur Word font perdre une heure le soir et oublient une mention légale sur deux.",
                    "Artisan Facile part de ce que fait vraiment un électricien : des interventions courtes à chiffrer vite (dépannage, remplacement de tableau, ajout de prises), des chantiers plus longs à décomposer par pièce ou par circuit (rénovation complète, extension, maison neuve), et des fournitures dont le prix change d'une semaine à l'autre chez le grossiste.",
                ],
            },
            {
                heading: 'Ce que vous trouvez dès la création du compte',
                bullets: [
                    "**Une bibliothèque électricité pré-remplie** : tableau et protections (disjoncteurs, différentiels, parafoudre), appareillage (prises, interrupteurs, va-et-vient), gaines et câblage, éclairage, domotique, et les temps de main-d'œuvre associés. Vous ajustez vos prix une fois, ils sont mémorisés.",
                    "**Des devis prêts à signer** : logo, SIRET, assurance décennale, TVA ou mention « TVA non applicable, art. 293 B du CGI », durée de validité, conditions de paiement — tout est inséré automatiquement. Le client signe depuis son téléphone.",
                    "**Un plan électrique** à dessiner depuis la tablette ou l'ordinateur : pièces, points lumineux, prises, circuits, câbles attachés aux symboles. Pratique pour la rénovation complète comme pour expliquer un projet au client.",
                    "**Des étiquettes de tableau** à imprimer : le repérage des circuits se fait depuis le devis, sans ressaisie.",
                    "**Des rapports d'intervention** avec photos avant / après, pour les dépannages et les remises aux normes : le client comprend ce qu'il a payé, vous gardez une trace.",
                    "**Le mode hors ligne** : en sous-sol, dans un local technique ou en campagne, vous créez et modifiez vos devis sans réseau ; tout se synchronise ensuite.",
                ],
            },
            {
                heading: 'Les cas concrets du quotidien',
                sub: [
                    {
                        heading: 'Dépannage électrique',
                        paragraphs: [
                            "Au-delà de 150 € TTC, le devis écrit est obligatoire avant toute intervention de dépannage ou de réparation chez un particulier (arrêté du 24 janvier 2017). Avec la bibliothèque, un devis de dépannage se fait en trois lignes : déplacement, main-d'œuvre, fourniture. Vous l'envoyez par e-mail ou SMS, le client signe, vous intervenez. La facture se génère en un clic à la fin.",
                        ],
                    },
                    {
                        heading: 'Remplacement ou mise aux normes du tableau',
                        paragraphs: [
                            "Partez d'un ouvrage « tableau 2 rangées » ou « 3 rangées » déjà composé (coffret, différentiels 30 mA type A et AC, disjoncteurs, peignes, bornier de terre, main-d'œuvre), puis adaptez le nombre de circuits. Les quantités se recalculent, le total suit. Vous pouvez indiquer dans les réserves la nécessité d'une attestation Consuel ou de la mise à la terre à reprendre.",
                        ],
                    },
                    {
                        heading: 'Rénovation complète ou maison neuve',
                        paragraphs: [
                            "Décomposez le devis par pièce ou par lot (tableau, circuits prises, éclairage, chauffage, VMC, réseau), avec sous-totaux. Prévoyez un échéancier : acompte à la commande, situation intermédiaire, solde à la réception. Les avenants en cours de chantier s'ajoutent sans refaire le devis.",
                        ],
                    },
                ],
            },
            {
                heading: 'Après le devis : se faire payer sans courir',
                paragraphs: [
                    "Le tableau de bord vous montre qui doit quoi et depuis combien de jours. Avec le plan Pro, les devis non signés sont relancés automatiquement à J+7, J+14 et J+21 et les factures en retard sont réclamées pour vous — aimablement d'abord, fermement ensuite. Vos factures sont déjà au format **Factur-X 1.08**, exigé par la [réforme de la facturation électronique](/facture-electronique-artisan-2026) : rien à changer en septembre 2026.",
                ],
            },
            {
                heading: 'Combien ça coûte ?',
                paragraphs: [
                    "Le plan Essentiel est **gratuit, pour toujours**, sans carte bancaire : devis et factures illimités, bibliothèque, agenda, clients, mode hors ligne, signature électronique, Factur-X. Le plan Pro (14,99 €/mois, 30 jours d'essai) ajoute le pilote automatique : relances, demandes d'avis Google, point du soir, dictée vocale illimitée. Les 50 premiers abonnés bénéficient du tarif fondateur à 9,90 €/mois à vie.",
                ],
            },
        ],
        faq: [
            {
                q: "Le logiciel contient-il déjà des prix pour l'électricité ?",
                a: "Oui. À la création du compte, en choisissant « Électricien », vous recevez une bibliothèque de fournitures et de main-d'œuvre classée par catégories : tableau, appareillage, gaines, câblage, éclairage, domotique. Les prix sont indicatifs ; vous les ajustez à vos tarifs de grossiste et ils restent mémorisés.",
            },
            {
                q: "Puis-je faire un devis électrique depuis mon téléphone, chez le client ?",
                a: "Oui, c'est l'usage principal. L'application fonctionne sur iPhone, Android, tablette et ordinateur, même sans réseau. Vous sélectionnez vos prestations, ajustez les quantités, et le devis part par e-mail avec un lien de signature en ligne.",
            },
            {
                q: "Les mentions obligatoires d'un devis d'électricien sont-elles gérées ?",
                a: "Oui : identité et SIRET de l'entreprise, assurance décennale, TVA ou franchise en base, date, durée de validité, conditions de paiement, détail des prestations avec quantités et prix unitaires, total HT et TTC, espace de signature « bon pour accord ». Voir notre guide des mentions obligatoires d'un devis.",
            },
            {
                q: "Est-ce vraiment gratuit pour un électricien auto-entrepreneur ?",
                a: "Oui. Le plan Essentiel ne coûte rien et n'est pas limité dans le temps ni en nombre de devis. Le plan Pro est optionnel et sert à automatiser les relances et la demande d'avis.",
            },
        ],
        related: ['facture-electronique-artisan-2026', 'devis-auto-entrepreneur-mentions-obligatoires', 'a-propos'],
        cta: CTA_DEFAULT,
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'logiciel-devis-plombier',
        kind: 'trade',
        title: 'Logiciel de devis et facture pour plombier, gratuit | Artisan Facile',
        description: "Devis de plombier en 2 minutes : bibliothèque tuyauterie, sanitaire, chauffage pré-remplie, acompte, photos avant/après, facture Factur-X 2026. Gratuit, sans carte bancaire, fonctionne hors ligne.",
        kicker: 'Pour les plombiers et chauffagistes',
        h1: "Le logiciel de devis et de facturation pensé pour les plombiers",
        lead: "Fuite à réparer dans l'heure, chauffe-eau à remplacer, salle de bain à refaire : trois devis très différents, un seul outil. Artisan Facile vous les fait chiffrer depuis le chantier, avec une bibliothèque plomberie déjà remplie, l'acompte et la facture qui suivent. Gratuit, sans carte bancaire.",
        published: '2026-11-27',
        updated: '2026-11-27',
        sections: [
            {
                heading: 'Le devis de plomberie se fait souvent dans l\'urgence',
                paragraphs: [
                    "Un plombier passe une bonne partie de sa journée en dépannage : le client appelle, vous intervenez, et il faut un devis écrit avant de commencer dès que l'intervention dépasse 150 € TTC. Le reste du temps, ce sont des chantiers plus longs — salle de bain, remplacement de chaudière ou de chauffe-eau, création de réseau — où le devis doit être détaillé, prévoir un acompte et résister aux imprévus découverts en ouvrant les murs.",
                    "Artisan Facile a été conçu par un artisan pour ces deux réalités : chiffrer vite et proprement sur place, puis suivre le chantier, les acomptes et les avenants sans paperasse le soir.",
                ],
            },
            {
                heading: 'Ce que vous trouvez dès la création du compte',
                bullets: [
                    "**Une bibliothèque plomberie pré-remplie** : tuyauterie (cuivre, PER, multicouche), raccords, sanitaire (WC, lavabo, douche, baignoire), chauffage (radiateurs, chauffe-eau, circulateurs), évacuations, et les temps de main-d'œuvre. Vos prix remplacent les prix indicatifs et restent mémorisés.",
                    "**Des devis prêts à signer** : logo, SIRET, assurance décennale, TVA au bon taux ou mention de franchise en base, durée de validité, conditions de paiement, signature en ligne par le client.",
                    "**Un acompte et un échéancier** : 30 % à la commande, solde à la réception — l'acompte se facture et se suit comme le reste.",
                    "**Des photos avant / après** attachées au chantier et au rapport d'intervention : utiles pour justifier une fuite réparée, un remplacement de pièce ou une malfaçon découverte.",
                    "**Le mode hors ligne** : dans une cave, un vide sanitaire ou un local chaufferie sans réseau, vous continuez à travailler ; la synchronisation se fait au retour du signal.",
                    "**Les commandes fournisseurs rattachées au devis**, pour connaître la marge réelle de chaque chantier, pas seulement la marge théorique.",
                ],
            },
            {
                heading: 'Les cas concrets du quotidien',
                sub: [
                    {
                        heading: 'Dépannage : fuite, WC bouché, chauffe-eau en panne',
                        paragraphs: [
                            "Trois lignes suffisent : déplacement, main-d'œuvre, pièce. Le devis part par SMS ou e-mail, le client signe sur son téléphone, vous intervenez, et la facture se génère en un clic depuis le devis signé. Pour les petites interventions en dessous de 150 € TTC, la facture seule suffit, le devis reste conseillé.",
                        ],
                    },
                    {
                        heading: 'Remplacement de chauffe-eau ou de chaudière',
                        paragraphs: [
                            "Partez d'un ouvrage composé (appareil, groupe de sécurité, raccords, dépose et évacuation de l'ancien, mise en service) et ajustez. Indiquez le taux de TVA applicable au logement (taux réduit possible en rénovation d'un logement de plus de deux ans, sur attestation du client) et joignez vos conditions.",
                        ],
                    },
                    {
                        heading: 'Salle de bain complète',
                        paragraphs: [
                            "Décomposez par lot : dépose, alimentation et évacuation, sanitaire, robinetterie, finitions. Prévoyez l'acompte, les situations intermédiaires et le solde. Quand le client change d'avis sur la douche ou qu'une canalisation se révèle à remplacer, l'avenant s'ajoute au devis d'origine sans tout refaire, et la marge réelle se met à jour.",
                        ],
                    },
                ],
            },
            {
                heading: 'Après le devis : se faire payer sans courir',
                paragraphs: [
                    "Le tableau de bord des impayés montre qui doit quoi et depuis quand. Avec le plan Pro, les devis sans réponse sont relancés automatiquement et les factures en retard réclamées pour vous. Vos factures sont au format **Factur-X 1.08** : vous êtes déjà prêt pour la [facturation électronique obligatoire](/facture-electronique-artisan-2026).",
                ],
            },
            {
                heading: 'Combien ça coûte ?',
                paragraphs: [
                    "Le plan Essentiel est **gratuit, pour toujours**, sans carte bancaire : devis et factures illimités, bibliothèque, agenda, clients, acomptes, mode hors ligne, signature électronique, Factur-X. Le plan Pro (14,99 €/mois, 30 jours d'essai) ajoute les relances automatiques, les demandes d'avis Google, le point du soir et la dictée vocale illimitée.",
                ],
            },
        ],
        faq: [
            {
                q: "La bibliothèque contient-elle les fournitures de plomberie ?",
                a: "Oui. En choisissant « Plombier » ou « Chauffagiste » à l'inscription, vous recevez une bibliothèque classée par catégories : tuyauterie, raccords, sanitaire, chauffage, évacuations, main-d'œuvre. Les prix sont indicatifs et se remplacent par les vôtres.",
            },
            {
                q: "Puis-je demander un acompte sur un devis de plomberie ?",
                a: "Oui. Vous définissez un échéancier (par exemple 30 % à la commande, solde à la réception). L'acompte fait l'objet d'une facture d'acompte et le solde se calcule automatiquement.",
            },
            {
                q: "Comment gérer la TVA à 10 % ou 5,5 % en rénovation ?",
                a: "Vous indiquez le taux applicable sur le devis. Le taux réduit s'applique aux travaux dans un logement achevé depuis plus de deux ans, sur attestation du client que vous conservez ; le taux normal s'applique sinon. En franchise en base (micro-entreprise sous les seuils), la mention « TVA non applicable, art. 293 B du CGI » est insérée automatiquement.",
            },
            {
                q: "Ça fonctionne sans réseau dans une cave ou un vide sanitaire ?",
                a: "Oui. L'application fonctionne hors ligne : vous créez et modifiez vos devis, rapports et photos sans connexion ; tout se synchronise dès que le réseau revient.",
            },
        ],
        related: ['facture-electronique-artisan-2026', 'devis-auto-entrepreneur-mentions-obligatoires', 'a-propos'],
        cta: CTA_DEFAULT,
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'logiciel-devis-macon',
        kind: 'trade',
        title: 'Logiciel de devis et facture pour maçon, gratuit | Artisan Facile',
        description: "Devis de maçonnerie par lot (terrassement, fondations, élévation, dalle), quantités au m², m³ et ml, acomptes et situations, avenants, photos de chantier, facture Factur-X 2026. Gratuit, sans carte bancaire.",
        kicker: 'Pour les maçons',
        h1: "Le logiciel de devis et de facturation pensé pour les maçons",
        lead: "Un mur de clôture, une extension, une dalle ou une ouverture dans un porteur : le devis de maçonnerie se chiffre en m², m³ et mètres linéaires, par lot, avec des acomptes et des imprévus une fois le sol ouvert. Artisan Facile est fait pour ça — depuis le chantier, gratuitement.",
        published: '2026-11-28',
        updated: '2026-11-28',
        sections: [
            {
                heading: 'Le devis de maçonnerie se construit par lot',
                paragraphs: [
                    "Terrassement, fondations, élévation, plancher, enduit : un chantier de maçonnerie s'organise en lots successifs, chacun avec ses quantités (m³ de béton, m² de parpaings, ml de chaînage, kg de ferraillage) et sa main-d'œuvre. Le client veut voir ces lots séparément pour comparer, et vous avez besoin de sous-totaux pour suivre l'avancement et facturer par situations.",
                    "Artisan Facile vous laisse composer le devis par lots avec sous-totaux, à partir d'ouvrages déjà composés (fourniture + main-d'œuvre), et transformer chaque étape franchie en facture de situation.",
                ],
            },
            {
                heading: 'Ce que vous trouvez dès la création du compte',
                bullets: [
                    "**Une bibliothèque maçonnerie pré-remplie** : matériaux (parpaings, briques, ciment, sable, gravier, béton prêt à l'emploi), ferraillage (treillis, aciers HA), et les temps de main-d'œuvre, avec les unités du métier (m², m³, ml, sac, tonne). Vous ajustez à vos prix négociés, ils restent mémorisés.",
                    "**Des devis prêts à signer** : logo, SIRET, **assurance décennale** (obligatoire et contrôlée en maçonnerie), TVA au bon taux, durée de validité, conditions de paiement, signature électronique du client.",
                    "**Acomptes et situations de travaux** : 30 % à la commande, situations à l'avancement, solde à la réception. Chaque situation donne une facture, le solde se calcule tout seul.",
                    "**Avenants** : une fondation plus profonde que prévu, un réseau découvert en creusant, un mur à reprendre — l'avenant s'ajoute au devis signé, le client le signe à son tour, et la marge réelle du chantier se met à jour.",
                    "**Photos de chantier** datées et rattachées à l'affaire : ferraillage avant coulage, drainage avant remblai. Une preuve en cas de litige, et un support pour expliquer au client ce qui est enterré.",
                    "**Le mode hors ligne** : un terrain en bout de chemin sans réseau n'empêche pas de faire le devis sur place.",
                ],
            },
            {
                heading: 'Les cas concrets du quotidien',
                sub: [
                    {
                        heading: 'Mur de clôture ou muret',
                        paragraphs: [
                            "Longueur × hauteur, fondation au ml, parpaings au m², chaînages, enduit ou couvertine : avec les ouvrages composés, le devis tient en cinq lignes et se recalcule quand le client change la hauteur.",
                        ],
                    },
                    {
                        heading: 'Extension ou garage',
                        paragraphs: [
                            "Un lot par étape, un sous-total par lot, un échéancier de situations. Le permis, l'étude de sol ou la mission du bureau d'études se notent dans les réserves du devis pour clarifier ce qui est — et n'est pas — compris.",
                        ],
                    },
                    {
                        heading: 'Ouverture dans un mur porteur, reprise en sous-œuvre',
                        paragraphs: [
                            "Étaiement, découpe, pose d'IPN ou de linteau, reprise des enduits : décrivez précisément et réservez l'étude structure. Les photos avant/après et le rapport d'intervention documentent le travail réalisé.",
                        ],
                    },
                ],
            },
            {
                heading: 'TVA et conformité',
                paragraphs: [
                    "En rénovation d'un logement de plus de deux ans, le taux réduit de TVA peut s'appliquer sur attestation du client ; une extension ou une construction neuve reste au taux normal. Vous indiquez le taux sur le devis, et la mention « TVA non applicable, art. 293 B du CGI » s'insère automatiquement si vous êtes en franchise en base. Vos factures sont au format **Factur-X 1.08** : vous êtes déjà prêt pour la [facturation électronique](/facture-electronique-artisan-2026).",
                ],
            },
            {
                heading: 'Combien ça coûte ?',
                paragraphs: [
                    "Le plan Essentiel est **gratuit, pour toujours**, sans carte bancaire : devis et factures illimités, situations, acomptes, bibliothèque, agenda, clients, photos, mode hors ligne. Le plan Pro (14,99 €/mois, 30 jours d'essai) relance pour vous les devis sans réponse et les factures en retard, et demande les avis Google à la fin du chantier.",
                ],
            },
        ],
        faq: [
            {
                q: "Puis-je facturer par situations de travaux ?",
                a: "Oui. Vous définissez un échéancier sur le devis (acompte, situations à l'avancement, solde) ; chaque étape devient une facture, et le reste à payer se calcule automatiquement.",
            },
            {
                q: "Comment gérer un imprévu découvert en cours de chantier ?",
                a: "Par un avenant : il s'ajoute au devis signé, le client le signe en ligne, et la marge réelle du chantier est recalculée. Le devis d'origine n'est pas modifié.",
            },
            {
                q: "Les unités du métier (m³, m², ml, tonne) sont-elles prévues ?",
                a: "Oui. Chaque ligne de la bibliothèque a son unité ; vous pouvez en ajouter. Les quantités se saisissent dans l'unité de la ligne et le total suit.",
            },
            {
                q: "L'assurance décennale apparaît-elle sur mes devis ?",
                a: "Oui. Renseignée une fois dans votre profil (assureur, numéro de contrat, zone couverte), elle figure automatiquement sur chaque devis et chaque facture, comme la loi l'exige pour les travaux soumis à la garantie décennale.",
            },
        ],
        related: ['devis-auto-entrepreneur-mentions-obligatoires', 'facture-electronique-artisan-2026', 'a-propos'],
        cta: CTA_DEFAULT,
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'logiciel-devis-peintre',
        kind: 'trade',
        title: 'Logiciel de devis et facture pour peintre en bâtiment, gratuit | Artisan Facile',
        description: "Devis de peinture au m² par pièce : préparation, enduits, couches, protection, bibliothèque pré-remplie, photos avant/après, TVA rénovation, facture Factur-X 2026. Gratuit, sans carte bancaire, fonctionne sur téléphone.",
        kicker: 'Pour les peintres en bâtiment',
        h1: "Le logiciel de devis et de facturation pensé pour les peintres",
        lead: "Un devis de peinture, c'est des surfaces, un état des supports et un nombre de couches — pièce par pièce. Artisan Facile vous le fait chiffrer sur place, au m², avec la préparation que le client ne voit pas mais qui fait la différence. Gratuit, sans carte bancaire.",
        published: '2026-11-28',
        updated: '2026-11-28',
        sections: [
            {
                heading: 'Le devis de peinture se joue sur la préparation',
                paragraphs: [
                    "Deux devis pour la même pièce peuvent varier du simple au double, et la différence tient rarement à la peinture : lessivage, rebouchage, enduit, ponçage, sous-couche, protection des sols et des meubles. Un devis qui détaille cette préparation justifie son prix et évite la discussion à la fin du chantier.",
                    "Artisan Facile vous permet de décrire chaque pièce (murs, plafond, boiseries, radiateurs) avec ses surfaces et son état, à partir d'ouvrages composés qui incluent la préparation, la fourniture et la main-d'œuvre.",
                ],
            },
            {
                heading: 'Ce que vous trouvez dès la création du compte',
                bullets: [
                    "**Une bibliothèque peinture pré-remplie** : peintures (acrylique, glycéro, façade, laque), enduits de rebouchage et de lissage, protection (bâches, adhésifs), revêtements muraux, outillage consommable, et les temps de main-d'œuvre au m². Vos prix remplacent les prix indicatifs.",
                    "**Un devis par pièce** avec sous-totaux : le client voit ce que coûte le salon, la cage d'escalier ou la façade, et peut retirer une pièce sans que vous refassiez tout.",
                    "**Des photos avant / après** rattachées au chantier : l'état des supports avant travaux (fissures, humidité, anciennes couches) et le résultat. Utile pour les réserves et pour vos avis clients.",
                    "**Des devis prêts à signer** : logo, SIRET, assurance, TVA au bon taux ou franchise en base, validité, conditions de paiement, signature électronique.",
                    "**Acompte à la commande**, solde à la réception, facture en un clic depuis le devis signé.",
                ],
            },
            {
                heading: 'Les cas concrets du quotidien',
                sub: [
                    {
                        heading: 'Rafraîchissement d\'un appartement avant location',
                        paragraphs: [
                            "Une ligne par pièce avec surface murs + plafond, préparation légère, deux couches. Le propriétaire veut un prix global et un délai : le devis est envoyé le jour de la visite, signé sur téléphone, et le planning est bloqué dans l'agenda.",
                        ],
                    },
                    {
                        heading: 'Remise en état après dégât des eaux',
                        paragraphs: [
                            "Les photos avant travaux et le détail de la préparation (traitement, enduit, sous-couche d'isolation des taches) servent au dossier d'assurance du client. Le rapport d'intervention se génère avec les photos.",
                        ],
                    },
                    {
                        heading: 'Ravalement ou façade',
                        paragraphs: [
                            "Surfaces au m² déduction faite des ouvertures, nettoyage, traitement, fixateur, finition ; l'échafaudage ou la nacelle en ligne séparée. Les situations de travaux permettent de facturer à l'avancement sur un gros chantier.",
                        ],
                    },
                ],
            },
            {
                heading: 'TVA et conformité',
                paragraphs: [
                    "Les travaux de peinture dans un logement achevé depuis plus de deux ans relèvent en général du taux réduit de TVA, sur attestation du client ; vous indiquez le taux sur le devis. En franchise en base, la mention « TVA non applicable, art. 293 B du CGI » est insérée automatiquement. Vos factures sont au format **Factur-X 1.08**, prêtes pour la [facturation électronique obligatoire](/facture-electronique-artisan-2026).",
                ],
            },
            {
                heading: 'Combien ça coûte ?',
                paragraphs: [
                    "Le plan Essentiel est **gratuit, pour toujours**, sans carte bancaire. Le plan Pro (14,99 €/mois, 30 jours d'essai) relance vos devis sans réponse et vos factures en retard, et demande les avis Google à la fin de chaque chantier — ce qui, pour un peintre, remplit l'agenda du mois suivant.",
                ],
            },
        ],
        faq: [
            {
                q: "Puis-je faire un devis de peinture au m² par pièce ?",
                a: "Oui. Chaque pièce devient un lot avec ses lignes (préparation, murs, plafond, boiseries) au m² ou au forfait, et son sous-total. Le client peut retirer une pièce sans que le devis soit refait.",
            },
            {
                q: "La bibliothèque contient-elle les fournitures de peinture ?",
                a: "Oui : peintures, enduits, protection, revêtements et consommables, avec des temps de main-d'œuvre au m². Les prix sont indicatifs et se remplacent par les vôtres.",
            },
            {
                q: "Comment joindre des photos avant / après ?",
                a: "Depuis le téléphone, directement dans le chantier. Elles sont datées, rattachées à l'affaire et peuvent figurer dans le rapport d'intervention remis au client.",
            },
        ],
        related: ['devis-auto-entrepreneur-mentions-obligatoires', 'facture-electronique-artisan-2026', 'a-propos'],
        cta: CTA_DEFAULT,
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'logiciel-devis-menuisier',
        kind: 'trade',
        title: 'Logiciel de devis et facture pour menuisier, gratuit | Artisan Facile',
        description: "Devis de menuiserie intérieure et extérieure : fourniture et pose, sur-mesure, options d'essence et de finition, acompte à la commande, délais de fabrication, facture Factur-X 2026. Gratuit, sans carte bancaire.",
        kicker: 'Pour les menuisiers',
        h1: "Le logiciel de devis et de facturation pensé pour les menuisiers",
        lead: "Pose de fenêtres, portes, parquet, dressing ou escalier sur mesure : le devis de menuiserie engage souvent une fourniture coûteuse, commandée ou fabriquée spécialement. Il faut un acompte, des options claires et un délai écrit. Artisan Facile vous les met en place en quelques minutes, gratuitement.",
        published: '2026-11-28',
        updated: '2026-11-28',
        sections: [
            {
                heading: 'Un devis de menuiserie engage de la fourniture',
                paragraphs: [
                    "Une fenêtre sur mesure, un bloc-porte, un plan de travail massif : une fois commandés, ils ne se renvoient pas. Le devis doit donc décrire précisément la référence, les dimensions, l'essence, la finition et le sens d'ouverture, prévoir un acompte à la hauteur de la fourniture, et fixer un délai de fabrication et de pose.",
                    "Artisan Facile sépare fourniture et pose sur chaque ligne, gère l'acompte à la commande et le solde à la réception, et garde la trace des commandes fournisseurs rattachées au chantier pour connaître la marge réelle.",
                ],
            },
            {
                heading: 'Ce que vous trouvez dès la création du compte',
                bullets: [
                    "**Une bibliothèque menuiserie pré-remplie** : bois et panneaux, menuiseries intérieures (blocs-portes, plinthes, parquet), menuiseries extérieures (fenêtres, portes, volets), quincaillerie, et les temps de pose. Vos tarifs remplacent les prix indicatifs.",
                    "**Fourniture et pose distinctes** : le client voit ce qu'il paie en matière et en travail ; vous suivez votre marge sur chacun.",
                    "**Acompte adapté** : 30 à 50 % à la commande pour le sur-mesure, solde à la réception. L'acompte se facture, le solde se calcule.",
                    "**Options et variantes** dans le devis : chêne ou hêtre, laqué ou huilé, double ou triple vitrage. Le client choisit, vous validez, le total suit.",
                    "**Commandes fournisseurs rattachées au devis** : ce que vous avez réellement payé chez le négociant, face à ce que vous avez vendu.",
                    "**Photos de prise de cotes** rattachées au chantier, pour ne plus chercher le relevé dans le téléphone au moment de commander.",
                ],
            },
            {
                heading: 'Les cas concrets du quotidien',
                sub: [
                    {
                        heading: 'Remplacement de fenêtres',
                        paragraphs: [
                            "Une ligne par ouverture (dimensions, matériau, vitrage, couleur), dépose et évacuation des anciennes, pose en rénovation ou en dépose totale, finitions. Le taux de TVA réduit s'applique souvent en rénovation, sur attestation du client.",
                        ],
                    },
                    {
                        heading: 'Agencement sur mesure (dressing, bibliothèque, cuisine)',
                        paragraphs: [
                            "Décrivez le caisson, les façades, la quincaillerie et la finition ; réservez les dimensions définitives à la prise de cotes. L'acompte à la commande couvre la matière ; un avenant gère le tiroir ajouté en cours de route.",
                        ],
                    },
                    {
                        heading: 'Parquet et escalier',
                        paragraphs: [
                            "Surface au m² avec chutes, préparation du support, pose collée ou flottante, plinthes au ml, finition. Pour l'escalier, le devis décrit la structure, les marches, le garde-corps et la finition, avec un délai de fabrication écrit.",
                        ],
                    },
                ],
            },
            {
                heading: 'Après le devis',
                paragraphs: [
                    "Le client signe en ligne, l'acompte est facturé, la commande fournisseur part. Le tableau de bord vous rappelle le solde à la réception. Vos factures sont au format **Factur-X 1.08** : prêtes pour la [facturation électronique](/facture-electronique-artisan-2026). Avec le plan Pro, les devis sans réponse sont relancés automatiquement — utile quand le client « réfléchit » pendant trois semaines.",
                ],
            },
            {
                heading: 'Combien ça coûte ?',
                paragraphs: [
                    "Le plan Essentiel est **gratuit, pour toujours**, sans carte bancaire : devis et factures illimités, acomptes, bibliothèque, commandes fournisseurs, agenda, clients, photos, mode hors ligne. Le plan Pro (14,99 €/mois, 30 jours d'essai) ajoute les relances automatiques et les demandes d'avis Google.",
                ],
            },
        ],
        faq: [
            {
                q: "Puis-je séparer la fourniture et la pose sur le devis ?",
                a: "Oui. Chaque ligne peut être une fourniture ou une main-d'œuvre, et un ouvrage composé peut regrouper les deux tout en gardant le détail. Vous suivez votre marge sur chaque partie.",
            },
            {
                q: "Comment demander un acompte important pour du sur-mesure ?",
                a: "Vous fixez le pourcentage sur le devis (par exemple 40 % à la commande). Une fois le devis signé, la facture d'acompte se génère et le solde se calcule automatiquement à la réception.",
            },
            {
                q: "Le délai de fabrication peut-il figurer sur le devis ?",
                a: "Oui, dans les conditions du devis : date de début prévue, durée estimée ou délai de fabrication et de pose. C'est d'ailleurs une mention attendue sur un devis d'artisan.",
            },
        ],
        related: ['devis-auto-entrepreneur-mentions-obligatoires', 'facture-electronique-artisan-2026', 'a-propos'],
        cta: CTA_DEFAULT,
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'logiciel-devis-carreleur',
        kind: 'trade',
        title: 'Logiciel de devis et facture pour carreleur, gratuit | Artisan Facile',
        description: "Devis de carrelage au m² : dépose, préparation (ragréage, primaire), pose, joints, plinthes au ml, chutes, fourniture par le client ou l'artisan, TVA rénovation, facture Factur-X 2026. Gratuit, sans carte bancaire.",
        kicker: 'Pour les carreleurs',
        h1: "Le logiciel de devis et de facturation pensé pour les carreleurs",
        lead: "Sol de cuisine, douche à l'italienne, terrasse : le devis de carrelage, c'est des m² avec des chutes, une préparation du support qu'on ne voit pas, et une fourniture qui vient tantôt de vous, tantôt du client. Artisan Facile vous le fait chiffrer sur place, proprement. Gratuit, sans carte bancaire.",
        published: '2026-11-28',
        updated: '2026-11-28',
        sections: [
            {
                heading: 'Le devis de carrelage se chiffre au m², et le reste au ml',
                paragraphs: [
                    "Surface à poser majorée des chutes (10 % en pose droite, davantage en diagonale ou avec des grands formats), plinthes et profilés au mètre linéaire, préparation au m² (dépose de l'ancien revêtement, ragréage, primaire, étanchéité sous carrelage en pièce humide), joints, silicone. Et une question à trancher dès le devis : qui fournit le carrelage ?",
                    "Artisan Facile prévoit les deux cas — fourniture par vous avec votre marge, ou pose seule sur un carrelage fourni par le client — et vous laisse composer des ouvrages qui incluent préparation, colle, joints et main-d'œuvre.",
                ],
            },
            {
                heading: 'Ce que vous trouvez dès la création du compte',
                bullets: [
                    "**Une bibliothèque carrelage pré-remplie** : préparation (ragréage, primaire, natte d'étanchéité), revêtements, consommables (colle, joint, croisillons, silicone), et la main-d'œuvre au m² selon le format et le type de pose. Vos prix remplacent les prix indicatifs.",
                    "**Pose seule ou fourniture + pose** : la ligne de carrelage est optionnelle ; vous précisez dans les réserves que le client fournit la quantité avec les chutes.",
                    "**Des photos avant / après** : l'état du support avant travaux (planéité, fissures, ancien carrelage) et le résultat, rattachées au chantier et au rapport d'intervention.",
                    "**Des devis prêts à signer** : logo, SIRET, assurance décennale, TVA au bon taux ou franchise en base, validité, conditions de paiement, signature électronique.",
                    "**Acompte à la commande** et solde à la réception ; facture en un clic depuis le devis signé.",
                ],
            },
            {
                heading: 'Les cas concrets du quotidien',
                sub: [
                    {
                        heading: 'Sol de cuisine ou de séjour',
                        paragraphs: [
                            "Surface + chutes, dépose éventuelle, ragréage, pose, plinthes au ml, joints. Si le client a déjà acheté son carrelage, la ligne de fourniture disparaît et une réserve précise la quantité attendue.",
                        ],
                    },
                    {
                        heading: 'Salle de bain et douche à l\'italienne',
                        paragraphs: [
                            "Étanchéité sous carrelage (SPEC), pente et receveur à carreler, faïence murale au m², niches, profilés. Les photos de l'étanchéité avant pose sont votre meilleure protection en cas de fuite ultérieure.",
                        ],
                    },
                    {
                        heading: 'Terrasse extérieure',
                        paragraphs: [
                            "Pose collée sur dalle ou sur plots, carrelage adapté au gel, joints et pentes d'écoulement. Les situations de travaux permettent de facturer à l'avancement sur une grande surface.",
                        ],
                    },
                ],
            },
            {
                heading: 'TVA et conformité',
                paragraphs: [
                    "Dans un logement achevé depuis plus de deux ans, la pose de carrelage relève généralement du taux réduit de TVA sur attestation du client ; vous indiquez le taux sur le devis. En franchise en base, la mention « TVA non applicable, art. 293 B du CGI » est automatique. Vos factures sont au format **Factur-X 1.08**, prêtes pour la [facturation électronique](/facture-electronique-artisan-2026).",
                ],
            },
            {
                heading: 'Combien ça coûte ?',
                paragraphs: [
                    "Le plan Essentiel est **gratuit, pour toujours**, sans carte bancaire. Le plan Pro (14,99 €/mois, 30 jours d'essai) relance vos devis sans réponse et vos factures en retard, et demande les avis Google à la fin du chantier.",
                ],
            },
        ],
        faq: [
            {
                q: "Comment faire un devis de pose seule quand le client fournit le carrelage ?",
                a: "Vous laissez de côté la ligne de fourniture et chiffrez préparation, colle, joints et main-d'œuvre au m². Une réserve du devis précise la quantité à fournir par le client, chutes comprises.",
            },
            {
                q: "Puis-je prévoir les chutes dans les quantités ?",
                a: "Oui. Vous saisissez la quantité majorée (par exemple surface × 1,10) ou créez un ouvrage dont la fourniture intègre déjà le pourcentage de chutes de votre choix.",
            },
            {
                q: "Les plinthes et profilés se chiffrent-ils au mètre linéaire ?",
                a: "Oui, chaque ligne a son unité : m² pour les surfaces, ml pour les plinthes et profilés, unité pour les niches ou les receveurs. Le total suit.",
            },
        ],
        related: ['devis-auto-entrepreneur-mentions-obligatoires', 'facture-electronique-artisan-2026', 'a-propos'],
        cta: CTA_DEFAULT,
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'facture-electronique-artisan-2026',
        kind: 'guide',
        title: 'Facture électronique 2026 pour artisans et auto-entrepreneurs : le guide',
        description: "Réforme de la facturation électronique : qui est concerné, calendrier septembre 2026 / 2027, Factur-X, plateformes agréées, annuaire, e-reporting. Ce qu'un artisan ou micro-entrepreneur doit faire, concrètement.",
        kicker: 'Guide pratique',
        h1: "Facturation électronique obligatoire en 2026 : ce que ça change pour un artisan",
        lead: "À partir du 1er septembre 2026, toutes les entreprises françaises assujetties à la TVA — y compris les auto-entrepreneurs en franchise de TVA — doivent pouvoir recevoir des factures électroniques. L'obligation d'en émettre suit en 2027 pour les TPE et micro-entreprises. Voici ce qu'il faut comprendre et faire, sans jargon.",
        published: '2026-11-27',
        updated: '2026-11-27',
        sections: [
            {
                heading: "Une facture électronique, ce n'est pas un PDF envoyé par e-mail",
                paragraphs: [
                    "C'est la confusion la plus courante. Un PDF joint à un e-mail reste une facture « papier » au sens de la réforme. Une facture électronique est un fichier **structuré** (les données sont lisibles par une machine : montants, TVA, SIREN, dates) transmis par une **plateforme agréée** par l'administration, qui en garde la trace et en transmet certaines données à la DGFIP.",
                    "Trois formats sont admis : **Factur-X** (un PDF lisible normalement, qui contient en plus un fichier XML conforme à la norme européenne EN 16931), **UBL** et **CII** (XML purs). Pour un artisan, Factur-X est le plus pratique : le client voit un PDF habituel, la machine lit le XML.",
                ],
            },
            {
                heading: 'Le calendrier',
                bullets: [
                    "**1er septembre 2026** — toutes les entreprises, quelle que soit leur taille, doivent être en mesure de **recevoir** des factures électroniques. Les grandes entreprises et les ETI doivent aussi en **émettre**.",
                    "**1er septembre 2027** — les PME, TPE et micro-entreprises doivent à leur tour **émettre** leurs factures au format électronique vers leurs clients professionnels, et transmettre les données d'e-reporting pour les ventes aux particuliers.",
                ],
                after: [
                    "Concrètement : dès septembre 2026, votre grossiste ou votre fournisseur de matériel pourra vous adresser ses factures par plateforme, et vous devez pouvoir les recevoir. Un an plus tard, vos propres factures à des professionnels (syndic, agence, entreprise générale, autre artisan) devront partir par le même canal.",
                ],
            },
            {
                heading: 'Les auto-entrepreneurs sont-ils concernés ?',
                paragraphs: [
                    "**Oui.** La réforme vise toutes les entreprises assujetties à la TVA établies en France, ce qui inclut les micro-entrepreneurs bénéficiant de la franchise en base (ceux qui écrivent « TVA non applicable, art. 293 B du CGI » sur leurs factures). La franchise dispense de facturer la TVA, pas d'être assujetti. Vous devez donc pouvoir recevoir des factures électroniques en septembre 2026 et en émettre en septembre 2027.",
                    "Les ventes à des particuliers ne passent pas par la facturation électronique (le particulier n'a pas de plateforme), mais elles font l'objet d'un **e-reporting** : la transmission périodique à l'administration de données de transaction, là encore via une plateforme agréée.",
                ],
            },
            {
                heading: "Les quatre briques : plateforme, annuaire, Factur-X, e-reporting",
                sub: [
                    {
                        heading: 'La plateforme agréée',
                        paragraphs: [
                            "Chaque entreprise choisit une plateforme de dématérialisation agréée par l'État (on parlait de « PDP », désormais de « plateforme agréée »). Elle émet, reçoit, archive et transmet les données à la DGFIP. Vous pouvez en choisir une directement ou passer par un logiciel qui en intègre une.",
                        ],
                    },
                    {
                        heading: "L'annuaire",
                        paragraphs: [
                            "Un annuaire national associe chaque SIREN à sa plateforme de réception. C'est lui qui permet à votre fournisseur de savoir où envoyer sa facture. Si vous n'y figurez pas, vous ne pouvez pas recevoir — c'est le premier point à régler avant septembre 2026.",
                        ],
                    },
                    {
                        heading: 'Le format Factur-X',
                        paragraphs: [
                            "Votre logiciel doit produire des PDF Factur-X conformes à la norme EN 16931 : les mentions habituelles de la facture, plus un bloc de données structurées. Un PDF classique ou un document Word ne suffira plus pour les clients professionnels à partir de 2027.",
                        ],
                    },
                    {
                        heading: "L'e-reporting",
                        paragraphs: [
                            "Pour les ventes aux particuliers et les opérations non soumises à la facturation électronique, les données (montant, TVA, date) sont transmises périodiquement à l'administration via la plateforme. À terme, cela préfigure la déclaration de TVA pré-remplie.",
                        ],
                    },
                ],
            },
            {
                heading: 'Ce que fait Artisan Facile, et ce que vous n\'avez pas à faire',
                bullets: [
                    "**Factur-X 1.08 natif** : chaque facture émise embarque son XML conforme EN 16931, lisible par toutes les plateformes agréées. Vous n'avez rien à paramétrer.",
                    "**Inscription à l'annuaire** : dès que vous renseignez votre SIRET dans votre profil, votre SIREN est enregistré dans l'annuaire via la plateforme agréée intégrée. Vos fournisseurs peuvent vous envoyer leurs factures.",
                    "**Réception des factures fournisseurs** directement dans l'application, via le réseau des plateformes agréées et Peppol : plus de PDF à ressaisir, et la dépense se rattache au chantier pour calculer la marge réelle.",
                    "**Transmission tracée** : envoi, accusé de réception, rejet — le statut de chaque facture est visible dans votre tableau de bord.",
                    "Tout cela est inclus dans le **plan gratuit**.",
                ],
            },
            {
                heading: 'Les questions que se posent les artisans',
                paragraphs: [
                    "« Dois-je changer de logiciel ? » — si le vôtre ne produit pas de Factur-X ou n'est pas relié à une plateforme agréée, oui, avant septembre 2027 pour l'émission, et le plus tôt possible pour la réception. « Et pour mes clients particuliers ? » — rien ne change pour eux : ils reçoivent toujours un PDF ; seule la transmission des données (e-reporting) s'ajoute, et le logiciel s'en charge. « Est-ce payant ? » — certaines plateformes facturent ; avec Artisan Facile, c'est compris dans le plan gratuit.",
                ],
            },
        ],
        faq: [
            {
                q: "Un auto-entrepreneur en franchise de TVA est-il concerné par la facture électronique ?",
                a: "Oui. La franchise en base dispense de collecter la TVA, pas d'être assujetti. Comme toutes les entreprises établies en France, un micro-entrepreneur doit pouvoir recevoir des factures électroniques à partir du 1er septembre 2026 et en émettre vers ses clients professionnels à partir du 1er septembre 2027.",
            },
            {
                q: "Un PDF envoyé par e-mail est-il une facture électronique ?",
                a: "Non. Une facture électronique au sens de la réforme est un fichier structuré (Factur-X, UBL ou CII) transmis par une plateforme agréée. Un simple PDF, même signé, reste assimilé à une facture papier.",
            },
            {
                q: "Que se passe-t-il si je ne suis pas prêt en septembre 2026 ?",
                a: "Vos fournisseurs ne pourront pas vous adresser leurs factures par voie électronique si votre SIREN n'est pas dans l'annuaire, et des sanctions sont prévues en cas de manquement (amende forfaitaire par facture non conforme, plafonnée par an). Le plus simple est d'utiliser dès maintenant un logiciel qui gère la réception et l'inscription à l'annuaire.",
            },
            {
                q: "Artisan Facile est-il conforme à la réforme ?",
                a: "Oui. Les factures sont générées au format Factur-X 1.08 (EN 16931), le SIREN est inscrit automatiquement à l'annuaire via une plateforme agréée dès la saisie du SIRET, et les factures fournisseurs sont reçues directement dans l'application. C'est inclus dans le plan gratuit.",
            },
            {
                q: "Mes factures aux particuliers doivent-elles être électroniques ?",
                a: "Non. Les particuliers continuent de recevoir une facture classique (PDF ou papier). En revanche, les données de ces ventes sont transmises à l'administration par e-reporting, ce que le logiciel fait pour vous.",
            },
        ],
        related: ['devis-auto-entrepreneur-mentions-obligatoires', 'logiciel-devis-electricien', 'logiciel-devis-plombier'],
        cta: {
            ...CTA_DEFAULT,
            title: 'Soyez conforme dès aujourd\'hui, gratuitement',
            text: "Factur-X, annuaire, réception des factures fournisseurs : tout est inclus dans le plan Essentiel d'Artisan Facile. Compte créé en 30 secondes, sans carte bancaire.",
        },
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'devis-auto-entrepreneur-mentions-obligatoires',
        kind: 'guide',
        title: "Devis d'artisan auto-entrepreneur : les mentions obligatoires (2026)",
        description: "Liste complète des mentions obligatoires sur un devis d'artisan ou de micro-entrepreneur : identité, SIRET, assurance décennale, TVA, validité, détail des prestations, signature. Avec les règles du dépannage à domicile.",
        kicker: 'Guide pratique',
        h1: "Les mentions obligatoires d'un devis d'artisan auto-entrepreneur",
        lead: "Un devis incomplet, c'est un litige qui attend son heure — et parfois une amende. Voici, poste par poste, ce qui doit figurer sur le devis d'un artisan du bâtiment en micro-entreprise ou en société, et quand le devis est obligatoire.",
        published: '2026-11-27',
        updated: '2026-11-27',
        sections: [
            {
                heading: 'Quand le devis est-il obligatoire ?',
                paragraphs: [
                    "Le devis est toujours recommandé, et il est **obligatoire** dans plusieurs cas qui concernent directement les artisans :",
                ],
                bullets: [
                    "**Travaux et dépannage à domicile** : pour les prestations de dépannage, réparation et entretien dans le bâtiment et l'équipement de la maison (électricité, plomberie, serrurerie, chauffage, menuiserie…), un devis écrit est obligatoire **avant l'intervention** dès que le montant estimé dépasse **150 € TTC** (arrêté du 24 janvier 2017). En dessous, le client peut l'exiger.",
                    "**Toute prestation de plus de 1 500 €** : une information écrite préalable sur le prix est exigée, et le devis en est la forme naturelle.",
                    "**À la demande du client**, quel que soit le montant.",
                ],
                after: [
                    "Le devis engage l'artisan sur le prix et le contenu une fois signé par le client ; il n'engage le client qu'à partir de sa signature. Précisez s'il est gratuit ou payant (un devis de diagnostic peut être facturé si le client en est informé avant).",
                ],
            },
            {
                heading: 'Les mentions relatives à votre entreprise',
                bullets: [
                    "Nom ou dénomination sociale, et pour un auto-entrepreneur : nom et prénom suivis éventuellement du nom commercial.",
                    "Adresse du siège ou de l'établissement, téléphone, e-mail.",
                    "**Numéro SIREN / SIRET**, et le code APE.",
                    "Forme juridique (EI, EURL, SASU…) et, pour les sociétés, le capital social. Mention d'immatriculation au Registre national des entreprises (RNE) pour les artisans.",
                    "**Numéro de TVA intracommunautaire** si vous êtes assujetti ; sinon la mention **« TVA non applicable, art. 293 B du CGI »** pour la franchise en base.",
                    "**Assurance professionnelle obligatoire** : pour les travaux de construction soumis à la garantie décennale, le nom de l'assureur, le numéro de contrat et la couverture géographique doivent figurer sur les devis et factures (loi du 18 juin 2014, art. L. 243-2 du Code des assurances).",
                ],
            },
            {
                heading: 'Les mentions relatives au client et au chantier',
                bullets: [
                    "Nom et adresse du client ; adresse du chantier si elle diffère.",
                    "**Date du devis** et **durée de validité** (par exemple 30 jours) : au-delà, vous n'êtes plus tenu par le prix.",
                    "Date de début prévue et durée estimée des travaux, ou délai d'exécution.",
                    "Un **numéro de devis** unique, utile pour le suivi et pour la facture qui y fera référence.",
                ],
            },
            {
                heading: 'Le détail des prestations et des prix',
                bullets: [
                    "**Décompte détaillé** de chaque prestation et de chaque fourniture : désignation, quantité, unité, prix unitaire HT.",
                    "Main-d'œuvre : taux horaire ou forfait, et nombre d'heures estimé.",
                    "Frais de déplacement, s'ils sont facturés, et leur mode de calcul.",
                    "**Total HT, taux et montant de TVA, total TTC** (ou total sans TVA avec la mention de franchise).",
                    "Conditions de paiement : acompte éventuel et son pourcentage, échéancier, délai de règlement, pénalités de retard et indemnité forfaitaire de recouvrement de 40 € pour les clients professionnels.",
                    "Caractère gratuit ou payant du devis.",
                ],
            },
            {
                heading: 'Les mentions de protection du consommateur',
                bullets: [
                    "**Médiateur de la consommation** : tout professionnel vendant à des particuliers doit indiquer les coordonnées du médiateur auquel il adhère (sur le devis, la facture ou les conditions générales).",
                    "**Droit de rétractation** : si le devis est signé hors de votre établissement (chez le client, c'est le cas général pour un artisan) ou à distance, le client dispose de 14 jours pour se rétracter. Le devis doit l'en informer et comporter le formulaire type. Si le client souhaite des travaux urgents avant la fin du délai, faites-lui signer une demande expresse d'intervention anticipée.",
                    "La **date et la signature du client**, précédées de la mention manuscrite ou électronique « Devis reçu avant l'exécution des travaux, bon pour accord ». La signature électronique a la même valeur.",
                ],
            },
            {
                heading: 'Les erreurs les plus fréquentes',
                bullets: [
                    "Oublier l'assurance décennale sur le devis : c'est la mention la plus souvent absente, et l'une des plus coûteuses en cas de litige.",
                    "Un devis sans durée de validité, que le client ressort six mois plus tard avec des prix de matériaux qui ont augmenté.",
                    "Des lignes « forfait » sans détail : en cas de contestation, c'est l'artisan qui doit prouver ce qui était prévu.",
                    "Ne pas faire signer avant de commencer. Sans signature, le devis n'a aucune valeur contractuelle.",
                    "Facturer un montant différent du devis signé sans avenant écrit.",
                ],
            },
            {
                heading: 'Comment Artisan Facile vous évite les oublis',
                paragraphs: [
                    "Toutes ces mentions sont renseignées **une fois** dans votre profil (identité, SIRET, assurance, régime de TVA, médiateur, conditions) et reprises automatiquement sur chaque devis et chaque facture. Les prestations viennent d'une bibliothèque déjà remplie pour votre métier, avec quantités et prix unitaires ; le client signe en ligne, horodaté ; la facture se génère depuis le devis signé, au format Factur-X. Et c'est [gratuit](/register).",
                ],
            },
        ],
        faq: [
            {
                q: "Un auto-entrepreneur doit-il mettre son assurance décennale sur ses devis ?",
                a: "Oui, s'il réalise des travaux soumis à la garantie décennale (gros œuvre, électricité, plomberie, couverture, menuiserie…). Le nom de l'assureur, le numéro de contrat et la zone géographique couverte doivent figurer sur les devis et les factures.",
            },
            {
                q: "À partir de quel montant le devis est-il obligatoire pour un dépannage ?",
                a: "Dès que le prix estimé dépasse 150 € TTC, pour les prestations de dépannage, de réparation et d'entretien dans le bâtiment et l'équipement de la maison. Le devis doit être remis avant l'intervention, et le client peut l'exiger en dessous de ce montant.",
            },
            {
                q: "Quelle mention de TVA pour un micro-entrepreneur ?",
                a: "En franchise en base, le devis ne mentionne pas de TVA et porte la formule « TVA non applicable, art. 293 B du CGI ». Si vous dépassez les seuils ou optez pour la TVA, vous indiquez votre numéro de TVA intracommunautaire, le taux et le montant de TVA, et le total TTC.",
            },
            {
                q: "Le client peut-il se rétracter après avoir signé un devis chez lui ?",
                a: "Oui, pendant 14 jours, lorsque le devis est signé hors établissement ou à distance. Le devis doit l'en informer et inclure le formulaire de rétractation. Pour une intervention urgente avant la fin du délai, faites signer une demande expresse de commencement anticipé.",
            },
            {
                q: "Combien de temps un devis est-il valable ?",
                a: "La durée que vous y inscrivez — 30 jours est l'usage. Sans mention de validité, un client peut soutenir que l'offre tient toujours ; indiquez-la systématiquement.",
            },
        ],
        related: ['facture-electronique-artisan-2026', 'logiciel-devis-electricien', 'logiciel-devis-plombier'],
        cta: {
            ...CTA_DEFAULT,
            title: 'Des devis complets, sans y penser',
            text: "Vos mentions obligatoires saisies une fois, reprises sur chaque devis. Bibliothèque de prix pour votre métier, signature en ligne, facture en un clic. Gratuit, sans carte bancaire.",
        },
    },

    // ──────────────────────────────────────────────────────────────────────
    {
        slug: 'a-propos',
        kind: 'about',
        title: "À propos : un logiciel d'artisan fait par un artisan | Artisan Facile",
        description: "Artisan Facile est créé par Denis, électricien depuis 25 ans, installé à son compte en Gironde. Pourquoi un logiciel gratuit, comment il est financé, et ce qu'il vous promet.",
        kicker: 'À propos',
        h1: "Un logiciel d'artisan, fait par un artisan",
        lead: "Je m'appelle Denis. Je suis électricien depuis 25 ans et j'ai ouvert mon entreprise d'installation et de dépannage électrique en Gironde en septembre 2025. Artisan Facile est l'outil que j'aurais voulu trouver ce jour-là.",
        published: '2026-11-27',
        updated: '2026-11-27',
        sections: [
            {
                heading: "Pourquoi j'ai construit Artisan Facile",
                paragraphs: [
                    "Quand on se met à son compte après des années en entreprise, on sait faire le métier. Ce qu'on ne sait pas, c'est tout le reste : le devis qui doit être prêt avant de quitter le client, les mentions légales qu'on ne connaît pas, la TVA, les relances qu'on n'ose pas faire, la facture électronique qui arrive. Les logiciels que j'ai essayés étaient faits pour des entreprises avec un bureau et une secrétaire : chers, compliqués, pensés par des gens qui n'ont jamais tiré un câble.",
                    "J'ai donc fait l'outil dont j'avais besoin sur le chantier : un devis en trois gestes sur le téléphone, une bibliothèque avec mes prix, la signature du client sur place, la facture en un clic, et un tableau qui me dit le soir qui me doit de l'argent. Puis d'autres artisans ont voulu l'utiliser, dans d'autres métiers. Artisan Facile est né comme ça.",
                ],
            },
            {
                heading: 'Ce que je vous promets',
                bullets: [
                    "**Le plan Essentiel restera gratuit.** Devis et factures illimités, bibliothèque, agenda, clients, mode hors ligne, signature, Factur-X : ce qu'il faut pour démarrer ne coûtera jamais rien. Pas de période d'essai qui se termine, pas de carte bancaire demandée.",
                    "**Des mots de chantier, pas de jargon.** Si quelque chose n'est pas clair en trente secondes, c'est un défaut du logiciel, pas le vôtre.",
                    "**Vos données vous appartiennent.** Elles sont hébergées en Europe, sauvegardées chaque jour, jamais vendues, et vous pouvez les exporter.",
                    "**Un vrai interlocuteur.** Les retours arrivent chez moi, pas dans un centre d'appels. Les membres fondateurs du plan Pro ont une visio de 30 minutes avec moi pour mettre en place leur bibliothèque et leur premier devis.",
                ],
            },
            {
                heading: 'Comment le logiciel est financé',
                paragraphs: [
                    "Par le **plan Pro** : 14,99 € par mois (9,90 € à vie pour les 50 premiers membres fondateurs), qui ajoute ce qui fait gagner de l'argent sans effort — les devis relancés automatiquement, les factures en retard réclamées, les avis Google demandés au bon moment, le point du soir sur le téléphone, la dictée vocale illimitée. Ceux qui en ont l'usage financent l'outil pour ceux qui démarrent. Il n'y a pas de publicité et vos données ne sont pas monétisées.",
                ],
            },
            {
                heading: 'Qui est derrière',
                paragraphs: [
                    "Artisan Facile est édité en France par une entreprise individuelle. Je continue d'exercer comme électricien : chaque fonctionnalité est utilisée sur mes propres chantiers avant d'être proposée aux autres. Le code évolue chaque semaine à partir des retours des artisans qui l'utilisent.",
                    "Pour me joindre : contact@artisanfacile.fr. Pour essayer : [créez un compte gratuit](/register), il n'y a rien à installer.",
                ],
            },
        ],
        faq: [],
        related: ['logiciel-devis-electricien', 'logiciel-devis-plombier', 'facture-electronique-artisan-2026'],
        cta: CTA_DEFAULT,
    },
];

export const getPublicPage = (slug) => PUBLIC_PAGES.find((p) => p.slug === slug) || null;
export const pagePath = (page) => `/${page.slug}`;
export const pageUrl = (page) => `${SITE_URL}/${page.slug}`;

/** Liens vers les pages de contenu, pour les pieds de page (ordre d'affichage). */
export const PUBLIC_PAGE_LINKS = PUBLIC_PAGES.map((p) => ({
    href: pagePath(p),
    label: {
        'logiciel-devis-electricien': 'Logiciel pour électricien',
        'logiciel-devis-plombier': 'Logiciel pour plombier',
        'logiciel-devis-macon': 'Logiciel pour maçon',
        'logiciel-devis-peintre': 'Logiciel pour peintre',
        'logiciel-devis-menuisier': 'Logiciel pour menuisier',
        'logiciel-devis-carreleur': 'Logiciel pour carreleur',
        'facture-electronique-artisan-2026': 'Facture électronique 2026',
        'devis-auto-entrepreneur-mentions-obligatoires': 'Mentions obligatoires du devis',
        'a-propos': 'À propos',
    }[p.slug] || p.h1,
}));

/**
 * Découpe un texte avec **gras** et [libellé](/lien) en segments.
 * @returns {Array<{type:'text'|'strong'|'link', text:string, href?:string}>}
 */
export const parseInline = (text) => {
    const out = [];
    const re = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text)) !== null) {
        if (m.index > last) out.push({ type: 'text', text: text.slice(last, m.index) });
        if (m[1] !== undefined) out.push({ type: 'strong', text: m[1] });
        else out.push({ type: 'link', text: m[2], href: m[3] });
        last = re.lastIndex;
    }
    if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
    return out;
};

/** Texte brut (sans balisage en ligne), pour le JSON-LD et les descriptions. */
export const plainText = (text) => parseInline(text).map((s) => s.text).join('');

/** Données structurées schema.org de la page. */
export const pageJsonLd = (page) => {
    const url = pageUrl(page);
    const org = { '@id': `${SITE_URL}/#organization` };
    const graph = [
        {
            '@type': 'BreadcrumbList',
            '@id': `${url}#breadcrumb`,
            itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Accueil', item: `${SITE_URL}/` },
                { '@type': 'ListItem', position: 2, name: page.h1, item: url },
            ],
        },
    ];
    if (page.kind === 'about') {
        graph.push({
            '@type': 'AboutPage',
            '@id': `${url}#webpage`,
            url,
            name: page.h1,
            description: page.description,
            inLanguage: 'fr-FR',
            isPartOf: { '@id': `${SITE_URL}/#website` },
            about: org,
            dateModified: page.updated,
        });
    } else {
        graph.push({
            '@type': 'Article',
            '@id': `${url}#article`,
            headline: page.h1,
            description: page.description,
            url,
            mainEntityOfPage: url,
            inLanguage: 'fr-FR',
            datePublished: page.published,
            dateModified: page.updated,
            author: org,
            publisher: org,
            image: `${SITE_URL}/images/og-preview.png`,
            about: { '@id': `${SITE_URL}/#software` },
        });
    }
    if (page.faq && page.faq.length) {
        graph.push({
            '@type': 'FAQPage',
            '@id': `${url}#faq`,
            mainEntity: page.faq.map(({ q, a }) => ({
                '@type': 'Question',
                name: q,
                acceptedAnswer: { '@type': 'Answer', text: plainText(a) },
            })),
        });
    }
    return { '@context': 'https://schema.org', '@graph': graph };
};
