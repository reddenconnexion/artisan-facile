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
