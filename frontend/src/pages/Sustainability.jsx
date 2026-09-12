import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { RadialBarChart, RadialBar, ResponsiveContainer } from "recharts";
import { Sun, Wind, Volume2, Leaf, Cloud, Lightbulb, CheckCircle2, ExternalLink, RefreshCw, DownloadCloud, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const METRICS = [
  { key: "embodied_carbon", label: "Embodied Carbon", icon: Cloud, color: "#0F172A" },
  { key: "solar_potential", label: "Solar Potential", icon: Sun, color: "#F59E0B" },
  { key: "daylight", label: "Daylight", icon: Lightbulb, color: "#EAB308" },
  { key: "wind", label: "Wind Comfort", icon: Wind, color: "#0EA5E9" },
  { key: "noise", label: "Noise", icon: Volume2, color: "#7C3AED" },
];

export default function Sustainability() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  const [autodeskStatus, setAutodeskStatus] = useState(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.get(`/projects/${id}`).then(r => setP(r.data));
    api.get("/autodesk/status").then(r => setAutodeskStatus(r.data)).catch(() => {});
  }, [id]);

  if (!p) return <div className="p-8 text-slate-500">Loading…</div>;

  const isFormaConnected = autodeskStatus?.connected;

  const handleImportForma = async () => {
    setSyncing(true);
    try {
      const res = await api.post(`/projects/${id}/autodesk-forma/simulate-microclimate`, {
        wind_direction_deg: 245.0,
        wind_speed_ms: 4.5,
        solar_date: "2026-06-21",
        time_of_day_hr: 12.0,
        density_factor: 1.0
      });
      if (res.data?.sustainability) {
        setP(prev => ({ ...prev, sustainability: res.data.sustainability, forma_analysis: res.data.forma_analysis }));
      }
      toast.success("Autodesk Forma microclimate & environmental simulation synced!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Autodesk Forma sync failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleRefresh = () => {
    api.get(`/projects/${id}`).then(r => {
      setP(r.data);
      toast.success("Sustainability analysis refreshed");
    });
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="overline mb-2">Sustainability Dashboard</div>
          <h1 className="font-display font-extrabold text-3xl">Environmental performance</h1>
        </div>
        {isFormaConnected ? (
          <span className="text-xs px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center gap-1.5 font-medium">
            <CheckCircle2 size={13} className="text-emerald-600" />
            Connected · Autodesk Forma Live Sync
          </span>
        ) : (
          <Link to="/integrations" className="text-xs px-3 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 flex items-center gap-1.5">
            Prototype · Connect Autodesk Forma for live analysis
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {METRICS.map((m, i) => {
          const d = p.sustainability[m.key];
          const score = d.score;
          return (
            <motion.div key={m.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="border border-slate-200 bg-white rounded-md p-4 relative">
              <div className="flex items-center gap-2 mb-2">
                <m.icon size={14} style={{ color: m.color }} />
                <span className="overline text-[10px]">{m.label}</span>
              </div>
              <div className="h-24 relative">
                <ResponsiveContainer>
                  <RadialBarChart innerRadius="60%" outerRadius="95%" data={[{ value: score, fill: m.color }]} startAngle={90} endAngle={90 - (score / 100) * 360}>
                    <RadialBar background={{ fill: "#F1F5F9" }} dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-xl font-display font-extrabold">{score}</div>
                </div>
              </div>
              <div className="mt-2 text-xs text-slate-500 text-center">{d.value} {d.unit}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="border border-slate-200 bg-white rounded-md p-6">
          <div className="flex items-center gap-2 mb-4">
            <Leaf size={16} className="text-emerald-600" />
            <div className="font-display font-bold">Green & Land Efficiency</div>
          </div>
          <Row label="Green Space" value={`${p.sustainability.green_space_pct}%`} score={p.sustainability.green_space_pct * 5} />
          <Row label="Land Efficiency" value={`${p.sustainability.land_efficiency}%`} score={p.sustainability.land_efficiency} />
          <Row label="Solar (Composite)" value={`${p.sustainability.solar_potential.score}/100`} score={p.sustainability.solar_potential.score} />
        </div>

        <div className="border border-slate-200 bg-white rounded-md p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="overline">
              {isFormaConnected ? "Autodesk Forma · Connected" : "Autodesk Forma · Integration Ready"}
            </div>
            {isFormaConnected && (
              <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                Live Sync Active
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600 mb-4">
            {isFormaConnected
              ? `Linked to ${p.autodesk?.aps_project_name || "Forma Pune Smart District"}. Streaming environmental metrics (solar, daylight, wind, and noise) directly into SmartScape.`
              : "SmartScape is designed to plug into Autodesk Forma's real-time environmental analysis for embodied carbon, daylight, wind, and noise."}
          </p>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => window.open("https://forma.autodesk.com", "_blank")}
              className="h-9 px-3.5 rounded-md border border-slate-300 text-xs hover:border-emerald-500 hover:text-emerald-700 flex items-center gap-1.5">
              <ExternalLink size={12} /> Open in Autodesk Forma
            </button>
            <button onClick={handleImportForma} disabled={syncing}
              className="h-9 px-3.5 rounded-md border border-slate-300 text-xs hover:border-emerald-500 hover:text-emerald-700 flex items-center gap-1.5 disabled:opacity-50">
              {syncing ? <Loader2 size={12} className="animate-spin" /> : <DownloadCloud size={12} />} Import Forma Data
            </button>
            <button onClick={handleRefresh}
              className="h-9 px-3.5 rounded-md border border-slate-300 text-xs hover:border-emerald-500 hover:text-emerald-700 flex items-center gap-1.5">
              <RefreshCw size={12} /> Refresh Analysis
            </button>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px]">
            <span className={`uppercase tracking-widest font-semibold ${isFormaConnected ? "text-emerald-700" : "text-amber-700"}`}>
              {isFormaConnected ? "Forma Integration Active" : "Prototype Integration"}
            </span>
            <Link to={`/projects/${id}/autodesk`} className="text-slate-600 hover:text-slate-900 underline font-medium">
              Autodesk Sync Details →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, score }) {
  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <div className="flex justify-between text-sm mb-1.5">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, score)}%` }} className="h-full bg-emerald-500" />
      </div>
    </div>
  );
}
