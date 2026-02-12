import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './layouts/Layout';
import ReloadPrompt from './components/ReloadPrompt';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';

// Configuration du cache React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Ne pas refetch automatiquement quand la fenêtre reprend le focus
      refetchOnWindowFocus: false,
      // Réessayer 1 fois, sauf si hors-ligne
      retry: (failureCount) => {
        if (!navigator.onLine) return false;
        return failureCount < 1;
      },
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

// Lazy loading avec retry automatique (fix Safari/iOS)
// Quand un chunk JS échoue (cache SW périmé après redéploiement),
// on vide le cache du Service Worker et on retente l'import
const lazyWithRetry = (importFn) => {
  return lazy(() =>
    importFn().catch(async () => {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(key => caches.delete(key)));
      }
      return importFn();
    })
  );
};

// Pages chargées à la demande (lazy loading avec retry)
// Cela réduit le temps de chargement initial de ~50%
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const Clients = lazyWithRetry(() => import('./pages/Clients'));
const ClientForm = lazyWithRetry(() => import('./pages/ClientForm'));
const CRM = lazyWithRetry(() => import('./pages/CRM'));
const DevisList = lazyWithRetry(() => import('./pages/DevisList'));
const DevisForm = lazyWithRetry(() => import('./pages/DevisForm'));
const Agenda = lazyWithRetry(() => import('./pages/Agenda'));
const PriceLibrary = lazyWithRetry(() => import('./pages/PriceLibrary'));
const Maintenance = lazyWithRetry(() => import('./pages/Maintenance'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const ClientPortal = lazyWithRetry(() => import('./pages/portal/ClientPortal'));
const PublicQuote = lazyWithRetry(() => import('./pages/PublicQuote'));
const ActivitySettings = lazyWithRetry(() => import('./pages/settings/ActivitySettings'));
const Inventory = lazyWithRetry(() => import('./pages/Inventory'));
const Portfolio = lazyWithRetry(() => import('./pages/Portfolio'));
// FollowUps est maintenant intégré dans DevisList comme sous-onglet
const Rentals = lazyWithRetry(() => import('./pages/Rentals'));
const Accounting = lazyWithRetry(() => import('./pages/Accounting'));
const Marketing = lazyWithRetry(() => import('./pages/Marketing'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" />;
  return children;
};

function App() {
  return (
    <ErrorBoundary>
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
                <Route path="follow-ups" element={<Navigate to="/app/devis" state={{ filter: 'followups' }} replace />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="settings" element={<Profile />} />
                <Route path="settings/activity" element={<ActivitySettings />} />
                <Route path="accounting" element={<Accounting />} />
                <Route path="marketing" element={<Marketing />} />
              </Route>
            </Routes >
          </Suspense >
        </BrowserRouter >
      </AuthProvider >
    </QueryClientProvider >
    </ErrorBoundary>
  );
}

export default App;
