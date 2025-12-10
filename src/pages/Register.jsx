import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { toast } from 'sonner';

const Register = () => {
    const navigate = useNavigate();
    const { signUp } = useAuth();
    const [loading, setLoading] = useState(false);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [jobType, setJobType] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const { data, error } = await signUp({
                email,
                password,
                options: {
                    data: {
                        job_type: jobType
                    }
                }
            });
            if (error) throw error;

            if (data.session) {
                toast.success('Inscription réussie ! Vous êtes connecté.');
                navigate('/app');
            } else {
                toast.success('Inscription réussie ! Veuillez vérifier votre email pour confirmer votre compte.');
                navigate('/login');
            }
        } catch (error) {
            console.error('Registration error:', error);
            if (error.message.includes('valid email')) {
                toast.error('Adresse email invalide. Veuillez utiliser une adresse réelle.');
            } else {
                toast.error(error.message || 'Erreur lors de l\'inscription');
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8">
                <div>
                    <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                        Créer un compte
                    </h2>
                    <p className="mt-2 text-center text-sm text-gray-600">
                        Déjà inscrit ?{' '}
                        <Link to="/login" className="font-medium text-blue-600 hover:text-blue-500">
                            Se connecter
                        </Link>
                    </p>
                </div>

                <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0">
                            <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                            </svg>
                        </div>
                        <div className="ml-3">
                            <p className="text-sm text-blue-700">
                                Une adresse email valide est requise. Vous devrez cliquer sur le lien de confirmation envoyé par email avant de pouvoir vous connecter.
                            </p>
                        </div>
                    </div>
                </div>

                <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                    <div className="rounded-md shadow-sm -space-y-px">
                        <div>
                            <input
                                type="email"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Adresse email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                placeholder="Mot de passe"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                        </div>
                        <div>
                            <select
                                required
                                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                                value={jobType}
                                onChange={(e) => setJobType(e.target.value)}
                            >
                                <option value="" disabled>Quel est votre corps de métier ?</option>
                                <option value="plombier">Plombier</option>
                                <option value="peintre">Peintre</option>
                                <option value="electricien">Électricien</option>
                                <option value="macon">Maçon</option>
                                <option value="menuisier">Menuisier</option>
                                <option value="paysagiste">Paysagiste</option>
                                <option value="multiservice">Multi-services / Bricolage</option>
                                <option value="autre">Autre (Partir de zéro)</option>
                            </select>
                        </div>
                    </div>

                    <div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                        >
                            {loading ? 'Inscription...' : 'S\'inscrire & Configurer mon espace'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default Register;
