import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { MapPin, Search, Loader2, ArrowRight, Check } from "lucide-react";
import { api } from "@/lib/api";
import { PROJECT } from "@/constants/testIds";
import { LocationPicker } from "@/components/LocationPicker";

const STEPS = ["Location", "Site Data", "Assumptions", "Review"];

const PRESETS = [
  { name: "Pune Ring 2, Maharashtra", lat: 18.5204, lng: 73.8567 },
  { name: "New Town Kolkata, WB", lat: 22.5807, lng: 88.4653 },
  { name: "Amaravati, Andhra Pradesh", lat: 16.5062, lng: 80.6480 },
  { name: "GIFT City, Gujarat", lat: 23.1602, lng: 72.6836 },
  { name: "Naya Raipur, Chhattisgarh", lat: 21.1794, lng: 81.7500 },
];

export default function NewProject() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [locSearch, setLocSearch] = useState("");
  const [locResults, setLocResults] = useState([]);
  const [form, setForm] = useState({
    name: "Smart Sector 21",
    location: { name: "Pune Ring 2, Maharashtra", lat: 18.5204, lng: 73.8567, state: "Maharashtra", country: "India" },
    site_area_sqkm: 10,
    existing_population: 50000,
    target_population: 120000,
    growth_rate: 2.8,
    planning_horizon_years: 20,
    existing_schools: 8,
    existing_hospitals: 2,
    existing_parks: 5,
    existing_roads_km: 40,
    existing_buildings: 4500,
  });
  const nav = useNavigate();

  const searchLoc = async (q) => {
    setLocSearch(q);
    if (!q.trim()) { setLocResults([]); return; }
    // use Nominatim (OSM) for real geocoding
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setLocResults(data.map(d => ({ name: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) })));
    } catch { setLocResults([]); }
  };

  const useCurrent = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    toast.loading("Getting your location…", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setForm(f => ({ ...f, location: { ...f.location, name: "Current Location", lat: p.coords.latitude, lng: p.coords.longitude } }));
        toast.success("Location captured", { id: "geo" });
      },
      () => toast.error("Permission denied", { id: "geo" })
    );
  };

  const submit = async () => {
    setLoading(true);
    try {
      const { data } = await api.post("/projects", form);
      toast.success("Planning analysis complete");
      nav(`/projects/${data.id}/map`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto">
      <div className="overline mb-2">New Planning Project</div>
      <h1 className="font-display font-extrabold text-3xl mb-6">Create a smart city plan</h1>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((s, i) => (
          <div key={i} className="flex items-center flex-1">
            <div className={`flex items-center gap-2 ${i <= step ? "text-slate-900" : "text-slate-400"}`}>
              <div className={`w-7 h-7 rounded-full grid place-items-center text-xs font-semibold ${
                i < step ? "bg-emerald-500 text-white" : i === step ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-500"
              }`}>{i < step ? <Check size={12} /> : i + 1}</div>
              <div className="text-sm font-medium">{s}</div>
            </div>
            {i < STEPS.length - 1 && <div className={`flex-1 h-px mx-3 ${i < step ? "bg-emerald-500" : "bg-slate-200"}`} />}
          </div>
        ))}
      </div>

      <div className="border border-slate-200 rounded-md bg-white p-6 lg:p-8">
        {step === 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="overline mb-2">Step 1</div>
            <h2 className="font-display font-bold text-2xl mb-6">Where are you planning?</h2>

            <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Project Name</label>
            <input data-testid={PROJECT.nameInput} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none mb-6" />

            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Search Location</label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input data-testid={PROJECT.locSearch} value={locSearch} onChange={e => searchLoc(e.target.value)}
                    placeholder="City, area, district…"
                    className="w-full pl-9 h-11 pr-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none" />
                </div>
                {locResults.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-md bg-white max-h-48 overflow-y-auto">
                    {locResults.map((r, i) => (
                      <button key={i} onClick={() => { setForm(f => ({ ...f, location: { ...f.location, ...r } })); setLocResults([]); setLocSearch(r.name); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100 last:border-0">
                        {r.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">Or Use Current</label>
                <button data-testid={PROJECT.useLocation} onClick={useCurrent}
                  className="w-full h-11 rounded-md border border-slate-300 hover:border-emerald-500 hover:text-emerald-700 flex items-center justify-center gap-2 text-sm">
                  <MapPin size={14} /> Use My Location
                </button>
              </div>
            </div>

            <div className="mb-4">
              <div className="text-xs text-slate-500 mb-2 uppercase tracking-widest">Quick Presets</div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p, i) => (
                  <button key={i} onClick={() => setForm(f => ({ ...f, location: { ...f.location, ...p } }))}
                    className={`text-xs px-3 py-1.5 rounded-full border ${
                      form.location.name === p.name ? "bg-slate-900 text-white border-slate-900" : "border-slate-200 hover:border-emerald-500 hover:text-emerald-700"
                    }`}>{p.name}</button>
                ))}
              </div>
            </div>

            <div className="mt-6 p-4 bg-slate-50 rounded-md border border-slate-200 text-xs text-slate-600">
              <div className="font-semibold text-slate-900 mb-1">Selected: {form.location.name}</div>
              Lat {form.location.lat.toFixed(4)} · Lng {form.location.lng.toFixed(4)}
            </div>

            <div className="mt-4">
              <div className="text-xs text-slate-500 mb-2 uppercase tracking-widest flex items-center justify-between">
                <span>Interactive GIS Site Anchor & Footprint</span>
                <span className="text-emerald-700 font-semibold font-mono text-[11px]">{form.site_area_sqkm} km² Planned Area</span>
              </div>
              <LocationPicker
                lat={form.location.lat}
                lng={form.location.lng}
                siteAreaSqkm={form.site_area_sqkm}
                onPick={({ lat, lng, name }) => setForm(f => ({
                  ...f,
                  location: {
                    ...f.location,
                    lat,
                    lng,
                    name: name || f.location.name
                  }
                }))}
              />
            </div>
          </motion.div>
        )}

        {step === 1 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="overline mb-2">Step 2</div>
            <h2 className="font-display font-bold text-2xl mb-6">Site & population</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <NumField id={PROJECT.siteAreaInput} label="Site Area (sq.km)" value={form.site_area_sqkm} step={0.1} onChange={v => setForm({ ...form, site_area_sqkm: v })} />
              <NumField id={PROJECT.existingPop} label="Existing Population" value={form.existing_population} onChange={v => setForm({ ...form, existing_population: v })} />
              <NumField id={PROJECT.targetPop} label="Target Population" value={form.target_population} onChange={v => setForm({ ...form, target_population: v })} />
              <NumField id={PROJECT.growth} label="Growth Rate (%)" value={form.growth_rate} step={0.1} onChange={v => setForm({ ...form, growth_rate: v })} />
              <NumField id={PROJECT.horizon} label="Planning Horizon (years)" value={form.planning_horizon_years} onChange={v => setForm({ ...form, planning_horizon_years: v })} />
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="overline mb-2">Step 3</div>
            <h2 className="font-display font-bold text-2xl mb-6">Existing infrastructure</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <NumField label="Existing Schools" value={form.existing_schools} onChange={v => setForm({ ...form, existing_schools: v })} />
              <NumField label="Existing Hospitals" value={form.existing_hospitals} onChange={v => setForm({ ...form, existing_hospitals: v })} />
              <NumField label="Existing Parks" value={form.existing_parks} onChange={v => setForm({ ...form, existing_parks: v })} />
              <NumField label="Existing Roads (km)" value={form.existing_roads_km} step={0.5} onChange={v => setForm({ ...form, existing_roads_km: v })} />
              <NumField label="Existing Buildings" value={form.existing_buildings} onChange={v => setForm({ ...form, existing_buildings: v })} />
            </div>
            <div className="mt-6 p-4 bg-emerald-50 border border-emerald-200 rounded-md text-xs text-emerald-900">
              <strong>Assumptions used:</strong> URDPFI-inspired norms — 1 school per 1500 people, 1 hospital per 25000, 15% green cover target.
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="overline mb-2">Step 4</div>
            <h2 className="font-display font-bold text-2xl mb-6">Review & analyze</h2>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <ReviewItem label="Project" value={form.name} />
              <ReviewItem label="Location" value={form.location.name} />
              <ReviewItem label="Site Area" value={`${form.site_area_sqkm} sq.km`} />
              <ReviewItem label="Target Population" value={form.target_population.toLocaleString()} />
              <ReviewItem label="Growth Rate" value={`${form.growth_rate}% / year`} />
              <ReviewItem label="Horizon" value={`${form.planning_horizon_years} years`} />
              <ReviewItem label="Existing Schools" value={form.existing_schools} />
              <ReviewItem label="Existing Hospitals" value={form.existing_hospitals} />
            </div>
          </motion.div>
        )}

        <div className="flex justify-between mt-8 pt-6 border-t border-slate-200">
          <button disabled={step === 0} onClick={() => setStep(s => s - 1)}
            className="h-10 px-4 rounded-md border border-slate-300 text-sm disabled:opacity-40 hover:border-slate-400">
            Back
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={() => setStep(s => s + 1)}
              className="h-10 px-5 rounded-md bg-slate-900 text-white text-sm hover:bg-slate-800 flex items-center gap-2">
              Continue <ArrowRight size={14} />
            </button>
          ) : (
            <button data-testid={PROJECT.submit} disabled={loading} onClick={submit}
              className="h-10 px-6 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700 flex items-center gap-2 disabled:opacity-60">
              {loading ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</> : <>Run Planning Analysis <ArrowRight size={14} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 1, id }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
      <input data-testid={id} type="number" step={step} value={value} onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full h-11 px-3 rounded-md border border-slate-300 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none" />
    </div>
  );
}

function ReviewItem({ label, value }) {
  return (
    <div className="p-3 border border-slate-200 rounded-md">
      <div className="overline text-[10px] mb-1">{label}</div>
      <div className="font-medium text-slate-900">{value}</div>
    </div>
  );
}
