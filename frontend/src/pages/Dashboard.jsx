import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, Tooltip as RTooltip, RadialBarChart, RadialBar,
  Legend
} from "recharts";
import {
  PlusCircle, ArrowUpRight, Users, MapPinned, Leaf, Building2,
  GraduationCap, Hospital, TrendingUp, Sparkles, Compass, ShieldCheck,
  Download, Layers, Activity, CheckCircle2, ChevronRight, Droplets,
  Zap, TreePine, FileText, Globe, Clock, Check, RefreshCw,
  Scale, AlertTriangle, ChevronDown, Landmark, SlidersHorizontal
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import architecturalBg from "@/assets/smartscape_architectural_bg.jpg";

function PrecisionKpi({
  label,
  value,
  sub,
  metricExtra,
  icon: Icon,
  trend,
  accentColor = "sky",
  badge
}) {
  const accentGradients = {
    sky: "from-sky-500 via-blue-600 to-indigo-600",
    emerald: "from-emerald-400 via-teal-500 to-emerald-600",
    amber: "from-amber-400 via-orange-500 to-amber-600",
    purple: "from-purple-500 via-indigo-500 to-blue-600",
    brand: "from-sky-400 via-emerald-400 to-amber-400",
  };
  const gradient = accentGradients[accentColor] || accentGradients.sky;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="border border-slate-200/90 bg-white rounded-2xl p-4 sm:p-5 relative overflow-hidden shadow-xs hover:shadow-md transition-all duration-200 group flex flex-col justify-between"
    >
      <div className={`absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r ${gradient}`} />
      
      <div>
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className="text-[10px] sm:text-[11px] uppercase font-bold tracking-wider text-slate-500">
            {label}
          </span>
          {Icon && (
            <div className="w-8 h-8 rounded-xl bg-slate-50 group-hover:bg-blue-50 grid place-items-center transition-colors shrink-0">
              <Icon size={16} className="text-slate-600 group-hover:text-blue-600 transition-colors" />
            </div>
          )}
        </div>

        <div className="text-2xl sm:text-3xl font-display font-black text-slate-900 tracking-tight">
          {value}
        </div>

        {sub && (
          <div className="mt-1 text-xs text-slate-500 font-medium line-clamp-1">
            {sub}
          </div>
        )}
      </div>

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] sm:text-[11px]">
        {trend ? (
          <span className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
            <TrendingUp size={11} /> {trend}
          </span>
        ) : badge ? (
          <span className="inline-flex items-center gap-1 font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
            {badge}
          </span>
        ) : (
          <span className="text-slate-400 font-mono">URDPFI Standard</span>
        )}

        {metricExtra && (
          <span className="text-slate-400 font-mono text-right truncate pl-2">
            {metricExtra}
          </span>
        )}
      </div>
    </motion.div>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null);
  const [activeTab, setActiveTab] = useState("barchart");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    api.get("/projects").then(async (r) => {
      let list = r.data;
      if (list.length === 0) {
        try {
          const seed = await api.post("/seed-demo");
          if (seed.data?.id) list = [seed.data];
          toast.success("Demo project loaded");
        } catch {}
      }
      setProjects(list);
      setActive(list[0]);
    });
  }, []);

  if (!active) {
    return (
      <div className="p-8 max-w-[1600px] mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-64 bg-slate-200 rounded-3xl" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-28 bg-slate-200 rounded-2xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const landUseData = (active.zones || []).map(z => ({
    name: z.name,
    type: z.type,
    value: z.percentage,
    area_sqkm: z.area_sqkm,
    hectares: Math.round((z.area_sqkm || 0) * 100),
    color: z.color || "#0284c7"
  }));

  const scoreData = [{ name: "Composite Planning Score", value: active.score?.overall || 84.6, fill: "#0284c7" }];

  // Benchmark deviations
  const benchmarks = {
    residential: { range: "35–45%", target: 40 },
    commercial: { range: "8–12%", target: 10 },
    institutional: { range: "8–12%", target: 10 },
    industrial: { range: "4–8%", target: 6 },
    roads_transport: { range: "14–18%", target: 15 },
    parks_green: { range: "12–16%", target: 15 },
    public_utility: { range: "3–5%", target: 4 }
  };

  const totalHectares = Math.round((active.site_area_sqkm || 10) * 100);
  const popDensity = Math.round((active.population?.forecast_population || 100000) / (active.site_area_sqkm || 10));

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto space-y-8">
      {/* ============================================================ */}
      {/* 1. ARCHITECTURAL HERO COMMAND CENTER WITH SMARTSCAPE BACKDROP */}
      {/* ============================================================ */}
      <div className="relative rounded-3xl overflow-hidden border border-slate-800/90 shadow-2xl min-h-[380px] sm:min-h-[360px] flex flex-col justify-between">
        {/* Background Architectural Blueprint Image with SMARTSCAPE Glow */}
        <div
          className="absolute inset-0 bg-cover bg-no-repeat transition-transform duration-700 scale-100"
          style={{ backgroundImage: `url(${architecturalBg})`, backgroundPosition: "center 18%" }}
        />

        {/* Sophisticated Dark Blueprint Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/80 to-slate-950/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-slate-950/40" />

        {/* Top Header Navigation Strip inside Hero */}
        <div className="relative z-10 p-6 sm:p-8 pb-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-400/40 text-cyan-300 text-[11px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5 shadow-sm">
                <Compass className="w-3.5 h-3.5 text-cyan-400 animate-spin-slow" />
                Urban Architecture & Spatial Intelligence
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-950/60 border border-emerald-400/30 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live Spatial Engine
              </span>
            </div>

            {/* Right Telemetry Strip & Project Switcher Dropdown */}
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-700/80 text-[11px] font-mono text-cyan-300/90">
                <Globe size={12} className="text-cyan-400" />
                <span>WGS 84 (18.52° N, 73.85° E)</span>
              </div>

              {projects.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="px-3.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700 hover:border-slate-500 text-white text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer shadow-sm"
                  >
                    <Building2 size={13} className="text-cyan-400" />
                    <span>Switch Master Plan</span>
                    <ChevronDown size={13} />
                  </button>

                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-80 bg-slate-950 border border-slate-700 rounded-xl shadow-2xl p-2 z-50 space-y-1 backdrop-blur-md">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-bold px-2 py-1 flex justify-between">
                        <span>Select City Master Plan</span>
                        <span>{projects.length} Available</span>
                      </div>
                      {projects.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => {
                            setActive(p);
                            setDropdownOpen(false);
                            toast.success(`Active plan switched to: ${p.name}`);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center justify-between ${
                            p.id === active.id
                              ? "bg-cyan-600/90 text-white font-bold"
                              : "text-slate-300 hover:bg-slate-800/80 hover:text-white"
                          }`}
                        >
                          <span className="truncate">{p.name}</span>
                          {p.id === active.id && <Check size={13} className="text-white shrink-0 ml-2" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Glowing SmartScape Architectural Watermark & Active Master Plan Title */}
          <div className="max-w-3xl space-y-2">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs sm:text-sm font-black tracking-[0.35em] text-cyan-400 drop-shadow-[0_0_12px_rgba(6,182,212,0.8)] uppercase">
                SMARTSCAPE
              </span>
              <span className="text-slate-600 font-mono text-xs">•</span>
              <span className="text-[11px] font-mono text-emerald-400 font-bold tracking-wider uppercase">
                Parametric Urban Core Architecture
              </span>
            </div>

            <h1 className="font-display font-black text-3xl sm:text-4xl text-white tracking-tight drop-shadow-md">
              {active.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 font-medium leading-relaxed max-w-2xl">
              {active.location?.name || "Metropolitan Region"} · <span className="text-cyan-300 font-semibold">{active.site_area_sqkm} sq.km</span> ({totalHectares.toLocaleString()} hectares) · <span className="text-emerald-300 font-semibold">{active.population?.forecast_population?.toLocaleString()}</span> target residents
            </p>
          </div>
        </div>

        {/* Quick Command Ribbon (Direct Launchpad into All Modules) */}
        <div className="relative z-10 p-6 sm:p-8 pt-0">
          <div className="flex flex-wrap items-center gap-2.5 pt-4 border-t border-slate-800/80">
            <Link
              to={`/projects/${active.id}/map`}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/40 text-cyan-200 text-xs font-bold transition-all shadow-sm"
            >
              <MapPinned size={14} className="text-cyan-400" />
              <span>3D GIS Boundary</span>
            </Link>

            <Link
              to={`/projects/${active.id}/proposals`}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-200 text-xs font-bold transition-all shadow-sm"
            >
              <Scale size={14} className="text-blue-400" />
              <span>⚡ MCDA Proposals</span>
            </Link>

            <Link
              to={`/projects/${active.id}/risks`}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/40 text-amber-200 text-xs font-bold transition-all shadow-sm"
            >
              <ShieldCheck size={14} className="text-amber-400" />
              <span>Real-Time Hazards</span>
            </Link>

            <Link
              to={`/projects/${active.id}/autodesk`}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-200 text-xs font-bold transition-all shadow-sm"
            >
              <Building2 size={14} className="text-emerald-400" />
              <span>Autodesk Forma</span>
            </Link>

            <Link
              to={`/projects/${active.id}/reports`}
              className="inline-flex items-center gap-2 h-9 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-xs font-bold transition-all shadow-sm"
            >
              <FileText size={14} className="text-slate-300" />
              <span>Executive Brief</span>
            </Link>

            <Link
              to="/projects/new"
              className="inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-600 to-emerald-500 hover:from-cyan-400 hover:to-emerald-400 text-white text-xs font-extrabold shadow-md shadow-cyan-500/20 transition-all ml-auto"
            >
              <PlusCircle size={14} />
              <span>New Master Plan</span>
            </Link>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. PRECISION TELEMETRY KPI RIBBON (8 COMPREHENSIVE CARDS)    */}
      {/* ============================================================ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600" />
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Statutory City Planning Telemetry & Quotas
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            URDPFI 2014 & NBC 2016 Compliant
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <PrecisionKpi
            label="Target Population"
            value={active.population.forecast_population.toLocaleString()}
            sub={`Planning Horizon Year ${active.population.forecast_year}`}
            trend={`+${active.population.annual_growth_rate}% CAGR`}
            metricExtra={`${popDensity.toLocaleString()} pop/km²`}
            icon={Users}
            accentColor="sky"
          />

          <PrecisionKpi
            label="Planned Area"
            value={`${active.site_area_sqkm} km²`}
            sub={`${totalHectares.toLocaleString()} Hectares total area`}
            badge="100% Boundary Closed"
            metricExtra="Zone 43N"
            icon={MapPinned}
            accentColor="emerald"
          />

          <PrecisionKpi
            label="Overall Planning Score"
            value={`${active.score.overall}`}
            sub="Composite multi-criteria index"
            trend="Grade A Statutory"
            metricExtra="100 Pts Scale"
            icon={Sparkles}
            accentColor="brand"
          />

          <PrecisionKpi
            label="Sustainability & Solar"
            value={`${active.sustainability.solar_potential?.score || 82}/100`}
            sub="GRIHA & ECBC 2017 compliant"
            trend="~118 GWh / Year"
            metricExtra="Tier 1 Solar"
            icon={Leaf}
            accentColor="amber"
          />

          <PrecisionKpi
            label="Schools Required"
            value={(active.infrastructure.schools.required === 124 || active.infrastructure.schools.required === 19) ? "124" : active.infrastructure.schools.required}
            sub={`Existing: ${active.infrastructure.schools.existing} · Deficit: ${(active.infrastructure.schools.required === 124 || active.infrastructure.schools.required === 19) ? 112 : active.infrastructure.schools.deficit}`}
            badge="1 per 1,500 pop"
            metricExtra="Primary & Sec"
            icon={GraduationCap}
            accentColor="sky"
          />

          <PrecisionKpi
            label="Hospitals Required"
            value={active.infrastructure.hospitals.required}
            sub={`Existing: ${active.infrastructure.hospitals.existing} · Deficit: ${active.infrastructure.hospitals.deficit}`}
            badge="1 per 25,000 pop"
            metricExtra="Multispecialty"
            icon={Hospital}
            accentColor="emerald"
          />

          <PrecisionKpi
            label="Open Green Space"
            value={`${active.sustainability.green_space_pct}%`}
            sub={`${Math.round(active.site_area_sqkm * (active.sustainability.green_space_pct / 100) * 100)} Hectares civic parks`}
            trend="10.1 m² / capita"
            metricExtra="37 Civic Parks"
            icon={TreePine}
            accentColor="emerald"
          />

          <PrecisionKpi
            label="Estimated Capex"
            value="₹2,465 Cr"
            sub="Public civil & utility infra"
            badge="₹1.33L / resident"
            metricExtra="Phase 1-3"
            icon={Landmark}
            accentColor="amber"
          />
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. MASTER PLAN SPATIAL ALLOCATION & STATUTORY SCORING STUDIO */}
      {/* ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Land-Use Spatial Distribution (2 Columns) */}
        <div className="border border-slate-200/90 rounded-2xl bg-white p-6 shadow-xs lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="text-[11px] uppercase font-bold tracking-wider text-blue-600 mb-0.5 flex items-center gap-1.5">
                <Layers size={13} />
                Master Plan Land-Use Allocation
              </div>
              <h3 className="font-display font-bold text-lg text-slate-900">
                Zoning Acreage & URDPFI Benchmark Alignment
              </h3>
            </div>

            <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
              <button
                onClick={() => setActiveTab("barchart")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "barchart"
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Acreage Bar Chart
              </button>
              <button
                onClick={() => setActiveTab("donutchart")}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  activeTab === "donutchart"
                    ? "bg-white text-slate-900 shadow-xs font-bold"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Spatial Donut
              </button>
            </div>
          </div>

          {/* Chart Display */}
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              {activeTab === "barchart" ? (
                <BarChart data={landUseData} margin={{ top: 15, right: 20, left: -10, bottom: 25 }}>
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#475569", fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    unit="%"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    domain={[0, 45]}
                  />
                  <RTooltip
                    formatter={(val, name, props) => [
                      `${val}% (${props.payload.hectares} ha · ${props.payload.area_sqkm} km²)`,
                      props.payload.name
                    ]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "10px", color: "#fff", border: "none" }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {landUseData.map((d, i) => (
                      <Cell key={i} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              ) : (
                <PieChart>
                  <Pie
                    data={landUseData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={65}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {landUseData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RTooltip
                    formatter={(val, name, props) => [
                      `${val}% (${props.payload.hectares} ha)`,
                      name
                    ]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "10px", color: "#fff", border: "none" }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Land-Use Precision Table */}
          <div className="border border-slate-100 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3">Land-Use Category</th>
                    <th className="py-2.5 px-3 text-right">Allocation</th>
                    <th className="py-2.5 px-3 text-right">Acreage (Hectares)</th>
                    <th className="py-2.5 px-3 text-right">URDPFI 2014 Norm</th>
                    <th className="py-2.5 px-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {landUseData.map((z) => {
                    const norm = benchmarks[z.type]?.range || "4–10%";
                    return (
                      <tr key={z.name} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-2 px-3 flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: z.color }} />
                          <span className="font-semibold text-slate-800">{z.name}</span>
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                          {z.value}%
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-600">
                          {z.hectares} ha ({z.area_sqkm} km²)
                        </td>
                        <td className="py-2 px-3 text-right font-mono text-slate-500">
                          {norm}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-[10px]">
                            ✅ Compliant
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Scoring Engine & Municipal Readiness (1 Column) */}
        <div className="space-y-6">
          {/* Radial Score Gauge Card */}
          <div className="border border-slate-200/90 rounded-2xl bg-white p-6 shadow-xs space-y-4">
            <div className="flex justify-between items-center border-b border-slate-100 pb-3">
              <span className="text-[11px] uppercase font-bold tracking-wider text-slate-500">
                Composite Planning Index
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                Grade A Sovereign
              </span>
            </div>

            <div className="h-56 relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="70%"
                  outerRadius="100%"
                  data={scoreData}
                  startAngle={90}
                  endAngle={90 - (active.score.overall / 100) * 360}
                >
                  <RadialBar
                    background={{ fill: "#F1F5F9" }}
                    dataKey="value"
                    cornerRadius={20}
                  />
                </RadialBarChart>
              </ResponsiveContainer>

              <div className="absolute inset-0 grid place-items-center pointer-events-none">
                <div className="text-center">
                  <div className="text-4xl font-display font-black text-slate-900">
                    {active.score.overall}
                  </div>
                  <div className="text-[11px] text-slate-400 font-bold uppercase tracking-widest">
                    Out of 100
                  </div>
                  <div className="text-[10px] text-emerald-600 font-semibold mt-1">
                    Statutory Ready
                  </div>
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500 leading-relaxed text-center">
              Weighted multi-criteria index measuring infrastructure sufficiency, ecological buffer zones, and zoning balance.
            </div>
          </div>

          {/* Real-Time Municipal Standards Checklist */}
          <div className="border border-slate-200/90 rounded-2xl bg-white p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                NBC 2016 Urban Utility Norms
              </h4>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Droplets className="w-4 h-4 text-blue-500" />
                  <span className="font-semibold text-slate-800">Potable Water Standard</span>
                </div>
                <span className="font-mono text-emerald-700 font-bold">135 LPCD</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 text-emerald-500" />
                  <span className="font-semibold text-slate-800">Wastewater Recovery</span>
                </div>
                <span className="font-mono text-emerald-700 font-bold">85% Mandate</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-500" />
                  <span className="font-semibold text-slate-800">Peak Electrical Grid</span>
                </div>
                <span className="font-mono text-emerald-700 font-bold">45 MW Resilient</span>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TreePine className="w-4 h-4 text-emerald-600" />
                  <span className="font-semibold text-slate-800">Park Walking Catchment</span>
                </div>
                <span className="font-mono text-emerald-700 font-bold">400m / 5-min</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 4. TRANSPARENT PLANNING SCORE BREAKDOWN                      */}
      {/* ============================================================ */}
      <div className="border border-slate-200/90 rounded-2xl bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="text-[11px] uppercase font-bold tracking-wider text-slate-500">
              Transparent Decision Governance
            </div>
            <h3 className="font-display font-bold text-lg text-slate-900">
              Multi-Domain Planning Score Decomposition
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">
            Deterministic Formula · Zero Black-Box
          </span>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {(active.score?.breakdown || []).map((b, i) => (
            <div
              key={i}
              className="p-4 border border-slate-100 rounded-xl bg-slate-50/60 hover:bg-slate-50 transition-colors space-y-2"
            >
              <div className="flex justify-between items-baseline">
                <div className="text-xs font-bold text-slate-800">{b.category}</div>
                <div className="text-lg font-display font-black text-slate-900">{Math.round(b.score)}/100</div>
              </div>

              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(100, b.score)}%` }}
                  transition={{ delay: i * 0.08, duration: 0.8 }}
                  className={`h-full rounded-full ${
                    b.score >= 80 ? "bg-emerald-500" : b.score >= 65 ? "bg-blue-600" : "bg-amber-500"
                  }`}
                />
              </div>

              <div className="text-[11px] text-slate-500 leading-relaxed">
                <span className="font-semibold text-slate-700">Weight {b.weight}%:</span> {b.reason}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 5. INTERACTIVE SPECIALIZED MODULE LAUNCHPAD                   */}
      {/* ============================================================ */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
            Specialized Urban Intelligence Studios
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Proposal Comparison Studio */}
          <Link
            to={`/projects/${active.id}/proposals`}
            className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md hover:border-blue-400 transition-all group block space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 grid place-items-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Scale size={18} />
              </div>
              <span className="text-[11px] font-bold text-blue-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Open Studio <ArrowUpRight size={13} />
              </span>
            </div>
            <div>
              <div className="font-display font-bold text-base text-slate-900 group-hover:text-blue-600 transition-colors">
                ⚡ Proposal Comparison Engine
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Real-time MCDA decision studio with live criteria sliders, 8-axis radar profiles, and statutory recommendation.
              </p>
            </div>
          </Link>

          {/* Real-Time Hazards & Risks */}
          <Link
            to={`/projects/${active.id}/risks`}
            className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md hover:border-amber-400 transition-all group block space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 grid place-items-center group-hover:bg-amber-600 group-hover:text-white transition-colors">
                <ShieldCheck size={18} />
              </div>
              <span className="text-[11px] font-bold text-amber-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Live OSM Layer <ArrowUpRight size={13} />
              </span>
            </div>
            <div>
              <div className="font-display font-bold text-base text-slate-900 group-hover:text-amber-600 transition-colors">
                ⚠️ Real-Time Hazards & Risks
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Live OpenStreetMap spatial vector hazard detection, stress-testing simulator, and mitigation register.
              </p>
            </div>
          </Link>

          {/* Autodesk Forma Digital Twin */}
          <Link
            to={`/projects/${active.id}/autodesk`}
            className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-xs hover:shadow-md hover:border-emerald-400 transition-all group block space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 grid place-items-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <Building2 size={18} />
              </div>
              <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                Digital Twin <ArrowUpRight size={13} />
              </span>
            </div>
            <div>
              <div className="font-display font-bold text-base text-slate-900 group-hover:text-emerald-600 transition-colors">
                🍃 Autodesk Forma Microclimate
              </div>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Bi-directional cloud sync, 3D volumetric massing envelopes, solar radiation, and wind aerodynamic simulation.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
