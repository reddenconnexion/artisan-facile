import React from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CheckCircle, ArrowRight, Shield, Zap, Smartphone, Calendar, FileText, Users } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const LandingPage = () => {
    const { user, loading, loginAsDemo } = useAuth();
    const navigate = useNavigate();

    const handleDemoLogin = async () => {
        try {
            await loginAsDemo();
            toast.success("Bienvenue sur la version de démonstration !");
            navigate('/app');
        } catch (error) {
            console.error(error);
            toast.error("Impossible de créer une session démo.");
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

            {/* Hero Section */}
            <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-b from-blue-50 to-white">
                <div className="max-w-7xl mx-auto text-center">
                    <h1 className="text-5xl md:text-6xl font-extrabold text-gray-900 tracking-tight mb-8">
                        Ne perdez plus d'argent. <br />
                        <span className="text-blue-600">Gagnez du temps pour vos chantiers.</span>
                    </h1>
                    <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto mb-10">
                        Artisan Facile est l'outil qui rentabilise votre activité.
                        <span className="block mt-2 font-semibold text-gray-900">
                            💰 Augmentez votre Chiffre d'Affaires de +15%
                            <span className="mx-2 hidden sm:inline">•</span>
                            ⏳ Économisez 5h/semaine de gestion
                        </span>
                    </p>
                    <div className="flex flex-col sm:flex-row justify-center gap-4">
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
                                <Link
                                    to="/register"
                                    className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-all transform hover:scale-105 shadow-lg hover:shadow-xl"
                                >
                                    Commencer gratuitement
                                    <ArrowRight className="ml-2 w-5 h-5" />
                                </Link>
                                <button
                                    onClick={handleDemoLogin}
                                    className="inline-flex items-center justify-center px-8 py-4 text-lg font-bold text-gray-700 bg-white border-2 border-gray-200 rounded-xl hover:bg-gray-50 transition-all"
                                >
                                    Accès Démo (sans inscription)
                                </button>
                            </>
                        )}
                    </div>

                    {/* Trust Badges / Stats */}
                    <div className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-8 max-w-4xl mx-auto border-t border-gray-200 pt-8">
                        <div>
                            <p className="text-3xl font-bold text-gray-900">100%</p>
                            <p className="text-gray-600">Conforme</p>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-gray-900">0€</p>
                            <p className="text-gray-600">Frais cachés</p>
                        </div>
                        <div>
                            <p className="text-3xl font-bold text-gray-900">24/7</p>
                            <p className="text-gray-600">Accessible</p>
                        </div>
                    </div>
                </div>

                {/* PDF Preview */}
                <div className="max-w-5xl mx-auto mt-16 relative z-10">
                    <div className="bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-100 transform rotate-1 hover:rotate-0 transition-transform duration-500">
                        <img
                            src="/images/quote_mockup.png"
                            alt="Exemple de devis professionnel généré par Artisan Facile"
                            className="w-full h-auto"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent pointer-events-none"></div>
                        <div className="absolute bottom-4 left-4 right-4 text-center">
                            <span className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-full text-sm font-medium text-gray-800 shadow-sm">
                                👆 Voici exactement ce que reçoivent vos clients
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

            {/* CTA Section */}
            <section className="py-20 bg-blue-600">
                <div className="max-w-4xl mx-auto text-center px-4">
                    <h2 className="text-3xl font-bold text-white mb-8">
                        Prêt à simplifier votre quotidien ?
                    </h2>
                    <p className="text-blue-100 text-xl mb-10">
                        Rejoignez les artisans qui nous font confiance pour gérer leur activité.
                    </p>
                    <Link
                        to="/register"
                        className="inline-block bg-white text-blue-600 font-bold px-8 py-4 rounded-xl hover:bg-gray-100 transition-colors shadow-lg"
                    >
                        Créer mon compte gratuit
                    </Link>
                </div>
            </section>

            {/* Footer */}
            <footer className="bg-gray-900 text-gray-400 py-12">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex flex-col md:flex-row justify-between items-center">
                        <div className="mb-4 md:mb-0">
                            <span className="text-2xl font-bold text-white">Artisan Facile</span>
                            <p className="mt-2 text-sm">L'outil préféré des artisans connectés.</p>
                        </div>
                        <div className="flex gap-8">
                            <a href="#" className="hover:text-white transition-colors">Mentions légales</a>
                            <a href="#" className="hover:text-white transition-colors">Contact</a>
                            <a href="#" className="hover:text-white transition-colors">Aide</a>
                        </div>
                    </div>
                    <div className="mt-8 text-center text-sm border-t border-gray-800 pt-8">
                        © {new Date().getFullYear()} Artisan Facile. Tous droits réservés.
                    </div>
                </div>
            </footer>
        </div>
    );
};

export default LandingPage;
