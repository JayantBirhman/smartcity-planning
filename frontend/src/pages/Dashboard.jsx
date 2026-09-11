import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip as RTooltip, RadialBarChart, RadialBar } from "recharts";
import { PlusCircle, ArrowUpRight, Users, MapPinned, Leaf, Building2, GraduationCap, Hospital, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

function KpiCard({ label, value, sub, icon: Icon, trend, accent = "emerald" }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="border border-slate-200 bg-white rounded-md p-5 relative shine">
      <div className="flex items-start justify-between">
        <div className="overline">{label}</div>
        {Icon && <Icon size={16} className={`text-${accent}-600`} />}
      </div>
      <div className="mt-2 text-3xl font-display font-extrabold text-slate-900">{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
      {trend && (
        <div className="mt-3 flex items-center gap-1 text-[11px] text-emerald-700 font-semibold">
          <TrendingUp size={12} /> {trend}
        </div>
      )}
    </motion.div>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState([]);
  const [active, setActive] = useState(null);
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
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 bg-slate-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-slate-200 rounded" />)}
          </div>
        </div>
      </div>
    );
  }

  const landUseData = active.zones.map(z => ({ name: z.name, value: z.percentage, color: z.color }));
  const scoreData = [{ name: "Score", value: active.score.overall, fill: "#059669" }];

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      {/* Header row */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <div className="overline mb-2">Active Project</div>
          <h1 className="font-display font-extrabold text-3xl">{active.name}</h1>
          <div className="text-sm text-slate-500 mt-1">{active.location.name} · {active.site_area_sqkm} sq.km · {active.population.forecast_population.toLocaleString()} projected pop.</div>
        </div>
        <div className="flex gap-2">
          <Link to="/projects/new" className="inline-flex items-center gap-2 h-10 px-4 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800">
            <PlusCircle size={14} /> New Project
          </Link>
          <Link to={`/projects/${active.id}/map`} className="inline-flex items-center gap-2 h-10 px-4 rounded-md border border-slate-300 text-sm hover:border-emerald-500 hover:text-emerald-700">
            Open Map <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KpiCard label="Target Population" value={active.population.forecast_population.toLocaleString()} sub={`by ${active.population.forecast_year}`} icon={Users} trend={`+${active.population.annual_growth_rate}% CAGR`} />
        <KpiCard label="Planned Area" value={`${active.site_area_sqkm} km²`} sub="Site coverage" icon={MapPinned} />
        <KpiCard label="Sustainability" value={`${active.sustainability.solar_potential.score}/100`} sub="Composite score" icon={Leaf} />
        <KpiCard label="Overall Score" value={`${active.score.overall}`} sub="Planning composite" icon={Building2} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <KpiCard label="Schools Required" value={active.infrastructure.schools.required} sub={`Deficit ${active.infrastructure.schools.deficit}`} icon={GraduationCap} />
        <KpiCard label="Hospitals Required" value={active.infrastructure.hospitals.required} sub={`Deficit ${active.infrastructure.hospitals.deficit}`} icon={Hospital} />
        <KpiCard label="Residential" value={`${active.zones.find(z=>z.type==='residential')?.percentage||0}%`} sub="Land use" />
        <KpiCard label="Green / Open" value={`${active.sustainability.green_space_pct}%`} sub="Parks + greens" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="border border-slate-200 rounded-md bg-white p-5 lg:col-span-2">
          <div className="overline mb-4">Land Use Distribution</div>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={landUseData} margin={{ left: -10 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} height={50} />
                <YAxis tick={{ fontSize: 11 }} />
                <RTooltip />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {landUseData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="border border-slate-200 rounded-md bg-white p-5">
          <div className="overline mb-4">Composite Score</div>
          <div className="h-64 relative">
            <ResponsiveContainer>
              <RadialBarChart innerRadius="60%" outerRadius="95%" data={scoreData} startAngle={90} endAngle={90 - (active.score.overall / 100) * 360}>
                <RadialBar background={{ fill: "#F1F5F9" }} dataKey="value" cornerRadius={20} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="text-center">
                <div className="text-4xl font-display font-extrabold">{active.score.overall}</div>
                <div className="text-xs text-slate-500 uppercase tracking-widest">/ 100</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Score breakdown */}
      <div className="mt-6 border border-slate-200 rounded-md bg-white p-5">
        <div className="overline mb-4">Score Breakdown · Transparent Planning</div>
        <div className="grid md:grid-cols-3 gap-4">
          {active.score.breakdown.map((b, i) => (
            <div key={i} className="p-4 border border-slate-200 rounded-md">
              <div className="flex justify-between items-baseline mb-2">
                <div className="text-sm font-semibold">{b.category}</div>
                <div className="text-lg font-display font-bold">{Math.round(b.score)}</div>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mb-2">
                <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100,b.score)}%` }} transition={{ delay: i * 0.05, duration: 0.8 }}
                  className="h-full bg-emerald-500 rounded-full" />
              </div>
              <div className="text-[11px] text-slate-500">Weight {b.weight}% · {b.reason}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
