import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { PlusCircle, Trash2, MapPin, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export default function Projects() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { load(); }, []);
  const load = () => api.get("/projects").then(r => { setProjects(r.data); setLoading(false); });

  const del = async (id) => {
    if (!window.confirm("Delete this project?")) return;
    await api.delete(`/projects/${id}`); toast.success("Project deleted"); load();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="overline mb-2">All Projects</div>
          <h1 className="font-display font-extrabold text-3xl">Your planning projects</h1>
        </div>
        <Link to="/projects/new" className="h-10 px-4 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 flex items-center gap-2">
          <PlusCircle size={14} /> New Project
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-slate-100 rounded-md animate-pulse" />)}
        </div>
      ) : projects.length === 0 ? (
        <div className="border border-dashed border-slate-300 rounded-md p-16 text-center bg-white">
          <div className="text-slate-500 mb-4">No projects yet</div>
          <Link to="/projects/new" className="inline-flex h-10 px-4 rounded-md bg-emerald-600 text-white text-sm items-center gap-2 hover:bg-emerald-700">
            Create your first project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p, i) => (
            <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
              className="border border-slate-200 bg-white rounded-md p-5 hover:shadow-md transition-shadow relative group">
              <button onClick={() => del(p.id)} className="absolute top-3 right-3 p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 opacity-0 group-hover:opacity-100">
                <Trash2 size={14} />
              </button>
              <div className="text-[10px] uppercase tracking-widest text-emerald-700 font-semibold mb-2">{p.status}</div>
              <div className="font-display font-bold text-lg mb-1 line-clamp-1">{p.name}</div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-4">
                <MapPin size={12} /> <span className="line-clamp-1">{p.location.name}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mb-4">
                <Stat label="Pop." value={`${(p.population.forecast_population / 1000).toFixed(0)}k`} />
                <Stat label="Area" value={`${p.site_area_sqkm}km²`} />
                <Stat label="Score" value={p.score.overall} />
              </div>
              <Link to={`/projects/${p.id}/map`} className="w-full h-9 rounded-md border border-slate-300 hover:border-emerald-500 hover:text-emerald-700 text-sm flex items-center justify-center gap-2">
                Open <ArrowRight size={12} />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-2 rounded bg-slate-50 border border-slate-100">
      <div className="text-[9px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
