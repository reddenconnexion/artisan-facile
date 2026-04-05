import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const PolitiqueConfidentialite = () => {
    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-4">
                    <Link to="/" className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors">
                        <ArrowLeft className="w-4 h-4" />
                        <span className="text-sm font-medium">Retour</span>
                    </Link>
                    <span className="text-gray-300">|</span>
                    <span className="text-2xl font-bold text-blue-600">Artisan Facile</span>
                </div>
            </header>

            <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Politique de confidentialité</h1>
                <p className="text-sm text-gray-500 mb-10">Dernière mise à jour : avril 2026</p>

                <div className="space-y-10 text-gray-700">

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">1. Responsable du traitement</h2>
                        <p>
                            Le responsable du traitement des données collectées via le site <strong>artisanfacile.fr</strong> et l'application Artisan Facile est :
                        </p>
                        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1 text-sm mt-3">
                            <p><span className="font-medium text-gray-900">Raison sociale :</span> Artisan Facile</p>
                            <p><span className="font-medium text-gray-900">Forme juridique :</span> Entreprise individuelle</p>
                            <p><span className="font-medium text-gray-900">Email :</span>{' '}
                                <a href="mailto:contact@artisanfacile.fr" className="text-blue-600 hover:underline">contact@artisanfacile.fr</a>
                            </p>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">2. Données collectées</h2>
                        <p className="mb-4">Artisan Facile collecte uniquement les données strictement nécessaires au fonctionnement du service :</p>
                        <div className="space-y-4">
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                                <h3 className="font-semibold text-gray-900 text-sm mb-2">Données de compte</h3>
                                <ul className="list-disc list-inside text-sm space-y-1 ml-1">
                                    <li>Adresse email (pour la connexion et les notifications)</li>
                                    <li>Nom, prénom ou raison sociale</li>
                                    <li>SIRET, adresse professionnelle</li>
                                    <li>Logo de l'entreprise (optionnel)</li>
                                </ul>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                                <h3 className="font-semibold text-gray-900 text-sm mb-2">Données métier (saisies par l'utilisateur)</h3>
                                <ul className="list-disc list-inside text-sm space-y-1 ml-1">
                                    <li>Coordonnées de vos clients (nom, email, téléphone, adresse)</li>
                                    <li>Devis, factures et leurs lignes de détail</li>
                                    <li>Événements d'agenda et plannings</li>
                                    <li>Notes, mémos vocaux et rapports d'intervention</li>
                                    <li>Bibliothèque de prix personnalisée</li>
                                </ul>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 p-5">
                                <h3 className="font-semibold text-gray-900 text-sm mb-2">Données techniques</h3>
                                <ul className="list-disc list-inside text-sm space-y-1 ml-1">
                                    <li>Adresse IP (journaux d'accès, conservation 7 jours)</li>
                                    <li>Type de navigateur et système d'exploitation</li>
                                    <li>Tokens de session (authentification)</li>
                                </ul>
                            </div>
                        </div>
                        <p className="mt-4 text-sm">
                            Aucune donnée bancaire ou de carte de crédit n'est collectée ni stockée par Artisan Facile.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">3. Finalités du traitement</h2>
                        <ul className="list-disc list-inside space-y-2 ml-2 text-sm">
                            <li><strong>Fourniture du service :</strong> création et gestion de devis, factures, clients et agenda</li>
                            <li><strong>Authentification :</strong> accès sécurisé à votre espace personnel</li>
                            <li><strong>Notifications :</strong> alertes relatives à vos devis et relances (email)</li>
                            <li><strong>Amélioration du service :</strong> analyse agrégée et anonymisée de l'usage pour identifier les fonctionnalités à améliorer</li>
                            <li><strong>Obligations légales :</strong> réponse aux demandes des autorités compétentes le cas échéant</li>
                        </ul>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">4. Base légale des traitements</h2>
                        <div className="space-y-3 text-sm">
                            <div className="flex gap-3">
                                <span className="font-semibold text-gray-900 min-w-[160px]">Exécution du contrat</span>
                                <span>Données de compte et données métier nécessaires à la fourniture du service souscrit</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-semibold text-gray-900 min-w-[160px]">Intérêt légitime</span>
                                <span>Données techniques (journaux de sécurité, amélioration du service)</span>
                            </div>
                            <div className="flex gap-3">
                                <span className="font-semibold text-gray-900 min-w-[160px]">Obligation légale</span>
                                <span>Conservation des données de facturation (10 ans — Code de commerce)</span>
                            </div>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">5. Durée de conservation</h2>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm border-collapse">
                                <thead>
                                    <tr className="bg-gray-50">
                                        <th className="text-left p-3 border border-gray-200 font-semibold text-gray-900">Catégorie de données</th>
                                        <th className="text-left p-3 border border-gray-200 font-semibold text-gray-900">Durée de conservation</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td className="p-3 border border-gray-200">Compte utilisateur actif</td>
                                        <td className="p-3 border border-gray-200">Durée de la relation contractuelle</td>
                                    </tr>
                                    <tr className="bg-gray-50/50">
                                        <td className="p-3 border border-gray-200">Compte inactif (aucune connexion)</td>
                                        <td className="p-3 border border-gray-200">3 ans après la dernière connexion, puis suppression</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 border border-gray-200">Devis et factures</td>
                                        <td className="p-3 border border-gray-200">10 ans (obligation légale comptable)</td>
                                    </tr>
                                    <tr className="bg-gray-50/50">
                                        <td className="p-3 border border-gray-200">Journaux d'accès techniques</td>
                                        <td className="p-3 border border-gray-200">7 jours glissants</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 border border-gray-200">Données de session</td>
                                        <td className="p-3 border border-gray-200">1 an ou jusqu'à déconnexion</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">6. Destinataires des données</h2>
                        <p className="mb-3">
                            Vos données ne sont jamais vendues ni cédées à des tiers à des fins commerciales. Elles peuvent être transmises aux sous-traitants techniques suivants, dans le strict cadre de la fourniture du service :
                        </p>
                        <div className="space-y-3">
                            <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
                                <p className="font-semibold text-gray-900">Supabase, Inc.</p>
                                <p className="text-gray-500">Base de données et authentification — Infrastructure cloud conforme RGPD, données hébergées en Europe (Frankfurt)</p>
                            </div>
                            <div className="bg-white rounded-xl border border-gray-200 p-4 text-sm">
                                <p className="font-semibold text-gray-900">Resend / prestataire email</p>
                                <p className="text-gray-500">Envoi des emails transactionnels (devis, relances, notifications)</p>
                            </div>
                        </div>
                        <p className="mt-3 text-sm">
                            Des clauses contractuelles de protection des données (DPA) sont en place avec chacun de ces sous-traitants.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">7. Vos droits</h2>
                        <p className="mb-3">
                            Conformément au RGPD (Règlement UE 2016/679) et à la loi Informatique et Libertés, vous disposez des droits suivants :
                        </p>
                        <ul className="list-disc list-inside space-y-2 ml-2 text-sm">
                            <li><strong>Droit d'accès :</strong> obtenir une copie de vos données personnelles</li>
                            <li><strong>Droit de rectification :</strong> corriger des informations inexactes</li>
                            <li><strong>Droit à l'effacement :</strong> demander la suppression de votre compte et de vos données</li>
                            <li><strong>Droit à la limitation :</strong> suspendre temporairement l'utilisation de vos données</li>
                            <li><strong>Droit à la portabilité :</strong> recevoir vos données dans un format structuré et lisible</li>
                            <li><strong>Droit d'opposition :</strong> vous opposer à certains traitements fondés sur l'intérêt légitime</li>
                        </ul>
                        <p className="mt-4 text-sm">
                            Pour exercer ces droits, contactez-nous à{' '}
                            <a href="mailto:contact@artisanfacile.fr" className="text-blue-600 hover:underline">contact@artisanfacile.fr</a>.
                            Nous répondrons dans un délai maximum de <strong>30 jours</strong>.
                        </p>
                        <p className="mt-3 text-sm">
                            Vous pouvez également introduire une réclamation auprès de la <strong>CNIL</strong> :{' '}
                            <a href="https://www.cnil.fr/fr/plaintes" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.cnil.fr/fr/plaintes</a>
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">8. Cookies et stockage local</h2>
                        <p className="mb-3">
                            Artisan Facile utilise exclusivement :
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                            <li><strong>Cookies de session :</strong> nécessaires à l'authentification (durée : session ou 1 an si "Se souvenir de moi")</li>
                            <li><strong>localStorage :</strong> préférences d'interface (thème, langue, checklists) — stocké uniquement sur votre appareil, non transmis</li>
                            <li><strong>Cache hors-ligne (Service Worker) :</strong> pour le fonctionnement sans connexion — données restent sur votre appareil</li>
                        </ul>
                        <p className="mt-3 text-sm">
                            Aucun cookie publicitaire, de tracking ou de profilage tiers n'est utilisé.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">9. Sécurité</h2>
                        <p className="text-sm">
                            Artisan Facile met en œuvre des mesures techniques et organisationnelles adaptées pour protéger vos données :
                            chiffrement TLS en transit, chiffrement au repos (Supabase), Row Level Security (accès aux données strictement limité à votre compte),
                            authentification sécurisée. En cas de violation de données susceptible d'engendrer un risque pour vos droits,
                            nous notifierons la CNIL dans les 72 heures et vous en informerons dans les meilleurs délais.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">10. Modifications</h2>
                        <p className="text-sm">
                            Cette politique peut être mise à jour pour refléter des évolutions légales ou techniques. La date de "Dernière mise à jour" en haut de page sera modifiée en conséquence.
                            Pour les changements substantiels, nous vous en informerons par email ou via une notification dans l'application.
                        </p>
                    </section>

                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">11. Contact</h2>
                        <p className="text-sm">
                            Pour toute question relative à cette politique ou à vos données personnelles :{' '}
                            <a href="mailto:contact@artisanfacile.fr" className="text-blue-600 hover:underline">contact@artisanfacile.fr</a>
                        </p>
                    </section>
                </div>
            </main>

            <footer className="border-t border-gray-200 mt-16 py-8 text-center text-sm text-gray-500">
                © {new Date().getFullYear()} Artisan Facile. Tous droits réservés. —{' '}
                <Link to="/mentions-legales" className="hover:text-blue-600 transition-colors">Mentions légales</Link>
            </footer>
        </div>
    );
};

export default PolitiqueConfidentialite;
