import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './layouts/Layout';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import ClientForm from './pages/ClientForm';
import CRM from './pages/CRM';
import DevisList from './pages/DevisList';
import DevisForm from './pages/DevisForm';
import Agenda from './pages/Agenda';
import Login from './pages/Login';
import Register from './pages/Register';
import PriceLibrary from './pages/PriceLibrary';
import Maintenance from './pages/Maintenance';
import LandingPage from './pages/LandingPage'; // Added this import
import Profile from './pages/Profile';
import ClientPortal from './pages/portal/ClientPortal';
import PublicQuote from './pages/PublicQuote';
import ActivitySettings from './pages/settings/ActivitySettings';
import Inventory from './pages/Inventory'; // Added Inventory Import

import MaterialsCalculator from './components/MaterialsCalculator';
import Rentals from './pages/Rentals';
import ReloadPrompt from './components/ReloadPrompt';
import OfflineBanner from './components/OfflineBanner';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Chargement...</div>;

  if (!user) return <Navigate to="/login" />;

  return children;
};

function App() {
  return (
    <AuthProvider>
      <ReloadPrompt />
      <OfflineBanner />
      <BrowserRouter>
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
            <Route path="settings" element={<Profile />} />
            <Route path="settings/activity" element={<ActivitySettings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
