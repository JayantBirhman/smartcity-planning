import { createContext, useContext, useEffect, useState } from "react";
import { api } from "./api";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("ss_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // CRITICAL: returning from OAuth callback — AuthCallback exchanges session_id first.
    if (window.location.hash?.includes("session_id=")) { setReady(true); return; }
    const t = localStorage.getItem("ss_token");
    if (!t) { setReady(true); return; }
    api.get("/auth/me").then((r) => { setUser(r.data); localStorage.setItem("ss_user", JSON.stringify(r.data)); })
      .catch(() => { localStorage.removeItem("ss_token"); localStorage.removeItem("ss_user"); setUser(null); })
      .finally(() => setReady(true));
  }, []);

  const setSession = (token, u) => {
    localStorage.setItem("ss_token", token);
    localStorage.setItem("ss_user", JSON.stringify(u));
    setUser(u);
  };

  const logout = () => {
    api.post("/auth/logout").catch(() => {});
    localStorage.removeItem("ss_token");
    localStorage.removeItem("ss_user");
    setUser(null);
  };

  return <AuthCtx.Provider value={{ user, setSession, logout, ready }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);
