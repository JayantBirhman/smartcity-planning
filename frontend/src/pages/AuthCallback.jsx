import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const location = useLocation();
  const nav = useNavigate();
  const { setSession } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const sessionId = new URLSearchParams(location.hash.replace(/^#/, "")).get("session_id");
    window.history.replaceState({}, document.title, window.location.pathname);
    if (!sessionId) { nav("/auth/login", { replace: true }); return; }
    api.post("/auth/google/session", { session_id: sessionId })
      .then(({ data }) => {
        setSession(data.token, data.user);
        api.post("/seed-demo").catch(() => {});
        nav("/dashboard", { replace: true });
      })
      .catch(() => nav("/auth/login?error=google", { replace: true }));
  }, []);

  return (
    <div data-testid="auth-callback" className="min-h-screen grid place-items-center bg-slate-50 text-slate-500 gap-3">
      <Loader2 className="animate-spin" size={20} />
    </div>
  );
}
