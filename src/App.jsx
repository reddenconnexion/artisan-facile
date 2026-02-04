import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './layouts/Layout';
import ReloadPrompt from './components/ReloadPrompt';
import OfflineBanner from './components/OfflineBanner';

// Configuration du cache React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ne pas refetch automatiquement quand la fenêtre reprend le focus
      refetchOnWindowFocus: false,
      // Réessayer 1 fois en cas d'erreur
      retry: 1,
      // Garder les données en cache 5 minutes par défaut
      staleTime: 5 * 60 * 1000,
    },
  },
});

// Composant de chargement pour les pages en lazy loading
const PageLoader = () => (
  <div className="flex items-center justify-center h-screen">
    <div className="flex flex-col items-center gap-3">
      <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
      <span className="text-gray-500 text-sm">Chargement...</span>
    </div>
  </div>
);

// Pages chargées immédiatement (critiques pour le premier affichage)
import LandingPage from './pages/LandingPage';
import Login from './pages/Login';
import Register from './pages/Register';

// Pages chargées à la demande (lazy loading)
// Cela réduit le temps de chargement initial de ~50%
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientForm = lazy(() => import('./pages/ClientForm'));
const CRM = lazy(() => import('./pages/CRM'));
const DevisList = lazy(() => import('./pages/DevisList'));
const DevisForm = lazy(() => import('./pages/DevisForm'));
const Agenda = lazy(() => import('./pages/Agenda'));
const PriceLibrary = lazy(() => import('./pages/PriceLibrary'));
const Maintenance = lazy(() => import('./pages/Maintenance'));
const Profile = lazy(() => import('./pages/Profile'));
const ClientPortal = lazy(() => import('./pages/portal/ClientPortal'));
const PublicQuote = lazy(() => import('./pages/PublicQuote'));
const ActivitySettings = lazy(() => import('./pages/settings/ActivitySettings'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const FollowUps = lazy(() => import('./pages/FollowUps'));
const Rentals = lazy(() => import('./pages/Rentals'));
const Accounting = lazy(() => import('./pages/Accounting'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  return children;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ReloadPrompt />
        <OfflineBanner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              <Route path="/p/:token" element={<ClientPortal />} />
              <Route path="/q/:token" element={<PublicQuote />} />

              <Route path="/app" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="agenda" element={<Agenda />} />
                <Route path="clients" element={<Clients />} />
                <Route path="clients/new" element={<ClientForm />} />
                <Route path="clients/:id" element={<ClientForm />} />
                <Route path="crm" element={<CRM />} />
                <Route path="devis" element={<DevisList />} />
                <Route path="devis/:id" element={<DevisForm />} />
                <Route path="maintenance" element={<Maintenance />} />
                <Route path="rentals" element={<Rentals />} />
                <Route path="library" element={<PriceLibrary />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="follow-ups" element={<FollowUps />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="settings" element={<Profile />} />
                <Route path="settings/activity" element={<ActivitySettings />} />
                <Route path="accounting" element={<Accounting />} />
              </Route>
            </Routes >
          </Suspense >
        </BrowserRouter >
      </AuthProvider >
    </QueryClientProvider >
  );
}

export default App;
