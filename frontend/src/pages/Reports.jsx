import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { FileText, Download } from "lucide-react";
import jsPDF from "jspdf";
import { api } from "@/lib/api";
import { toast } from "sonner";

const REPORTS = [
  { key: "summary", title: "Planning Summary", desc: "High-level project overview and score" },
  { key: "population", title: "Population Analysis", desc: "Forecast, growth and density" },
  { key: "infrastructure", title: "Infrastructure Requirements", desc: "Schools, hospitals, parks, utilities" },
  { key: "zoning", title: "Zoning Plan", desc: "Land-use distribution and reasoning" },
  { key: "sustainability", title: "Sustainability Analysis", desc: "Carbon, solar, daylight, wind, noise" },
  { key: "proposals", title: "Proposal Comparison", desc: "Balanced vs Sustainable — scored" },
  { key: "risks", title: "Challenges & Risks", desc: "Risk register with mitigation" },
];

export default function Reports() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/projects/${id}`).then(r => setP(r.data)); }, [id]);
  if (!p) return <div className="p-8 text-slate-500">Loading…</div>;

  const gen = (kind) => {
    const doc = new jsPDF();
    let y = 20;
    doc.setFontSize(18); doc.text(`SmartScape · ${REPORTS.find(r=>r.key===kind).title}`, 14, y); y += 8;
    doc.setFontSize(10); doc.setTextColor(100); doc.text(`${p.name} · ${p.location.name}`, 14, y); y += 10;
    doc.setTextColor(30); doc.setFontSize(11);

    if (kind === "summary") {
      const lines = [
        `Site area: ${p.site_area_sqkm} sq.km`,
        `Forecast population: ${p.population.forecast_population.toLocaleString()}`,
        `Overall score: ${p.score.overall}/100`,
        ``,
        `Score breakdown:`,
        ...p.score.breakdown.map(b => `  - ${b.category}: ${Math.round(b.score)} (weight ${b.weight}%)`),
      ];
      lines.forEach(l => { doc.text(l, 14, y); y += 6; });
    } else if (kind === "infrastructure") {
      Object.entries(p.infrastructure).forEach(([k, v]) => {
        doc.text(`${k}: required ${v.required}, existing ${v.existing}, deficit ${v.deficit}`, 14, y); y += 6;
      });
    } else if (kind === "zoning") {
      p.zones.forEach(z => { doc.text(`${z.name} — ${z.percentage}% (${z.area_sqkm} sq.km) - ${z.purpose}`, 14, y); y += 6; });
    } else if (kind === "risks") {
      p.risks.forEach(r => { doc.text(`${r.title} [${r.level}]`, 14, y); y += 5;
        doc.setTextColor(90); doc.text(`  ${r.mitigation}`, 14, y); y += 8; doc.setTextColor(30); });
    } else if (kind === "sustainability") {
      Object.entries(p.sustainability).forEach(([k, v]) => {
        if (typeof v === "object") doc.text(`${k}: ${v.value} ${v.unit || ""} (score ${v.score})`, 14, y);
        else doc.text(`${k}: ${v}`, 14, y);
        y += 6;
      });
    } else if (kind === "proposals") {
      p.proposals.forEach(pr => { doc.text(`${pr.name}: score ${pr.score}`, 14, y); y += 6;
        doc.setTextColor(90); doc.text(`  ${pr.description}`, 14, y); y += 8; doc.setTextColor(30); });
    } else if (kind === "population") {
      Object.entries(p.population).forEach(([k, v]) => { doc.text(`${k}: ${v}`, 14, y); y += 6; });
    }
    doc.save(`${p.name.replace(/\s+/g, "_")}_${kind}.pdf`);
    toast.success("Report generated");
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="overline mb-2">Reports</div>
      <h1 className="font-display font-extrabold text-3xl mb-8">Generate & download</h1>

      <div className="grid md:grid-cols-2 gap-4">
        {REPORTS.map((r, i) => (
          <motion.div key={r.key} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
            className="border border-slate-200 bg-white rounded-md p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-md bg-slate-100 grid place-items-center">
              <FileText size={16} className="text-slate-700" />
            </div>
            <div className="flex-1">
              <div className="font-display font-semibold">{r.title}</div>
              <div className="text-xs text-slate-500 mt-0.5">{r.desc}</div>
            </div>
            <button onClick={() => gen(r.key)} className="h-9 px-3 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800 flex items-center gap-1.5">
              <Download size={12} /> PDF
            </button>
          </motion.div>
        ))}
      </div>

      <div className="mt-6 text-xs text-slate-500">
        All reports are generated from your project data in the browser. Connect a report service for enterprise formats later.
      </div>
    </div>
  );
}
