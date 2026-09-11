import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AUTH } from "@/constants/testIds";
import { GoogleButton } from "@/components/GoogleButton";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { setSession } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e?.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setSession(data.token, data.user);
      toast.success(`Welcome back, ${data.user.name}`);
      nav("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setLoading(false); }
  };

  const demo = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/demo");
      setSession(data.token, data.user);
      // seed demo project (idempotent)
      try { await api.post("/seed-demo"); } catch {}
      toast.success("Demo mode activated");
      nav("/dashboard");
    } catch { toast.error("Demo login failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:block relative bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute top-0 left-0 right-0 h-full bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-900/40" />
        <div className="relative h-full p-12 flex flex-col justify-between text-white">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-md bg-white/10 backdrop-blur grid place-items-center">
              <div className="w-4 h-4 bg-emerald-400 rounded-sm rotate-45" />
            </div>
            <div className="font-display font-extrabold text-lg">SmartScape</div>
          </Link>
          <div>
            <div className="overline text-emerald-300 mb-3">Urban Intelligence Platform</div>
            <h2 className="font-display font-extrabold text-4xl leading-tight max-w-md">
              Turn planning inputs into transparent city intelligence.
            </h2>
            <div className="mt-8 flex gap-6 text-xs text-slate-300">
              <div><div className="text-2xl font-display font-bold text-white">99.4%</div>data transparency</div>
              <div><div className="text-2xl font-display font-bold text-white">20yr</div>planning horizon</div>
              <div><div className="text-2xl font-display font-bold text-white">Forma</div>ready</div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md">
          <div className="overline mb-3">Sign In</div>
          <h1 className="font-display font-extrabold text-3xl mb-2">Welcome back</h1>
          <p className="text-sm text-slate-500 mb-8">Plan smarter cities with SmartScape.</p>

          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Email</label>
          <input data-testid={AUTH.emailInput} type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none mb-4" />

          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Password</label>
          <input data-testid={AUTH.passwordInput} type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none mb-6" />

          <button data-testid={AUTH.submitBtn} disabled={loading} type="submit"
            className="w-full h-11 rounded-md bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Sign In"}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-slate-500 uppercase tracking-widest">or</span></div>
          </div>

          <GoogleButton />

          <button type="button" data-testid={AUTH.demoBtn} onClick={demo}
            className="w-full h-11 rounded-md border-2 border-emerald-500 text-emerald-700 font-medium hover:bg-emerald-50 flex items-center justify-center gap-2">
            <Sparkles size={14} /> One-Click Demo Login
          </button>

          <div className="mt-6 text-sm text-slate-500 text-center">
            No account? <Link data-testid={AUTH.signupLink} to="/auth/signup" className="text-emerald-700 font-semibold hover:underline">Create one</Link>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
