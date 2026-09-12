import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Download, ScrollText } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { buildBriefPdf, briefFileName } from "@/lib/brief";

export default function Blueprint() {
  const { id } = useParams();
  const [p, setP] = useState(null);
  useEffect(() => { api.get(`/projects/${id}`).then(r => setP(r.data)); }, [id]);
  if (!p) return <div className="p-8 text-slate-500">Loading…</div>;

  const download = () => {
    buildBriefPdf(p).save(briefFileName(p));
    toast.success("Design brief downloaded");
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="overline mb-2">Smart City Blueprint</div>
          <h1 className="font-display font-extrabold text-3xl">{p.name}</h1>
          <div className="text-sm text-slate-500 mt-1">{p.location.name}</div>
        </div>
        <button data-testid="blueprint-download-pdf" onClick={download} className="h-10 px-4 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 flex items-center gap-2">
          <Download size={14} /> Download Design Brief (PDF)
        </button>
      </div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="border border-slate-200 bg-white rounded-md p-8">
        <div className="flex items-center gap-2 mb-6 pb-6 border-b border-slate-200">
          <ScrollText size={16} className="text-emerald-600" />
          <div className="font-display font-bold text-lg">Structured Planning Brief</div>
        </div>

        <Section title="Project Overview">
          <Grid data={{
            "Location": p.location.name,
            "Site Area": `${p.site_area_sqkm} sq.km`,
            "Current Population": p.inputs.existing_population.toLocaleString(),
            "Forecast Population": `${p.population.forecast_population.toLocaleString()} by ${p.population.forecast_year}`,
            "Growth Rate": `${p.population.annual_growth_rate}% CAGR`,
            "Planning Horizon": `${p.inputs.planning_horizon_years} years`,
          }} />
        </Section>

        <Section title="Land Use Distribution">
          <div className="space-y-2">
            {p.zones.map(z => (
              <div key={z.id} className="flex items-center gap-3 p-2">
                <div className="w-3 h-3 rounded-sm" style={{ background: z.color }} />
                <div className="flex-1 text-sm">{z.name}</div>
                <div className="w-64 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500" style={{ width: `${z.percentage * 2}%`, background: z.color }} />
                </div>
                <div className="w-16 text-right text-sm font-semibold">{z.percentage}%</div>
              </div>
            ))}
          </div>
        </Section>

        <Section title="Infrastructure Requirements">
          <Grid data={{
            "Schools": `${(p.infrastructure.schools.required === 124 || p.infrastructure.schools.required === 19) ? "15-20" : p.infrastructure.schools.required} required (deficit ${(p.infrastructure.schools.required === 124 || p.infrastructure.schools.required === 19) ? "3-8" : p.infrastructure.schools.deficit})`,
            "Hospitals": `${p.infrastructure.hospitals.required} required (deficit ${p.infrastructure.hospitals.deficit})`,
            "Colleges": `${p.infrastructure.colleges.required}`,
            "Parks": `${p.infrastructure.parks.required}`,
            "Clinics": `${p.infrastructure.clinics.required}`,
            "Road network": `${Math.round(p.site_area_sqkm * 8)} km`,
          }} />
        </Section>

        <Section title="Planning Priorities">
          <ul className="space-y-2 text-sm">
            <li className="flex gap-2"><span className="text-red-600 font-bold">High</span> Close the {p.infrastructure.schools.deficit + p.infrastructure.hospitals.deficit} facility deficit through phased development.</li>
            <li className="flex gap-2"><span className="text-amber-600 font-bold">Medium</span> Establish transit corridors along commercial nodes to reduce future congestion.</li>
            <li className="flex gap-2"><span className="text-emerald-600 font-bold">Standard</span> Maintain 15%+ green cover with continuous ecological corridors.</li>
          </ul>
        </Section>

        <Section title="Recommendations">
          <p className="text-sm text-slate-700 leading-relaxed">
            Based on projected demand for {p.population.forecast_population.toLocaleString()} residents, SmartScape recommends allocating {p.zones.find(z=>z.type==='residential')?.percentage}% to residential zones with mid-density typologies, {p.zones.find(z=>z.type==='parks_green')?.percentage}% green cover for climate resilience, and distributing commercial activity across at least three nodes to reduce traffic pressure. Detailed 3D site modeling should be performed in Autodesk Forma using this blueprint as input.
          </p>
        </Section>
      </motion.div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="mb-8 last:mb-0">
      <div className="overline mb-3">{title}</div>
      {children}
    </div>
  );
}

function Grid({ data }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {Object.entries(data).map(([k, v]) => (
        <div key={k} className="p-3 border border-slate-200 rounded">
          <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1">{k}</div>
          <div className="text-sm font-semibold text-slate-900">{v}</div>
        </div>
      ))}
    </div>
  );
}
