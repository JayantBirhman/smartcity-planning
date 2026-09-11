import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { GraduationCap, Hospital, TreePine, Route, Zap } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
import { api } from "@/lib/api";

const SECTIONS = [
  { key: "schools", label: "Schools", icon: GraduationCap, color: "#2563EB" },
  { key: "hospitals", label: "Hospitals", icon: Hospital, color: "#DC2626" },
  { key: "colleges", label: "Colleges", icon: GraduationCap, color: "#9333EA" },
  { key: "parks", label: "Parks", icon: TreePine, color: "#059669" },
];

export default function Infrastructure() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/projects/${id}`).then(r => setP(r.data)); }, [id]);
  if (!p) return <div className="p-8 text-slate-500">Loading…</div>;

  const chartData = SECTIONS.map(s => ({
    name: s.label,
    Required: p.infrastructure[s.key].required,
    Existing: p.infrastructure[s.key].existing,
    Deficit: p.infrastructure[s.key].deficit,
    color: s.color,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="overline mb-2">Infrastructure Planning</div>
      <h1 className="font-display font-extrabold text-3xl mb-8">Coverage, requirements & deficits</h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {SECTIONS.map((s, i) => {
          const d = p.infrastructure[s.key];
          return (
            <motion.div key={s.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="border border-slate-200 bg-white rounded-md p-5">
              <div className="flex items-center justify-between mb-3">
                <s.icon size={18} style={{ color: s.color }} />
                <span className="overline">{s.label}</span>
              </div>
              <div className="text-3xl font-display font-extrabold">{d.required}</div>
              <div className="text-xs text-slate-500 mt-1">Required · {d.existing} existing</div>
              <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between text-xs">
                <span className="text-slate-500">Deficit</span>
                <span className={`font-semibold ${d.deficit > 0 ? "text-red-600" : "text-emerald-600"}`}>{d.deficit}</span>
              </div>
            </motion.div>
          );
        })}
      </div>

      <div className="border border-slate-200 rounded-md bg-white p-6 mb-6">
        <div className="overline mb-4">Requirement vs Existing</div>
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="Required" radius={[4, 4, 0, 0]}>
                {chartData.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Bar>
              <Bar dataKey="Existing" radius={[4, 4, 0, 0]} fill="#94A3B8" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Section icon={Route} title="Transportation" items={[
          ["Road network required", `${Math.round(p.site_area_sqkm * 8)} km`],
          ["Existing roads", `${p.inputs.existing_roads_km} km`],
          ["Coverage", "72%"],
          ["Public transit corridors", "3 recommended"],
        ]} />
        <Section icon={Zap} title="Utilities" items={[
          ["Water demand", `${Math.round(p.population.forecast_population * 135 / 1000)} kL/day`],
          ["Electricity load", `${Math.round(p.population.forecast_population * 0.9 / 1000)} MW`],
          ["Waste generation", `${Math.round(p.population.forecast_population * 0.5 / 1000)} tonnes/day`],
          ["Waste treatment plants", "2 required"],
        ]} />
      </div>

      <div className="mt-6 p-4 rounded-md bg-slate-50 border border-slate-200 text-xs text-slate-600">
        <strong>Rules used (transparent):</strong> 1 school / 1,500 people · 1 hospital / 25,000 · 1 park / 5,000 · Road density 8 km/sq.km · 135 L water per person/day.
      </div>
    </div>
  );
}

function Section({ icon: Icon, title, items }) {
  return (
    <div className="border border-slate-200 rounded-md bg-white p-6">
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-emerald-600" />
        <div className="font-display font-bold">{title}</div>
      </div>
      <div className="space-y-2">
        {items.map(([k, v], i) => (
          <div key={i} className="flex justify-between text-sm py-1.5 border-b border-slate-100 last:border-0">
            <span className="text-slate-500">{k}</span>
            <span className="font-semibold text-slate-900">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
