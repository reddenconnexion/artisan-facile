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

    // if (user) {
    //     return <Navigate to="/app" />;
    // }

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
                        Gérez votre activité d'artisan <br />
                        <span className="text-blue-600">en toute simplicité</span>
                    </h1>
                    <p className="mt-4 text-xl text-gray-600 max-w-3xl mx-auto mb-10">
                        La solution tout-en-un pour créer vos devis, gérer vos factures et suivre vos chantiers.
                        Gagnez du temps et concentrez-vous sur votre métier.
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

            {/* Features Section */}
            <section className="py-20 bg-white">
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
                        <div className="p-8 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-colors group">
                            <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                                <FileText className="w-6 h-6 text-blue-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Devis & Factures</h3>
                            <p className="text-gray-600">
                                Créez des documents professionnels en quelques clics. Transformez vos devis en factures instantanément.
                            </p>
                        </div>

                        {/* Feature 2 */}
                        <div className="p-8 bg-gray-50 rounded-2xl hover:bg-blue-50 transition-colors group">
                            <div className="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center mb-6 group-hover:bg-green-600 transition-colors">
                                <Users className="w-6 h-6 text-green-600 group-hover:text-white transition-colors" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-3">Gestion Clients (CRM)</h3>
                            <p className="text-gray-600">
                                Centralisez les informations de vos clients. Historique des chantiers, coordonnées et notes personnelles.
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
