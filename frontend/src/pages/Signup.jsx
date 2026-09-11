import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { AUTH } from "@/constants/testIds";
import { GoogleButton } from "@/components/GoogleButton";

export default function Signup() {
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "Urban Planner" });
  const [loading, setLoading] = useState(false);
  const { setSession } = useAuth();
  const nav = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/register", form);
      setSession(data.token, data.user);
      toast.success("Account created");
      nav("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Sign up failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white">
      <div className="hidden lg:block relative bg-slate-900 overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-20" />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-900/40" />
        <div className="relative h-full p-12 flex flex-col justify-between text-white">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-md bg-white/10 grid place-items-center">
              <div className="w-4 h-4 bg-emerald-400 rounded-sm rotate-45" />
            </div>
            <div className="font-display font-extrabold text-lg">SmartScape</div>
          </Link>
          <div>
            <div className="overline text-emerald-300 mb-3">Join the platform</div>
            <h2 className="font-display font-extrabold text-4xl leading-tight max-w-md">
              Start planning cities backed by data, not guesswork.
            </h2>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center p-8">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
          <div className="overline mb-3">Create Account</div>
          <h1 className="font-display font-extrabold text-3xl mb-2">Get started</h1>
          <p className="text-sm text-slate-500 mb-8">A minute to create · a lifetime of better planning.</p>

          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Full Name</label>
          <input data-testid={AUTH.nameInput} required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none mb-4" />

          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Email</label>
          <input data-testid={AUTH.emailInput} type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none mb-4" />

          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Password</label>
          <input data-testid={AUTH.passwordInput} type="password" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none mb-4" />

          <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Role</label>
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
            className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none mb-6 bg-white">
            <option>Urban Planner</option>
            <option>Government / Municipal</option>
            <option>Developer</option>
            <option>Admin</option>
          </select>

          <button data-testid={AUTH.submitBtn} type="submit" disabled={loading}
            className="w-full h-11 rounded-md bg-slate-900 text-white font-medium hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : "Create Account"}
          </button>

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-slate-200" /></div>
            <div className="relative flex justify-center"><span className="bg-white px-3 text-xs text-slate-500 uppercase tracking-widest">or</span></div>
          </div>

          <GoogleButton label="Sign up with Google" />

          <div className="mt-6 text-sm text-slate-500 text-center">
            Already have an account? <Link data-testid={AUTH.loginLink} to="/auth/login" className="text-emerald-700 font-semibold hover:underline">Sign in</Link>
          </div>
        </motion.form>
      </div>
    </div>
  );
}
