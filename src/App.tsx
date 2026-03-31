import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Workshop from './pages/Workshop';
import Analytics from './pages/Analytics';
import DSS from './pages/DSS';
import Users from './pages/Users';

import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { FirebaseProvider, useFirebase } from './components/FirebaseProvider';
import Login from './pages/Login';

function AppContent() {
  const { user, loading } = useFirebase();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
          <h2 className="text-2xl font-bold text-white tracking-tighter uppercase">INITIALIZING_SYSTEM</h2>
          <p className="text-[10px] text-text-secondary uppercase tracking-[0.4em] mt-2 font-bold">FERMATA_CORE_V1.0</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="inventory" element={<Inventory />} />
          <Route path="pos" element={<POS />} />
          <Route path="workshop" element={<Workshop />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="dss" element={<DSS />} />
          <Route path="users" element={<Users />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <AppContent />
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
