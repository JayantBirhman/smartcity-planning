import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { CheckCircle2, Award } from "lucide-react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";

export default function Proposals() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/projects/${id}`).then(r => setP(r.data)); }, [id]);
  if (!p) return <div className="p-8 text-slate-500">Loading…</div>;

  const [A, B] = p.proposals;
  const winner = A.score > B.score ? A : B;
  const radarData = Object.keys(A.metrics).map(k => ({ metric: k.replace("_", " "), A: A.metrics[k], B: B.metrics[k] }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="overline mb-2">Proposal Comparison</div>
      <h1 className="font-display font-extrabold text-3xl mb-2">Proposal A vs Proposal B</h1>
      <p className="text-sm text-slate-500 mb-8">Side-by-side evaluation with recommendation.</p>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        {[A, B].map((prop, i) => {
          const isWinner = prop.id === winner.id;
          return (
            <motion.div key={prop.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
              className={`border rounded-md bg-white p-6 relative ${isWinner ? "border-emerald-500 ring-2 ring-emerald-500/20" : "border-slate-200"}`}>
              {isWinner && (
                <div className="absolute -top-3 left-4 px-3 py-1 rounded-full bg-emerald-500 text-white text-[10px] uppercase tracking-widest font-semibold flex items-center gap-1">
                  <Award size={10} /> Recommended
                </div>
              )}
              <div className="overline mb-2">{prop.id}</div>
              <div className="font-display font-bold text-xl mb-2">{prop.name}</div>
              <p className="text-sm text-slate-600 mb-4">{prop.description}</p>
              <div className="text-4xl font-display font-extrabold mb-4">{prop.score}<span className="text-lg text-slate-500">/100</span></div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Stat label="Population" value={prop.population_capacity.toLocaleString()} />
                <Stat label="Green Space" value={`${prop.green_space_pct}%`} />
                <Stat label="Schools" value={prop.schools} />
                <Stat label="Hospitals" value={prop.hospitals} />
                <Stat label="Parks" value={prop.parks} />
                <Stat label="Road Coverage" value={`${prop.road_coverage_pct}%`} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="border border-slate-200 bg-white rounded-md p-6 mb-6">
        <div className="overline mb-4">Metric-by-metric Comparison</div>
        <div className="h-80">
          <ResponsiveContainer>
            <RadarChart data={radarData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
              <Radar name="Proposal A" dataKey="A" stroke="#0F172A" fill="#0F172A" fillOpacity={0.2} />
              <Radar name="Proposal B" dataKey="B" stroke="#059669" fill="#059669" fillOpacity={0.3} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="border border-emerald-200 bg-emerald-50 rounded-md p-6">
        <div className="flex items-center gap-2 mb-2">
          <CheckCircle2 size={16} className="text-emerald-700" />
          <div className="font-display font-bold text-emerald-900">Recommendation</div>
        </div>
        <p className="text-sm text-emerald-900">
          <strong>{winner.name}</strong> is recommended with a composite score of {winner.score}/100. It provides {winner.green_space_pct}% green coverage and stronger sustainability performance while meeting projected infrastructure requirements for {p.population.forecast_population.toLocaleString()} residents.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-2 border border-slate-200 rounded">
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
