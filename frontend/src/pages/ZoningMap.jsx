import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Layers, Info, Upload, Trash2, Loader2, Satellite } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import MapView, { BASEMAPS } from "@/components/MapView";

const LAYER_KEYS = [
  { key: "zones", label: "Zoning Overlays", color: "#059669" },
  { key: "boundary", label: "Site Boundary", color: "#0F172A" },
  { key: "schools", label: "Schools", color: "#2563EB" },
  { key: "hospitals", label: "Hospitals", color: "#DC2626" },
  { key: "parks", label: "Parks", color: "#059669" },
];

export default function ZoningMap() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const [project, setProject] = useState(null);
  const [selected, setSelected] = useState(null);
  const [basemap, setBasemap] = useState("satellite");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [layers, setLayers] = useState({ zones: true, boundary: true, schools: true, hospitals: true, parks: true });

  useEffect(() => {
    api.get(`/projects/${id}`).then(r => {
      setProject(r.data);
      const zoneId = sp.get("zone");
      if (zoneId) {
        const z = r.data.zones.find(z => z.id === zoneId);
        if (z) setSelected(z);
      }
    });
  }, [id]);

  const uploadBoundary = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const geojson = JSON.parse(await file.text());
      const { data } = await api.put(`/projects/${id}/boundary`, { geojson, source_name: file.name });
      setProject(data);
      setSelected(null);
      toast.success(`Boundary applied — ${data.site_area_sqkm} sq.km, zones re-cut to your plot`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not read that GeoJSON file");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeBoundary = async () => {
    setUploading(true);
    try {
      const { data } = await api.delete(`/projects/${id}/boundary`);
      setProject(data);
      setSelected(null);
      toast.success("Boundary removed — reverted to generated zone blocks");
    } catch { toast.error("Failed to remove boundary"); }
    finally { setUploading(false); }
  };

  if (!project) return <div className="p-8 text-slate-500">Loading map…</div>;

  return (
    <div className="h-[calc(100vh-3.5rem)] relative">
      {/* Map */}
      <MapView project={project} onZoneClick={setSelected} selectedZoneId={selected?.id} layers={layers} basemap={basemap} />

      {/* Left overlay: header */}
      <div className="absolute top-4 left-16 z-[500] glass rounded-md px-4 py-3 max-w-md">
        <div className="overline text-[10px] mb-1">Interactive Planning Map</div>
        <div className="font-display font-bold text-slate-900">{project.name}</div>
        <div className="text-xs text-slate-500">{project.location.name}</div>
        <div className="text-[11px] text-slate-600 mt-1.5">
          {project.site_area_sqkm} sq.km ·{" "}
          {project.boundary ? (
            <span data-testid="boundary-status" className="text-emerald-700 font-semibold">Real boundary: {project.boundary.source_name || "uploaded"}</span>
          ) : (
            <span data-testid="boundary-status" className="text-slate-500">Generated blocks (no boundary)</span>
          )}
        </div>
        <div className="flex gap-2 mt-3">
          <input ref={fileRef} type="file" accept=".geojson,.json,application/geo+json,application/json"
            data-testid="boundary-file-input" className="hidden"
            onChange={(e) => uploadBoundary(e.target.files?.[0])} />
          <button data-testid="boundary-upload-btn" disabled={uploading} onClick={() => fileRef.current?.click()}
            className="h-8 px-3 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1.5">
            {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />} Upload GeoJSON boundary
          </button>
          {project.boundary && (
            <button data-testid="boundary-remove-btn" disabled={uploading} onClick={removeBoundary}
              className="h-8 px-3 rounded-md border border-slate-300 text-xs hover:bg-white flex items-center gap-1.5">
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
      </div>

      {/* Layers */}
      <div className="absolute top-4 right-4 z-[500] glass rounded-md p-4 w-64">
        <div className="flex items-center gap-2 mb-3">
          <Satellite size={14} className="text-emerald-600" />
          <div className="text-sm font-semibold">Basemap</div>
        </div>
        <div className="flex gap-1.5 mb-4">
          {Object.entries(BASEMAPS).map(([key, b]) => (
            <button key={key} data-testid={`basemap-${key}`} onClick={() => setBasemap(key)}
              className={`flex-1 h-8 rounded text-[11px] font-medium border transition-colors ${
                basemap === key ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 text-slate-600 hover:border-emerald-500"
              }`}>{b.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-2 pt-3 border-t border-slate-200">
          <Layers size={14} className="text-emerald-600" />
          <div className="text-sm font-semibold">Map Layers</div>
        </div>
        {LAYER_KEYS.map(l => (
          <label key={l.key} className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={layers[l.key]} onChange={e => setLayers(v => ({ ...v, [l.key]: e.target.checked }))}
              className="w-4 h-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
            <div className="w-2.5 h-2.5 rounded-sm" style={{ background: l.color }} />
            <div className="text-sm text-slate-700">{l.label}</div>
          </label>
        ))}
        <div className="mt-3 pt-3 border-t border-slate-200 text-[10px] text-slate-500 uppercase tracking-widest flex items-center gap-1">
          <Info size={10} /> Click any zone to inspect
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 z-[500] glass rounded-md p-3">
        <div className="overline text-[10px] mb-2">Zone Legend</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
          {project.zones.map(z => (
            <div key={z.id} className="flex items-center gap-2 text-xs">
              <div className="w-3 h-3 rounded-sm" style={{ background: z.color }} />
              <div className="text-slate-700">{z.name}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Zone detail panel */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ x: 380, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 380, opacity: 0 }}
            transition={{ type: "spring", stiffness: 180, damping: 22 }}
            className="absolute top-0 right-0 h-full w-96 bg-white border-l border-slate-200 z-[600] flex flex-col shadow-2xl"
          >
            <div className="p-4 border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="overline text-[10px] mb-1" style={{ color: selected.color }}>Zone {selected.id}</div>
                <div className="font-display font-bold text-xl text-slate-900">{selected.name}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-slate-100 rounded"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Area" value={`${selected.area_sqkm} km²`} />
                <Stat label="% of Site" value={`${selected.percentage}%`} />
                <Stat label="Pop. Served" value={selected.population_served.toLocaleString()} />
                <Stat label="Type" value={selected.type} />
              </div>
              <div>
                <div className="overline mb-1">Purpose</div>
                <p className="text-sm text-slate-700">{selected.purpose}</p>
              </div>
              <div>
                <div className="overline mb-1">Planning Reasoning</div>
                <p className="text-sm text-slate-700">{selected.reasoning}</p>
              </div>
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200">
                <div className="overline mb-1">Nearby Infrastructure</div>
                <div className="text-xs text-slate-700">
                  {project.infrastructure.schools.required} schools · {project.infrastructure.hospitals.required} hospitals · {project.infrastructure.parks.required} parks planned across zones
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 flex gap-2">
              <Link to={`/projects/${id}/infrastructure`} className="flex-1 h-10 rounded-md border border-slate-300 grid place-items-center text-sm hover:border-emerald-500 hover:text-emerald-700">
                Infrastructure
              </Link>
              <Link to={`/projects/${id}/blueprint`} className="flex-1 h-10 rounded-md bg-slate-900 text-white grid place-items-center text-sm hover:bg-slate-800">
                Blueprint
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="p-2 border border-slate-200 rounded">
      <div className="overline text-[9px]">{label}</div>
      <div className="text-sm font-semibold text-slate-900 capitalize">{value}</div>
    </div>
  );
}
