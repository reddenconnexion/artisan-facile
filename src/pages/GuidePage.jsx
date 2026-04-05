import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
    BookOpen, Building2, Users, FileText, Send, BarChart3, Sparkles, Mic,
    Smartphone, ChevronRight, ChevronDown, CheckCircle, ExternalLink,
    Keyboard, Calculator, Bell, Palette, Star, Zap, HelpCircle
} from 'lucide-react';

const Section = ({ icon: Icon, iconBg, title, id, children }) => {
    const [open, setOpen] = useState(true);
    return (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 overflow-hidden mb-4">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
                <div className={`w-9 h-9 ${iconBg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                    <Icon className="w-4.5 h-4.5 text-white" />
                </div>
                <span className="flex-1 font-semibold text-gray-900 dark:text-white">{title}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="px-5 pb-5 border-t border-gray-50 dark:border-gray-800">
                    {children}
                </div>
            )}
        </div>
    );
};

const Step = ({ number, title, detail }) => (
    <div className="flex items-start gap-3 py-2">
        <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
            {number}
        </div>
        <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">{title}</p>
            {detail && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{detail}</p>}
        </div>
    </div>
);

const Tip = ({ children }) => (
    <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/50 rounded-lg px-4 py-3 mt-3">
        <Star className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
        <p className="text-xs text-amber-800 dark:text-amber-300">{children}</p>
    </div>
);

const GuidePage = () => {
    return (
        <div className="max-w-2xl mx-auto pb-12">
            {/* Header */}
            <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <BookOpen className="w-7 h-7 text-blue-600" />
                    Guide de l'application
                </h2>
                <p className="text-gray-500 dark:text-gray-400 mt-1">
                    Tout ce qu'il faut savoir pour bien démarrer et aller plus loin.
                </p>
            </div>

            {/* Quick start CTA */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-5 mb-6 text-white">
                <p className="font-bold text-lg mb-1">Démarrage rapide</p>
                <p className="text-blue-100 text-sm mb-4">Suivez ces 3 étapes pour votre premier devis envoyé.</p>
                <div className="flex flex-col sm:flex-row gap-2">
                    {[
                        { label: '1. Mon profil', href: '/app/settings' },
                        { label: '2. Un client', href: '/app/clients/new' },
                        { label: '3. Un devis', href: '/app/devis/new' },
                    ].map((item, i) => (
                        <Link
                            key={i}
                            to={item.href}
                            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-colors"
                        >
                            {item.label}
                            <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                    ))}
                </div>
            </div>

            {/* === PROFIL === */}
            <Section icon={Building2} iconBg="bg-amber-500" title="1. Votre profil artisan">
                <div className="pt-3 space-y-1">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                        Vos informations sont reprises sur chaque devis et facture. Sans elles, vos documents
                        ne sont pas légalement conformes.
                    </p>
                    <Step number="1" title="Allez dans Paramètres" detail="Icône engrenage en bas de la barre latérale" />
                    <Step number="2" title="Remplissez les champs obligatoires" detail="Nom d'entreprise, SIRET, adresse" />
                    <Step number="3" title="Ajoutez votre logo (optionnel)" detail="Il s'affiche en haut de chaque document PDF" />
                    <Step number="4" title="Renseignez vos coordonnées bancaires" detail="Apparaissent sur les factures pour faciliter le paiement" />
                </div>
                <Tip>
                    Le SIRET est à 14 chiffres. Vous le trouvez sur votre attestation URSSAF ou sur papiers.fr.
                </Tip>
                <div className="mt-4">
                    <Link to="/app/settings" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline">
                        Aller dans Paramètres <ChevronRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            </Section>

            {/* === CLIENTS === */}
            <Section icon={Users} iconBg="bg-green-600" title="2. Gérer vos clients">
                <div className="pt-3 space-y-1">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                        Créez une fiche par client. Ses coordonnées sont réutilisées automatiquement sur tous
                        les devis que vous lui adressez.
                    </p>
                    <Step number="1" title="Clients → Nouveau client" detail="Nom, téléphone, email, adresse" />
                    <Step number="2" title="Depuis la fiche client → Créer devis" detail="Les champs client sont pré-remplis" />
                    <Step number="3" title="Consultez l'historique des devis par client" detail="Chaque fiche client liste tous ses devis passés" />
                </div>
                <Tip>
                    Vous pouvez aussi créer ou sélectionner un client directement depuis le formulaire devis.
                </Tip>
            </Section>

            {/* === DEVIS === */}
            <Section icon={FileText} iconBg="bg-violet-600" title="3. Créer un devis">
                <div className="pt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                        Le formulaire devis est optimisé pour une saisie rapide. Ajoutez autant de lignes que nécessaire.
                    </p>

                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Types de lignes</p>
                    <div className="grid grid-cols-2 gap-2 mb-4">
                        {[
                            { color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', label: '🔧 Main d\'œuvre', desc: 'Pose, travaux, déplacement' },
                            { color: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300', label: '📦 Matériel', desc: 'Fournitures, produits' },
                            { color: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300', label: '📋 Section', desc: 'Regrouper les lots' },
                            { color: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300', label: '✨ IA', desc: 'Auto-remplissage' },
                        ].map((btn, i) => (
                            <div key={i} className={`rounded-lg p-2.5 ${btn.color}`}>
                                <p className="text-xs font-semibold">{btn.label}</p>
                                <p className="text-xs mt-0.5 opacity-75">{btn.desc}</p>
                            </div>
                        ))}
                    </div>

                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Fonctions du formulaire</p>
                    <div className="space-y-2">
                        {[
                            { icon: '💾', label: 'Sauvegarde automatique', detail: 'Votre brouillon est enregistré toutes les 30 secondes' },
                            { icon: '📎', label: 'Pièces jointes', detail: 'Ajoutez des photos depuis le formulaire' },
                            { icon: '📅', label: 'Date de validité', detail: 'Le client voit un badge d\'expiration sur son lien' },
                            { icon: '🏷️', label: 'Remise globale ou par ligne', detail: 'Appliquez un pourcentage ou un montant fixe' },
                        ].map((item, i) => (
                            <div key={i} className="flex items-start gap-2.5 text-sm">
                                <span className="text-base leading-tight">{item.icon}</span>
                                <div>
                                    <span className="font-medium text-gray-900 dark:text-white">{item.label}</span>
                                    <span className="text-gray-500 dark:text-gray-400"> — {item.detail}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                    <Tip>
                        Utilisez "Générer avec l'IA" pour remplir automatiquement une ligne à partir d'une description.
                        Très utile pour la rédaction des prestations.
                    </Tip>
                </div>
            </Section>

            {/* === ENVOI & SIGNATURE === */}
            <Section icon={Send} iconBg="bg-sky-600" title="4. Envoyer et faire signer">
                <div className="pt-3 space-y-1">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-3">
                        Chaque devis génère un lien sécurisé que votre client consulte sans créer de compte.
                    </p>
                    <Step number="1" title='Cliquez sur "Envoyer par email"' detail="Dans le menu Actions → Partage & Signature" />
                    <Step number="2" title="Votre client reçoit un email avec le lien" detail="Vous pouvez aussi copier le lien et l'envoyer par SMS" />
                    <Step number="3" title="Il visualise le devis et peut poser des questions" detail="Via le bouton Contacter de la page publique" />
                    <Step number="4" title="Il signe électroniquement" detail="Au doigt sur mobile, ou à la souris sur desktop" />
                    <Step number="5" title="Vous recevez une notification" detail="Push si activé, ou email de confirmation" />
                </div>
                <Tip>
                    Après la signature, vous pouvez convertir le devis en facture en un clic depuis la page du devis.
                </Tip>
            </Section>

            {/* === COMPTABILITÉ === */}
            <Section icon={BarChart3} iconBg="bg-emerald-600" title="5. Comptabilité & URSSAF">
                <div className="pt-3">
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                        L'onglet Comptabilité calcule automatiquement vos charges URSSAF et génère
                        votre livre de recettes légal.
                    </p>

                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Onglet Charges URSSAF</p>
                    <div className="space-y-1.5 mb-4">
                        {[
                            'Sélectionnez la période (mois ou trimestre)',
                            'Le CA est calculé automatiquement depuis vos factures payées',
                            'Les charges sont calculées aux taux 2026 (services 21,2% / vente 12,3%)',
                            'Copiez les montants puis déclarez sur autoentrepreneur.urssaf.fr',
                        ].map((step, i) => (
                            <div key={i} className="flex items-start gap-2 text-sm">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                                <span className="text-gray-600 dark:text-gray-300">{step}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Livre de recettes</p>
                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
                        Requis légalement (art. L123-28 du Code de Commerce). Généré automatiquement
                        depuis vos factures marquées "Payé".
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        <span className="text-gray-600 dark:text-gray-300">Export CSV compatible Excel et logiciels comptables</span>
                    </div>
                    <Tip>
                        Pensez à renseigner le mode de règlement (virement, chèque...) sur chaque facture
                        payée pour que le livre de recettes soit complet.
                    </Tip>
                </div>
            </Section>

            {/* === FONCTIONNALITÉS AVANCÉES === */}
            <Section icon={Sparkles} iconBg="bg-purple-600" title="6. Fonctionnalités avancées">
                <div className="pt-4 space-y-4">

                    {/* Vocal */}
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Mic className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Mémos vocaux (dictée devis)</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Appuyez sur le bouton micro en bas de l'écran et dictez votre devis en langage naturel.
                                L'IA transcrit et structure les lignes automatiquement.
                            </p>
                            <Link to="/app/voice-memos" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1 hover:underline">
                                Essayer <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>

                    {/* Mobile */}
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Smartphone className="w-4 h-4 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Installation mobile (PWA)</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Ajoutez Artisan Facile à votre écran d'accueil pour un accès rapide,
                                sans passer par le navigateur.
                            </p>
                            <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                <strong className="text-gray-700 dark:text-gray-300">iPhone :</strong> Safari →
                                <span className="mx-1">Partager</span> →
                                <span className="ml-1">"Sur l'écran d'accueil"</span>
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                <strong className="text-gray-700 dark:text-gray-300">Android :</strong> Chrome →
                                <span className="ml-1">menu ⋮ → "Ajouter à l'écran d'accueil"</span>
                            </div>
                        </div>
                    </div>

                    {/* Notifications */}
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-amber-100 dark:bg-amber-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Bell className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Notifications push</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Soyez alerté dès qu'un client signe un devis, même si l'app est fermée.
                                Activez les notifications dans Paramètres.
                            </p>
                        </div>
                    </div>

                    {/* Raccourcis clavier */}
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Keyboard className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Raccourcis clavier</p>
                            <div className="mt-1.5 space-y-1">
                                {[
                                    ['Alt + D', 'Nouveau devis'],
                                    ['Alt + C', 'Nouveau client'],
                                    ['Alt + R', 'Nouveau RDV'],
                                    ['Alt + I', 'Nouveau rapport d\'intervention'],
                                ].map(([key, label]) => (
                                    <div key={key} className="flex items-center gap-2">
                                        <kbd className="px-1.5 py-0.5 text-xs font-mono bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded border border-gray-200 dark:border-gray-700">
                                            {key}
                                        </kbd>
                                        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Bibliothèque de prix */}
                    <div className="flex items-start gap-3">
                        <div className="w-8 h-8 bg-violet-100 dark:bg-violet-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
                            <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                        </div>
                        <div>
                            <p className="text-sm font-semibold text-gray-900 dark:text-white">Bibliothèque de prix</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                Enregistrez vos lignes récurrentes (pose, déplacement...) pour les réutiliser
                                en un clic dans n'importe quel devis.
                            </p>
                            <Link to="/app/library" className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 mt-1 hover:underline">
                                Voir la bibliothèque <ChevronRight className="w-3 h-3" />
                            </Link>
                        </div>
                    </div>
                </div>
            </Section>

            {/* === FAQ === */}
            <Section icon={HelpCircle} iconBg="bg-gray-500" title="Questions fréquentes">
                <div className="pt-4 space-y-4">
                    {[
                        {
                            q: 'Mes devis sont-ils légalement valides ?',
                            a: 'Oui, à condition d\'avoir rempli votre profil (SIRET, nom, adresse). Les documents générés respectent les mentions obligatoires du Code de Commerce français.',
                        },
                        {
                            q: 'La signature électronique a-t-elle une valeur légale ?',
                            a: 'La signature manuscrite numérisée (au doigt ou à la souris) est reconnue en France comme preuve de consentement. Pour les marchés importants, nous recommandons de conserver une capture horodatée.',
                        },
                        {
                            q: 'Comment passer un devis en facture ?',
                            a: 'Depuis la page du devis (statut "Accepté"), cliquez sur "Convertir en facture" dans le menu Actions. La facture reprend toutes les lignes et informations.',
                        },
                        {
                            q: 'Puis-je utiliser l\'appli sans connexion internet ?',
                            a: 'En mode hors-ligne, vous pouvez consulter les devis et clients déjà chargés. La création et l\'envoi nécessitent une connexion.',
                        },
                        {
                            q: 'Comment exporter mes données ?',
                            a: 'Le livre de recettes est exportable en CSV depuis la section Comptabilité. Les devis sont téléchargeables en PDF individuellement.',
                        },
                    ].map((faq, i) => (
                        <div key={i} className="border-b border-gray-50 dark:border-gray-800 pb-4 last:border-0 last:pb-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                                {faq.q}
                            </p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{faq.a}</p>
                        </div>
                    ))}
                </div>
            </Section>

            {/* Footer CTA */}
            <div className="text-center mt-8">
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                    Une question ? Un problème ?
                </p>
                <Link
                    to="/app/settings"
                    className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                    Accéder aux paramètres <ChevronRight className="w-4 h-4" />
                </Link>
            </div>
        </div>
    );
};

export default GuidePage;
