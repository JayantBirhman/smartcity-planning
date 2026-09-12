import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Building2, MapPinned, Leaf, Sparkles, GitCompareArrows, ShieldAlert, LayoutGrid, LineChart } from "lucide-react";
import { NAV } from "@/constants/testIds";
import brandLogo from "@/assets/logo.png";

const FEATURES = [
  { icon: MapPinned, title: "Location Intelligence", desc: "Real map + SVG zoning overlay for site analysis." },
  { icon: LayoutGrid, title: "Zoning Recommendation", desc: "URDPFI-inspired land-use split, calculated live." },
  { icon: Building2, title: "Infrastructure Sizing", desc: "Schools, hospitals, parks and utilities requirements." },
  { icon: Leaf, title: "Sustainability Metrics", desc: "Solar, daylight, wind, noise and green-space scores." },
  { icon: GitCompareArrows, title: "Proposal Comparison", desc: "Balanced vs Sustainable side-by-side scoring." },
  { icon: ShieldAlert, title: "Risks & Mitigations", desc: "Data-driven risks with actionable mitigation plans." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 relative">
        <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-r from-sky-500 via-emerald-500 to-amber-400 opacity-95" />
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div className="p-1.5 rounded-xl bg-white shadow-xs border border-slate-100 group-hover:border-sky-300 transition-all">
              <img src={brandLogo} alt="SmartScape Logo" className="w-10 h-10 object-contain drop-shadow-xs shrink-0" />
            </div>
            <div>
              <div className="font-display font-black text-xl leading-none tracking-tight flex items-center gap-1">
                <span>Smart</span>
                <span className="text-sky-600">Scape</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block ml-0.5 animate-pulse"></span>
              </div>
              <div className="text-[9.5px] uppercase font-bold tracking-[0.2em] text-slate-400 mt-1 flex items-center gap-1">
                <span>Urban</span>
                <span className="text-amber-500 font-black">•</span>
                <span>Intelligence</span>
              </div>
            </div>
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm text-slate-600 font-medium">
            <a href="#features" className="hover:text-sky-600 transition-colors">Features</a>
            <a href="#how" className="hover:text-sky-600 transition-colors">How it works</a>
            <a href="#tech" className="hover:text-sky-600 transition-colors">Technology</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/auth/login" className="text-sm font-semibold text-slate-700 hover:text-sky-600 transition-colors">Sign In</Link>
            <Link to="/auth/signup" data-testid={NAV.landingGetStarted}
              className="text-sm px-5 h-9 rounded-xl bg-gradient-to-r from-sky-600 via-blue-700 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white font-bold grid place-items-center shadow-md shadow-sky-600/20 transition-all">
              Start Planning
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-grid opacity-50" />
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-sky-400/20 blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 -left-32 w-80 h-80 rounded-full bg-emerald-400/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-72 h-72 rounded-full bg-amber-400/15 blur-3xl pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-28 grid lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-sky-200 bg-gradient-to-r from-sky-50 to-emerald-50 text-sky-900 text-xs font-semibold shadow-2xs">
              <Sparkles size={12} className="text-amber-500" /> SIH 2026 · AI-Powered Urban Intelligence
            </motion.div>
            <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="mt-6 font-display font-black text-5xl lg:text-6xl leading-[1.05] tracking-tight text-slate-900">
              Plan cities smarter.<br /><span className="text-brand-gradient">Build better futures.</span>
            </motion.h1>
            <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="mt-6 text-lg text-slate-600 max-w-xl font-normal leading-relaxed">
              SmartScape turns location, population and site data into transparent zoning, infrastructure and sustainability intelligence — ready for Autodesk Forma.
            </motion.p>
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="mt-8 flex flex-wrap gap-3">
              <Link to="/auth/signup" data-testid={NAV.landingGetStarted}
                className="inline-flex items-center gap-2 h-12 px-7 rounded-xl bg-gradient-to-r from-sky-600 via-blue-700 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white font-bold shadow-lg shadow-sky-600/25 transition-all">
                Start Planning <ArrowRight size={16} />
              </Link>
              <Link to="/auth/login" data-testid={NAV.landingDemo}
                className="inline-flex items-center gap-2 h-12 px-6 rounded-xl border border-slate-300 hover:border-sky-500 hover:text-sky-700 bg-white text-slate-700 font-semibold shadow-xs transition-colors">
                Explore Demo
              </Link>
            </motion.div>

            <div className="mt-10 grid grid-cols-3 gap-3 max-w-lg">
              {[["185k","Population planned"],["12.4","sq.km site area"],["84","Sustainability score"]].map(([v,l],i)=>(
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i*0.05 }}
                  className="border border-slate-200 rounded-md p-4 bg-white">
                  <div className="text-2xl font-display font-extrabold text-slate-900">{v}</div>
                  <div className="text-xs text-slate-500 mt-1">{l}</div>
                </motion.div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5">
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.2 }}
              className="relative rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div className="text-xs font-semibold">Live Planning Map</div>
                </div>
                <div className="text-[10px] uppercase tracking-widest text-slate-500">Pune Ring 2</div>
              </div>
              <div className="relative aspect-[4/3] bg-grid-dense">
                <svg viewBox="0 0 300 220" className="absolute inset-0 w-full h-full">
                  {[
                    { x: 10, y: 10, w: 90, h: 60, c: "#FBBF24", l: "Residential" },
                    { x: 100, y: 10, w: 90, h: 60, c: "#F87171", l: "Commercial" },
                    { x: 190, y: 10, w: 90, h: 60, c: "#60A5FA", l: "Institutional" },
                    { x: 10, y: 70, w: 60, h: 80, c: "#34D399", l: "Parks" },
                    { x: 70, y: 70, w: 130, h: 80, c: "#FBBF24", l: "Residential" },
                    { x: 200, y: 70, w: 80, h: 80, c: "#A78BFA", l: "Industrial" },
                    { x: 10, y: 150, w: 270, h: 30, c: "#94A3B8", l: "Roads" },
                    { x: 10, y: 180, w: 130, h: 30, c: "#38BDF8", l: "Utility" },
                    { x: 140, y: 180, w: 140, h: 30, c: "#34D399", l: "Green" },
                  ].map((z, i) => (
                    <motion.g key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i*0.05 }}>
                      <rect x={z.x} y={z.y} width={z.w} height={z.h} fill={z.c} fillOpacity="0.35" stroke={z.c} strokeWidth="1" />
                      <text x={z.x + 4} y={z.y + 12} fontSize="7" fill="#0F172A" fontWeight="600">{z.l}</text>
                    </motion.g>
                  ))}
                </svg>
              </div>
              <div className="p-4 grid grid-cols-3 gap-3">
                {[["Schools","15-20"],["Hospitals","8"],["Parks","37"]].map(([l,v],i)=>(
                  <div key={i} className="text-center">
                    <div className="text-lg font-display font-bold">{v}</div>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500">{l}</div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="max-w-7xl mx-auto px-6 py-20">
        <div className="max-w-2xl mb-12">
          <div className="overline mb-3">Smart City Intelligence</div>
          <h2 className="font-display font-extrabold text-4xl">Everything a planner needs — in one workspace.</h2>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((f, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
              transition={{ delay: i * 0.05 }}
              className="p-6 border border-slate-200 rounded-md bg-white hover:shadow-md transition-shadow">
              <f.icon size={20} className="text-emerald-600 mb-3" />
              <h3 className="font-display font-bold text-lg">{f.title}</h3>
              <p className="mt-2 text-sm text-slate-600">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* How */}
      <section id="how" className="bg-white border-y border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-20">
          <div className="overline mb-3">How SmartScape Works</div>
          <h2 className="font-display font-extrabold text-4xl mb-12">From location → to blueprint, in minutes.</h2>
          <div className="grid md:grid-cols-4 gap-4">
            {["Select location & inputs","Analytics engine calculates","Zones & infrastructure mapped","Compare & recommend"].map((s, i) => (
              <div key={i} className="border-l-2 border-emerald-500 pl-4">
                <div className="text-xs uppercase tracking-widest text-slate-500 mb-2">Step {i + 1}</div>
                <div className="font-display font-semibold text-lg">{s}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="tech" className="max-w-7xl mx-auto px-6 py-20">
        <div className="rounded-xl bg-slate-900 text-white p-12 relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-dense opacity-10" />
          <div className="relative max-w-2xl">
            <h2 className="font-display font-extrabold text-4xl">Ready to plan your smart city?</h2>
            <p className="mt-4 text-slate-300">Autodesk Forma-ready architecture · GIS-ready · LLM-powered</p>
            <div className="mt-8 flex gap-3">
              <Link to="/auth/signup" className="h-12 px-6 rounded-md bg-emerald-500 text-white grid place-items-center hover:bg-emerald-600 inline-flex">
                Get Started Free
              </Link>
              <Link to="/auth/login" className="h-12 px-6 rounded-md border border-slate-700 hover:border-emerald-500 grid place-items-center inline-flex">
                Try Demo
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        SmartScape · Built for Smart India Hackathon 2026 · Prototype for Autodesk Forma integration
      </footer>
    </div>
  );
}
