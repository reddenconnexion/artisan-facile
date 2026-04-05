import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const MentionsLegales = () => {
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
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Mentions légales</h1>
                <p className="text-sm text-gray-500 mb-10">Dernière mise à jour : avril 2026</p>

                <div className="space-y-10 text-gray-700">

                    {/* Éditeur */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">1. Éditeur du site</h2>
                        <p className="mb-2">Le site <strong>artisanfacile.fr</strong> est édité par :</p>
                        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1 text-sm">
                            <p><span className="font-medium text-gray-900">Raison sociale :</span> Artisan Facile</p>
                            <p><span className="font-medium text-gray-900">Forme juridique :</span> Entreprise individuelle</p>
                            <p><span className="font-medium text-gray-900">Siège social :</span> France</p>
                            <p><span className="font-medium text-gray-900">Email :</span> contact@artisanfacile.fr</p>
                        </div>
                    </section>

                    {/* Hébergeur */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">2. Hébergement</h2>
                        <p className="mb-2">Le site est hébergé par :</p>
                        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-1 text-sm">
                            <p><span className="font-medium text-gray-900">Hébergeur :</span> Netlify, Inc.</p>
                            <p><span className="font-medium text-gray-900">Adresse :</span> 512 2nd Street, Suite 200, San Francisco, CA 94107, États-Unis</p>
                            <p><span className="font-medium text-gray-900">Site :</span> www.netlify.com</p>
                        </div>
                        <p className="mt-3 text-sm">
                            La base de données et les services backend sont fournis par <strong>Supabase, Inc.</strong> (infrastructure cloud conforme RGPD).
                        </p>
                    </section>

                    {/* Propriété intellectuelle */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">3. Propriété intellectuelle</h2>
                        <p>
                            L'ensemble des contenus présents sur le site artisanfacile.fr (textes, images, graphismes, logo, icônes, sons, logiciels) est la propriété exclusive d'Artisan Facile, à l'exception des marques, logos ou contenus appartenant à d'autres sociétés partenaires ou auteurs.
                        </p>
                        <p className="mt-3">
                            Toute reproduction, distribution, modification, adaptation, retransmission ou publication, même partielle, de ces différents éléments est strictement interdite sans l'accord exprès par écrit d'Artisan Facile.
                        </p>
                    </section>

                    {/* Données personnelles */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">4. Données personnelles et RGPD</h2>
                        <p className="mb-3">
                            Artisan Facile collecte et traite des données personnelles dans le cadre de la fourniture de son service. Conformément au Règlement Général sur la Protection des Données (RGPD — Règlement UE 2016/679) et à la loi Informatique et Libertés du 6 janvier 1978 modifiée, vous disposez des droits suivants :
                        </p>
                        <ul className="list-disc list-inside space-y-1 ml-2 text-sm">
                            <li>Droit d'accès à vos données personnelles</li>
                            <li>Droit de rectification des données inexactes</li>
                            <li>Droit à l'effacement (« droit à l'oubli »)</li>
                            <li>Droit à la limitation du traitement</li>
                            <li>Droit à la portabilité des données</li>
                            <li>Droit d'opposition au traitement</li>
                        </ul>
                        <p className="mt-4">
                            Pour exercer ces droits ou pour toute question relative à vos données personnelles, vous pouvez nous contacter à l'adresse suivante : <a href="mailto:contact@artisanfacile.fr" className="text-blue-600 hover:underline">contact@artisanfacile.fr</a>
                        </p>
                        <p className="mt-3">
                            Vos données sont conservées uniquement le temps nécessaire à la fourniture du service et ne sont jamais vendues à des tiers. Elles peuvent être transférées à des sous-traitants techniques (Supabase pour le stockage, Netlify pour l'hébergement) opérant sous des garanties conformes au RGPD.
                        </p>
                        <p className="mt-3">
                            Si vous estimez que vos droits ne sont pas respectés, vous pouvez introduire une réclamation auprès de la <strong>CNIL</strong> (Commission Nationale de l'Informatique et des Libertés) — <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">www.cnil.fr</a>.
                        </p>
                    </section>

                    {/* Cookies */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">5. Cookies</h2>
                        <p className="mb-3">
                            Le site utilise des cookies techniques strictement nécessaires au bon fonctionnement de l'application (gestion de session, authentification). Aucun cookie publicitaire ou de traçage tiers n'est utilisé.
                        </p>
                        <p>
                            Vous pouvez configurer votre navigateur pour refuser les cookies, mais cela peut altérer le fonctionnement du service.
                        </p>
                    </section>

                    {/* Responsabilité */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">6. Limitation de responsabilité</h2>
                        <p className="mb-3">
                            Artisan Facile s'efforce d'assurer l'exactitude et la mise à jour des informations diffusées sur ce site. Cependant, Artisan Facile décline toute responsabilité quant aux erreurs, omissions ou résultats qui pourraient être obtenus par un mauvais usage des informations diffusées.
                        </p>
                        <p>
                            Artisan Facile ne saurait être tenu pour responsable des dommages directs ou indirects résultant d'un accès au site ou de l'utilisation du service, notamment en cas d'indisponibilité temporaire du service pour raisons de maintenance.
                        </p>
                    </section>

                    {/* Droit applicable */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">7. Droit applicable</h2>
                        <p>
                            Les présentes mentions légales sont soumises au droit français. En cas de litige, les tribunaux français seront compétents.
                        </p>
                    </section>

                    {/* Contact */}
                    <section>
                        <h2 className="text-xl font-semibold text-gray-900 mb-3 pb-2 border-b border-gray-200">8. Contact</h2>
                        <p>
                            Pour toute question concernant ces mentions légales, vous pouvez nous contacter par email à : <a href="mailto:contact@artisanfacile.fr" className="text-blue-600 hover:underline">contact@artisanfacile.fr</a>
                        </p>
                    </section>
                </div>
            </main>

            <footer className="border-t border-gray-200 mt-16 py-8 text-center text-sm text-gray-500 space-y-2">
                <div className="flex justify-center gap-6">
                    <Link to="/politique-confidentialite" className="hover:text-blue-600 transition-colors">Politique de confidentialité</Link>
                    <a href="mailto:contact@artisanfacile.fr" className="hover:text-blue-600 transition-colors">Contact</a>
                </div>
                <p>© {new Date().getFullYear()} Artisan Facile. Tous droits réservés.</p>
            </footer>
        </div>
    );
};

export default MentionsLegales;
