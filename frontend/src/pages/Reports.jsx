import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText,
  Download,
  Eye,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Building2,
  Users,
  Map,
  Leaf,
  Cpu,
  AlertTriangle,
  Layers,
  Search,
  ChevronRight,
  ExternalLink,
  X,
  Printer,
  RefreshCw,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { generateReportPdf, downloadPdfBlob } from "@/lib/reportPdfEngine";

const REPORT_SECTIONS = [
  {
    key: "all",
    title: "Comprehensive Master Planning Dossier",
    desc: "Complete statutory multi-page dossier compiling all 8 chapters: summary, demographics, infrastructure, zoning, climate, ML features, and risks.",
    category: "governance",
    icon: Sparkles,
    iconColor: "text-emerald-700 bg-emerald-50 border-emerald-300",
    tags: ["Full Dossier", "All 8 Chapters", "Multi-Page PDF", "Statutory Package"],
    pageEstimate: "6 - 8 Pages",
  },
  {
    key: "summary",
    title: "Executive Planning Summary",
    desc: "Key performance indicators, overall liveability index, and multi-criteria score breakdown.",
    category: "governance",
    icon: FileText,
    iconColor: "text-indigo-600 bg-indigo-50 border-indigo-200",
    tags: ["KPIs", "Liveability Score", "URDPFI", "Site Metrics"],
    pageEstimate: "1 Page",
  },
  {
    key: "population",
    title: "Demographic & Population Dynamics",
    desc: "20-year horizon population forecast (2046), CAGR compound growth rate, and gross density modeling.",
    category: "governance",
    icon: Users,
    iconColor: "text-blue-600 bg-blue-50 border-blue-200",
    tags: ["2046 Horizon", "CAGR 3.2%", "Density Analysis", "Cohort Growth"],
    pageEstimate: "1 Page",
  },
  {
    key: "infrastructure",
    title: "URDPFI Infrastructure Fulfillment & Deficit",
    desc: "Statutory gap analysis across schools, tertiary healthcare, district parks, and civic utilities.",
    category: "zoning",
    icon: Building2,
    iconColor: "text-emerald-600 bg-emerald-50 border-emerald-200",
    tags: ["Schools", "Hospitals", "Colleges", "Parks", "Clinics", "Deficit Matrix"],
    pageEstimate: "1 - 2 Pages",
  },
  {
    key: "zoning",
    title: "Land Use Zoning & Spatial Allocation",
    desc: "Municipal zone distributions, hectare allotments, gross percentage splits, and permitted use codes.",
    category: "zoning",
    icon: Map,
    iconColor: "text-amber-600 bg-amber-50 border-amber-200",
    tags: ["Residential", "Commercial", "Green Space", "Public Utilities", "FAR"],
    pageEstimate: "1 Page",
  },
  {
    key: "sustainability",
    title: "Environmental Sustainability & Microclimate",
    desc: "Solar insolation harvest, embodied carbon benchmark, daylight autonomy, and Lawson wind comfort.",
    category: "climate",
    icon: Leaf,
    iconColor: "text-teal-600 bg-teal-50 border-teal-200",
    tags: ["Solar Potential", "Carbon Footprint", "Daylight Autonomy", "Wind Comfort"],
    pageEstimate: "1 Page",
  },
  {
    key: "features",
    title: "16-Dimensional ML Spatial Feature Matrix",
    desc: "Extracted spatial geometry, Polsby-Popper compactness, Shannon land-use entropy, and road network density.",
    category: "climate",
    icon: Cpu,
    iconColor: "text-purple-600 bg-purple-50 border-purple-200",
    tags: ["Shannon Entropy", "Polsby-Popper", "Road Density", "Transit Proximity", "16D Tensor"],
    pageEstimate: "1 - 2 Pages",
  },
  {
    key: "risks",
    title: "Urban Risk Register & Statutory Mitigation",
    desc: "Risk matrix assessing hydrological, traffic congestion, and environmental hazards with mitigation actions.",
    category: "risks",
    icon: AlertTriangle,
    iconColor: "text-rose-600 bg-rose-50 border-rose-200",
    tags: ["Risk Register", "Severity Ranking", "Statutory Mitigation", "Environmental Risks"],
    pageEstimate: "1 Page",
  },
  {
    key: "proposals",
    title: "Scenario Proposal Comparison",
    desc: "Multi-scenario design analysis comparing balanced growth vs eco-resilient polycentric development.",
    category: "risks",
    icon: Layers,
    iconColor: "text-sky-600 bg-sky-50 border-sky-200",
    tags: ["Scenario Planning", "Balanced vs Eco", "Comparative Scoring", "Trade-offs"],
    pageEstimate: "1 Page",
  },
];

const CATEGORIES = [
  { id: "all", label: "All Reports" },
  { id: "governance", label: "Governance & Overview" },
  { id: "zoning", label: "Zoning & Infrastructure" },
  { id: "climate", label: "Climate & AI Features" },
  { id: "risks", label: "Risks & Scenarios" },
];

export default function Reports() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [features, setFeatures] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & Search
  const [activeTab, setActiveTab] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Action states
  const [generatingKey, setGeneratingKey] = useState(null);
  const [previewData, setPreviewData] = useState(null); // { url, filename, title, blob }

  const loadData = useCallback(() => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.get(`/projects/${id}`),
      api.get(`/projects/${id}/features`).catch(() => ({ data: null })),
    ])
      .then(([projRes, featRes]) => {
        setProject(projRes.data);
        if (featRes && featRes.data) {
          setFeatures(featRes.data);
        }
      })
      .catch((err) => {
        console.error("Failed to load project details:", err);
        setError(err.response?.data?.detail || err.message || "Failed to load project");
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (previewData?.url) {
        URL.revokeObjectURL(previewData.url);
      }
    };
  }, [previewData]);

  // Handler for PDF generation and download
  const handleDownload = async (key) => {
    if (!project) return;
    setGeneratingKey(key);

    try {
      // Small tick to ensure UI state renders spinner
      await new Promise((res) => setTimeout(res, 50));
      const res = generateReportPdf(key, project, features);
      downloadPdfBlob(res.blob, res.filename, res.doc);
      toast.success(`${key === "all" ? "Master Planning Dossier" : "Report"} downloaded successfully`, {
        description: res.filename,
      });
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast.error("Failed to generate report", {
        description: err.message || "An unexpected error occurred during PDF rendering.",
      });
    } finally {
      setGeneratingKey(null);
    }
  };

  // Handler for PDF in-browser preview
  const handlePreview = async (key, title) => {
    if (!project) return;
    setGeneratingKey(`preview_${key}`);

    try {
      await new Promise((res) => setTimeout(res, 50));
      const res = generateReportPdf(key, project, features);
      setPreviewData({
        url: res.url,
        filename: res.filename,
        title: title || (key === "all" ? "Comprehensive Master Planning Dossier" : "Report Preview"),
        blob: res.blob,
        doc: res.doc,
      });
    } catch (err) {
      console.error("PDF preview generation failed:", err);
      toast.error("Could not generate preview", {
        description: err.message,
      });
    } finally {
      setGeneratingKey(null);
    }
  };

  // Close preview modal
  const handleClosePreview = () => {
    if (previewData?.url) {
      URL.revokeObjectURL(previewData.url);
    }
    setPreviewData(null);
  };

  // JSON export
  const handleExportJson = () => {
    if (!project) return;
    const payload = {
      project_id: project.id,
      name: project.name,
      exported_at: new Date().toISOString(),
      metadata: {
        site_area_sqkm: project.site_area_sqkm,
        location: project.location,
        population: project.population,
        score: project.score,
      },
      infrastructure: project.infrastructure,
      zones: project.zones,
      sustainability: project.sustainability,
      risks: project.risks,
      proposals: project.proposals,
      features: features || project.features_data || null,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const safeName = (project.name || "SmartScape_Project").replace(/[^a-zA-Z0-9_-]/g, "_");
    downloadPdfBlob(blob, `${safeName}_Planning_Data.json`);
    toast.success("Planning Dataset exported as JSON");
  };

  // Filtered reports list
  const filteredReports = useMemo(() => {
    return REPORT_SECTIONS.filter((r) => {
      const matchCat = activeTab === "all" || r.category === activeTab;
      const q = searchQuery.toLowerCase().trim();
      const matchSearch =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.desc.toLowerCase().includes(q) ||
        r.tags.some((t) => t.toLowerCase().includes(q));
      return matchCat && matchSearch;
    });
  }, [activeTab, searchQuery]);

  if (loading) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="flex items-center gap-3 text-slate-400 mb-4 animate-pulse">
          <div className="h-4 w-24 bg-slate-200 rounded" />
          <div className="h-4 w-4 bg-slate-200 rounded" />
          <div className="h-4 w-32 bg-slate-200 rounded" />
        </div>
        <div className="h-10 w-64 bg-slate-200 rounded mb-6 animate-pulse" />
        <div className="grid md:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-100 rounded-lg border border-slate-200 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="p-8 max-w-6xl mx-auto">
        <div className="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800">
          <div className="flex items-center gap-2 font-bold text-lg mb-2">
            <AlertCircle className="text-rose-600" /> Unable to load project reports
          </div>
          <p className="text-sm text-rose-700 mb-4">{error || "Project could not be found."}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-lg hover:bg-rose-700 transition-colors flex items-center gap-2"
          >
            <RefreshCw size={14} /> Retry
          </button>
        </div>
      </div>
    );
  }

  const overallScore = project.score?.overall || 70;
  const siteArea = project.site_area_sqkm || 24.5;
  const forecastPop = project.population?.forecast_population || 185000;

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto space-y-8">
      {/* Breadcrumb Navigation */}
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Link to="/projects" className="hover:text-slate-900 transition-colors">
          Projects
        </Link>
        <ChevronRight size={13} className="text-slate-400" />
        <Link to={`/projects/${id}`} className="hover:text-slate-900 transition-colors">
          {project.name}
        </Link>
        <ChevronRight size={13} className="text-slate-400" />
        <span className="text-slate-900 font-semibold">Statutory Reports & Dossiers</span>
      </div>

      {/* Header Banner & Metadata */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-200/80">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold tracking-wide bg-gradient-to-r from-sky-50 to-emerald-50 text-sky-800 border border-sky-200 flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-emerald-600" /> URDPFI 2026 Compliant
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600 border border-slate-200">
              A4 Vector Print Engine
            </span>
          </div>
          <h1 className="font-display font-black text-2xl lg:text-3xl text-slate-900 tracking-tight">
            Official Statutory Reports & Planning Dossiers
          </h1>
          <p className="text-slate-500 text-sm mt-1 max-w-2xl font-medium">
            Generate, preview, and download executive-grade documentation formatted with national URDPFI benchmarks,
            zoning allocation matrices, and 16D spatial machine learning tensors.
          </p>
        </div>

        {/* Quick Project Summary Badges & Export */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 p-2 rounded-xl">
            <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Site Area</div>
              <div className="font-display font-black text-sm text-slate-800">{siteArea} sq.km</div>
            </div>
            <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Target Pop (2046)</div>
              <div className="font-display font-black text-sm text-slate-800">{forecastPop.toLocaleString()}</div>
            </div>
            <div className="px-3 py-1 bg-white border border-slate-200 rounded-lg">
              <div className="text-[10px] text-slate-400 uppercase font-bold">Liveability Score</div>
              <div className="font-display font-black text-sm text-sky-600">{overallScore}/100</div>
            </div>
          </div>

          <button
            onClick={handleExportJson}
            className="h-10 px-3.5 rounded-xl bg-white hover:bg-sky-50/50 border border-slate-200 hover:border-sky-200 text-xs font-bold text-slate-700 transition-colors flex items-center gap-1.5 shadow-xs"
            title="Export complete planning dataset in JSON"
          >
            <FileText size={14} className="text-sky-600" /> Export JSON
          </button>
        </div>
      </div>

      {/* FILTER TABS & SEARCH BAR */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-2">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveTab(c.id)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                activeTab === c.id
                  ? "bg-gradient-to-r from-sky-600 via-blue-700 to-sky-700 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900"
              }`}
            >
              {c.label}
              {c.id === "all" && <span className="ml-1.5 text-[10px] opacity-75">({REPORT_SECTIONS.length})</span>}
            </button>
          ))}
        </div>

        {/* Search Bar */}
        <div className="relative w-full md:w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search reports or indicators…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* REPORT CARDS GRID */}
      <div className="grid md:grid-cols-2 gap-4">
        {filteredReports.map((r, i) => {
          const Icon = r.icon;
          const isGenDownload = generatingKey === r.key;
          const isGenPreview = generatingKey === `preview_${r.key}`;

          return (
            <motion.div
              key={r.key}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="border border-slate-200 hover:border-slate-300 bg-white rounded-xl p-5 flex flex-col justify-between shadow-xs hover:shadow-md transition-all group"
            >
              <div>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl grid place-items-center border ${r.iconColor}`}>
                      <Icon size={18} />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-base text-slate-900 group-hover:text-sky-600 transition-colors">
                        {r.title}
                      </h3>
                      <span className="text-[11px] font-medium text-slate-400">{r.pageEstimate}</span>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 uppercase tracking-wider">
                    {r.category}
                  </span>
                </div>

                <p className="text-xs text-slate-500 leading-relaxed mb-4">{r.desc}</p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {r.tags.map((t) => (
                    <span
                      key={t}
                      className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-slate-50 text-slate-600 border border-slate-200/80"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handlePreview(r.key, r.title)}
                  disabled={isGenPreview}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:border-sky-300 hover:text-sky-700 hover:bg-sky-50/50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
                >
                  {isGenPreview ? (
                    <RefreshCw size={13} className="animate-spin text-slate-400" />
                  ) : (
                    <Eye size={13} className="text-slate-500" />
                  )}
                  Preview
                </button>

                <button
                  onClick={() => handleDownload(r.key)}
                  disabled={isGenDownload}
                  className="h-8 px-3.5 rounded-lg bg-gradient-to-r from-sky-600 via-blue-700 to-emerald-600 hover:from-sky-500 hover:to-emerald-500 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
                >
                  {isGenDownload ? (
                    <>
                      <RefreshCw size={12} className="animate-spin" /> Rendering…
                    </>
                  ) : (
                    <>
                      <Download size={12} /> Download PDF
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {filteredReports.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-slate-200">
          <FileText className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-sm font-semibold text-slate-700">No reports matched your query</p>
          <p className="text-xs text-slate-400 mt-0.5">Try searching for keywords like "schools", "carbon", or "zoning".</p>
        </div>
      )}

      {/* Statutory Guidance Note */}
      <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 flex items-start gap-3">
        <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold text-slate-800">Statutory Compliance & Legal Admissibility</div>
          <div className="mt-0.5 text-slate-600 leading-relaxed">
            All PDF reports are generated client-side with native vector rendering conforming to the Town and Country
            Planning Organization (TCPO) guidelines. For Autodesk Forma bidirectional sync or GIS shapefile exports, visit
            the <Link to={`/projects/${id}/integrations`} className="text-emerald-700 font-semibold underline">Integrations</Link> hub.
          </div>
        </div>
      </div>

      {/* INTERACTIVE PDF PREVIEW MODAL */}
      <AnimatePresence>
        {previewData && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs">
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl h-[88vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="p-4 px-6 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 grid place-items-center">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="font-display font-bold text-sm text-white">{previewData.title}</h3>
                    <p className="text-[11px] text-slate-400">{previewData.filename}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadPdfBlob(previewData.blob, previewData.filename, previewData.doc)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download size={13} /> Save PDF
                  </button>
                  <button
                    onClick={handleClosePreview}
                    className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 grid place-items-center transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>

              {/* Embedded PDF Viewer */}
              <div className="flex-1 bg-slate-100 p-2 overflow-hidden">
                <iframe
                  src={previewData.url}
                  title="PDF Preview"
                  className="w-full h-full rounded-xl border border-slate-300 bg-white shadow-inner"
                />
              </div>

              {/* Modal Footer */}
              <div className="p-3 px-6 bg-white border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
                <span>Vector PDF rendering engine · SmartScape v2.4</span>
                <button
                  onClick={handleClosePreview}
                  className="px-4 py-1.5 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold transition-colors"
                >
                  Close Preview
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
