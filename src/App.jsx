import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider, QueryCache } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext';
import { TestModeProvider } from './context/TestModeContext';
import Layout from './layouts/Layout';
import ReloadPrompt from './components/ReloadPrompt';
import OfflineBanner from './components/OfflineBanner';
import ErrorBoundary from './components/ErrorBoundary';

// Skip noisy errors that the rest of the app already surfaces (auth flows
// that show their own toast, not-found from a single-row .single() query…).
// Surfacing those again would create duplicate toasts.
const isQuiet = (error) => {
  if (!error) return true;
  const msg = String(error.message || '');
  if (msg.includes('JWT') || msg.includes('not authenticated')) return true;
  // PGRST116 = "Results contain 0 rows" from .single(). Used for "does X exist?"
  // checks where the empty result is expected.
  if (error.code === 'PGRST116') return true;
  return false;
};

let lastErrorToastAt = 0;
const queryClient = new QueryClient({
  // Single global handler: any background fetch error that isn't expected
  // gets a discreet toast instead of being silently logged. Throttled so a
  // burst of failures doesn't flood the UI.
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (!navigator.onLine) return; // OfflineBanner already handles this
      if (isQuiet(error)) return;
      // Skip if data is already in cache (the user can still see something);
      // the next refetch will retry on its own.
      if (query.state.data !== undefined) return;
      const now = Date.now();
      if (now - lastErrorToastAt < 5000) return;
      lastErrorToastAt = now;
      console.error('[query]', query.queryKey, error);
      toast.error('Impossible de charger ces données.', {
        description: 'Vérifiez votre connexion ou réessayez dans un instant.',
        duration: 4000,
      });
    },
  }),
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
import MentionsLegales from './pages/MentionsLegales';
import PolitiqueConfidentialite from './pages/PolitiqueConfidentialite';
import ResetPassword from './pages/ResetPassword';

// Pages publiques chargées immédiatement (liens clients /q/:token et /p/:token)
// Pas de lazy loading = pas de chunk séparé = affichage direct sur Safari/iPhone
import PublicQuote from './pages/PublicQuote';
import ClientPortal from './pages/portal/ClientPortal';

// Lazy loading avec retry automatique (fix Safari/iOS + Chrome Android).
// Trois protections :
//   1. timeout : un chunk qui pend (SW coincé) doit échouer pour qu'on retente,
//      sinon Suspense reste figé sur le PageLoader indéfiniment.
//   2. purge ciblée des caches Workbox / vite-plugin-pwa avant retry, sans
//      toucher aux caches métier (offline data) que l'utilisateur consulte.
//   3. en dernier recours, désinscription du SW + reload one-shot pour casser
//      un état de SW bloqué — guardé par sessionStorage pour éviter une boucle.
const isWorkerOrAssetCache = (name) =>
  name.startsWith('workbox-') ||
  name.startsWith('pwa-') ||
  name.startsWith('vite-') ||
  name.includes('precache') ||
  name.includes('runtime');

const CHUNK_IMPORT_TIMEOUT_MS = 10000;
const RECOVERY_FLAG = 'lazy_retry_recovery_attempted';

const importWithTimeout = (importFn) =>
  Promise.race([
    importFn(),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('chunk import timed out')), CHUNK_IMPORT_TIMEOUT_MS)
    ),
  ]);

const purgeServiceWorkerAssets = async () => {
  if ('caches' in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter(isWorkerOrAssetCache).map((key) => caches.delete(key))
      );
    } catch (cacheErr) {
      console.warn('[lazyWithRetry] cache purge failed:', cacheErr);
    }
  }
};

const hardRecovery = async () => {
  if (sessionStorage.getItem(RECOVERY_FLAG)) return false;
  sessionStorage.setItem(RECOVERY_FLAG, '1');
  if ('serviceWorker' in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch (swErr) {
      console.warn('[lazyWithRetry] SW unregister failed:', swErr);
    }
  }
  await purgeServiceWorkerAssets();
  window.location.reload();
  return true;
};

const lazyWithRetry = (importFn) => {
  return lazy(() =>
    importWithTimeout(importFn).catch(async (err) => {
      console.warn('[lazyWithRetry] chunk import failed, purging SW caches:', err);
      await purgeServiceWorkerAssets();
      try {
        return await importWithTimeout(importFn);
      } catch (err2) {
        console.error('[lazyWithRetry] retry failed, attempting hard recovery:', err2);
        const reloading = await hardRecovery();
        if (reloading) {
          // Suspend forever so React doesn't fall through to ErrorBoundary
          // before the page has a chance to reload.
          return new Promise(() => {});
        }
        throw err2;
      }
    })
  );
};

// Successful navigation = recovery worked, clear the guard so a future
// stuck state can trigger the hard recovery again.
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => {
    setTimeout(() => sessionStorage.removeItem(RECOVERY_FLAG), 5000);
  });
}

// Pages chargées à la demande (lazy loading avec retry)
// Cela réduit le temps de chargement initial de ~50%
const Dashboard = lazyWithRetry(() => import('./pages/Dashboard'));
const ClientsHub = lazyWithRetry(() => import('./pages/ClientsHub'));
const ClientForm = lazyWithRetry(() => import('./pages/ClientForm'));
const DevisList = lazyWithRetry(() => import('./pages/DevisList'));
const DevisForm = lazyWithRetry(() => import('./pages/DevisForm'));
const Agenda = lazyWithRetry(() => import('./pages/Agenda'));
const PriceLibrary = lazyWithRetry(() => import('./pages/PriceLibrary'));
const Maintenance = lazyWithRetry(() => import('./pages/Maintenance'));
const Profile = lazyWithRetry(() => import('./pages/Profile'));
const ActivitySettings = lazyWithRetry(() => import('./pages/settings/ActivitySettings'));
const Inventory = lazyWithRetry(() => import('./pages/Inventory'));
const Portfolio = lazyWithRetry(() => import('./pages/Portfolio'));
// FollowUps est maintenant intégré dans DevisList comme sous-onglet
const Rentals = lazyWithRetry(() => import('./pages/Rentals'));
const Accounting = lazyWithRetry(() => import('./pages/Accounting'));
const Marketing = lazyWithRetry(() => import('./pages/Marketing'));
const InterventionReports = lazyWithRetry(() => import('./pages/InterventionReports'));
const InterventionReportForm = lazyWithRetry(() => import('./pages/InterventionReportForm'));
const ReceivedInvoices = lazyWithRetry(() => import('./pages/ReceivedInvoices'));
const VoiceMemos = lazyWithRetry(() => import('./pages/VoiceMemos'));
const Subscription = lazyWithRetry(() => import('./pages/Subscription'));
const Outils = lazyWithRetry(() => import('./pages/Outils'));
const EtiquettesTableau = lazyWithRetry(() => import('./pages/EtiquettesTableau'));
const GuidePage = lazyWithRetry(() => import('./pages/GuidePage'));
const TerrainMode = lazyWithRetry(() => import('./pages/TerrainMode'));
const Procurement = lazyWithRetry(() => import('./pages/Procurement'));
const PortalMessages = lazyWithRetry(() => import('./pages/PortalMessages'));
const RecurringInvoices = lazyWithRetry(() => import('./pages/RecurringInvoices'));
const AuditLog = lazyWithRetry(() => import('./pages/AuditLog'));

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <PageLoader />;
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
};

function App() {
  return (
    <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TestModeProvider>
        <ReloadPrompt />
        <OfflineBanner />
        <BrowserRouter>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/mentions-legales" element={<MentionsLegales />} />
              <Route path="/politique-confidentialite" element={<PolitiqueConfidentialite />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              <Route path="/p/:token" element={<ClientPortal />} />
              <Route path="/q/:token" element={<PublicQuote />} />

              {/* Mode terrain — page standalone sans sidebar, protégée */}
              <Route path="/terrain" element={
                <ProtectedRoute>
                  <TerrainMode />
                </ProtectedRoute>
              } />

              <Route path="/app" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="agenda" element={<Agenda />} />
                <Route path="clients" element={<ClientsHub />} />
                <Route path="clients/new" element={<ClientForm />} />
                <Route path="clients/:id" element={<ClientForm />} />
                <Route path="crm" element={<Navigate to="/app/clients?view=worksites" replace />} />
                <Route path="devis" element={<DevisList />} />
                <Route path="devis/:id" element={<DevisForm />} />
                <Route path="maintenance" element={<Maintenance />} />
                <Route path="rentals" element={<Rentals />} />
                <Route path="library" element={<PriceLibrary />} />
                <Route path="inventory" element={<Inventory />} />
                <Route path="procurement" element={<Procurement />} />
                <Route path="follow-ups" element={<Navigate to="/app/devis" state={{ filter: 'followups' }} replace />} />
                <Route path="portfolio" element={<Portfolio />} />
                <Route path="settings" element={<Profile />} />
                <Route path="settings/activity" element={<ActivitySettings />} />
                <Route path="accounting" element={<Accounting />} />
                <Route path="received-invoices" element={<ReceivedInvoices />} />
                <Route path="marketing" element={<Marketing />} />
                <Route path="interventions" element={<InterventionReports />} />
                <Route path="interventions/:id" element={<InterventionReportForm />} />
                <Route path="voice-memos" element={<VoiceMemos />} />
                <Route path="subscription" element={<Subscription />} />
                <Route path="outils" element={<Outils />} />
                <Route path="etiquettes-tableau" element={<EtiquettesTableau />} />
                <Route path="guide" element={<GuidePage />} />
                <Route path="portal-messages" element={<PortalMessages />} />
                <Route path="recurring" element={<RecurringInvoices />} />
                <Route path="audit-log" element={<AuditLog />} />
              </Route>
            </Routes >
          </Suspense >
        </BrowserRouter >
        </TestModeProvider>
      </AuthProvider >
    </QueryClientProvider >
    </ErrorBoundary>
  );
}

export default App;
