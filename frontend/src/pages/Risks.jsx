import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";

const LEVEL_STYLE = {
  High: "bg-red-50 text-red-700 border-red-200",
  Medium: "bg-amber-50 text-amber-800 border-amber-200",
  Low: "bg-slate-50 text-slate-700 border-slate-200",
};

export default function Risks() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/projects/${id}`).then(r => setP(r.data)); }, [id]);
  if (!p) return <div className="p-8 text-slate-500">Loading…</div>;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="overline mb-2">Challenges & Risks</div>
      <h1 className="font-display font-extrabold text-3xl mb-8">Data-driven risks with mitigation</h1>

      <div className="space-y-3">
        {p.risks.map((r, i) => (
          <motion.div key={r.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="border border-slate-200 rounded-md bg-white p-5 grid md:grid-cols-12 gap-4">
            <div className="md:col-span-1 flex items-center justify-center">
              <div className="w-10 h-10 rounded-md bg-slate-50 grid place-items-center">
                <AlertTriangle size={16} className={r.level === "High" ? "text-red-600" : r.level === "Medium" ? "text-amber-600" : "text-slate-500"} />
              </div>
            </div>
            <div className="md:col-span-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="overline text-[10px]">{r.id}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold uppercase tracking-widest ${LEVEL_STYLE[r.level]}`}>{r.level}</span>
              </div>
              <div className="font-display font-bold text-slate-900">{r.title}</div>
              <div className="text-xs text-slate-500 mt-1">{r.category}</div>
            </div>
            <div className="md:col-span-3">
              <Meter label="Probability" value={r.probability} />
              <Meter label="Impact" value={r.impact} />
            </div>
            <div className="md:col-span-4 text-sm">
              <div className="text-slate-600 mb-2"><strong className="text-slate-900">Reason.</strong> {r.reason}</div>
              <div className="flex items-start gap-2 p-2.5 rounded-md bg-emerald-50 border border-emerald-200">
                <ShieldCheck size={14} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                <div className="text-emerald-900 text-xs">{r.mitigation}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Meter({ label, value }) {
  return (
    <div className="mb-1.5">
      <div className="flex justify-between text-[10px] text-slate-500 uppercase tracking-widest mb-1">
        <span>{label}</span><span>{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div initial={{ width: 0 }} animate={{ width: `${value}%` }} className="h-full bg-slate-900" />
      </div>
    </div>
  );
}
