import React, { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, Shield, Zap, Smartphone, Calendar, FileText, Users, Loader2 } from 'lucide-react';
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

            {/* Hero Section — Problème / Solution */}
            <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-slate-50 to-white">
                <div className="max-w-5xl mx-auto">

                    {/* Cible */}
                    <div className="text-center mb-8">
                        <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-800 px-5 py-2 rounded-full text-sm font-bold border border-blue-200">
                            Pour les artisans et auto-entrepreneurs qui se lancent
                        </div>
                    </div>

                    {/* Titre problème */}
                    <div className="text-center mb-10">
                        <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900 tracking-tight leading-tight mb-4">
                            Vous venez de vous lancer.<br />
                            <span className="text-red-500">L'administratif ne devrait pas vous bloquer.</span>
                        </h1>
                        <p className="text-lg text-gray-500 max-w-2xl mx-auto">
                            Ces questions vous bloquent probablement en ce moment :
                        </p>
                    </div>

                    {/* Points de douleur */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-left">
                            <div className="text-2xl mb-3">😰</div>
                            <p className="font-semibold text-gray-800 text-sm leading-snug">
                                "Comment je fais un devis professionnel ? Je n'ai aucun modèle..."
                            </p>
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-left">
                            <div className="text-2xl mb-3">😤</div>
                            <p className="font-semibold text-gray-800 text-sm leading-snug">
                                "Je vais passer mes soirées sur la paperasse au lieu de me reposer..."
                            </p>
                        </div>
                        <div className="bg-red-50 border border-red-100 rounded-2xl p-5 text-left">
                            <div className="text-2xl mb-3">😟</div>
                            <p className="font-semibold text-gray-800 text-sm leading-snug">
                                "Et si j'oublie une mention légale ? Et si un client ne me paie pas ?"
                            </p>
                        </div>
                    </div>

                    {/* Transition */}
                    <div className="flex items-center justify-center gap-4 mb-10">
                        <div className="h-px flex-1 max-w-20 bg-gray-200" />
                        <div className="flex items-center gap-2 text-green-700 font-bold text-base">
                            <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                            Artisan Facile résout tout ça — dès le premier jour
                        </div>
                        <div className="h-px flex-1 max-w-20 bg-gray-200" />
                    </div>

                    {/* Solution */}
                    <div className="text-center mb-8">
                        <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 tracking-tight mb-4">
                            Votre premier devis pro{' '}
                            <span className="text-blue-600">en 2 minutes.</span><br />
                            Toutes les mentions légales. Votre logo. Prêt à envoyer.
                        </h2>
                        <p className="text-lg text-gray-600 max-w-2xl mx-auto mb-4">
                            Artisan Facile vous guide pas à pas. Pas de formation, pas de comptable nécessaire.
                            Juste un outil simple qui fait le travail à votre place —{' '}
                            <strong>gratuitement</strong>.
                        </p>
                        <div className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-5 py-2 rounded-full text-sm font-bold border border-green-200">
                            <CheckCircle className="w-4 h-4 flex-shrink-0" />
                            100% Gratuit pour démarrer — sans carte bancaire, sans engagement
                        </div>
                    </div>

                    {/* CTAs */}
                    <div className="flex flex-col sm:flex-row justify-center gap-4 mb-14">
                        {user ? (
                            <Link
                                to="/app"
                                className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
                            >
                                Accéder à mon espace
                                <ArrowRight className="ml-2 w-5 h-5" />
                            </Link>
                        ) : (
                            <>
                                <div className="flex flex-col items-center gap-1">
                                    <Link
                                        to="/register"
                                        className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
                                    >
                                        Créer mon compte gratuit
                                        <ArrowRight className="ml-2 w-5 h-5" />
                                    </Link>
                                    <span className="text-xs text-gray-500">Gratuit · Sans CB · Sans engagement</span>
                                </div>
                                <div className="flex flex-col items-center gap-1">
                                    <button
                                        onClick={handleDemoLogin}
                                        disabled={demoLoading}
                                        className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-gray-700 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all disabled:opacity-60"
                                    >
                                        {demoLoading ? (
                                            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                                        ) : null}
                                        Tester sans inscription
                                    </button>
                                    <span className="text-xs text-gray-500">Compte démo pré-rempli · Aucune donnée requise</span>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 max-w-3xl mx-auto border-t border-gray-200 pt-8 text-center">
                        <div>
                            <p className="text-3xl font-bold text-green-600">Gratuit</p>
                            <p className="text-gray-600 text-sm">Pour toujours sur l'essentiel</p>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-gray-900">0€</p>
                            <p className="text-gray-600 text-sm">Sans carte bancaire</p>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-gray-900">2 min</p>
                            <p className="text-gray-600 text-sm">Pour créer un devis</p>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-gray-900">5 min</p>
                            <p className="text-gray-600 text-sm">Pour être opérationnel</p>
                        </div>
                    </div>
                </div>

                {/* Devis Mockup */}
                <div className="max-w-3xl mx-auto mt-16 relative z-10">
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 transform rotate-1 hover:rotate-0 transition-transform duration-500">
                        {/* En-tête du devis */}
                        <div className="p-6 sm:p-8">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-2">
                                        <span className="text-white font-bold text-lg">E</span>
                                    </div>
                                    <p className="font-bold text-gray-900 text-sm">Électricité Moreau</p>
                                    <p className="text-xs text-gray-500">14 avenue Berthelot, 69007 Lyon</p>
                                    <p className="text-xs text-gray-500">SIRET : 812 345 678 00019</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-2xl font-extrabold text-blue-600">DEVIS</p>
                                    <p className="text-xs text-gray-500 mt-1">N° DEV-2026-0012</p>
                                    <p className="text-xs text-gray-500">Date : 02/04/2026</p>
                                    <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-semibold rounded-full">En attente</span>
                                </div>
                            </div>

                            <div className="bg-gray-50 rounded-lg p-3 mb-5 text-xs">
                                <p className="font-semibold text-gray-900">Client :</p>
                                <p className="text-gray-700">M. Dupont Bernard — 8 allée des Roses, 69006 Lyon</p>
                                <p className="text-gray-500">06 12 34 56 78 — bernard.dupont@email.fr</p>
                            </div>

                            {/* Lignes du devis */}
                            <table className="w-full text-xs mb-5">
                                <thead>
                                    <tr className="border-b border-gray-200 text-gray-500">
                                        <th className="text-left pb-2 font-medium">Description</th>
                                        <th className="text-right pb-2 font-medium">Qté</th>
                                        <th className="text-right pb-2 font-medium">P.U.</th>
                                        <th className="text-right pb-2 font-medium">Total HT</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-700">
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2">Mise en place tableau électrique 36 modules</td>
                                        <td className="text-right py-2">1</td>
                                        <td className="text-right py-2">320,00 €</td>
                                        <td className="text-right py-2 font-medium">320,00 €</td>
                                    </tr>
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2">Point lumineux + câblage</td>
                                        <td className="text-right py-2">6</td>
                                        <td className="text-right py-2">45,00 €</td>
                                        <td className="text-right py-2 font-medium">270,00 €</td>
                                    </tr>
                                    <tr>
                                        <td className="py-2">Pose prises électriques (dont 2 USB)</td>
                                        <td className="text-right py-2">8</td>
                                        <td className="text-right py-2">28,00 €</td>
                                        <td className="text-right py-2 font-medium">224,00 €</td>
                                    </tr>
                                </tbody>
                            </table>

                            {/* Totaux */}
                            <div className="flex justify-end">
                                <div className="w-48 text-xs space-y-1">
                                    <div className="flex justify-between text-gray-600">
                                        <span>Total HT</span>
                                        <span>814,00 €</span>
                                    </div>
                                    <div className="flex justify-between text-gray-600">
                                        <span>TVA 10%</span>
                                        <span>81,40 €</span>
                                    </div>
                                    <div className="flex justify-between font-bold text-gray-900 text-sm border-t border-gray-200 pt-1 mt-1">
                                        <span>Total TTC</span>
                                        <span className="text-blue-600">895,40 €</span>
                                    </div>
                                </div>
                            </div>

                            {/* Signature */}
                            <div className="mt-5 flex items-center justify-between border-t border-gray-100 pt-4">
                                <p className="text-xs text-gray-400">Valable 30 jours · Paiement à réception</p>
                                <div className="flex items-center gap-2">
                                    <div className="w-24 h-7 border border-dashed border-gray-300 rounded flex items-center justify-center">
                                        <span className="text-xs text-gray-400">Signature client</span>
                                    </div>
                                    <div className="w-7 h-7 bg-green-500 rounded-full flex items-center justify-center">
                                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-blue-600 px-6 py-3 text-center">
                            <span className="text-white text-sm font-medium">
                                Voici exactement ce que reçoivent vos clients · Signature électronique incluse
                            </span>
                        </div>
                    </div>
                </div>
            </section>

            {/* Why Choose Us - ROI Section */}
            <section className="py-20 bg-white border-b border-gray-100">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                            Pourquoi les artisans gagnent plus avec nous ?
                        </h2>
                        <p className="mt-4 text-xl text-gray-600">
                            Des résultats concrets sur votre quotidien et votre compte en banque.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                        {/* Money Benefit */}
                        <div className="bg-blue-50 rounded-2xl p-8 border border-blue-100 relative overflow-hidden group hover:shadow-lg transition-all">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Zap className="w-48 h-48 text-blue-600" />
                            </div>
                            <div className="relative z-10">
                                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-bold mb-4">RENTABILITÉ</span>
                                <h3 className="text-3xl font-bold text-gray-900 mb-4">
                                    + 15% de Chiffre d'Affaires
                                </h3>
                                <p className="text-lg text-gray-700 mb-6">
                                    Ne laissez plus aucuns devis sans réponse. Avec les <strong>relances automatiques</strong> et des devis ultra-professionnels, vous signez plus de chantiers.
                                </p>
                                <ul className="space-y-3">
                                    <li className="flex items-center text-gray-600">
                                        <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                                        Relances de factures impayées automatisées
                                    </li>
                                    <li className="flex items-center text-gray-600">
                                        <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                                        Devis signés en ligne instantanément
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* Time Benefit */}
                        <div className="bg-green-50 rounded-2xl p-8 border border-green-100 relative overflow-hidden group hover:shadow-lg transition-all">
                            <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Calendar className="w-48 h-48 text-green-600" />
                            </div>
                            <div className="relative z-10">
                                <span className="inline-block px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-bold mb-4">TEMPS LIBRE</span>
                                <h3 className="text-3xl font-bold text-gray-900 mb-4">
                                    5 Heures gagnées par semaine
                                </h3>
                                <p className="text-lg text-gray-700 mb-6">
                                    Fini l'administratif le soir et le week-end. Créez vos devis dans votre camion en <strong>moins de 2 minutes</strong> grâce à la bibliothèque de prix.
                                </p>
                                <ul className="space-y-3">
                                    <li className="flex items-center text-gray-600">
                                        <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                                        Bibliothèque d'ouvrages pré-remplie
                                    </li>
                                    <li className="flex items-center text-gray-600">
                                        <CheckCircle className="w-5 h-5 text-green-500 mr-2" />
                                        Transformation Devis → Facture en 1 clic
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Features Grid Header (Existing Start) */}
            <section className="py-20 bg-gray-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="text-center mb-16">
                        <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
                            Tout ce dont vous avez besoin
                        </h2>
                        <p className="mt-4 text-xl text-gray-600">
                            Une suite d'outils complète pensée pour les artisans
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                        {/* Feature 1 */}
                        <div className="p-8 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all group border border-gray-100">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                                <FileText className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Devis en 2 minutes</h3>
                            <p className="text-gray-600">
                                Créez des documents pro sur place. Impressionnez vos clients par votre réactivité et bloquez le chantier immédiatement.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="p-8 bg-white rounded-2xl shadow-sm hover:shadow-md transition-all group border border-gray-100">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-green-600 transition-colors">
                                <Users className="w-6 h-6 text-green-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Fini les impayés</h3>
                            <p className="text-gray-600">
                                Suivez qui vous doit de l'argent en temps réel. Un tableau de bord clair pour relancer au bon moment.
                            </p>
                        </div>

                        {/* Feature 3 */}
                        <div className="p-8 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-colors group">
                            <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-purple-600 transition-colors">
                                <Calendar className="w-6 h-6 text-purple-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Agenda Intelligent</h3>
                            <p className="text-gray-600">
                                Planifiez vos interventions et recevez des rappels. Synchronisation facile avec vos calendriers.
                            </p>
                        </div>

                        {/* Feature 4 */}
                        <div className="p-8 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-colors group">
                            <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-orange-600 transition-colors">
                                <Zap className="w-6 h-6 text-orange-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Bibliothèque de Prix</h3>
                            <p className="text-gray-600">
                                Gagnez du temps en enregistrant vos prestations et matériaux favoris pour vos futurs devis.
                            </p>
                        </div>

                        {/* Feature 5 */}
                        <div className="p-8 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-colors group">
                            <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-red-600 transition-colors">
                                <Smartphone className="w-6 h-6 text-red-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Mode Hors Ligne</h3>
                            <p className="text-gray-600">
                                Continuez à travailler même sans connexion internet. Vos données se synchronisent automatiquement.
                            </p>
                        </div>

                        {/* Feature 6 */}
                        <div className="p-8 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-colors group">
                            <div className="w-12 h-12 bg-teal-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-teal-600 transition-colors">
                                <Shield className="w-6 h-6 text-teal-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Sécurisé & Fiable</h3>
                            <p className="text-gray-600">
                                Vos données sont cryptées et sauvegardées quotidiennement. Accédez à votre bureau partout.
                            </p>
                        </div>
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
                            <span className="text-2xl font-bold text-white">Artisan Facile</span>
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
