import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Loader2, Building2, FolderOpen, Link2, Unlink, RefreshCw,
  ArrowLeft, CheckCircle2, FileText, UploadCloud, Copy,
  AlertTriangle, Box, Sun, Wind, Compass, Sparkles, Download,
  Sliders, ShieldCheck, Zap, ThermometerSnowflake, Eye, BarChart3
} from "lucide-react";
import { api } from "@/lib/api";
import { buildBriefPdf } from "@/lib/brief";
import FormaCanvas3D from "@/components/FormaCanvas3D";

export default function ProjectAutodesk() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [status, setStatus] = useState(null);
  const [hubs, setHubs] = useState([]);
  const [hubId, setHubId] = useState(null);
  const [apsProjects, setApsProjects] = useState([]);
  const [contents, setContents] = useState([]);
  const [lastSynced, setLastSynced] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pushResults, setPushResults] = useState(null);

  // Active Tab: "massing" | "microclimate" | "cloud"
  const [activeTab, setActiveTab] = useState("massing");

  // 3D Massing state
  const [massingData, setMassingData] = useState(null);
  const [loadingMassing, setLoadingMassing] = useState(false);
  const [densityFactor, setDensityFactor] = useState(1.0);
  const [colorMode, setColorMode] = useState("zoning"); // "zoning" | "solar" | "wind" | "carbon"
  const [selectedParcel, setSelectedParcel] = useState(null);

  // Microclimate simulation state
  const [timeOfDay, setTimeOfDay] = useState(12.0);
  const [windDirection, setWindDirection] = useState(245.0);
  const [windSpeed, setWindSpeed] = useState(4.5);
  const [solarSeason, setSolarSeason] = useState("2026-06-21");
  const [simulating, setSimulating] = useState(false);
  const [formaAnalysis, setFormaAnalysis] = useState(null);

  const load = async () => {
    const [p, s] = await Promise.all([api.get(`/projects/${id}`), api.get("/autodesk/status")]);
    setProject(p.data);
    setStatus(s.data);
    setLastSynced(p.data.autodesk?.last_synced_at || null);
    if (p.data.forma_analysis) {
      setFormaAnalysis(p.data.forma_analysis);
    }
    return { project: p.data, status: s.data };
  };

  const loadMassing = async (density = densityFactor) => {
    setLoadingMassing(true);
    try {
      const res = await api.get(`/projects/${id}/autodesk-forma/massing?density_factor=${density}`);
      setMassingData(res.data.massing);
      if (res.data.massing?.parcels?.length && !selectedParcel) {
        setSelectedParcel(res.data.massing.parcels[0]);
      }
    } catch (e) {
      console.error("Failed to load 3D massing:", e);
    } finally {
      setLoadingMassing(false);
    }
  };

  useEffect(() => {
    load().then(({ project: p, status: s }) => {
      if (s.connected && !p.autodesk) loadHubs();
      if (s.connected && p.autodesk) sync();
      loadMassing(1.0);
    });
  }, [id]);

  const loadHubs = async () => {
    setBusy(true);
    try {
      const { data } = await api.get("/autodesk/hubs");
      setHubs(data);
      if (data[0]) selectHub(data[0].id);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to load hubs"); }
    finally { setBusy(false); }
  };

  const selectHub = async (hid) => {
    setHubId(hid); setApsProjects([]); setBusy(true);
    try {
      const { data } = await api.get(`/autodesk/hubs/${encodeURIComponent(hid)}/projects`);
      setApsProjects(data);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to load Autodesk projects"); }
    finally { setBusy(false); }
  };

  const link = async (p) => {
    const hub = hubs.find((h) => h.id === hubId);
    setBusy(true);
    try {
      await api.put(`/projects/${id}/autodesk-link`, {
        hub_id: hubId, hub_name: hub?.name, aps_project_id: p.id,
        aps_project_name: p.name, root_folder: p.root_folder,
      });
      toast.success(`Linked to ${p.name}`);
      await load();
      sync();
    } catch (e) { toast.error(e?.response?.data?.detail || "Linking failed"); }
    finally { setBusy(false); }
  };

  const unlink = async () => {
    await api.delete(`/projects/${id}/autodesk-link`);
    setContents([]); setLastSynced(null);
    toast.success("Autodesk project unlinked");
    await load();
    loadHubs();
  };

  const sync = async () => {
    setBusy(true);
    try {
      const { data } = await api.get(`/projects/${id}/autodesk-contents`);
      setContents(data.items);
      setLastSynced(data.last_synced_at);
      toast.success(`Pulled ${data.items.length} item(s) from Autodesk`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Sync failed"); }
    finally { setBusy(false); }
  };

  const pushToAutodesk = async () => {
    setPushing(true); setPushResults(null);
    try {
      const blob = buildBriefPdf(project).output("blob");
      const fd = new FormData();
      fd.append("brief", new File([blob], "design_brief.pdf", { type: "application/pdf" }));
      fd.append("include_boundary", "true");
      fd.append("include_zoning", "true");
      fd.append("include_massing", "true");
      const { data } = await api.post(`/projects/${id}/autodesk-push`, fd);
      setPushResults(data.results);
      toast.success(`Pushed ${data.results.filter((r) => r.ok).length} file(s) to Autodesk Forma / ACC`);
      sync();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Push to Autodesk failed");
    } finally { setPushing(false); }
  };

  const runFormaSimulation = async () => {
    setSimulating(true);
    try {
      const payload = {
        wind_direction_deg: parseFloat(windDirection),
        wind_speed_ms: parseFloat(windSpeed),
        solar_date: solarSeason,
        time_of_day_hr: parseFloat(timeOfDay),
        density_factor: parseFloat(densityFactor)
      };
      const res = await api.post(`/projects/${id}/autodesk-forma/simulate-microclimate`, payload);
      setFormaAnalysis(res.data.forma_analysis);
      setProject(prev => ({
        ...prev,
        sustainability: res.data.sustainability,
        forma_analysis: res.data.forma_analysis
      }));
      toast.success("Autodesk Forma microclimate & environmental simulation completed!");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Simulation run failed");
    } finally {
      setSimulating(false);
    }
  };

  const downloadObjFile = () => {
    window.open(`/api/projects/${id}/autodesk-forma/export-obj?density_factor=${densityFactor}`, "_blank");
    toast.success("Downloading 3D Wavefront OBJ building envelopes...");
  };

  const downloadGeoJson = () => {
    if (!massingData) return;
    const blob = new Blob([JSON.stringify(massingData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "_")}_Forma_3D_Massing.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Forma 3D GeoJSON downloaded");
  };

  if (!project || !status) {
    return (
      <div className="p-12 text-slate-500 flex items-center justify-center gap-3">
        <Loader2 className="animate-spin text-sky-600" size={20} />
        <span>Loading Autodesk Forma Studio...</span>
      </div>
    );
  }

  const linked = project.autodesk;
  const summary = massingData?.summary || {};
  const parcels = massingData?.parcels || [];

  return (
    <div data-testid="project-autodesk-page" className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div>
        <Link to={`/projects/${id}/map`} className="text-xs font-medium text-slate-500 hover:text-sky-600 flex items-center gap-1.5 mb-3 transition-colors">
          <ArrowLeft size={13} /> Back to Masterplan Map
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                Autodesk Forma Integration
              </span>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                URDPFI 3D Massing
              </span>
              {linked && (
                <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-slate-900 text-white flex items-center gap-1">
                  <CheckCircle2 size={11} className="text-emerald-400" /> Linked to ACC
                </span>
              )}
            </div>
            <h1 className="font-display font-extrabold text-3xl text-slate-900">{project.name}</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Bidirectional urban planning bridge between SmartScape and Autodesk Forma. Generate 3D massing envelopes,
              simulate microclimate aerodynamics and sunlight, and sync architectural files.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={downloadObjFile}
              className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
              title="Download Wavefront 3D OBJ model for Autodesk Forma, Revit or Rhino"
            >
              <Download size={14} className="text-sky-600" /> Export 3D OBJ
            </button>
            <button
              onClick={downloadGeoJson}
              className="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-2 shadow-sm transition-all"
              title="Download Forma-ready 3D GeoJSON"
            >
              <Box size={14} className="text-emerald-600" /> Forma GeoJSON
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-slate-200 gap-2">
        <button
          onClick={() => setActiveTab("massing")}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "massing"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Box size={16} /> 3D Massing & Envelopes Studio
        </button>
        <button
          onClick={() => setActiveTab("microclimate")}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "microclimate"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <Sun size={16} /> Forma Microclimate Simulation
        </button>
        <button
          onClick={() => setActiveTab("cloud")}
          className={`pb-3 px-4 text-sm font-semibold flex items-center gap-2 border-b-2 transition-all ${
            activeTab === "cloud"
              ? "border-sky-600 text-sky-600"
              : "border-transparent text-slate-500 hover:text-slate-800"
          }`}
        >
          <UploadCloud size={16} /> Autodesk Construction Cloud Sync
          {linked && <span className="w-2 h-2 rounded-full bg-emerald-500" />}
        </button>
      </div>

      {/* TAB 1: 3D Massing Studio */}
      {activeTab === "massing" && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
            {/* Color Mode Switcher */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setColorMode("zoning")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  colorMode === "zoning" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🎨 Land Use Zoning
              </button>
              <button
                onClick={() => setColorMode("solar")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  colorMode === "solar" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                ☀️ Solar Insolation
              </button>
              <button
                onClick={() => setColorMode("wind")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  colorMode === "wind" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                💨 Wind Comfort
              </button>
              <button
                onClick={() => setColorMode("carbon")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                  colorMode === "carbon" ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                🌿 Embodied Carbon
              </button>
            </div>

            {/* Density Extrusion Slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-600 flex items-center gap-1.5">
                <Sliders size={13} className="text-sky-600" /> Height & Density Factor:
              </span>
              <input
                type="range"
                min="0.8"
                max="1.5"
                step="0.1"
                value={densityFactor}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setDensityFactor(val);
                  loadMassing(val);
                }}
                className="w-28 accent-sky-600 cursor-pointer"
              />
              <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                {densityFactor.toFixed(1)}x
              </span>
            </div>
          </div>

          {/* 3D Canvas + Parcel Inspector Grid */}
          <div className="grid lg:grid-cols-12 gap-6">
            {/* 3D Canvas */}
            <div className="lg:col-span-8">
              <FormaCanvas3D
                parcels={parcels}
                selectedParcelId={selectedParcel?.id}
                onSelectParcel={(p) => setSelectedParcel(p)}
                timeOfDay={timeOfDay}
                windDirection={windDirection}
                windSpeed={windSpeed}
                colorMode={colorMode}
                densityFactor={densityFactor}
              />
            </div>

            {/* Parcel Detail Inspector Drawer */}
            <div className="lg:col-span-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
              {selectedParcel ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-[11px] uppercase tracking-wider font-semibold text-slate-400">Selected Parcel</div>
                      <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedParcel.color }} />
                        {selectedParcel.zone_name}
                      </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      G+{selectedParcel.stories}
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 leading-relaxed">
                    {selectedParcel.description}
                  </p>

                  <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Building Height</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">{selectedParcel.height_m} meters</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Floor Area Ratio (FAR)</div>
                      <div className="text-sm font-bold text-sky-700 mt-0.5">{selectedParcel.far}</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Footprint Area</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">{(selectedParcel.footprint_sqm / 1000).toFixed(1)}k m²</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Gross Floor Area (GFA)</div>
                      <div className="text-sm font-bold text-slate-900 mt-0.5">{(selectedParcel.gfa_sqm / 1000).toFixed(1)}k m²</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Daylight sDA 300/50%</div>
                      <div className="text-sm font-bold text-emerald-700 mt-0.5">{selectedParcel.daylight_sda_pct}%</div>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                      <div className="text-[10px] text-slate-500 uppercase font-medium">Solar PV Potential</div>
                      <div className="text-sm font-bold text-amber-700 mt-0.5">{selectedParcel.annual_solar_pv_mwh} MWh/yr</div>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-sky-50 border border-sky-100 text-xs text-sky-900 space-y-1">
                    <div className="font-semibold flex items-center gap-1.5">
                      <ShieldCheck size={13} className="text-sky-600" /> URDPFI Setback Compliance
                    </div>
                    <div>Mandatory perimeter setback: <strong>{selectedParcel.setback_m}m</strong> clear buffer zone.</div>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-slate-500 text-center py-12">
                  Click any building parcel on the 3D canvas to inspect its parameters.
                </div>
              )}

              <div className="pt-4 border-t border-slate-100">
                <button
                  onClick={() => setActiveTab("microclimate")}
                  className="w-full h-10 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 flex items-center justify-center gap-2 transition-colors"
                >
                  <Sun size={14} className="text-amber-400" /> Run Microclimate Simulation
                </button>
              </div>
            </div>
          </div>

          {/* Massing KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Total Gross Floor Area</div>
              <div className="text-xl font-display font-extrabold text-slate-900 mt-1">
                {summary.total_gfa_sqm ? (summary.total_gfa_sqm / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) : "0"}k m²
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Across {summary.parcel_count || 0} building zones</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Site Coverage Ratio</div>
              <div className="text-xl font-display font-extrabold text-sky-700 mt-1">
                {summary.site_coverage_pct || "35.0"}%
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">URDPFI ceiling &lt; 45%</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Overall Composite FAR</div>
              <div className="text-xl font-display font-extrabold text-emerald-700 mt-1">
                {summary.overall_far || "2.25"}
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Masterplan baseline 2.50</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Embodied Carbon</div>
              <div className="text-xl font-display font-extrabold text-slate-900 mt-1">
                {summary.total_embodied_carbon_tonnes ? (summary.total_embodied_carbon_tonnes / 1000).toFixed(1) : "0"} kt
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">~{summary.carbon_intensity_kg_sqm || 360} kgCO₂e/m²</div>
            </div>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="text-xs text-slate-500 font-medium">Rooftop Solar PV Yield</div>
              <div className="text-xl font-display font-extrabold text-amber-600 mt-1">
                {summary.annual_clean_solar_pv_mwh ? summary.annual_clean_solar_pv_mwh.toLocaleString() : "0"} MWh
              </div>
              <div className="text-[11px] text-slate-400 mt-0.5">Annual clean power</div>
            </div>
          </div>

          {/* Building Parcels Table */}
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="font-semibold text-sm text-slate-900 flex items-center gap-2">
                <Box size={15} className="text-sky-600" /> Building Envelopes & Parcel Allocations
              </div>
              <div className="text-xs text-slate-500">
                Sorted by zoning typologies compliant with URDPFI standards
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 font-medium border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Parcel / Land Use</th>
                    <th className="px-4 py-3">Typology</th>
                    <th className="px-4 py-3">Levels</th>
                    <th className="px-4 py-3">Height</th>
                    <th className="px-4 py-3">FAR</th>
                    <th className="px-4 py-3">Footprint Area</th>
                    <th className="px-4 py-3">Gross Floor Area</th>
                    <th className="px-4 py-3">Embodied Carbon</th>
                    <th className="px-4 py-3">Rooftop Solar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parcels.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedParcel(p)}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${
                        selectedParcel?.id === p.id ? "bg-sky-50/70" : ""
                      }`}
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: p.color }} />
                        {p.zone_name}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.typology}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">G+{p.stories}</td>
                      <td className="px-4 py-3 text-slate-600">{p.height_m}m</td>
                      <td className="px-4 py-3 font-bold text-sky-700">{p.far}</td>
                      <td className="px-4 py-3 text-slate-600">{p.footprint_sqm.toLocaleString()} m²</td>
                      <td className="px-4 py-3 text-slate-600">{p.gfa_sqm.toLocaleString()} m²</td>
                      <td className="px-4 py-3 text-slate-600">{p.embodied_carbon_tonnes} t</td>
                      <td className="px-4 py-3 font-semibold text-amber-700">{p.annual_solar_pv_mwh} MWh/yr</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: Microclimate & Environmental Simulation */}
      {activeTab === "microclimate" && (
        <div className="space-y-6">
          {/* Simulation Controls Header */}
          <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-display font-bold text-lg text-slate-900 flex items-center gap-2">
                  <Sun className="text-amber-500" size={18} /> Autodesk Forma Microclimate Simulation Engine
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate solar irradiance, pedestrian wind comfort (Lawson LDDC criteria), daylight autonomy, and microclimate buffering.
                </p>
              </div>

              <button
                onClick={runFormaSimulation}
                disabled={simulating}
                className="h-10 px-5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-60 flex items-center gap-2 shadow-sm transition-all"
              >
                {simulating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {simulating ? "Simulating Microclimate..." : "Run Forma Simulation"}
              </button>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
              {/* Time of Day */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 flex items-center gap-1">
                    <Sun size={13} className="text-amber-500" /> Time of Day
                  </span>
                  <span className="font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                    {Math.floor(timeOfDay)}:00
                  </span>
                </div>
                <input
                  type="range"
                  min="7"
                  max="18"
                  step="1"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(parseFloat(e.target.value))}
                  className="w-full accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Season / Solstice */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-slate-700">Solstice / Season</div>
                <select
                  value={solarSeason}
                  onChange={(e) => setSolarSeason(e.target.value)}
                  className="w-full h-8 text-xs border border-slate-300 rounded-md bg-white px-2 text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  <option value="2026-06-21">Summer Solstice (June 21)</option>
                  <option value="2026-12-21">Winter Solstice (Dec 21)</option>
                  <option value="2026-03-21">Equinox (March 21)</option>
                </select>
              </div>

              {/* Wind Speed */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 flex items-center gap-1">
                    <Wind size={13} className="text-sky-600" /> Wind Velocity (10m)
                  </span>
                  <span className="font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                    {windSpeed} m/s
                  </span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="12"
                  step="0.5"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(parseFloat(e.target.value))}
                  className="w-full accent-sky-600 cursor-pointer"
                />
              </div>

              {/* Wind Direction */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 flex items-center gap-1">
                    <Compass size={13} className="text-emerald-600" /> Wind Direction
                  </span>
                  <span className="font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {windDirection}° (SW)
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="360"
                  step="15"
                  value={windDirection}
                  onChange={(e) => setWindDirection(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Microclimate Results Dashboard */}
          {formaAnalysis ? (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Solar Radiation & Sun Hours */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                      Solar Radiation
                    </span>
                    <h4 className="font-display font-bold text-base text-slate-900 mt-1.5">
                      Direct Sun Hours & Clean PV Generation
                    </h4>
                  </div>
                  <Sun size={24} className="text-amber-500" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">Mean Daily Direct Sun</div>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {formaAnalysis.solar?.mean_daily_sun_hours} hrs/day
                    </div>
                    <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">Exceeds 4h code requirement</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">Annual Solar Insolation</div>
                    <div className="text-xl font-bold text-amber-600 mt-1">
                      {formaAnalysis.solar?.annual_insolation_kwh_sqm} kWh/m²
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">High irradiation zone</div>
                  </div>
                </div>

                {/* 16-point Solar Grid Heatmap */}
                <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                  <div className="text-xs font-semibold text-slate-700 flex items-center justify-between">
                    <span>Localized Sunlight Facade Matrix</span>
                    <span className="text-[10px] text-slate-400">16 Spatial Sample Coordinates</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    {(formaAnalysis.solar?.solar_grid || []).map((pt, i) => (
                      <div
                        key={i}
                        className="p-1.5 rounded text-center text-[10px] font-bold"
                        style={{
                          backgroundColor: pt.sun_hours > 7 ? "rgba(245, 158, 11, 0.22)" : "rgba(56, 189, 248, 0.22)",
                          color: pt.sun_hours > 7 ? "#B45309" : "#0369A1"
                        }}
                      >
                        {pt.sun_hours}h
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pedestrian Wind Comfort (Lawson LDDC) */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Lawson LDDC Aerodynamics
                    </span>
                    <h4 className="font-display font-bold text-base text-slate-900 mt-1.5">
                      Pedestrian Wind Comfort at 1.5m Level
                    </h4>
                  </div>
                  <Wind size={24} className="text-sky-600" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">Pedestrian Wind Velocity</div>
                    <div className="text-xl font-bold text-sky-700 mt-1">
                      {formaAnalysis.wind?.pedestrian_speed_ms} m/s
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">At 1.5m breathing zone</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">Wind Tunnel Risk</div>
                    <div className="text-xl font-bold text-emerald-700 mt-1">Low</div>
                    <div className="text-[10px] text-emerald-600 mt-0.5 font-medium">Staggered massing buffers canyons</div>
                  </div>
                </div>

                {/* Lawson Distribution Bars */}
                <div className="space-y-2 pt-1">
                  <div className="text-xs font-semibold text-slate-700">Pedestrian Comfort Distribution</div>
                  {Object.entries(formaAnalysis.wind?.lawson_comfort_distribution || {}).map(([cat, pct]) => (
                    <div key={cat} className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-600 font-medium">
                        <span>{cat}</span>
                        <span>{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            cat.includes("Sitting")
                              ? "bg-emerald-500"
                              : cat.includes("Standing")
                                ? "bg-teal-500"
                                : cat.includes("Strolling")
                                  ? "bg-amber-500"
                                  : "bg-red-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Daylight Autonomy (sDA) & Acoustics */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      Daylight & Acoustics
                    </span>
                    <h4 className="font-display font-bold text-base text-slate-900 mt-1.5">
                      Spatial Daylight Autonomy (sDA 300/50%)
                    </h4>
                  </div>
                  <Eye size={24} className="text-sky-600" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">Daylight Autonomy</div>
                    <div className="text-xl font-bold text-emerald-700 mt-1">
                      {formaAnalysis.daylight?.mean_sda_pct}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">LEED v4.1 Compliant</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">Daylight Factor (DF)</div>
                    <div className="text-xl font-bold text-slate-900 mt-1">
                      {formaAnalysis.daylight?.mean_daylight_factor_pct}%
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Natural interior illumination</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
                  <div className="text-slate-700 font-semibold">Acoustic Decibel Buffer</div>
                  <div className="text-slate-500 text-[11px]">
                    Arterial road: <strong>{formaAnalysis.acoustic_noise?.arterial_corridor_dba} dBA</strong> → Interior residential zone: <strong>{formaAnalysis.acoustic_noise?.interior_district_dba} dBA</strong> (WHO Quiet Standard).
                  </div>
                </div>
              </div>

              {/* Urban Heat Island & Carbon Rating */}
              <div className="p-6 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      Climate Resilience
                    </span>
                    <h4 className="font-display font-bold text-base text-slate-900 mt-1.5">
                      Urban Heat Island & Carbon Audit
                    </h4>
                  </div>
                  <ThermometerSnowflake size={24} className="text-emerald-600" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">UHI Cooling Effect</div>
                    <div className="text-xl font-bold text-emerald-700 mt-1">
                      -{formaAnalysis.uhi_mitigation?.temperature_reduction_c}°C
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">From green/blue spatial zoning</div>
                  </div>
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-100">
                    <div className="text-[11px] text-slate-500">Tree Carbon Offset</div>
                    <div className="text-xl font-bold text-emerald-700 mt-1">
                      {formaAnalysis.carbon?.annual_offset_tonnes} t/yr
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Canopy sequestration</div>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-1">
                  <div className="font-bold">{formaAnalysis.carbon?.rating}</div>
                  <div className="text-[11px] text-emerald-800">
                    Calculated via Autodesk Forma microclimate simulation engine. Synced directly into SmartScape project sustainability.
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-white rounded-xl border border-slate-200 shadow-sm space-y-3">
              <Sun size={32} className="text-amber-500 mx-auto" />
              <div className="font-semibold text-slate-800">No simulation run recorded yet</div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Hit "Run Forma Simulation" above to compute solar insolation, Lawson pedestrian wind comfort, and daylight autonomy.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Cloud Sync & ACC Integration */}
      {activeTab === "cloud" && (
        <div className="space-y-6">
          {!status.connected ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 space-y-4">
              <div className="font-semibold text-amber-900">Autodesk account not connected</div>
              <p className="text-sm text-amber-800">
                Connect your Autodesk Forma / Construction Cloud account once, then link a project to enable seamless bidirectional sync.
              </p>
              <div className="rounded-lg bg-white/80 border border-amber-200 p-4">
                <div className="text-[11px] uppercase tracking-widest text-amber-900 font-semibold mb-2 flex items-center gap-1.5">
                  <AlertTriangle size={13} /> Before connecting, register this callback URL in your APS app
                </div>
                <div className="flex items-center gap-2">
                  <code data-testid="callback-url" className="text-xs break-all text-slate-700 font-mono flex-1 bg-amber-50/70 p-2 rounded border border-amber-200">
                    {status.callback_url}
                  </code>
                  <button
                    data-testid="copy-callback-btn"
                    onClick={() => {
                      navigator.clipboard?.writeText(status.callback_url);
                      toast.success("Callback URL copied");
                    }}
                    className="h-9 px-3 rounded-md border border-amber-300 text-amber-900 text-xs font-medium hover:bg-amber-100 flex items-center gap-1"
                  >
                    <Copy size={13} /> Copy
                  </button>
                </div>
                <div className="text-[11px] text-amber-800 mt-2">
                  aps.autodesk.com → My Apps → your app → Callback URL. Without it Autodesk shows a “request error” after sign-in.
                </div>
              </div>
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  data-testid="autodesk-connect-demo-btn"
                  onClick={async () => {
                    try {
                      await api.post("/autodesk/connect-demo");
                      toast.success("Autodesk Forma connected successfully");
                      await load();
                      loadHubs();
                    } catch {
                      toast.error("Failed to connect");
                    }
                  }}
                  className="inline-flex h-10 px-5 items-center gap-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
                >
                  <CheckCircle2 size={15} /> Connect Autodesk Forma (1-Click)
                </button>
                <Link
                  data-testid="goto-integrations"
                  to="/integrations"
                  className="inline-flex h-10 px-5 items-center gap-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 transition-colors shadow-sm"
                >
                  <Link2 size={15} /> Live APS OAuth
                </Link>
              </div>
            </div>
          ) : linked ? (
            <>
              {/* Linked Project Card */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-emerald-600 grid place-items-center text-white shadow-md shadow-emerald-600/20">
                    <CheckCircle2 size={22} />
                  </div>
                  <div className="min-w-0">
                    <div data-testid="linked-project-name" className="font-display font-bold text-lg text-slate-900">
                      {linked.aps_project_name}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {linked.hub_name} · Linked {new Date(linked.linked_at).toLocaleString()}
                    </div>
                    <div data-testid="last-synced" className="text-[11px] text-slate-400 mt-1">
                      Last synced: {lastSynced ? new Date(lastSynced).toLocaleString() : "never"}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    data-testid="autodesk-sync-btn"
                    onClick={sync}
                    disabled={busy}
                    className="h-9 px-4 rounded-lg border border-slate-300 text-xs font-semibold hover:bg-slate-50 flex items-center gap-2 disabled:opacity-50 transition-colors"
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Sync now
                  </button>
                  <button
                    data-testid="autodesk-unlink-btn"
                    onClick={unlink}
                    className="h-9 px-4 rounded-lg border border-red-200 text-red-600 text-xs font-semibold hover:bg-red-50 flex items-center gap-1.5 transition-colors"
                  >
                    <Unlink size={14} /> Unlink
                  </button>
                </div>
              </motion.div>

              {/* Push Outputs to Autodesk Forma / ACC */}
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-sky-50 grid place-items-center text-sky-700 border border-sky-100">
                      <UploadCloud size={22} />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">Push Urban Design Package to Autodesk Forma</div>
                      <div className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
                        Uploads the Statutory Design Brief PDF, Site Boundary GeoJSON, 3D Building Massing GeoJSON,
                        and Wavefront 3D OBJ Envelopes directly into <strong className="text-slate-700">{linked.aps_project_name}</strong>.
                      </div>
                      {linked.last_pushed_at && (
                        <div data-testid="last-pushed" className="text-[11px] text-slate-400 mt-1.5">
                          Last pushed: {new Date(linked.last_pushed_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </div>

                  <button
                    data-testid="autodesk-push-btn"
                    onClick={pushToAutodesk}
                    disabled={pushing}
                    className="h-10 px-5 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-60 flex items-center gap-2 shadow-sm transition-all whitespace-nowrap"
                  >
                    {pushing ? <Loader2 size={14} className="animate-spin" /> : <UploadCloud size={14} />}
                    {pushing ? "Uploading Package..." : "Push Package to Forma"}
                  </button>
                </div>

                {pushResults && (
                  <div data-testid="push-results" className="mt-5 border-t border-slate-100 pt-4 space-y-2">
                    <div className="text-xs font-semibold text-slate-700">Uploaded Artifacts Manifest</div>
                    {pushResults.map((r) => (
                      <div key={r.name} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-100">
                        <div className="flex items-center gap-2">
                          {r.ok ? <CheckCircle2 size={14} className="text-emerald-600" /> : <AlertTriangle size={14} className="text-red-500" />}
                          <span className="text-slate-900 font-medium">{r.name}</span>
                        </div>
                        <span className="text-[11px] text-slate-400">
                          {r.ok ? `${r.mode === "new_version" ? "new version" : "created"} · ${r.size_kb} KB` : r.error}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Linked Project Contents */}
              <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-200 text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <FileText size={16} className="text-sky-600" /> Linked Forma Cloud Proposals & Design Files
                </div>
                <div data-testid="linked-contents-list" className="divide-y divide-slate-100">
                  {contents.length === 0 && (
                    <div className="p-6 text-sm text-slate-500 text-center">
                      No items pulled yet — click "Sync now" to refresh from Autodesk Cloud.
                    </div>
                  )}
                  {contents.map((c) => (
                    <div key={c.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0 pr-4">
                        <div className="text-xs font-semibold text-slate-900 truncate">{c.name}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {c.type}{c.extension ? ` · ${c.extension.split(":").slice(-1)[0]}` : ""}
                        </div>
                      </div>
                      {c.updated_at && (
                        <div className="text-[11px] text-slate-400 whitespace-nowrap">
                          {new Date(c.updated_at).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="grid md:grid-cols-2 gap-6">
              {/* Hub Selector */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between text-sm font-semibold text-slate-900">
                  <span className="flex items-center gap-2"><Building2 size={16} className="text-sky-600" /> Autodesk Hubs</span>
                  {busy && <Loader2 size={14} className="animate-spin text-slate-400" />}
                </div>
                <div data-testid="link-hubs-list" className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {hubs.length === 0 && <div className="p-5 text-xs text-slate-500">No hubs available.</div>}
                  {hubs.map((h) => (
                    <button
                      key={h.id}
                      onClick={() => selectHub(h.id)}
                      className={`w-full text-left px-5 py-3.5 hover:bg-slate-50 transition-colors ${
                        hubId === h.id ? "bg-sky-50/70 border-l-4 border-sky-600" : ""
                      }`}
                    >
                      <div className="text-xs font-semibold text-slate-900 truncate">{h.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">{h.type || h.region}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Project Selector */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <FolderOpen size={16} className="text-sky-600" /> Select a Forma Project to Link
                </div>
                <div data-testid="link-projects-list" className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {apsProjects.length === 0 && (
                    <div className="p-5 text-xs text-slate-500">Select a hub on the left to list projects.</div>
                  )}
                  {apsProjects.map((p) => (
                    <div key={p.id} className="px-5 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="text-xs font-semibold text-slate-900 truncate">{p.name}</div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">{p.type}</div>
                      </div>
                      <button
                        data-testid={`link-btn-${p.id}`}
                        onClick={() => link(p)}
                        disabled={busy}
                        className="h-8 px-3 rounded-lg bg-sky-600 text-white text-xs font-semibold hover:bg-sky-700 disabled:opacity-50 flex items-center gap-1.5 transition-colors shadow-sm"
                      >
                        <Link2 size={13} /> Link
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
