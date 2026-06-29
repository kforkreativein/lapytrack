import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import PinAuth from "@/pages/PinAuth";
import Dashboard from "@/pages/Dashboard";
import Devices from "@/pages/Devices";
import DeviceDetail from "@/pages/DeviceDetail";
import InwardForm from "@/pages/InwardForm";
import OutwardForm from "@/pages/OutwardForm";
import Ledger from "@/pages/Ledger";
import CustomerDetail from "@/pages/CustomerDetail";
import Reports from "@/pages/Reports";
import Settings from "@/pages/Settings";
import Catalog from "@/pages/Catalog";
import PublicJobCard from "@/pages/PublicJobCard";
import Layout from "@/components/Layout";
import PinOverlay from "@/components/PinOverlay";
import Onboarding, { useOnboarding } from "@/components/Onboarding";
import ErrorBoundary from "@/components/ErrorBoundary";
import { Toaster } from "sonner";
import { Loader2 } from "lucide-react";
import { useState, useEffect } from "react";

function AuthLoadingScreen() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 4000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
      <Loader2 className="w-5 h-5 animate-spin text-zinc-400" />
      <p className="text-sm text-zinc-500">Loading…</p>
      {slow && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3 py-2.5 rounded-sm max-w-xs">
          Backend is waking up — first load can take up to 60 seconds on mobile. Please wait.
        </p>
      )}
    </div>
  );
}

function ProtectedRoute({ children }) {
  const { user, loading, pinLocked } = useAuth();
  const { show: showOnboarding, dismiss: dismissOnboarding } = useOnboarding();
  if (loading) return <AuthLoadingScreen />;
  if (!user) return <Navigate to="/unlock" replace />;
  return (
    <Layout>
      {pinLocked && <PinOverlay />}
      {showOnboarding && <Onboarding onDone={dismissOnboarding} />}
      {children}
    </Layout>
  );
}

function UnlockGate({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <AuthLoadingScreen />;
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

function App() {
  return (
    <ErrorBoundary>
      <div className="App font-sans">
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/job/:id" element={<PublicJobCard />} />
              <Route path="/unlock" element={<UnlockGate><PinAuth /></UnlockGate>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/devices" element={<ProtectedRoute><Devices /></ProtectedRoute>} />
              <Route path="/devices/:id" element={<ProtectedRoute><DeviceDetail /></ProtectedRoute>} />
              <Route path="/inward" element={<ProtectedRoute><InwardForm /></ProtectedRoute>} />
              <Route path="/outward/:id" element={<ProtectedRoute><OutwardForm /></ProtectedRoute>} />
              <Route path="/ledger" element={<ProtectedRoute><Ledger /></ProtectedRoute>} />
              <Route path="/ledger/:id" element={<ProtectedRoute><CustomerDetail /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
              <Route path="/catalog" element={<ProtectedRoute><Catalog /></ProtectedRoute>} />
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
            <Toaster position="bottom-right" richColors closeButton />
          </AuthProvider>
        </BrowserRouter>
      </div>
    </ErrorBoundary>
  );
}

export default App;
