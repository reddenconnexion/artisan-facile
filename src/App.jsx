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
import LandingPage from './pages/LandingPage';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) return <div className="flex items-center justify-center h-screen">Chargement...</div>;

  if (!user) return <Navigate to="/login" />;

  return children;
};

import Profile from './pages/Profile';
import ClientPortal from './pages/portal/ClientPortal';

import ReloadPrompt from './components/ReloadPrompt';
import OfflineBanner from './components/OfflineBanner';

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
            <Route path="library" element={<PriceLibrary />} />
            <Route path="settings" element={<Profile />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
