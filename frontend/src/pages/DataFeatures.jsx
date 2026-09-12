import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell,
  PieChart, Pie
} from "recharts";
import {
  Cpu, Database, Network, Binary, RefreshCw, Download, Layers,
  Compass, MapPin, CheckCircle2, ArrowRight, Activity, Sparkles,
  Share2, Copy, Sliders, ShieldCheck, BarChart3, AlertCircle, Info,
  Search, X, SlidersHorizontal, Calculator, TrendingUp, ExternalLink,
  UploadCloud, FileCode2, Check, AlertTriangle, HelpCircle
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

const DOMAIN_COLORS = {
  "Spatial Morphology": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", bar: "#6366f1", light: "#e0e7ff" },
  "Network & Proximity": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", bar: "#3b82f6", light: "#dbeafe" },
  "Urban Diversity": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", bar: "#10b981", light: "#d1fae5" },
  "Climate & Resilience": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", bar: "#f59e0b", light: "#fef3c7" },
  "Socio-Demographics": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", bar: "#8b5cf6", light: "#ede9fe" },
};

const FEATURE_FORMULAS = {
  compactness: {
    formula: "Polsby-Popper = (4 * π * Area) / (Perimeter²)",
    math: "4π · A / P²",
    benchmark: "≥ 0.650 (Circle = 1.0, Square = 0.785)",
    interpretation: "Measures boundary circularity and minimizes infrastructure network sprawl.",
    recommendation: "Smooth irregular boundary jaggedness and avoid protruding narrow corridors to reduce utility trenching costs.",
    mlImpact: "Strongly correlates with infrastructure capital efficiency and emergency response times.",
  },
  solidity: {
    formula: "Solidity = Area / ConvexHull(Area)",
    math: "A / A_convex_hull",
    benchmark: "≥ 0.850 (Solid convex shape)",
    interpretation: "Quantifies structural compactness and detects deep boundary indentations.",
    recommendation: "Fill concave voids with public park buffers or civic retention reservoirs.",
    mlImpact: "Direct input for contiguous pedestrian network generation and parcel subdivision.",
  },
  shape_regularity: {
    formula: "Regularity = Area / BoundingBox(Area)",
    math: "A / (Width · Height)",
    benchmark: "≥ 0.700",
    interpretation: "Compares the site footprint to its minimum bounding box rectangle.",
    recommendation: "Align primary development axes with cardinal solar orientation.",
    mlImpact: "Optimizes building layout density algorithms and grid orientation.",
  },
  road_density: {
    formula: "Road Density = Total Road Centerline Length / Site Area",
    math: "Σ L_roads / A_sqkm",
    benchmark: "8.0 - 18.0 km/km²",
    interpretation: "Measures transport grid permeability and block connectivity.",
    recommendation: "Develop secondary grid hierarchy to eliminate arterial bottlenecks.",
    mlImpact: "Governs traffic simulation flow matrices and accessibility scores.",
  },
  school_access: {
    formula: "d_school = min ||x_site - x_school||",
    math: "min ||x - x_school||",
    benchmark: "≤ 800 m (10-min walk catchment)",
    interpretation: "Pedestrian proximity from site centroid to primary & secondary educational facilities.",
    recommendation: "Ensure protected pedestrian walking paths and safe school zone corridors.",
    mlImpact: "Crucial weight in family-oriented demographic liveability index.",
  },
  hospital_access: {
    formula: "d_hosp = min ||x_site - x_hospital||",
    math: "min ||x - x_hospital||",
    benchmark: "≤ 2,000 m (Emergency catchment)",
    interpretation: "Proximity to community health centers and emergency tertiary hospitals.",
    recommendation: "Reserve priority transit lanes for emergency vehicular routing.",
    mlImpact: "Primary metric in urban risk mitigation and health resilience index.",
  },
  park_access: {
    formula: "d_park = min ||x_site - x_park||",
    math: "min ||x - x_park||",
    benchmark: "≤ 400 m (5-min walk catchment)",
    interpretation: "Accessibility to public recreational greenspace and nature reserves.",
    recommendation: "Weave linear green corridors and pocket parks into residential blocks.",
    mlImpact: "Major predictor of mental well-being, air quality, and urban heat island reduction.",
  },
  transit_access: {
    formula: "Transit Accessibility Score = Coverage(BRT, Metro, Bus)",
    math: "Σ (w_transit · Stop_coverage)",
    benchmark: "≥ 75 / 100",
    interpretation: "Coverage density of rapid mass transit and bus stops across the zone.",
    recommendation: "Incorporate Transit-Oriented Development (TOD) zoning within 500m of transit nodes.",
    mlImpact: "Directly determines modal shift away from private automotive congestion.",
  },
  mixed_use_entropy: {
    formula: "Shannon Entropy H = - Σ (p_i * ln(p_i))",
    math: "- Σ p_i · ln(p_i)",
    benchmark: "H ≥ 1.40 nats (Diversity Ratio ≥ 80%)",
    interpretation: "Evaluates functional land-use balance across URDPFI zone classes.",
    recommendation: "Avoid monocentric sprawl; co-locate residential, commercial, and civic uses.",
    mlImpact: "Key ML feature predicting 24/7 street vibrancy, safety, and local economic resilience.",
  },
  green_ratio: {
    formula: "Green Cover Ratio = Area(Parks + Green) / Total Area",
    math: "A_green / A_total",
    benchmark: "15% - 25% of total site area",
    interpretation: "Percentage of site designated for permeable natural ecosystems.",
    recommendation: "Maintain sponge city guidelines to enhance aquifer recharge.",
    mlImpact: "Direct input for stormwater runoff modeling and urban heat index.",
  },
  solar_potential: {
    formula: "Solar Potential = Annual Irradiance Simulation Score",
    math: "kWh / m² / year",
    benchmark: "≥ 75 / 100",
    interpretation: "Simulated solar insolation exposure across rooftop and facade envelopes.",
    recommendation: "Orient building roofs towards south/south-west for maximum photovoltaic harvest.",
    mlImpact: "Calculates renewable microgrid capacity and net-zero energy offset.",
  },
  daylight: {
    formula: "Daylight Autonomy = % Area receiving ≥ 300 lux for ≥ 50% hours",
    math: "sDA_300/50%",
    benchmark: "≥ 70%",
    interpretation: "Natural interior daylight availability minimizing artificial lighting needs.",
    recommendation: "Optimize building separations and courtyard depths relative to building heights.",
    mlImpact: "Drives building operational energy models and occupant well-being.",
  },
  wind_comfort: {
    formula: "Pedestrian Wind Comfort = Lawson Criteria Compliance",
    math: "P(v_wind < v_threshold)",
    benchmark: "≥ 75%",
    interpretation: "Evaluation of ground-level wind turbulence and pedestrian microclimate.",
    recommendation: "Use staggered building heights and windbreak vegetation to dissipate vortexes.",
    mlImpact: "Critical for outdoor thermal comfort and street-level dining/walking viability.",
  },
  acoustic_quality: {
    formula: "Acoustic Buffer Score = Decibel attenuation rating",
    math: "dB_drop / Distance",
    benchmark: "≥ 65 / 100",
    interpretation: "Sound attenuation from arterial corridors into sensitive residential receptors.",
    recommendation: "Install vegetated earth berms and set back residential facades ≥ 30m from highways.",
    mlImpact: "Drives acoustic zoning overlays and sleep quality demographic indices.",
  },
  density_balance: {
    formula: "Density Balance = Forecast Population / Carrying Capacity",
    math: "Pop / Area_sqkm",
    benchmark: "8,000 - 16,000 ppl/km²",
    interpretation: "Population density relative to urban infrastructure carrying thresholds.",
    recommendation: "Calibrate Floor Area Ratio (FAR) with public water and sewer main capacities.",
    mlImpact: "Determines utility sizing matrices and civic infrastructure requirements.",
  },
  land_efficiency: {
    formula: "Land Utilization Efficiency = Value Generated / Hectare",
    math: "URDPFI_utilization_ratio",
    benchmark: "≥ 75 / 100",
    interpretation: "Optimization of urban footprint avoiding underutilized brownfield wastelands.",
    recommendation: "Encourage compact multi-level development and shared civic facilities.",
    mlImpact: "Key parameter in economic ROI forecasting and municipal revenue generation.",
  },
};

const DEFAULT_RADAR = [
  { axis: "Spatial Morphology", score: 75.0, benchmark: 75.0 },
  { axis: "Network & Access", score: 70.0, benchmark: 70.0 },
  { axis: "Civic Proximity", score: 78.0, benchmark: 80.0 },
  { axis: "Mixed-Use Diversity", score: 88.0, benchmark: 85.0 },
  { axis: "Climate & Environment", score: 76.0, benchmark: 78.0 },
  { axis: "Land Efficiency", score: 81.0, benchmark: 80.0 },
];

export default function DataFeatures() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeTab, setActiveTab] = useState("vector"); // "vector", "radar", "weights", "simulation"
  const [selectedDomain, setSelectedDomain] = useState("ALL");
  const [displayNormalized, setDisplayNormalized] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL"); // "ALL", "OPTIMAL", "ADEQUATE", "ATTENTION"
  const [detailFeature, setDetailFeature] = useState(null);

  // AI Liveability Weights State
  const [weights, setWeights] = useState({
    morphology: 20,
    network: 25,
    diversity: 25,
    climate: 20,
    demographics: 10,
  });

  // Simulation state for custom extraction
  const [simDensity, setSimDensity] = useState(12000);
  const [simResPct, setSimResPct] = useState(40);
  const [simComPct, setSimComPct] = useState(20);
  const [simGreenPct, setSimGreenPct] = useState(20);
  const [simIndPct, setSimIndPct] = useState(10);
  const [simTransPct, setSimTransPct] = useState(10);
  const [simulating, setSimulating] = useState(false);
  const [customGeoJson, setCustomGeoJson] = useState("");
  const [useCustomGeo, setUseCustomGeo] = useState(false);

  // Fetch project and features
  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    Promise.all([
      api.get(`/projects/${id}`),
      api.get(`/projects/${id}/features`).catch(() => null),
    ])
      .then(([projRes, featRes]) => {
        if (!isMounted) return;
        setProject(projRes.data);
        if (featRes && featRes.data) {
          setFeatures(featRes.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load project features:", err);
        toast.error("Failed to load feature dataset");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [id]);

  // Execute processing pipeline
  const handleRunPipeline = async () => {
    setProcessing(true);
    try {
      const res = await api.post(`/projects/${id}/features/process`);
      setFeatures(res.data);
      toast.success("Feature extraction pipeline executed and cached successfully!");
    } catch (err) {
      console.error("Pipeline run error:", err);
      toast.error("Pipeline run failed. Please check network connectivity.");
    } finally {
      setProcessing(false);
    }
  };

  // Export CSV
  const handleExportCSV = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/projects/${id}/features/export?format=csv`, { responseType: "blob" });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: "text/csv" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartscape_features_${id.slice(0, 8)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1500);
      toast.success("Downloaded CSV feature dataset");
    } catch (err) {
      console.error("Export CSV error:", err);
      toast.error("Failed to export CSV features");
    } finally {
      setExporting(false);
    }
  };

  // Export JSON
  const handleExportJSON = async () => {
    setExporting(true);
    try {
      const res = await api.get(`/projects/${id}/features/export?format=json`, { responseType: "blob" });
      const blob = res.data instanceof Blob ? res.data : new Blob([res.data], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `smartscape_features_${id.slice(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1500);
      toast.success("Downloaded JSON feature dataset");
    } catch (err) {
      console.error("Export JSON error:", err);
      toast.error("Failed to export JSON features");
    } finally {
      setExporting(false);
    }
  };

  // Copy 16D array to clipboard
  const handleCopyVector = () => {
    if (!features?.feature_vector_16d) return;
    navigator.clipboard.writeText(JSON.stringify(features.feature_vector_16d));
    toast.success("Copied 16-dimensional normalized array to clipboard!");
  };

  // Run custom simulation
  const handleSimulate = async () => {
    setSimulating(true);
    try {
      let boundaryGeo = null;
      if (useCustomGeo && customGeoJson.trim()) {
        try {
          boundaryGeo = JSON.parse(customGeoJson);
        } catch (e) {
          toast.error("Invalid GeoJSON syntax. Please check coordinates format.");
          setSimulating(false);
          return;
        }
      }

      const payload = {
        name: `${project?.name || "Project"} - Custom Mix`,
        site_area_sqkm: project?.site_area_sqkm || 10.0,
        land_use_mix: {
          residential: simResPct,
          commercial: simComPct,
          parks_green: simGreenPct,
          industrial: simIndPct,
          roads_transport: simTransPct,
        },
        target_density_pph: simDensity,
        boundary_geojson: boundaryGeo,
      };
      const res = await api.post("/features/extract-raw", payload);
      setFeatures(res.data);
      toast.success("Extracted custom feature vector for simulated parameters!");
    } catch (err) {
      toast.error("Failed to compute simulated features");
    } finally {
      setSimulating(false);
    }
  };

  // Filtered vector items
  const vectorItems = useMemo(() => {
    if (!features?.ml_feature_vector) return [];
    return features.ml_feature_vector.filter((item) => {
      // Domain filter
      if (selectedDomain !== "ALL" && item.domain !== selectedDomain) return false;

      // Status filter
      const norm = item.normalized ?? 0.5;
      if (statusFilter === "OPTIMAL" && norm < 0.75) return false;
      if (statusFilter === "ADEQUATE" && (norm < 0.5 || norm >= 0.75)) return false;
      if (statusFilter === "ATTENTION" && norm >= 0.5) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = item.name.toLowerCase().includes(q);
        const matchKey = item.key.toLowerCase().includes(q);
        const matchDesc = (item.description || "").toLowerCase().includes(q);
        if (!matchName && !matchKey && !matchDesc) return false;
      }

      return true;
    });
  }, [features, selectedDomain, statusFilter, searchQuery]);

  // Unique domains
  const domains = useMemo(() => {
    if (!features?.ml_feature_vector) return [];
    return Array.from(new Set(features.ml_feature_vector.map((item) => item.domain)));
  }, [features]);

  // Composite weighted score
  const compositeLiveability = useMemo(() => {
    if (!features?.ml_feature_vector) return 76.5;
    const totalW = weights.morphology + weights.network + weights.diversity + weights.climate + weights.demographics || 100;
    const scores = {
      morphology: 0,
      network: 0,
      diversity: 0,
      climate: 0,
      demographics: 0,
    };
    const counts = { morphology: 0, network: 0, diversity: 0, climate: 0, demographics: 0 };

    features.ml_feature_vector.forEach((item) => {
      const val = item.normalized ?? 0.5;
      if (item.domain === "Spatial Morphology") { scores.morphology += val; counts.morphology += 1; }
      else if (item.domain === "Network & Proximity") { scores.network += val; counts.network += 1; }
      else if (item.domain === "Urban Diversity") { scores.diversity += val; counts.diversity += 1; }
      else if (item.domain === "Climate & Resilience") { scores.climate += val; counts.climate += 1; }
      else if (item.domain === "Socio-Demographics") { scores.demographics += val; counts.demographics += 1; }
    });

    const avg = (dom) => (counts[dom] ? (scores[dom] / counts[dom]) * 100 : 75);
    const weightedSum =
      avg("morphology") * weights.morphology +
      avg("network") * weights.network +
      avg("diversity") * weights.diversity +
      avg("climate") * weights.climate +
      avg("demographics") * weights.demographics;

    return (weightedSum / totalW).toFixed(1);
  }, [features, weights]);

  // Status counts
  const statusCounts = useMemo(() => {
    if (!features?.ml_feature_vector) return { optimal: 0, adequate: 0, attention: 0 };
    let opt = 0, adq = 0, att = 0;
    features.ml_feature_vector.forEach((i) => {
      const v = i.normalized ?? 0.5;
      if (v >= 0.75) opt += 1;
      else if (v >= 0.5) adq += 1;
      else att += 1;
    });
    return { optimal: opt, adequate: adq, attention: att };
  }, [features]);

  if (loading) {
    return (
      <div className="p-12 flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-emerald-200 border-t-emerald-600 rounded-full animate-spin mb-4" />
        <p className="text-slate-600 font-medium">Loading SmartScape feature pipeline...</p>
      </div>
    );
  }

  const morphology = features?.domains?.morphology || features?.morphology;
  const entropy = features?.domains?.diversity || features?.entropy;
  const network = features?.domains?.network;
  const resilience = features?.domains?.resilience;
  const radarData = (features?.radar_profile && features.radar_profile.length > 0) ? features.radar_profile : DEFAULT_RADAR;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
              <Cpu className="w-3.5 h-3.5 text-emerald-600" />
              URDPFI Pipeline v2.4
            </span>
            <span className="text-xs text-slate-400">•</span>
            <span className="text-xs text-slate-500 font-mono">16-Dimensional ML Tensor</span>
            <span className="text-xs text-slate-400">•</span>
            <Link
              to={`/projects/${id}/map`}
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 transition"
            >
              <Compass className="w-3 h-3" />
              <span>Back to Zoning Map</span>
            </Link>
          </div>
          <h1 className="text-3xl font-display font-extrabold text-slate-900 tracking-tight">
            Data Processing & Feature Extraction
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            Automated spatial morphology extraction, network density analytics, Shannon entropy diversity indices,
            and machine-learning ready vector synthesis for <span className="font-semibold text-slate-700">{project?.name || "SmartScape Demo City — Pune Ring 2"}</span>.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={handleRunPipeline}
            disabled={processing}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-sky-600 via-blue-700 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md shadow-sky-600/20 transition-all disabled:opacity-50"
            id="run-pipeline-btn"
          >
            <RefreshCw className={`w-4 h-4 ${processing ? "animate-spin" : ""}`} />
            {processing ? "Processing Spatial Engine..." : "Run Extraction Pipeline"}
          </button>

          <div className="inline-flex rounded-lg shadow-sm border border-slate-200 bg-white">
            <button
              onClick={handleExportCSV}
              disabled={exporting}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 border-r border-slate-200 rounded-l-lg transition inline-flex items-center gap-1.5"
              id="export-csv-btn"
              title="Export features as CSV table"
            >
              <Download className="w-3.5 h-3.5 text-slate-500" />
              CSV
            </button>
            <button
              onClick={handleExportJSON}
              disabled={exporting}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 rounded-r-lg transition inline-flex items-center gap-1.5"
              id="export-json-btn"
              title="Export features as JSON payload"
            >
              <Binary className="w-3.5 h-3.5 text-slate-500" />
              JSON
            </button>
          </div>
        </div>
      </div>

      {/* Pipeline Lifecycle Stages Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pipeline Stages & Health</span>
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-3">
            <span>Status: <span className="text-emerald-600 font-semibold">{features?.pipeline_status || "Active"}</span></span>
            {features?.processed_at && (
              <span className="text-slate-400 font-mono">({new Date(features.processed_at).toLocaleTimeString()})</span>
            )}
            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold">
              Project ID: {id.slice(0, 8)}...
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Stage 01</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="font-semibold text-sm text-slate-900">Spatial Ingestion</div>
            <div className="text-xs text-slate-500 mt-1">GeoJSON boundary ring & site geometry projection</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Stage 02</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="font-semibold text-sm text-slate-900">Morphology Engine</div>
            <div className="text-xs text-slate-500 mt-1">Polsby-Popper, Convex Hull, Aspect Ratio & Solidity</div>
          </div>

          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200/80">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase">Stage 03</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>
            <div className="font-semibold text-sm text-slate-900">Entropy & Proximity</div>
            <div className="text-xs text-slate-500 mt-1">Shannon H-index, Simpson diversity, OSM amenities</div>
          </div>

          <div className="p-3.5 rounded-lg bg-emerald-50/70 border border-emerald-200">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-emerald-700 uppercase">Stage 04</span>
              <Sparkles className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="font-semibold text-sm text-emerald-900">16D ML Assembly</div>
            <div className="text-xs text-emerald-700/80 mt-1">Clamped [0.0, 1.0] vectors ready for deep inference</div>
          </div>
        </div>
      </div>

      {/* 4 Domain Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Card 1: Spatial Morphology */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-indigo-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-indigo-600">Spatial Morphology</span>
            <Compass className="w-5 h-5 text-indigo-500" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-extrabold text-slate-900">
                {morphology?.compactness?.toFixed(3) ?? "0.785"}
              </div>
              <div className="text-xs text-slate-500 font-medium">Polsby-Popper Compactness (0-1)</div>
            </div>
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block">Solidity</span>
                <span className="font-semibold text-slate-700">{morphology?.solidity?.toFixed(3) ?? "0.985"}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Aspect Ratio</span>
                <span className="font-semibold text-slate-700">{morphology?.aspect_ratio?.toFixed(2) ?? "1.08"}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Perimeter</span>
                <span className="font-semibold text-slate-700">{morphology?.perimeter_km ?? (morphology?.perimeter_m ? (morphology.perimeter_m/1000).toFixed(2) : "12.65")} km</span>
              </div>
              <div>
                <span className="text-slate-400 block">Regularity</span>
                <span className="font-semibold text-slate-700">{(morphology?.shape_regularity ? (morphology.shape_regularity * 100).toFixed(1) : "92.5")}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Network & Accessibility */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-blue-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Network & Proximity</span>
            <Network className="w-5 h-5 text-blue-500" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-extrabold text-slate-900">
                {network?.road_density ? `${network.road_density} km/km²` : "4.00 km/km²"}
              </div>
              <div className="text-xs text-slate-500 font-medium">Road Network Density</div>
            </div>
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block">School Dist</span>
                <span className="font-semibold text-slate-700">{Math.round(network?.school_proximity_m ?? 850)} m</span>
              </div>
              <div>
                <span className="text-slate-400 block">Hospital Dist</span>
                <span className="font-semibold text-slate-700">{Math.round(network?.hospital_proximity_m ?? 2200)} m</span>
              </div>
              <div>
                <span className="text-slate-400 block">Park Dist</span>
                <span className="font-semibold text-slate-700">{Math.round(network?.park_proximity_m ?? 620)} m</span>
              </div>
              <div>
                <span className="text-slate-400 block">Transit Score</span>
                <span className="font-semibold text-slate-700">{network?.transit_access_pct ?? 76}/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Urban Diversity & Shannon Entropy */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-emerald-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-600">Land-Use Entropy</span>
            <Layers className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-extrabold text-slate-900">
                {entropy?.shannon_entropy ?? entropy?.entropy ?? "1.652"}
              </div>
              <div className="text-xs text-slate-500 font-medium">Shannon Entropy Index H (nats)</div>
            </div>
            <div className="pt-2 border-t border-slate-100 text-xs space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Diversity Ratio</span>
                <span className="font-semibold text-slate-700">
                  {((entropy?.normalized_entropy ?? 0.88) * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Simpson Index</span>
                <span className="font-semibold text-slate-700">
                  {entropy?.simpson_diversity ?? "0.785"}
                </span>
              </div>
              <div className="mt-1 pt-1 border-t border-slate-100">
                <span className="inline-block px-2 py-0.5 text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                  {entropy?.assessment ?? "Balanced Mixed-Use"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Climate Resilience */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:border-amber-300 transition">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-600">Climate Resilience</span>
            <ShieldCheck className="w-5 h-5 text-amber-500" />
          </div>
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-extrabold text-slate-900">
                {resilience?.solar_potential_score ?? "84"}/100
              </div>
              <div className="text-xs text-slate-500 font-medium">Solar Insolation Score</div>
            </div>
            <div className="pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-slate-400 block">Daylight</span>
                <span className="font-semibold text-slate-700">{resilience?.daylight_score ?? 78}%</span>
              </div>
              <div>
                <span className="text-slate-400 block">Wind Comfort</span>
                <span className="font-semibold text-slate-700">{resilience?.wind_comfort_score ?? 65}%</span>
              </div>
              <div>
                <span className="text-slate-400 block">Acoustic Buff</span>
                <span className="font-semibold text-slate-700">{resilience?.acoustic_score ?? 62}%</span>
              </div>
              <div>
                <span className="text-slate-400 block">Green Cover</span>
                <span className="font-semibold text-slate-700">{resilience?.green_ratio_pct ?? 15.0}%</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Analysis Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Navigation Tab Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-slate-50/50 flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab("vector")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === "vector"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              16D Feature Matrix
            </button>
            <button
              onClick={() => setActiveTab("radar")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === "radar"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Urban Radar Profile
            </button>
            <button
              onClick={() => setActiveTab("weights")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === "weights"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              AI Liveability Weights
            </button>
            <button
              onClick={() => setActiveTab("simulation")}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition ${
                activeTab === "simulation"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              Custom Mix Simulator
            </button>
          </div>

          {/* Quick Controls */}
          {activeTab === "vector" && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter 16 dimensions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1 bg-white border border-slate-200 text-xs rounded-md text-slate-700 w-44 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-2 top-2 text-slate-400 hover:text-slate-600">
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span className="text-slate-400 font-medium">Domain:</span>
                <select
                  value={selectedDomain}
                  onChange={(e) => setSelectedDomain(e.target.value)}
                  className="bg-white border border-slate-200 text-xs font-medium rounded-md px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="ALL">All Domains ({features?.ml_feature_vector?.length || 16})</option>
                  {domains.map((dom) => (
                    <option key={dom} value={dom}>{dom}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => setDisplayNormalized(!displayNormalized)}
                className="px-2.5 py-1 text-xs font-medium border border-slate-200 rounded-md bg-white hover:bg-slate-50 text-slate-700 transition"
              >
                {displayNormalized ? "Showing: Normalized [0, 1]" : "Showing: Raw Values"}
              </button>

              <button
                onClick={handleCopyVector}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md hover:bg-emerald-100 transition"
                title="Copy normalized 16D array for Python/ML notebooks"
              >
                <Copy className="w-3.5 h-3.5" />
                Copy Array
              </button>
            </div>
          )}
        </div>

        {/* Tab 1: 16-Dimensional Feature Vector Matrix */}
        {activeTab === "vector" && (
          <div className="p-6 space-y-4">
            {/* Quick Status Pill Bar */}
            <div className="flex items-center justify-between text-xs text-slate-500 flex-wrap gap-3 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-700">Status filter:</span>
                <button
                  onClick={() => setStatusFilter("ALL")}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${
                    statusFilter === "ALL" ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  All ({features?.ml_feature_vector?.length || 16})
                </button>
                <button
                  onClick={() => setStatusFilter("OPTIMAL")}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${
                    statusFilter === "OPTIMAL" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                  }`}
                >
                  Optimal ({statusCounts.optimal})
                </button>
                <button
                  onClick={() => setStatusFilter("ADEQUATE")}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${
                    statusFilter === "ADEQUATE" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                  }`}
                >
                  Adequate ({statusCounts.adequate})
                </button>
                <button
                  onClick={() => setStatusFilter("ATTENTION")}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition ${
                    statusFilter === "ATTENTION" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
                  }`}
                >
                  Needs Attention ({statusCounts.attention})
                </button>
              </div>

              <div className="text-[11px] text-slate-400">
                Click any feature card to view formula and URDPFI design recommendations
              </div>
            </div>

            {/* Feature Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {vectorItems.map((item, idx) => {
                const colorMeta = DOMAIN_COLORS[item.domain] || {
                  bg: "bg-slate-50", text: "text-slate-700", border: "border-slate-200", bar: "#64748b", light: "#f1f5f9"
                };
                const normVal = item.normalized ?? 0.5;
                const pct = Math.round(normVal * 100);
                const isOptimal = normVal >= 0.75;
                const isAdequate = normVal >= 0.5 && normVal < 0.75;

                return (
                  <motion.div
                    key={item.key}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.02 }}
                    onClick={() => setDetailFeature(item)}
                    className="p-4 rounded-xl border border-slate-200 bg-white hover:shadow-md hover:border-slate-300 transition flex flex-col justify-between cursor-pointer group"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${colorMeta.bg} ${colorMeta.text}`}>
                          {item.domain}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${isOptimal ? "bg-emerald-500" : isAdequate ? "bg-blue-500" : "bg-amber-500"}`} />
                          <span className="text-[11px] font-mono text-slate-400">dim[{idx}]</span>
                        </div>
                      </div>

                      <div className="font-bold text-slate-900 text-sm leading-tight mb-1 group-hover:text-emerald-700 transition">
                        {item.name}
                      </div>

                      <p className="text-xs text-slate-500 line-clamp-2 mb-3">
                        {item.description}
                      </p>
                    </div>

                    <div>
                      {/* Metric Display */}
                      <div className="flex items-baseline justify-between mb-1.5">
                        <span className="text-xs text-slate-400 font-medium">
                          {displayNormalized ? "Normalized [0, 1]" : "Raw Unit Value"}
                        </span>
                        <span className="text-base font-extrabold text-slate-900 font-mono">
                          {displayNormalized
                            ? normVal.toFixed(3)
                            : typeof item.raw_value === "number"
                            ? `${item.raw_value.toFixed(2)} ${item.unit}`
                            : `${item.raw_value ?? "N/A"} ${item.unit}`}
                        </span>
                      </div>

                      {/* Mini Visual Progress Bar */}
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: colorMeta.bar,
                          }}
                        />
                      </div>

                      <div className="mt-2 text-[10px] text-slate-400 flex items-center justify-between opacity-0 group-hover:opacity-100 transition">
                        <span>View scientific formula</span>
                        <ArrowRight className="w-3 h-3" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Urban Radar Profile */}
        {activeTab === "radar" && (
          <div className="p-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Radar Chart */}
              <div className="lg:col-span-7 min-w-0 w-full h-[380px] flex items-center justify-center bg-slate-50/50 rounded-xl p-4 border border-slate-100">
                <ResponsiveContainer width="100%" height={360}>
                  <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="axis" stroke="#64748b" tick={{ fill: "#334155", fontSize: 11, fontWeight: 600 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbd5e1" />
                    <Radar
                      name="Project Performance"
                      dataKey="score"
                      stroke="#059669"
                      fill="#10b981"
                      fillOpacity={0.45}
                    />
                    <Radar
                      name="URDPFI Benchmark"
                      dataKey="benchmark"
                      stroke="#94a3b8"
                      fill="#cbd5e1"
                      fillOpacity={0.15}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              {/* Radar Score Breakdown */}
              <div className="lg:col-span-5 space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">
                    Multi-Domain Urban Fingerprint
                  </h3>
                  <p className="text-xs text-slate-500">
                    Radar axes aggregated from the 16 extracted spatial and environmental dimensions,
                    benchmarked against URDPFI 2026 guidelines.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {radarData.map((axis) => {
                    const diff = axis.score - axis.benchmark;
                    const isPositive = diff >= 0;

                    return (
                      <div key={axis.axis} className="p-3 bg-slate-50 rounded-lg border border-slate-100 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-800">{axis.axis}</div>
                          <div className="text-[11px] text-slate-400">
                            Target benchmark: {axis.benchmark}%
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-slate-900 font-mono">
                            {axis.score}%
                          </div>
                          <div className={`text-[10px] font-semibold ${isPositive ? "text-emerald-600" : "text-amber-600"}`}>
                            {isPositive ? `+${diff.toFixed(1)}% vs target` : `${diff.toFixed(1)}% vs target`}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: AI Liveability Weights & Sensitivity */}
        {activeTab === "weights" && (
          <div className="p-8 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  AI Liveability Model Weighting & Sensitivity
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Simulate how different municipal development priorities shift the composite urban liveability score.
                </p>
              </div>

              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center gap-4">
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">Composite Liveability</div>
                  <div className="text-3xl font-extrabold text-emerald-900 font-mono">{compositeLiveability}/100</div>
                </div>
                <div className="text-xs text-emerald-700 border-l border-emerald-200 pl-4">
                  <div>Grade: <span className="font-bold">{Number(compositeLiveability) >= 80 ? "A (High Liveability)" : "B+ (Adequate)"}</span></div>
                  <div className="text-[11px] text-emerald-600/80">URDPFI 2026 Compliant</div>
                </div>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold text-slate-600">Planning Presets:</span>
              <button
                onClick={() => setWeights({ morphology: 20, network: 25, diversity: 25, climate: 20, demographics: 10 })}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition"
              >
                URDPFI Baseline (Balanced)
              </button>
              <button
                onClick={() => setWeights({ morphology: 15, network: 35, diversity: 25, climate: 15, demographics: 10 })}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 transition"
              >
                Transit-Oriented Hub
              </button>
              <button
                onClick={() => setWeights({ morphology: 15, network: 15, diversity: 20, climate: 40, demographics: 10 })}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 transition"
              >
                Climate-Resilient Eco City
              </button>
              <button
                onClick={() => setWeights({ morphology: 10, network: 20, diversity: 35, climate: 15, demographics: 20 })}
                className="px-3 py-1 text-xs font-medium rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 transition"
              >
                Polycentric Mixed-Use Core
              </button>
            </div>

            {/* Sliders Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Spatial Morphology Weight</span>
                  <span className="font-mono text-indigo-600">{weights.morphology}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={weights.morphology}
                  onChange={(e) => setWeights({ ...weights, morphology: Number(e.target.value) })}
                  className="w-full accent-indigo-600"
                />
                <p className="text-[11px] text-slate-500">Polsby-Popper compactness, solidity, and regular boundary containment.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Network & Proximity Weight</span>
                  <span className="font-mono text-blue-600">{weights.network}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={weights.network}
                  onChange={(e) => setWeights({ ...weights, network: Number(e.target.value) })}
                  className="w-full accent-blue-600"
                />
                <p className="text-[11px] text-slate-500">Road network density, schools, hospitals, and transit coverage.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Urban Diversity (Entropy)</span>
                  <span className="font-mono text-emerald-600">{weights.diversity}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={weights.diversity}
                  onChange={(e) => setWeights({ ...weights, diversity: Number(e.target.value) })}
                  className="w-full accent-emerald-600"
                />
                <p className="text-[11px] text-slate-500">Shannon entropy index H and mixed-use functional distribution.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Climate & Resilience</span>
                  <span className="font-mono text-amber-600">{weights.climate}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={weights.climate}
                  onChange={(e) => setWeights({ ...weights, climate: Number(e.target.value) })}
                  className="w-full accent-amber-600"
                />
                <p className="text-[11px] text-slate-500">Solar potential, natural daylight, Lawson wind comfort, and acoustics.</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Socio-Demographics Weight</span>
                  <span className="font-mono text-purple-600">{weights.demographics}%</span>
                </div>
                <input
                  type="range"
                  min="5"
                  max="50"
                  value={weights.demographics}
                  onChange={(e) => setWeights({ ...weights, demographics: Number(e.target.value) })}
                  className="w-full accent-purple-600"
                />
                <p className="text-[11px] text-slate-500">Population density balance and infrastructure carrying capacity.</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Custom Mix Simulator & Boundary Ingestion */}
        {activeTab === "simulation" && (
          <div className="p-8">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 mb-1">
                    Stateless Feature Simulation Engine
                  </h3>
                  <p className="text-xs text-slate-500">
                    Experiment with custom demographic densities, URDPFI land-use distributions, and arbitrary GeoJSON polygons.
                  </p>
                </div>

                <button
                  onClick={() => setUseCustomGeo(!useCustomGeo)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition inline-flex items-center gap-1.5 ${
                    useCustomGeo ? "bg-indigo-50 border-indigo-200 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <FileCode2 className="w-3.5 h-3.5" />
                  {useCustomGeo ? "Using Custom GeoJSON" : "Paste Custom GeoJSON"}
                </button>
              </div>

              {useCustomGeo && (
                <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-200 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
                    <span>Custom Boundary GeoJSON Coordinates</span>
                    <span className="text-[11px] font-normal text-indigo-600">Polygon or FeatureCollection</span>
                  </div>
                  <textarea
                    rows={4}
                    value={customGeoJson}
                    onChange={(e) => setCustomGeoJson(e.target.value)}
                    placeholder='{"type": "Polygon", "coordinates": [[[73.85, 18.52], [73.86, 18.52], [73.86, 18.53], [73.85, 18.53], [73.85, 18.52]]]}'
                    className="w-full p-3 font-mono text-xs bg-white border border-indigo-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="text-[11px] text-slate-500">
                    Morphological indicators (compactness, solidity, and aspect ratio) will be re-computed live on this polygon geometry.
                  </p>
                </div>
              )}

              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-5">
                <div>
                  <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                    <span>Target Population Density (people / sq.km)</span>
                    <span className="font-mono text-emerald-600">{simDensity.toLocaleString()} ppl/km²</span>
                  </div>
                  <input
                    type="range"
                    min="2000"
                    max="25000"
                    step="500"
                    value={simDensity}
                    onChange={(e) => setSimDensity(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Residential Zone</span>
                      <span className="font-mono">{simResPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="70"
                      value={simResPct}
                      onChange={(e) => setSimResPct(Number(e.target.value))}
                      className="w-full accent-indigo-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Commercial Zone</span>
                      <span className="font-mono">{simComPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={simComPct}
                      onChange={(e) => setSimComPct(Number(e.target.value))}
                      className="w-full accent-blue-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Green & Recreational Parks</span>
                      <span className="font-mono">{simGreenPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={simGreenPct}
                      onChange={(e) => setSimGreenPct(Number(e.target.value))}
                      className="w-full accent-emerald-600"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-semibold text-slate-700 mb-1">
                      <span>Transportation & Roads</span>
                      <span className="font-mono">{simTransPct}%</span>
                    </div>
                    <input
                      type="range"
                      min="5"
                      max="30"
                      value={simTransPct}
                      onChange={(e) => setSimTransPct(Number(e.target.value))}
                      className="w-full accent-amber-600"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-slate-200 flex-wrap gap-3">
                  <div className="text-xs text-slate-500">
                    Total Land-Use Allocation: <span className="font-bold text-slate-700">{simResPct + simComPct + simGreenPct + simTransPct + simIndPct}%</span>
                  </div>
                  <button
                    onClick={handleSimulate}
                    disabled={simulating}
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-sm transition disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    <Sliders className={`w-3.5 h-3.5 ${simulating ? "animate-spin" : ""}`} />
                    {simulating ? "Extracting..." : "Simulate & Update Feature Vector"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Feature Details Modal */}
      <AnimatePresence>
        {detailFeature && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                      {detailFeature.domain}
                    </span>
                    <span className="text-xs font-mono text-slate-400">dim[{detailFeature.key}]</span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">{detailFeature.name}</h3>
                </div>
                <button
                  onClick={() => setDetailFeature(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
                {/* Score Banner */}
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-500 font-medium">Normalized ML Value [0, 1]</div>
                    <div className="text-3xl font-extrabold text-slate-900 font-mono">
                      {detailFeature.normalized?.toFixed(3) ?? "0.500"}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-slate-500 font-medium">Raw Measurement</div>
                    <div className="text-xl font-bold text-slate-700 font-mono">
                      {typeof detailFeature.raw_value === "number"
                        ? `${detailFeature.raw_value.toFixed(2)} ${detailFeature.unit}`
                        : `${detailFeature.raw_value ?? "N/A"} ${detailFeature.unit}`}
                    </div>
                  </div>
                </div>

                {/* Mathematical Formulation */}
                {FEATURE_FORMULAS[detailFeature.key] && (
                  <div className="space-y-3">
                    <div className="p-3.5 rounded-xl bg-indigo-50/60 border border-indigo-100 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900">
                        <Calculator className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Mathematical Formulation</span>
                      </div>
                      <div className="font-mono text-xs text-indigo-800 font-bold bg-white p-2 rounded border border-indigo-200/60">
                        {FEATURE_FORMULAS[detailFeature.key].formula}
                      </div>
                      <div className="text-[11px] text-indigo-700/80 pt-1">
                        {FEATURE_FORMULAS[detailFeature.key].interpretation}
                      </div>
                    </div>

                    {/* Benchmark Standards */}
                    <div className="p-3.5 rounded-xl bg-emerald-50/60 border border-emerald-100 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        <span>URDPFI Guideline Target</span>
                      </div>
                      <div className="text-xs font-semibold text-emerald-800">
                        {FEATURE_FORMULAS[detailFeature.key].benchmark}
                      </div>
                    </div>

                    {/* Planning Recommendation */}
                    <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Urban Design Action Plan</span>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {FEATURE_FORMULAS[detailFeature.key].recommendation}
                      </p>
                    </div>

                    {/* Downstream ML Influence */}
                    <div className="p-3.5 rounded-xl bg-purple-50/60 border border-purple-100 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-purple-900">
                        <Binary className="w-3.5 h-3.5 text-purple-600" />
                        <span>Downstream AI/ML Influence</span>
                      </div>
                      <p className="text-xs text-purple-800/90 leading-relaxed">
                        {FEATURE_FORMULAS[detailFeature.key].mlImpact}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                <button
                  onClick={() => setDetailFeature(null)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition"
                >
                  Close Specification
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
