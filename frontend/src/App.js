import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/lib/auth";
import { Toaster } from "sonner";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Dashboard from "@/pages/Dashboard";
import NewProject from "@/pages/NewProject";
import Projects from "@/pages/Projects";
import ZoningMap from "@/pages/ZoningMap";
import Infrastructure from "@/pages/Infrastructure";
import Sustainability from "@/pages/Sustainability";
import Blueprint from "@/pages/Blueprint";
import Proposals from "@/pages/Proposals";
import Risks from "@/pages/Risks";
import Reports from "@/pages/Reports";
import Integrations from "@/pages/Integrations";
import ProjectAutodesk from "@/pages/ProjectAutodesk";
import AuthCallback from "@/pages/AuthCallback";
import AppShell from "@/components/AppShell";

function Protected({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div className="min-h-screen flex items-center justify-center text-slate-500">Loading…</div>;
  if (!user) return <Navigate to="/auth/login" replace />;
  return <AppShell>{children}</AppShell>;
}

function AppRouter() {
  const location = useLocation(); // read hash from here, not window.location.hash (not reactive)
  if (location.hash?.includes("session_id=")) return <AuthCallback />;
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/auth/login" element={<Login />} />
      <Route path="/auth/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
      <Route path="/integrations" element={<Protected><Integrations /></Protected>} />
      <Route path="/projects" element={<Protected><Projects /></Protected>} />
      <Route path="/projects/new" element={<Protected><NewProject /></Protected>} />
      <Route path="/projects/:id/map" element={<Protected><ZoningMap /></Protected>} />
      <Route path="/projects/:id/infrastructure" element={<Protected><Infrastructure /></Protected>} />
      <Route path="/projects/:id/sustainability" element={<Protected><Sustainability /></Protected>} />
      <Route path="/projects/:id/blueprint" element={<Protected><Blueprint /></Protected>} />
      <Route path="/projects/:id/proposals" element={<Protected><Proposals /></Protected>} />
      <Route path="/projects/:id/risks" element={<Protected><Risks /></Protected>} />
      <Route path="/projects/:id/reports" element={<Protected><Reports /></Protected>} />
      <Route path="/projects/:id/autodesk" element={<Protected><ProjectAutodesk /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Toaster position="top-right" richColors />
          <AppRouter />
        </BrowserRouter>
      </AuthProvider>
    </div>
  );
}

export default App;
