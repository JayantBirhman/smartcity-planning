import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  AlertTriangle, ShieldCheck, ShieldAlert, Activity, CheckCircle2,
  TrendingDown, ArrowLeft, Download, Plus, Filter, Search,
  Sliders, Building2, Droplets, Car, Users, Sun, Zap, Sparkles, X,
  MapPin, Compass, Radio, Globe, RefreshCw, Check, Layers, Trees
} from "lucide-react";
import { api } from "@/lib/api";

const LEVEL_CONFIG = {
  High: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    badge: "bg-red-600 text-white",
    iconColor: "text-red-600",
    dot: "bg-red-500",
  },
  Medium: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-200",
    badge: "bg-amber-500 text-white",
    iconColor: "text-amber-600",
    dot: "bg-amber-500",
  },
  Low: {
    bg: "bg-slate-50",
    text: "text-slate-700",
    border: "border-slate-200",
    badge: "bg-slate-600 text-white",
    iconColor: "text-slate-500",
    dot: "bg-slate-400",
  },
};

const CATEGORY_ICONS = {
  Transportation: Car,
  "Public Services": Building2,
  "Environmental & Hydrology": Droplets,
  "Demographics & Housing": Users,
  "Climate & Sustainability": Sun,
  "Utilities & Energy": Zap,
};

const WORLD_PRESETS = [
  { name: "Pune Ring Zone 2, India", lat: 18.5204, lng: 73.8567, desc: "High-density urban expansion corridor with intense commercial nodes." },
  { name: "London Isle of Dogs, UK", lat: 51.5002, lng: -0.0193, desc: "Dense maritime Thames riverfront docklands & financial hub." },
  { name: "Tokyo Shinjuku West, Japan", lat: 35.6938, lng: 139.7034, desc: "Hyper-dense high-rise transit cluster with massive pedestrian flow." },
  { name: "Bikaner Sector 7, Rajasthan", lat: 28.0229, lng: 73.3119, desc: "Arid desert development fringe with civic infrastructure deficits." },
  { name: "New York Long Island City, USA", lat: 40.7447, lng: -73.9485, desc: "Post-industrial waterfront transitioning to mixed-use high density." },
];

export default function Risks() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [risks, setRisks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchingRealTime, setFetchingRealTime] = useState(false);

  // Real-time metadata & amenities
  const [realTimeMeta, setRealTimeMeta] = useState(null);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [customLocInput, setCustomLocInput] = useState({
    name: "",
    lat: 18.5204,
    lng: 73.8567,
    radius_m: 2500,
  });

  // Filters & State
  const [activeSeverity, setActiveSeverity] = useState("all");
  const [activeCategory, setActiveCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRisk, setSelectedRisk] = useState(null);
  const [currentScenario, setCurrentScenario] = useState("baseline");
  const [stressTesting, setStressTesting] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);

  // Custom risk form state
  const [customForm, setCustomForm] = useState({
    title: "",
    category: "Environmental & Hydrology",
    level: "Medium",
    probability: 50,
    impact: 55,
    reason: "",
    mitigation: "",
    authority: "Municipal Corporation",
    timeframe: "Phase 2 (12–24 mo)",
    capex_estimate: "₹25 Cr ($3.0M)",
    statutory_standard: "Municipal Town Planning Bylaws",
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [projRes, risksRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/risks`),
      ]);
      setProject(projRes.data);
      setRisks(risksRes.data);
      if (projRes.data.risk_scenario) {
        setCurrentScenario(projRes.data.risk_scenario);
      }
      if (projRes.data.risks_amenities) {
        setRealTimeMeta({
          data_source: projRes.data.risks_data_source || "real_osm",
          amenities: projRes.data.risks_amenities,
          computed_at: projRes.data.risks_computed_at,
          location: projRes.data.location,
        });
      }
      setCustomLocInput({
        name: projRes.data.location?.name || projRes.data.name || "Selected Area",
        lat: projRes.data.location?.lat || 18.5204,
        lng: projRes.data.location?.lng || 73.8567,
        radius_m: 2500,
      });
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to load risks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleFetchRealTimeRisks = async (overrideParams = null) => {
    setFetchingRealTime(true);
    try {
      const payload = overrideParams || {
        lat: project?.location?.lat,
        lng: project?.location?.lng,
        location_name: project?.location?.name || project?.name,
        radius_m: 2500,
      };
      const res = await api.post(`/projects/${id}/risks/real-time`, payload);
      setRisks(res.data.risks);
      setRealTimeMeta(res.data);
      if (overrideParams?.location_name) {
        setProject((prev) => ({
          ...prev,
          location: {
            ...prev.location,
            name: overrideParams.location_name,
            lat: overrideParams.lat,
            lng: overrideParams.lng,
          },
        }));
      }
      toast.success(
        `Live OSM hazards calculated for ${res.data.location?.name || "selected area"} (${res.data.amenities?.roads?.count || 0} roads, ${res.data.amenities?.schools?.count || 0} schools mapped)`
      );
      setShowLocationModal(false);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to fetch real-time OSM data");
    } finally {
      setFetchingRealTime(false);
    }
  };

  const handleScenarioChange = async (scenario) => {
    setCurrentScenario(scenario);
    setStressTesting(true);
    try {
      const res = await api.post(`/projects/${id}/risks/stress-test`, { scenario });
      setRisks(res.data.risks);
      toast.success(
        scenario === "baseline"
          ? "Reset to calibrated area risk profile"
          : `Stress-test applied: ${scenario.replace("_", " ").toUpperCase()}`
      );
    } catch (e) {
      toast.error("Failed to apply stress test scenario");
    } finally {
      setStressTesting(false);
    }
  };

  const handleAddCustomRisk = async (e) => {
    e.preventDefault();
    if (!customForm.title || !customForm.reason || !customForm.mitigation) {
      toast.error("Please fill all mandatory risk fields");
      return;
    }
    try {
      const res = await api.post(`/projects/${id}/risks`, customForm);
      setRisks((prev) => [...prev, res.data]);
      setShowAddModal(false);
      toast.success(`Registered new statutory risk: ${res.data.id}`);
      setCustomForm({
        title: "",
        category: "Environmental & Hydrology",
        level: "Medium",
        probability: 50,
        impact: 55,
        reason: "",
        mitigation: "",
        authority: "Municipal Corporation",
        timeframe: "Phase 2 (12–24 mo)",
        capex_estimate: "₹25 Cr ($3.0M)",
        statutory_standard: "Municipal Town Planning Bylaws",
      });
    } catch (e) {
      toast.error("Failed to add custom risk");
    }
  };

  const exportRiskCsv = () => {
    if (!risks.length) return;
    const headers = [
      "Risk ID", "Title", "Category", "Level", "Probability (%)",
      "Impact (%)", "RPN", "Residual RPN", "Reduction (%)",
      "Data Source", "Real Metrics Summary",
      "Reason", "Mitigation", "Authority", "Timeframe", "Capex", "Standard"
    ];
    const rows = risks.map((r) => [
      `"${r.id}"`, `"${r.title}"`, `"${r.category}"`, `"${r.level}"`,
      r.probability, r.impact, r.rpn || Math.round((r.probability * r.impact) / 100),
      r.residual_rpn || 10, `${r.risk_reduction_pct || 80}%`,
      `"${r.data_source || 'real_osm'}"`,
      `"${JSON.stringify(r.real_metrics || {}).replace(/"/g, '""')}"`,
      `"${(r.reason || '').replace(/"/g, '""')}"`,
      `"${(r.mitigation || '').replace(/"/g, '""')}"`,
      `"${r.authority || 'Municipal Body'}"`,
      `"${r.timeframe || 'Phase 1'}"`,
      `"${r.capex_estimate || ''}"`,
      `"${r.statutory_standard || ''}"`
    ]);
    const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name?.replace(/\s+/g, "_") || "SmartScape"}_RealArea_Risk_Register.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Statutory Risk Register exported to CSV with live spatial metrics");
  };

  // Filtered risks
  const filteredRisks = useMemo(() => {
    return risks.filter((r) => {
      const matchesSeverity = activeSeverity === "all" || r.level.toLowerCase() === activeSeverity.toLowerCase();
      const matchesCategory = activeCategory === "all" || r.category === activeCategory;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || r.title.toLowerCase().includes(q) || r.reason.toLowerCase().includes(q) || r.id.toLowerCase().includes(q);
      return matchesSeverity && matchesCategory && matchesSearch;
    });
  }, [risks, activeSeverity, activeCategory, searchQuery]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    if (!risks.length) return { avgRpn: 0, highCount: 0, avgResidual: 0, overallReduction: 0 };
    const totalRpn = risks.reduce((acc, r) => acc + (r.rpn || Math.round((r.probability * r.impact) / 100)), 0);
    const totalResidual = risks.reduce((acc, r) => acc + (r.residual_rpn || 10), 0);
    const highCount = risks.filter((r) => r.level === "High").length;
    const avgRpn = Math.round(totalRpn / risks.length);
    const avgResidual = Math.round(totalResidual / risks.length);
    const overallReduction = Math.round((1 - (avgResidual / Math.max(1, avgRpn))) * 100);
    return { avgRpn, highCount, avgResidual, overallReduction };
  }, [risks]);

  // Unique categories
  const categories = useMemo(() => {
    return Array.from(new Set(risks.map((r) => r.category))).filter(Boolean);
  }, [risks]);

  const isRealOsmActive = useMemo(() => {
    return risks.some((r) => r.data_source === "real_osm") || realTimeMeta?.data_source === "real_osm";
  }, [risks, realTimeMeta]);

  const activeAmenities = useMemo(() => {
    return realTimeMeta?.amenities || project?.risks_amenities || project?.real_suitability?.amenities || {
      roads: { count: 3012, nearest_distance_m: 28.8 },
      schools: { count: 121, nearest_distance_m: 395.0 },
      hospitals: { count: 286, nearest_distance_m: 118.2 },
      parks: { count: 115, nearest_distance_m: 109.3 },
    };
  }, [realTimeMeta, project]);

  if (loading || !project) {
    return (
      <div className="p-12 text-slate-500 flex items-center justify-center gap-3">
        <Activity className="animate-spin text-sky-600" size={20} />
        <span>Loading Urban Risk Assessment & Spatial Sensors...</span>
      </div>
    );
  }

  const currentLat = project.location?.lat ?? 18.5204;
  const currentLng = project.location?.lng ?? 73.8567;
  const currentLocName = project.location?.name || project.name || "Selected Area";
  const currentArea = project.site_area_sqkm || 12.4;
  const currentPop = project.population?.forecast_population || 185000;

  return (
    <div className="p-6 lg:p-10 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div>
        <Link
          to={`/projects/${id}/map`}
          className="text-xs font-medium text-slate-500 hover:text-sky-600 flex items-center gap-1.5 mb-3 transition-colors"
        >
          <ArrowLeft size={13} /> Back to Masterplan Map
        </Link>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                ISO 31000 & NDMA Guidelines
              </span>
              <span className="px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full bg-sky-100 text-sky-800 border border-sky-200">
                Statutory Risk Register
              </span>
              <span className={`px-2.5 py-0.5 text-[11px] font-semibold tracking-wider uppercase rounded-full border ${
                isRealOsmActive
                  ? "bg-emerald-100 text-emerald-800 border-emerald-300 flex items-center gap-1"
                  : "bg-amber-100 text-amber-800 border-amber-300"
              }`}>
                {isRealOsmActive ? (
                  <>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Live OSM Spatial Data Active
                  </>
                ) : (
                  "Preset Baseline Data"
                )}
              </span>
            </div>
            <h1 className="font-display font-extrabold text-3xl text-slate-900">Challenges & Urban Risks</h1>
            <p className="text-sm text-slate-500 mt-1 max-w-2xl">
              Real-time hazard evaluation derived from the selected area's OpenStreetMap (OSM) geometry, road density,
              civic facility distances, cloudburst runoff volume, and thermal microclimate.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleFetchRealTimeRisks()}
              disabled={fetchingRealTime}
              className="h-10 px-4 rounded-lg bg-gradient-to-r from-sky-600 to-indigo-600 hover:from-sky-700 hover:to-indigo-700 text-white text-xs font-semibold flex items-center gap-2 shadow-sm transition-all shadow-sky-600/20"
            >
              <RefreshCw size={14} className={fetchingRealTime ? "animate-spin text-white" : "text-sky-200"} />
              {fetchingRealTime ? "Scanning Real Area (OSM)..." : "⚡ Fetch Real-Time Area Hazards"}
            </button>

            <button
              onClick={() => setShowLocationModal(true)}
              className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Compass size={14} className="text-slate-500" /> Inspect Area
            </button>

            <button
              onClick={exportRiskCsv}
              className="h-10 px-3.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Download size={14} className="text-sky-600" /> Export CSV
            </button>

            <button
              onClick={() => setShowAddModal(true)}
              className="h-10 px-3.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Plus size={14} /> Custom Risk
            </button>
          </div>
        </div>
      </div>

      {/* Real-Time Area Selected Banner & Live Telemetry */}
      <div className="rounded-2xl border border-sky-100 bg-gradient-to-br from-slate-900 via-[#0B132B] to-slate-900 p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-12 -translate-y-8 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-sky-500/20 text-sky-300 border border-sky-400/30 flex items-center gap-1.5">
                <Radio size={11} className="animate-pulse text-sky-400" /> Active Spatial Perimeter
              </span>
              <span className="text-xs text-slate-400">
                {project.boundary ? "Custom GeoJSON Boundary Applied" : "2.5km Radial Spatial Buffer"}
              </span>
            </div>
            <h2 className="font-display font-extrabold text-2xl text-white flex items-center gap-2">
              <MapPin size={22} className="text-rose-400" /> {currentLocName}
            </h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-300 font-mono">
              <span>Coordinates: <strong>{currentLat.toFixed(4)}°N, {currentLng.toFixed(4)}°E</strong></span>
              <span>•</span>
              <span>Site Area: <strong>{currentArea} km²</strong></span>
              <span>•</span>
              <span>Target Population: <strong>{currentPop.toLocaleString()}</strong></span>
              {realTimeMeta?.computed_at && (
                <>
                  <span>•</span>
                  <span className="text-emerald-400">Last Scanned: {new Date(realTimeMeta.computed_at).toLocaleTimeString()}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleFetchRealTimeRisks()}
              disabled={fetchingRealTime}
              className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-sky-500/30 transition-all"
            >
              <RefreshCw size={13} className={fetchingRealTime ? "animate-spin" : ""} />
              {fetchingRealTime ? "Scanning OSM..." : "Re-Scan Area"}
            </button>
            <button
              onClick={() => setShowLocationModal(true)}
              className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/20 text-white font-medium text-xs flex items-center gap-1.5 transition-all"
            >
              <Globe size={13} className="text-sky-300" /> Switch Area
            </button>
          </div>
        </div>

        {/* Live Spatial Telemetry Cards */}
        <div className="relative z-10 grid grid-cols-2 md:grid-cols-5 gap-3 pt-5">
          {/* Roads */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Car size={13} className="text-sky-400" /> Road Corridors
            </div>
            <div className="text-xl font-display font-extrabold text-white mt-1">
              {activeAmenities?.roads?.count?.toLocaleString() || "3,012"}
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              Nearest arterial: <strong>{activeAmenities?.roads?.nearest_distance_m || 28.8}m</strong>
            </div>
          </div>

          {/* Schools */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Building2 size={13} className="text-emerald-400" /> Schools Mapped
            </div>
            <div className="text-xl font-display font-extrabold text-white mt-1">
              {activeAmenities?.schools?.count?.toLocaleString() || "121"}
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              Nearest: <strong>{activeAmenities?.schools?.nearest_distance_m || 395}m</strong> (ideal 800m)
            </div>
          </div>

          {/* Hospitals */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Activity size={13} className="text-rose-400" /> Health Facilities
            </div>
            <div className="text-xl font-display font-extrabold text-white mt-1">
              {activeAmenities?.hospitals?.count?.toLocaleString() || "286"}
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              Nearest: <strong>{activeAmenities?.hospitals?.nearest_distance_m || 118}m</strong> (ideal 2,000m)
            </div>
          </div>

          {/* Parks */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Trees size={13} className="text-green-400" /> Green Sponges
            </div>
            <div className="text-xl font-display font-extrabold text-white mt-1">
              {activeAmenities?.parks?.count?.toLocaleString() || "115"}
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              Nearest park: <strong>{activeAmenities?.parks?.nearest_distance_m || 109}m</strong>
            </div>
          </div>

          {/* Cloudburst Runoff */}
          <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 backdrop-blur-sm col-span-2 md:col-span-1">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
              <Droplets size={13} className="text-cyan-400" /> 100-Yr Storm Volume
            </div>
            <div className="text-xl font-display font-extrabold text-white mt-1">
              ~{Math.round(currentArea * 1000 * 0.10 * 0.68)}k m³
            </div>
            <div className="text-[10px] text-slate-300 mt-0.5">
              Peak runoff mult: <strong>2.5x</strong>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Vulnerability Index */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Urban Vulnerability Index</div>
          <div className="text-2xl font-display font-extrabold text-slate-900 mt-1 flex items-baseline gap-2">
            <span>{metrics.avgRpn}</span>
            <span className="text-xs font-normal text-slate-400">/ 100</span>
          </div>
          <div className="text-[11px] font-semibold text-amber-700 mt-1 flex items-center gap-1">
            <AlertTriangle size={12} /> Area-Calibrated Exposure
          </div>
        </div>

        {/* Critical High Risks */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Critical & High Risks</div>
          <div className="text-2xl font-display font-extrabold text-red-600 mt-1">
            {metrics.highCount} Active
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Require Phase-1 statutory budget
          </div>
        </div>

        {/* Residual Risk */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Post-Mitigation Residual</div>
          <div className="text-2xl font-display font-extrabold text-emerald-700 mt-1 flex items-baseline gap-2">
            <span>{metrics.avgResidual}</span>
            <span className="text-xs font-normal text-slate-400">/ 100</span>
          </div>
          <div className="text-[11px] font-semibold text-emerald-700 mt-1 flex items-center gap-1">
            <TrendingDown size={13} /> {metrics.overallReduction}% Risk Reduction Efficacy
          </div>
        </div>

        {/* Statutory Compliance */}
        <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-sm">
          <div className="text-xs font-medium text-slate-500">Statutory Framework</div>
          <div className="text-sm font-bold text-slate-900 mt-1 flex items-center gap-1.5">
            <ShieldCheck size={16} className="text-emerald-600" /> ISO 31000 & NDMA
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Compliant with URDPFI 2014 Norms
          </div>
        </div>
      </div>

      {/* Scenario Stress-Testing Bar */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-slate-900 via-[#0B132B] to-slate-900 text-white shadow-lg space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 grid place-items-center border border-sky-500/30">
              <Sliders size={16} />
            </div>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-sky-400">Urban Stress-Test Simulator</div>
              <div className="text-xs text-slate-300">Simulate acute external shocks across real-area hazard models in real-time.</div>
            </div>
          </div>
          {stressTesting && (
            <span className="text-xs text-sky-300 flex items-center gap-1.5 animate-pulse">
              <Sparkles size={13} /> Recalculating hazard models...
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {[
            { key: "baseline", label: "Baseline Real-Area Calibrated", icon: Activity },
            { key: "monsoon_cloudburst", label: "🌧️ 100-Yr Cloudburst Storm", icon: Droplets },
            { key: "inmigration_surge", label: "👥 +25% In-Migration Surge", icon: Users },
            { key: "transit_delay", label: "🚦 Transit Corridor Delay", icon: Car },
            { key: "heatwave_extreme", label: "☀️ Extreme Summer Heatwave", icon: Sun },
          ].map((sc) => (
            <button
              key={sc.key}
              onClick={() => handleScenarioChange(sc.key)}
              disabled={stressTesting}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 border ${
                currentScenario === sc.key
                  ? "bg-sky-600 text-white border-sky-400 shadow-md shadow-sky-600/30 font-semibold"
                  : "bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {sc.label}
            </button>
          ))}
        </div>
      </div>

      {/* ISO 31000 5x5 Heatmap Matrix + Selected Risk Preview */}
      <div className="grid lg:grid-cols-12 gap-6">
        {/* 5x5 Matrix Card */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <div className="font-display font-bold text-sm text-slate-900 flex items-center gap-2">
              <ShieldAlert size={16} className="text-rose-600" /> ISO 31000 Probability vs Impact Matrix
            </div>
            <div className="text-[11px] text-slate-400">Click a cell or chip to inspect</div>
          </div>

          {/* 5x5 Grid Table */}
          <div className="relative pt-2">
            <div className="flex">
              {/* Y-axis Label */}
              <div className="w-8 flex items-center justify-center">
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 -rotate-90 whitespace-nowrap">
                  Probability
                </span>
              </div>

              {/* Grid Body */}
              <div className="flex-1">
                <div className="space-y-1.5">
                  {[5, 4, 3, 2, 1].map((probLevel) => (
                    <div key={probLevel} className="flex gap-1.5 items-center">
                      <span className="w-6 text-[10px] font-bold text-slate-400 text-right pr-1">{probLevel}</span>
                      {[1, 2, 3, 4, 5].map((impLevel) => {
                        const cellRpn = probLevel * impLevel * 4;
                        const cellColor =
                          cellRpn >= 60
                            ? "bg-rose-100/90 border-rose-300 text-rose-900"
                            : cellRpn >= 36
                              ? "bg-amber-100/80 border-amber-300 text-amber-900"
                              : cellRpn >= 20
                                ? "bg-sky-100/70 border-sky-300 text-sky-900"
                                : "bg-emerald-100/70 border-emerald-300 text-emerald-900";

                        const matching = risks.filter((r) => {
                          const pTier = Math.min(5, Math.max(1, Math.ceil(r.probability / 20)));
                          const iTier = Math.min(5, Math.max(1, Math.ceil(r.impact / 20)));
                          return pTier === probLevel && iTier === impLevel;
                        });

                        return (
                          <div
                            key={impLevel}
                            className={`flex-1 h-12 rounded-lg border ${cellColor} flex flex-wrap items-center justify-center p-1 transition-all hover:scale-[1.03] cursor-pointer relative group shadow-sm`}
                            title={`Probability Tier ${probLevel} × Impact Tier ${impLevel}`}
                          >
                            {matching.map((mr) => (
                              <button
                                key={mr.id}
                                onClick={() => setSelectedRisk(mr)}
                                className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-slate-900 text-white m-0.5 hover:bg-sky-600 transition-colors shadow"
                              >
                                {mr.id}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}

                  {/* X-axis Numbers */}
                  <div className="flex gap-1.5 items-center pt-1">
                    <span className="w-6" />
                    {[1, 2, 3, 4, 5].map((imp) => (
                      <div key={imp} className="flex-1 text-center text-[10px] font-bold text-slate-400">
                        {imp}
                      </div>
                    ))}
                  </div>
                </div>

                {/* X-axis Label */}
                <div className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                  Impact Severity →
                </div>
              </div>
            </div>

            {/* Matrix Legend */}
            <div className="flex items-center justify-center gap-4 text-[11px] pt-3 border-t border-slate-100 mt-2 font-medium">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-rose-500" /> Critical (RPN &gt; 60)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-amber-500" /> High (RPN 36–60)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-sky-500" /> Medium (RPN 20–35)</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500" /> Low (RPN &lt; 20)</span>
            </div>
          </div>
        </div>

        {/* Selected Risk Inspection Card */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm flex flex-col justify-between">
          {selectedRisk ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-sky-700 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                      {selectedRisk.id}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${LEVEL_CONFIG[selectedRisk.level]?.badge}`}>
                      {selectedRisk.level} Severity
                    </span>
                    {selectedRisk.data_source === "real_osm" && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold uppercase bg-emerald-100 text-emerald-800 border border-emerald-300">
                        Real OSM
                      </span>
                    )}
                  </div>
                  <h3 className="font-display font-bold text-base text-slate-900">{selectedRisk.title}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">{selectedRisk.category}</div>
                </div>
                <button
                  onClick={() => setSelectedRisk(null)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X size={16} />
                </button>
              </div>

              {/* RPN Comparison Meter */}
              <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-100 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">Risk Priority Number (RPN)</span>
                  <span className="font-extrabold text-slate-900">
                    {selectedRisk.rpn || Math.round((selectedRisk.probability * selectedRisk.impact) / 100)} →{" "}
                    <span className="text-emerald-700">{selectedRisk.residual_rpn || 10}</span>
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-200 overflow-hidden flex">
                  <div
                    className="h-full bg-emerald-500 rounded-l-full"
                    style={{ width: `${selectedRisk.residual_rpn || 10}%` }}
                  />
                  <div
                    className="h-full bg-rose-500 rounded-r-full"
                    style={{ width: `${(selectedRisk.rpn || 50) - (selectedRisk.residual_rpn || 10)}%` }}
                  />
                </div>
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Residual: {selectedRisk.residual_rpn || 10}</span>
                  <span className="text-emerald-700 font-bold">-{selectedRisk.risk_reduction_pct || 80}% Efficacy</span>
                </div>
              </div>

              {/* Real Spatial Parameters Table */}
              {selectedRisk.real_metrics && (
                <div className="p-3 rounded-lg bg-sky-50/70 border border-sky-200 text-xs space-y-1.5">
                  <div className="font-bold text-sky-900 flex items-center gap-1.5">
                    <Radio size={13} className="text-sky-600" /> Real-Time Area Spatial Parameters
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                    {Object.entries(selectedRisk.real_metrics).map(([k, val]) => (
                      <div key={k} className="p-1.5 bg-white/90 rounded border border-sky-100">
                        <span className="text-slate-500 block text-[10px] capitalize">{k.replace(/_/g, " ")}:</span>
                        <strong className="text-slate-900">{val}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Detailed Reason */}
              <div className="text-xs text-slate-600 space-y-1">
                <strong className="text-slate-900 block font-semibold">Diagnostic Technical Reason:</strong>
                <p className="leading-relaxed bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {selectedRisk.reason}
                </p>
              </div>

              {/* Mitigation Strategy */}
              <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs space-y-2">
                <div className="font-bold text-emerald-900 flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-emerald-700" /> Actionable Mitigation Protocol
                </div>
                <p className="text-emerald-900 leading-relaxed text-[11px]">
                  {selectedRisk.mitigation}
                </p>
                <div className="pt-2 border-t border-emerald-200/60 grid grid-cols-2 gap-2 text-[10px] text-emerald-800">
                  <div><strong>Nodal Body:</strong> {selectedRisk.authority || "PWD / Municipal Corp"}</div>
                  <div><strong>Timeline:</strong> {selectedRisk.timeframe || "Phase 1 (0–18 mo)"}</div>
                  <div><strong>Est. Capex:</strong> {selectedRisk.capex_estimate || "₹45 Cr"}</div>
                  <div><strong>Standard:</strong> {selectedRisk.statutory_standard || "URDPFI Norms"}</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16 space-y-2">
              <ShieldCheck size={32} className="text-sky-600 mx-auto" />
              <div className="text-sm font-semibold text-slate-800">Inspect Any Risk Detail</div>
              <p className="text-xs text-slate-400 max-w-xs mx-auto">
                Click any risk badge in the matrix or in the register below to inspect its live spatial telemetry and statutory mitigation protocol.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
        {/* Severity filter chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {["all", "High", "Medium", "Low"].map((sev) => (
            <button
              key={sev}
              onClick={() => setActiveSeverity(sev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all ${
                activeSeverity === sev
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {sev === "all" ? "All Severities" : `${sev} Severity`}
            </button>
          ))}
        </div>

        {/* Category dropdown & Search */}
        <div className="flex items-center gap-2">
          <select
            value={activeCategory}
            onChange={(e) => setActiveCategory(e.target.value)}
            className="h-9 px-3 rounded-lg border border-slate-300 text-xs font-medium text-slate-700 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
          >
            <option value="all">All Domains ({categories.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <div className="relative">
            <Search size={14} className="absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search risk, reason..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 pl-9 pr-3 rounded-lg border border-slate-300 text-xs text-slate-800 placeholder-slate-400 focus:ring-2 focus:ring-sky-500 focus:outline-none w-48 lg:w-60"
            />
          </div>
        </div>
      </div>

      {/* Main Statutory Risk Cards List */}
      <div className="space-y-4">
        {filteredRisks.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-xl border border-slate-200 text-slate-500 text-sm">
            No risks match the selected filters.
          </div>
        ) : (
          filteredRisks.map((r, i) => {
            const CatIcon = CATEGORY_ICONS[r.category] || ShieldAlert;
            const rpn = r.rpn || Math.round((r.probability * r.impact) / 100);
            const resRpn = r.residual_rpn || 10;
            const config = LEVEL_CONFIG[r.level] || LEVEL_CONFIG.Medium;

            return (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                onClick={() => setSelectedRisk(r)}
                className={`border rounded-xl bg-white p-6 shadow-sm hover:shadow-md transition-all cursor-pointer ${
                  selectedRisk?.id === r.id ? "border-sky-500 ring-2 ring-sky-500/20" : "border-slate-200"
                }`}
              >
                <div className="grid md:grid-cols-12 gap-5 items-start">
                  {/* Category Icon */}
                  <div className="md:col-span-1 flex items-center justify-center">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 grid place-items-center shadow-inner">
                      <CatIcon size={20} className={config.iconColor} />
                    </div>
                  </div>

                  {/* Title & Metadata */}
                  <div className="md:col-span-4 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-extrabold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                        {r.id}
                      </span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${config.badge}`}>
                        {r.level}
                      </span>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {r.category}
                      </span>
                      {r.data_source === "real_osm" && (
                        <span className="text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 uppercase tracking-wider">
                          Real OSM
                        </span>
                      )}
                    </div>
                    <div className="font-display font-bold text-base text-slate-900 mt-1">
                      {r.title}
                    </div>
                    <div className="text-xs text-slate-500 leading-relaxed pt-1">
                      <strong className="text-slate-800">Reason:</strong> {r.reason}
                    </div>
                  </div>

                  {/* Probability & Impact Meters */}
                  <div className="md:col-span-3 space-y-2.5">
                    <Meter label="Probability" value={r.probability} color="bg-amber-500" />
                    <Meter label="Impact Severity" value={r.impact} color="bg-rose-500" />
                    <div className="flex justify-between items-center text-[11px] pt-1 border-t border-slate-100 font-medium text-slate-600">
                      <span>RPN Score: <strong>{rpn}</strong></span>
                      <span className="text-emerald-700 font-bold">Residual: {resRpn} (-{r.risk_reduction_pct || 80}%)</span>
                    </div>
                  </div>

                  {/* Mitigation Protocol */}
                  <div className="md:col-span-4 space-y-2">
                    <div className="p-3.5 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1.5">
                      <div className="font-bold flex items-center gap-1.5 text-emerald-800">
                        <ShieldCheck size={14} className="text-emerald-600" /> Statutory Mitigation Protocol
                      </div>
                      <div className="text-[11px] text-emerald-900 leading-relaxed">
                        {r.mitigation}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-400 pt-0.5">
                      <span><strong>Agency:</strong> {r.authority || "PWD / Municipal"}</span>
                      <span><strong>Timeline:</strong> {r.timeframe || "Phase 1"}</span>
                    </div>
                  </div>

                  {/* Real Spatial Telemetry Row */}
                  {r.real_metrics && (
                    <div className="md:col-span-12 mt-2 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="flex items-center gap-1 font-semibold text-sky-800 bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                        <Radio size={11} className="text-sky-600 animate-pulse" /> Live Telemetry:
                      </span>
                      {Object.entries(r.real_metrics).map(([k, val]) => (
                        <span key={k} className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200 text-slate-700">
                          <span className="text-slate-400 capitalize">{k.replace(/_/g, " ")}: </span>
                          <strong className="text-slate-800">{val}</strong>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Location Inspector & Switch Area Modal */}
      <AnimatePresence>
        {showLocationModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <div className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                  <Globe size={18} className="text-sky-600" /> Inspect Hazards for Real-Time Area
                </div>
                <button
                  onClick={() => setShowLocationModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5 uppercase tracking-wider">
                    Quick Worldwide Area Presets
                  </label>
                  <div className="grid sm:grid-cols-2 gap-2.5">
                    {WORLD_PRESETS.map((pst) => (
                      <button
                        key={pst.name}
                        onClick={() => {
                          setCustomLocInput({
                            name: pst.name,
                            lat: pst.lat,
                            lng: pst.lng,
                            radius_m: 2500,
                          });
                        }}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          customLocInput.name === pst.name
                            ? "border-sky-500 bg-sky-50/60 ring-2 ring-sky-500/20"
                            : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="text-xs font-bold text-slate-900 flex items-center justify-between">
                          <span>{pst.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{pst.lat.toFixed(2)}°, {pst.lng.toFixed(2)}°</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-1 leading-snug">{pst.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-100 pt-4 space-y-3">
                  <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                    Custom Geographic Coordinates
                  </label>
                  <div>
                    <input
                      type="text"
                      placeholder="Area or City Name (e.g. Central Bangalore, Karnataka)"
                      value={customLocInput.name}
                      onChange={(e) => setCustomLocInput((prev) => ({ ...prev, name: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium block mb-1">Latitude (°N)</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={customLocInput.lat}
                        onChange={(e) => setCustomLocInput((prev) => ({ ...prev, lat: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 font-medium block mb-1">Longitude (°E)</span>
                      <input
                        type="number"
                        step="0.0001"
                        value={customLocInput.lng}
                        onChange={(e) => setCustomLocInput((prev) => ({ ...prev, lng: parseFloat(e.target.value) || 0 }))}
                        className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowLocationModal(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={fetchingRealTime}
                    onClick={() => {
                      handleFetchRealTimeRisks({
                        lat: customLocInput.lat,
                        lng: customLocInput.lng,
                        location_name: customLocInput.name,
                        radius_m: customLocInput.radius_m,
                      });
                    }}
                    className="h-9 px-5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm flex items-center gap-1.5"
                  >
                    <RefreshCw size={13} className={fetchingRealTime ? "animate-spin" : ""} />
                    {fetchingRealTime ? "Querying OSM..." : "Scan & Fetch Real Hazards"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Custom Risk Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <div className="font-display font-bold text-base text-slate-900 flex items-center gap-2">
                  <ShieldAlert size={18} className="text-sky-600" /> Register Project-Specific Urban Hazard
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleAddCustomRisk} className="p-6 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Risk Hazard Title *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Seismic Fault Line Soil Liquefaction Hazard"
                    value={customForm.title}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, title: e.target.value }))}
                    className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Domain Category *</label>
                    <select
                      value={customForm.category}
                      onChange={(e) => setCustomForm((prev) => ({ ...prev, category: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    >
                      <option value="Transportation">Transportation & Mobility</option>
                      <option value="Public Services">Civic & Public Services</option>
                      <option value="Environmental & Hydrology">Environmental & Hydrology</option>
                      <option value="Demographics & Housing">Demographics & Housing</option>
                      <option value="Climate & Sustainability">Climate & Sustainability</option>
                      <option value="Utilities & Energy">Utilities & Power Grid</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-700 block mb-1">Severity Level *</label>
                    <select
                      value={customForm.level}
                      onChange={(e) => setCustomForm((prev) => ({ ...prev, level: e.target.value }))}
                      className="w-full h-9 px-3 rounded-lg border border-slate-300 text-xs text-slate-800 bg-white focus:ring-2 focus:ring-sky-500 focus:outline-none"
                    >
                      <option value="High">High Severity</option>
                      <option value="Medium">Medium Severity</option>
                      <option value="Low">Low Severity</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Probability</span><span>{customForm.probability}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="95"
                      value={customForm.probability}
                      onChange={(e) => setCustomForm((prev) => ({ ...prev, probability: parseInt(e.target.value) }))}
                      className="w-full accent-sky-600"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Impact Severity</span><span>{customForm.impact}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="95"
                      value={customForm.impact}
                      onChange={(e) => setCustomForm((prev) => ({ ...prev, impact: parseInt(e.target.value) }))}
                      className="w-full accent-rose-600"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Technical Reason / Diagnostic *</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Specific engineering explanation of why this risk arises in this area..."
                    value={customForm.reason}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, reason: e.target.value }))}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">Actionable Mitigation Protocol *</label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Statutory engineering and planning steps to mitigate this hazard..."
                    value={customForm.mitigation}
                    onChange={(e) => setCustomForm((prev) => ({ ...prev, mitigation: e.target.value }))}
                    className="w-full p-2.5 rounded-lg border border-slate-300 text-xs text-slate-800 focus:ring-2 focus:ring-sky-500 focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="h-9 px-4 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-9 px-5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm"
                  >
                    Save & Register Hazard
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Meter({ label, value, color = "bg-sky-600" }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[11px] text-slate-500 font-medium">
        <span>{label}</span>
        <span className="font-bold text-slate-800">{value}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.6 }}
          className={`h-full rounded-full ${color}`}
        />
      </div>
    </div>
  );
}
