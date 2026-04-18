import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, Shield, Zap, Smartphone, Calendar, FileText, Users, Loader2, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const LandingPage = () => {
    const { user, loading, loginAsDemo } = useAuth();
    const navigate = useNavigate();
    const [demoLoading, setDemoLoading] = useState(false);

    const handleDemoLogin = async () => {
        if (demoLoading) return;
        setDemoLoading(true);
        try {
            await loginAsDemo();
            toast.success("Bienvenue sur la démo — compte Électricité Moreau prêt !");
            navigate('/app');
        } catch (error) {
            console.error(error);
            toast.error("Impossible de créer une session démo.");
        } finally {
            setDemoLoading(false);
        }
    };

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Chargement...</div>;
    }

    if (user) {
        return <Navigate to="/app" />;
    }

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <header className="fixed w-full bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex items-center">
                            <img src="/logo-bleu.svg" alt="Logo Artisan Facile" className="w-8 h-8 rounded-md mr-2" />
                            <span className="text-2xl font-bold text-blue-600">Artisan Facile</span>
                        </div>
                        <div className="flex items-center gap-4">
                            {user ? (
                                <Link
                                    to="/app"
                                    className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                >
                                    Tableau de bord
                                </Link>
                            ) : (
                                <>
                                    <Link to="/login" className="text-gray-600 hover:text-blue-600 font-medium transition-colors">
                                        Se connecter
                                    </Link>
                                    <Link
                                        to="/register"
                                        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors font-medium"
                                    >
                                        S'inscrire
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Hero Section */}
            <section className="pt-24 pb-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-blue-50 via-white to-white">
                <div className="max-w-6xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">

                        {/* Colonne gauche : texte */}
                        <div>
                            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
                                Pour les artisans qui se lancent
                            </div>

                            <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 leading-tight mb-5">
                                Votre premier devis professionnel{' '}
                                <span className="text-blue-600">en 2 minutes.</span>
                            </h1>

                            <p className="text-lg text-gray-600 leading-relaxed mb-8">
                                Artisan Facile vous guide pas à pas — sans formation, sans comptable.
                                Un outil simple, pensé pour les artisans qui démarrent.
                            </p>

                            <ul className="space-y-3 mb-10">
                                <li className="flex items-center gap-3 text-gray-700">
                                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    Toutes les mentions légales incluses automatiquement
                                </li>
                                <li className="flex items-center gap-3 text-gray-700">
                                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    Votre logo, vos tarifs, votre signature électronique
                                </li>
                                <li className="flex items-center gap-3 text-gray-700">
                                    <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                    100% gratuit pour démarrer — sans carte bancaire
                                </li>
                            </ul>

                            {user ? (
                                <Link
                                    to="/app"
                                    className="inline-flex items-center justify-center px-7 py-4 text-base font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
                                >
                                    Accéder à mon espace
                                    <ArrowRight className="ml-2 w-5 h-5" />
                                </Link>
                            ) : (
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="flex flex-col gap-1">
                                        <Link
                                            to="/register"
                                            className="inline-flex items-center justify-center px-7 py-4 text-base font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl"
                                        >
                                            Créer mon compte gratuit
                                            <ArrowRight className="ml-2 w-5 h-5" />
                                        </Link>
                                        <span className="text-xs text-gray-400 text-center">Sans carte bancaire · Sans engagement</span>
                                    </div>
                                    <button
                                        onClick={handleDemoLogin}
                                        disabled={demoLoading}
                                        className="inline-flex items-center justify-center px-7 py-4 text-base font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-60 shadow-sm"
                                    >
                                        {demoLoading ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : null}
                                        Voir la démo
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Colonne droite : aperçu devis */}
                        <div className="relative">
                            <div className="absolute -inset-4 bg-blue-100 rounded-3xl opacity-30 blur-2xl" />
                            <div className="relative bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100">
                                {/* En-tête du devis */}
                                <div className="p-6">
                                    <div className="flex justify-between items-start mb-5">
                                        <div>
                                            <div className="w-9 h-9 bg-blue-600 rounded-lg flex items-center justify-center mb-2">
                                                <span className="text-white font-bold">E</span>
                                            </div>
                                            <p className="font-bold text-gray-900 text-sm">Électricité Moreau</p>
                                            <p className="text-xs text-gray-400">14 av. Berthelot, 69007 Lyon</p>
                                            <p className="text-xs text-gray-400">SIRET : 812 345 678 00019</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xl font-extrabold text-blue-600">DEVIS</p>
                                            <p className="text-xs text-gray-400 mt-0.5">N° DEV-2026-0012</p>
                                            <p className="text-xs text-gray-400">02/04/2026</p>
                                            <span className="inline-block mt-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">En attente</span>
                                        </div>
                                    </div>

                                    <div className="bg-gray-50 rounded-lg p-3 mb-4 text-xs">
                                        <p className="font-semibold text-gray-800 mb-0.5">Client</p>
                                        <p className="text-gray-600">M. Dupont Bernard — 8 allée des Roses, 69006 Lyon</p>
                                        <p className="text-gray-400">bernard.dupont@email.fr</p>
                                    </div>

                                    <table className="w-full text-xs mb-4">
                                        <thead>
                                            <tr className="border-b border-gray-200 text-gray-400">
                                                <th className="text-left pb-2 font-medium">Description</th>
                                                <th className="text-right pb-2 font-medium">Qté</th>
                                                <th className="text-right pb-2 font-medium">P.U.</th>
                                                <th className="text-right pb-2 font-medium">Total HT</th>
                                            </tr>
                                        </thead>
                                        <tbody className="text-gray-700">
                                            <tr className="border-b border-gray-100">
                                                <td className="py-1.5">Tableau électrique 36 modules</td>
                                                <td className="text-right py-1.5">1</td>
                                                <td className="text-right py-1.5">320,00 €</td>
                                                <td className="text-right py-1.5 font-medium">320,00 €</td>
                                            </tr>
                                            <tr className="border-b border-gray-100">
                                                <td className="py-1.5">Point lumineux + câblage</td>
                                                <td className="text-right py-1.5">6</td>
                                                <td className="text-right py-1.5">45,00 €</td>
                                                <td className="text-right py-1.5 font-medium">270,00 €</td>
                                            </tr>
                                            <tr>
                                                <td className="py-1.5">Prises électriques (dont 2 USB)</td>
                                                <td className="text-right py-1.5">8</td>
                                                <td className="text-right py-1.5">28,00 €</td>
                                                <td className="text-right py-1.5 font-medium">224,00 €</td>
                                            </tr>
                                        </tbody>
                                    </table>

                                    <div className="flex justify-end mb-4">
                                        <div className="w-44 text-xs space-y-1">
                                            <div className="flex justify-between text-gray-500">
                                                <span>Total HT</span>
                                                <span>814,00 €</span>
                                            </div>
                                            <div className="flex justify-between text-gray-500">
                                                <span>TVA 10%</span>
                                                <span>81,40 €</span>
                                            </div>
                                            <div className="flex justify-between font-bold text-gray-900 text-sm border-t border-gray-200 pt-1">
                                                <span>Total TTC</span>
                                                <span className="text-blue-600">895,40 €</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                                        <p className="text-xs text-gray-400">Valable 30 jours · Paiement à réception</p>
                                        <div className="flex items-center gap-2">
                                            <div className="w-20 h-6 border border-dashed border-gray-300 rounded flex items-center justify-center">
                                                <span className="text-xs text-gray-400">Signature</span>
                                            </div>
                                            <div className="w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
                                                <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="bg-blue-600 px-6 py-2.5 text-center">
                                    <span className="text-white text-xs font-medium">
                                        Voici ce que reçoit votre client — en 2 minutes chrono
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Comment ça marche — 3 étapes */}
            <section className="py-20 bg-white border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-14">
                        <span className="inline-block px-4 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm font-bold mb-4">
                            Aucune formation requise
                        </span>
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                            De zéro à votre premier devis envoyé<br />
                            <span className="text-blue-600">en moins de 10 minutes</span>
                        </h2>
                        <p className="mt-4 text-lg text-gray-500">Vraiment. Voici comment ça se passe.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr,auto,1fr] gap-6 items-start">
                        {/* Étape 1 */}
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg mb-5">
                                <span className="text-[10px] font-bold uppercase tracking-wide opacity-70 -mb-1">Étape</span>
                                <span className="text-4xl font-extrabold leading-none">1</span>
                            </div>
                            <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-3">30 secondes</span>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Créez votre compte</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Votre nom, votre métier, votre SIRET. C'est tout.
                                Pas de carte bancaire, pas de formulaire interminable.
                            </p>
                        </div>

                        {/* Flèche 1→2 */}
                        <div className="hidden md:flex items-center justify-center pt-10">
                            <ArrowRight className="w-7 h-7 text-blue-200" />
                        </div>

                        {/* Étape 2 */}
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-blue-600 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg mb-5">
                                <span className="text-[10px] font-bold uppercase tracking-wide opacity-70 -mb-1">Étape</span>
                                <span className="text-4xl font-extrabold leading-none">2</span>
                            </div>
                            <span className="inline-block bg-blue-50 text-blue-700 text-xs font-bold px-3 py-1 rounded-full mb-3">2 minutes</span>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Rédigez votre devis</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Choisissez vos prestations dans la bibliothèque, ajoutez les quantités.
                                TVA, mentions légales, logo : tout se génère automatiquement.
                            </p>
                        </div>

                        {/* Flèche 2→3 */}
                        <div className="hidden md:flex items-center justify-center pt-10">
                            <ArrowRight className="w-7 h-7 text-blue-200" />
                        </div>

                        {/* Étape 3 */}
                        <div className="flex flex-col items-center text-center">
                            <div className="w-20 h-20 bg-green-500 text-white rounded-2xl flex flex-col items-center justify-center shadow-lg mb-5">
                                <span className="text-[10px] font-bold uppercase tracking-wide opacity-70 -mb-1">Étape</span>
                                <span className="text-4xl font-extrabold leading-none">3</span>
                            </div>
                            <span className="inline-block bg-green-50 text-green-700 text-xs font-bold px-3 py-1 rounded-full mb-3">Instantané</span>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">Envoyez &amp; faites-vous payer</h3>
                            <p className="text-gray-600 text-sm leading-relaxed">
                                Votre client reçoit le devis par email, le signe depuis son téléphone.
                                Transformez-le en facture en 1 clic dès la fin du chantier.
                            </p>
                        </div>
                    </div>

                    {/* Encart de réassurance + CTA */}
                    <div className="mt-14 bg-blue-50 rounded-2xl p-8 text-center border border-blue-100">
                        <p className="text-lg font-semibold text-gray-800 mb-1">
                            Pas besoin d'être à l'aise avec les logiciels.
                        </p>
                        <p className="text-gray-600 mb-6">
                            Si vous savez utiliser WhatsApp, vous saurez utiliser Artisan Facile.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                            <Link
                                to="/register"
                                className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-bold px-7 py-3.5 rounded-xl hover:bg-blue-700 transition-colors shadow text-base"
                            >
                                Je démarre maintenant — c'est gratuit
                                <ArrowRight className="w-4 h-4" />
                            </Link>
                            <button
                                onClick={handleDemoLogin}
                                disabled={demoLoading}
                                className="inline-flex items-center gap-1.5 text-gray-500 hover:text-blue-600 transition-colors text-sm font-medium disabled:opacity-60 underline underline-offset-2"
                            >
                                {demoLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                Voir la démo sans inscription
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* Avant / Avec Artisan Facile */}
            <section className="py-20 bg-gray-50 border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                            Votre quotidien,{' '}
                            <span className="text-blue-600">avant et après</span>
                        </h2>
                        <p className="mt-4 text-lg text-gray-500">
                            Ce que vivent la plupart des artisans qui se lancent — et ce que vous évitez.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 rounded-2xl overflow-hidden shadow-xl border border-gray-200">
                        {/* Colonne AVANT */}
                        <div className="bg-red-50 p-8 md:p-10">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-8 h-8 bg-red-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <X className="w-5 h-5 text-red-600" />
                                </div>
                                <h3 className="text-base font-extrabold text-red-600 uppercase tracking-widest">Avant</h3>
                            </div>
                            <ul className="space-y-6">
                                {[
                                    { text: 'Devis griffonné à la main ou bricolé sur Word', sub: 'Le client doute de votre sérieux' },
                                    { text: 'Soirées entières sur la paperasse', sub: 'Fatigue, erreurs, week-end gâché' },
                                    { text: '"Est-ce que ce client m\'a payé ?"', sub: 'Impayés oubliés, argent perdu' },
                                    { text: 'Peur d\'oublier la TVA ou une mention légale', sub: 'Risque de litige avec le client' },
                                    { text: 'Attendre des jours pour avoir une signature', sub: 'Le chantier part à la concurrence' },
                                ].map(({ text, sub }, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded-full bg-red-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <X className="w-3 h-3 text-red-500" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm leading-snug">{text}</p>
                                            <p className="text-xs text-red-400 mt-0.5">{sub}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>

                        {/* Colonne AVEC */}
                        <div className="bg-green-50 p-8 md:p-10 border-t md:border-t-0 md:border-l border-gray-200">
                            <div className="flex items-center gap-3 mb-8">
                                <div className="w-8 h-8 bg-green-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                    <CheckCircle className="w-5 h-5 text-green-600" />
                                </div>
                                <h3 className="text-base font-extrabold text-green-700 uppercase tracking-widest">Avec Artisan Facile</h3>
                            </div>
                            <ul className="space-y-6">
                                {[
                                    { text: 'Devis pro en 2 minutes, depuis votre téléphone', sub: 'Logo, SIRET, TVA : tout est inclus automatiquement' },
                                    { text: '10 minutes d\'admin par semaine, pas plus', sub: 'Devis → Facture en 1 clic' },
                                    { text: 'Tableau de bord : qui vous doit quoi, en temps réel', sub: 'Relances automatiques pour les impayés' },
                                    { text: 'Mentions légales et TVA générées automatiquement', sub: 'Zéro risque d\'oubli, zéro prise de tête' },
                                    { text: 'Le client signe en ligne depuis son téléphone', sub: 'Chantier bloqué en quelques minutes' },
                                ].map(({ text, sub }, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        <div className="w-5 h-5 rounded-full bg-green-200 flex items-center justify-center flex-shrink-0 mt-0.5">
                                            <CheckCircle className="w-3 h-3 text-green-600" />
                                        </div>
                                        <div>
                                            <p className="font-semibold text-gray-800 text-sm leading-snug">{text}</p>
                                            <p className="text-xs text-green-600 mt-0.5">{sub}</p>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid */}
            <section className="py-20 bg-gray-50">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                            Tous les outils d'un vrai artisan.<br />
                            <span className="text-blue-600">Prêts à l'emploi dès votre inscription.</span>
                        </h2>
                        <p className="mt-4 text-lg text-gray-500">
                            Pas de configuration, pas de formation. Tout est là, pensé pour aller vite.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            {
                                icon: <FileText className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />,
                                iconBg: 'bg-blue-100 group-hover:bg-blue-600',
                                title: 'Devis en 2 minutes, sur chantier',
                                description: 'Vous êtes chez un client qui veut un prix. Sélectionnez vos prestations, ajustez les quantités — votre devis est prêt, avec logo, SIRET et mentions légales. Envoyé par email avant de remonter dans votre camion.',
                                proof: 'Le client peut signer en ligne depuis son téléphone',
                            },
                            {
                                icon: <Users className="w-6 h-6 text-green-600 group-hover:text-white transition-colors" />,
                                iconBg: 'bg-green-100 group-hover:bg-green-600',
                                title: 'Suivi des impayés sans effort',
                                description: 'Un tableau vous dit en un coup d\'œil qui doit payer, combien, et depuis combien de jours. Plus besoin de fouiller dans vos emails. Relancez d\'un clic, sans gêne, au bon moment.',
                                proof: 'Factures en retard signalées automatiquement',
                            },
                            {
                                icon: <Calendar className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />,
                                iconBg: 'bg-purple-100 group-hover:bg-purple-600',
                                title: 'Planning sans double réservation',
                                description: 'Ajoutez vos chantiers en quelques secondes. Recevez un rappel le matin. Votre semaine s\'affiche en clair — plus jamais de rendez-vous oublié ou de journée qui se chevauche.',
                                proof: 'Vue semaine ou mois, sur mobile et ordinateur',
                            },
                            {
                                icon: <Zap className="w-6 h-6 text-orange-600 group-hover:text-white transition-colors" />,
                                iconBg: 'bg-orange-100 group-hover:bg-orange-600',
                                title: 'Tarifs enregistrés une fois pour toutes',
                                description: 'Renseignez votre main d\'œuvre et vos fournitures avec leur prix. La prochaine fois, vous sélectionnez depuis la liste — pas besoin de recalculer ou de retrouver vos tarifs dans un carnet.',
                                proof: 'Bibliothèque pré-remplie selon votre métier',
                            },
                            {
                                icon: <Smartphone className="w-6 h-6 text-red-500 group-hover:text-white transition-colors" />,
                                iconBg: 'bg-red-100 group-hover:bg-red-500',
                                title: 'Ça marche même sans réseau',
                                description: 'Sur un chantier en zone blanche ? Pas de panique. Vous travaillez normalement — créez, modifiez, consultez. Dès que le réseau revient, tout se synchronise sans rien faire.',
                                proof: 'Idéal en sous-sol, en forêt ou en rural',
                            },
                            {
                                icon: <Shield className="w-6 h-6 text-teal-600 group-hover:text-white transition-colors" />,
                                iconBg: 'bg-teal-100 group-hover:bg-teal-600',
                                title: 'Vos données toujours récupérables',
                                description: 'Devis, factures, contacts clients — tout est sauvegardé automatiquement. Même si vous cassez ou perdez votre téléphone, vous retrouvez tout en vous reconnectant sur n\'importe quel appareil.',
                                proof: 'Hébergé en Europe · Sauvegarde quotidienne',
                            },
                        ].map(({ icon, iconBg, title, description, proof }) => (
                            <div key={title} className="p-7 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all group border border-gray-100 flex flex-col gap-4">
                                <div className={`w-12 h-12 ${iconBg} rounded-xl flex items-center justify-center transition-colors flex-shrink-0`}>
                                    {icon}
                                </div>
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-gray-900 mb-2">{title}</h3>
                                    <p className="text-gray-600 text-sm leading-relaxed">{description}</p>
                                </div>
                                <p className="text-xs text-blue-600 font-semibold border-t border-gray-100 pt-3">{proof}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pour votre métier */}
            <section className="py-20 bg-white border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                            Fait pour <span className="text-blue-600">votre métier</span>
                        </h2>
                        <p className="mt-4 text-lg text-gray-500 max-w-2xl mx-auto">
                            Artisan Facile s'adapte à tous les corps de métier du bâtiment et des services.
                            Quel que soit votre activité, vous êtes au bon endroit.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Électricien',       emoji: '⚡' },
                            { label: 'Plombier',          emoji: '🔧' },
                            { label: 'Maçon',             emoji: '🧱' },
                            { label: 'Peintre',           emoji: '🖌️' },
                            { label: 'Menuisier',         emoji: '🪚' },
                            { label: 'Carreleur',         emoji: '🟫' },
                            { label: 'Couvreur',          emoji: '🏠' },
                            { label: 'Chauffagiste',      emoji: '🔥' },
                            { label: 'Paysagiste',        emoji: '🌿' },
                            { label: 'Serrurier',         emoji: '🔑' },
                            { label: 'Climaticien',       emoji: '❄️' },
                            { label: 'Multi-services',    emoji: '🛠️' },
                        ].map(({ label, emoji }) => (
                            <div
                                key={label}
                                className="flex items-center gap-3 bg-gray-50 hover:bg-blue-50 border border-gray-100 hover:border-blue-200 rounded-xl px-4 py-3.5 transition-colors group cursor-default"
                            >
                                <span className="text-2xl flex-shrink-0">{emoji}</span>
                                <span className="text-sm font-semibold text-gray-700 group-hover:text-blue-700 transition-colors">{label}</span>
                            </div>
                        ))}
                    </div>

                    <p className="text-center text-sm text-gray-400 mt-8">
                        Vous ne voyez pas votre métier ? Artisan Facile fonctionne pour tout artisan indépendant.
                    </p>
                </div>
            </section>

            {/* Témoignages */}
            <section className="py-20 bg-white border-b border-gray-100">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-14">
                        <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
                            Ils se sont lancés. Voici ce qu'ils en disent.
                        </h2>
                        <p className="mt-4 text-lg text-gray-500">Des artisans comme vous, en début d'activité.</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[
                            {
                                quote: "J'avais peur que ce soit compliqué. J'ai créé mon premier devis en 3 minutes le jour de mon inscription. Mon client a signé depuis son téléphone le soir même.",
                                name: "Thomas M.",
                                role: "Électricien",
                                since: "Lancé depuis 5 mois",
                                initials: "TM",
                                color: "bg-blue-600",
                            },
                            {
                                quote: "Avant je rentrais et je passais mes soirées sur Excel. Maintenant je fais la facture dans mon camion avant de démarrer. C'est un autre monde.",
                                name: "Sarah K.",
                                role: "Peintre en bâtiment",
                                since: "Auto-entrepreneuse",
                                initials: "SK",
                                color: "bg-purple-600",
                            },
                            {
                                quote: "La TVA et les mentions légales remplies automatiquement — c'est ça qui m'a convaincu. J'avais vraiment peur de faire une erreur au démarrage.",
                                name: "Karim B.",
                                role: "Plombier",
                                since: "Lancé depuis 3 mois",
                                initials: "KB",
                                color: "bg-orange-500",
                            },
                            {
                                quote: "Un client m'a dit que mes devis faisaient 'très professionnel'. J'avais l'impression d'avoir une assistante. Et c'est gratuit !",
                                name: "Lucie D.",
                                role: "Menuisière",
                                since: "Auto-entrepreneuse",
                                initials: "LD",
                                color: "bg-teal-600",
                            },
                            {
                                quote: "J'ai récupéré un impayé de 800€ grâce au rappel automatique. Sans ce suivi, j'aurais laissé tomber et perdu l'argent.",
                                name: "Marc R.",
                                role: "Maçon",
                                since: "Lancé depuis 4 mois",
                                initials: "MR",
                                color: "bg-red-500",
                            },
                            {
                                quote: "En 5 minutes j'avais mon compte, ma bibliothèque de prix configurée et mon premier devis envoyé. Je ne m'attendais pas à ce que ce soit aussi simple.",
                                name: "Nadia F.",
                                role: "Carreleur",
                                since: "Auto-entrepreneuse",
                                initials: "NF",
                                color: "bg-green-600",
                            },
                        ].map(({ quote, name, role, since, initials, color }) => (
                            <div key={name} className="bg-gray-50 rounded-2xl p-6 border border-gray-100 flex flex-col gap-4">
                                {/* Étoiles */}
                                <div className="flex gap-0.5">
                                    {[...Array(5)].map((_, i) => (
                                        <svg key={i} className="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                        </svg>
                                    ))}
                                </div>
                                {/* Citation */}
                                <p className="text-gray-700 text-sm leading-relaxed flex-1">"{quote}"</p>
                                {/* Auteur */}
                                <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                                    <div className={`w-9 h-9 ${color} rounded-full flex items-center justify-center flex-shrink-0`}>
                                        <span className="text-white text-xs font-bold">{initials}</span>
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-gray-900">{name}</p>
                                        <p className="text-xs text-gray-500">{role} · {since}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Pricing / Offer Section */}
            <section className="py-20 bg-blue-600">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-white sm:text-4xl">
                            Démarrez gratuitement.<br />Évoluez quand vous êtes prêt.
                        </h2>
                        <p className="mt-4 text-blue-100 text-lg max-w-2xl mx-auto">
                            Pas de mauvaise surprise. Tout ce qu'il faut pour lancer votre activité est 100% gratuit, pour toujours.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Free Plan */}
                        <div className="bg-white rounded-2xl p-8 relative">
                            <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                                <span className="bg-green-500 text-white text-xs font-bold px-4 py-1 rounded-full">RECOMMANDÉ POUR DÉMARRER</span>
                            </div>
                            <div className="mb-6">
                                <p className="text-lg font-semibold text-gray-700 mb-1">Plan Essentiel</p>
                                <div className="flex items-end gap-1">
                                    <span className="text-5xl font-extrabold text-gray-900">0€</span>
                                    <span className="text-gray-500 mb-2">/mois, pour toujours</span>
                                </div>
                                <p className="text-sm text-green-700 font-medium mt-1">Aucune carte bancaire requise</p>
                            </div>
                            <ul className="space-y-3 mb-8">
                                {[
                                    'Devis & factures illimités',
                                    'Bibliothèque de prix pré-remplie',
                                    'Agenda & planification chantiers',
                                    'CRM clients intégré',
                                    'Tableau de bord des impayés',
                                    'Signature électronique des devis',
                                    'Mode hors ligne (sans WiFi)',
                                    'Accès depuis mobile, tablette, PC',
                                ].map((f) => (
                                    <li key={f} className="flex items-center gap-3 text-gray-700 text-sm">
                                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                                        {f}
                                    </li>
                                ))}
                            </ul>
                            <Link
                                to="/register"
                                className="block w-full text-center bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition-colors"
                            >
                                Commencer gratuitement
                            </Link>
                        </div>

                        {/* Pro Plan */}
                        <div className="bg-white/10 rounded-2xl p-8 border border-white/20 text-white">
                            <div className="mb-6">
                                <p className="text-lg font-semibold text-blue-100 mb-1">Plan Pro</p>
                                <div className="flex items-end gap-1">
                                    <span className="text-5xl font-extrabold">Bientôt</span>
                                </div>
                                <p className="text-sm text-blue-200 mt-1">Fonctionnalités avancées pour scaler votre activité</p>
                            </div>
                            <ul className="space-y-3 mb-8">
                                {[
                                    'Tout du plan Essentiel, plus :',
                                    'Relances automatiques impayés',
                                    'Comptabilité avancée & export',
                                    'Rapports d\'intervention PDF',
                                    'Gestion des stocks',
                                    'Notes vocales transcrites',
                                    'Portail client personnalisé',
                                    'Support prioritaire',
                                ].map((f, i) => (
                                    <li key={f} className={`flex items-center gap-3 text-sm ${i === 0 ? 'font-semibold text-white' : 'text-blue-100'}`}>
                                        <CheckCircle className={`w-5 h-5 flex-shrink-0 ${i === 0 ? 'text-blue-300' : 'text-blue-300'}`} />
                                        {f}
                                    </li>
                                ))}
                            </ul>
                            <button
                                disabled
                                className="block w-full text-center bg-white/20 text-white font-bold py-3 rounded-xl cursor-not-allowed opacity-70"
                            >
                                Disponible prochainement
                            </button>
                        </div>
                    </div>
                </div>
            </section>

            {/* FAQ Section - SEO */}
            <section className="py-20 bg-white border-b border-gray-100">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-12">
                        <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                            Questions fréquentes
                        </h2>
                        <p className="mt-4 text-xl text-gray-600">
                            Tout ce que vous devez savoir sur Artisan Facile
                        </p>
                    </div>
                    <dl className="space-y-6">
                        {[
                            {
                                question: "Artisan Facile est-il vraiment gratuit ?",
                                answer: "Oui — et pas seulement en période d'essai. Le plan Essentiel est gratuit pour toujours, sans carte bancaire, sans engagement. Il inclut les devis et factures illimités, l'agenda, le CRM clients, la bibliothèque de prix et le mode hors ligne. Un plan Pro avec des fonctionnalités avancées sera disponible prochainement pour ceux qui souhaitent aller plus loin."
                            },
                            {
                                question: "Je démarre mon activité d'artisan, est-ce fait pour moi ?",
                                answer: "Absolument. Artisan Facile a été conçu spécialement pour les artisans en début d'activité et les auto-entrepreneurs. L'interface est simple et en français, aucune formation n'est nécessaire. Vous êtes opérationnel en moins de 5 minutes et vous créez votre premier devis professionnel dès le premier jour."
                            },
                            {
                                question: "Pour quels corps de métier est conçu Artisan Facile ?",
                                answer: "Artisan Facile convient à tous les corps de métier : plombier, électricien, maçon, menuisier, peintre, carreleur, couvreur, chauffagiste, paysagiste et tout artisan du bâtiment ou des services à domicile. L'outil s'adapte aussi bien aux auto-entrepreneurs qui démarrent qu'aux artisans avec une équipe."
                            },
                            {
                                question: "Combien de temps faut-il pour créer un devis ?",
                                answer: "Moins de 2 minutes. Grâce à la bibliothèque d'ouvrages et de prix pré-remplie, vous sélectionnez vos prestations, ajoutez vos quantités et envoyez le devis directement depuis votre téléphone sur le chantier. Votre client peut signer en ligne instantanément."
                            },
                            {
                                question: "Est-ce que ça fonctionne sans connexion internet ?",
                                answer: "Oui. L'application fonctionne en mode hors ligne : vous travaillez normalement même sans réseau sur le chantier, et vos données se synchronisent automatiquement dès que vous retrouvez une connexion."
                            }
                        ].map(({ question, answer }, i) => (
                            <div key={i} className="bg-gray-50 rounded-2xl p-6 border border-gray-100">
                                <dt className="text-lg font-semibold text-gray-900 mb-2">{question}</dt>
                                <dd className="text-gray-600 leading-relaxed">{answer}</dd>
                            </div>
                        ))}
                    </dl>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-20 bg-gray-900">
                <div className="max-w-4xl mx-auto text-center px-4">
                    <div className="inline-flex items-center gap-2 bg-green-500/20 text-green-400 px-4 py-1.5 rounded-full text-sm font-bold mb-6 border border-green-500/30">
                        <CheckCircle className="w-4 h-4" />
                        Gratuit — sans carte bancaire — sans engagement
                    </div>
                    <h2 className="text-3xl md:text-4xl font-extrabold text-white mb-5">
                        Vous lancez votre activité ?<br />
                        Commencez à zéro. Progressez sans limites.
                    </h2>
                    <p className="text-gray-400 text-lg mb-10 max-w-2xl mx-auto">
                        Rejoignez les artisans débutants qui gèrent leur activité avec Artisan Facile.
                        Devis, facturation, agenda, clients — tout en un, gratuit, depuis votre téléphone.
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center items-center gap-4">
                        <Link
                            to="/register"
                            className="inline-flex items-center justify-center gap-2 bg-blue-600 text-white font-bold px-8 py-4 rounded-xl hover:bg-blue-500 transition-colors shadow-lg text-lg"
                        >
                            Créer mon compte gratuit
                            <ArrowRight className="w-5 h-5" />
                        </Link>
                        <button
                            onClick={handleDemoLogin}
                            disabled={demoLoading}
                            className="inline-flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors text-sm underline underline-offset-2 disabled:opacity-60"
                        >
                            {demoLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                            Tester sans inscription
                        </button>
                    </div>
                    <p className="mt-5 text-xs text-gray-600">
                        Aucune carte bancaire requise · Inscription en 1 minute · Données hébergées en Europe
                    </p>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-gray-400 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="mb-6 md:mb-0">
                            <div className="flex items-center gap-2">
                                <img src="/logo-bleu.svg" alt="Logo Artisan Facile" className="w-8 h-8 rounded-md" />
                                <span className="text-2xl font-bold text-white">Artisan Facile</span>
                            </div>
                            <p className="mt-2 text-sm max-w-xs">
                                Le logiciel de gestion tout-en-un pour artisans : devis, facturation, agenda, CRM et comptabilité.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-6 justify-center md:justify-end">
                            <Link to="/mentions-legales" className="hover:text-white transition-colors">Mentions légales</Link>
                            <Link to="/politique-confidentialite" className="hover:text-white transition-colors">Confidentialité</Link>
                            <a href="mailto:contact@artisanfacile.fr" className="hover:text-white transition-colors">Contact</a>
                        </div>
                    </div>
                    <div className="mt-8 text-center text-sm border-t border-gray-800 pt-8">
                        © {new Date().getFullYear()} Artisan Facile. Tous droits réservés. — Logiciel de gestion pour artisans, auto-entrepreneurs et TPE du bâtiment.
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
