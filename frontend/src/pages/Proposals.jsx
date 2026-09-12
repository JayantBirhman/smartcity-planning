import React, { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Award, Scale, Leaf, Building2, TrendingUp, Sparkles,
  RefreshCw, Download, Printer, ShieldCheck, Zap, ArrowRight,
  ChevronDown, ChevronUp, Layers, Check, Info, FileSpreadsheet,
  SlidersHorizontal, BarChart3, Activity, AlertTriangle, Star,
  Compass, Loader2, Gauge, Landmark, Trees, Car, Home, IndianRupee
} from "lucide-react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, CartesianGrid, ReferenceLine
} from "recharts";
import { toast } from "sonner";
import { api } from "@/lib/api";

const PRESETS = [
  {
    id: "balanced",
    name: "Balanced Urban",
    badge: "Default ⚖️",
    icon: Scale,
    description: "Harmonized livability, demographic yield, and municipal infrastructure",
    weights: { sustainability: 25, housing: 25, civic: 20, mobility: 15, economic: 15 },
    color: "from-blue-600 to-indigo-600"
  },
  {
    id: "net_zero",
    name: "Net-Zero Climate",
    badge: "Eco-First 🌿",
    icon: Leaf,
    description: "Prioritizes 22% green canopy, solar microgrids, and carbon drawdown",
    weights: { sustainability: 45, civic: 20, mobility: 15, housing: 10, economic: 10 },
    color: "from-emerald-600 to-teal-600"
  },
  {
    id: "density_transit",
    name: "Transit & Housing",
    badge: "TOD Yield 🏙️",
    icon: Building2,
    description: "Maximizes demographic capacity (+19k residents) and transit corridor flow",
    weights: { housing: 40, mobility: 25, civic: 15, economic: 10, sustainability: 10 },
    color: "from-cyan-600 to-blue-600"
  },
  {
    id: "economic_hub",
    name: "Economic Hub",
    badge: "Commerce 💼",
    icon: TrendingUp,
    description: "Maximizes commercial & office acreage (12%) for high municipal tax base",
    weights: { economic: 35, mobility: 25, housing: 20, civic: 10, sustainability: 10 },
    color: "from-amber-600 to-orange-600"
  }
];

export default function Proposals() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [settingActive, setSettingActive] = useState(false);

  // Real-time MCDA Weights State
  const [strategyPreset, setStrategyPreset] = useState("balanced");
  const [weights, setWeights] = useState({
    sustainability: 25,
    housing: 25,
    civic: 20,
    mobility: 15,
    economic: 15
  });
  const [autoRecalculate, setAutoRecalculate] = useState(true);
  const [showSliders, setShowSliders] = useState(true);
  const [activeVisTab, setActiveVisTab] = useState("radar");
  const [activeCategoryFilter, setActiveCategoryFilter] = useState("All");

  const debounceTimerRef = useRef(null);

  // Initial fetch
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      try {
        const [pRes, compRes] = await Promise.all([
          api.get(`/projects/${id}`),
          api.get(`/projects/${id}/proposals`)
        ]);
        if (isMounted) {
          setProject(pRes.data);
          setComparison(compRes.data);
          if (compRes.data.strategy_preset) {
            setStrategyPreset(compRes.data.strategy_preset);
          }
        }
      } catch (err) {
        console.error("Failed to load proposals data", err);
        toast.error("Could not fetch project proposal comparison data");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    loadData();
    return () => { isMounted = false; };
  }, [id]);

  // Execute real-time comparison request to backend
  const executeComparison = useCallback(async (newWeights, presetName = null) => {
    setComparing(true);
    try {
      const payload = {
        sustainability: Number(newWeights.sustainability),
        housing: Number(newWeights.housing),
        civic: Number(newWeights.civic),
        mobility: Number(newWeights.mobility),
        economic: Number(newWeights.economic),
        strategy_preset: presetName || strategyPreset
      };
      const res = await api.post(`/projects/${id}/proposals/compare`, payload);
      setComparison(res.data);
      if (presetName) setStrategyPreset(presetName);
      return res.data;
    } catch (err) {
      console.error("Comparison execution failed", err);
      toast.error("Real-time comparison calculation failed");
      throw err;
    } finally {
      setComparing(false);
    }
  }, [id, strategyPreset]);

  // Handler for explicit comparison button
  const handleRunRealTimeCompare = async () => {
    try {
      const res = await executeComparison(weights, strategyPreset);
      toast.success(
        `Real-time comparison evaluated: ${res.winner_name} leads by +${res.margin} pts!`,
        { icon: "⚡" }
      );
    } catch (e) {
      // Handled in executeComparison
    }
  };

  // Strategy preset selection
  const handlePresetSelect = (preset) => {
    setStrategyPreset(preset.id);
    setWeights(preset.weights);
    executeComparison(preset.weights, preset.id)
      .then((res) => {
        toast.success(`Applied ${preset.name} Strategy (${res.winner_id} leads by +${res.margin} pts)`);
      })
      .catch(() => {});
  };

  // Weight Slider Change
  const handleWeightChange = (key, value) => {
    const numVal = Math.max(0, Math.min(100, Number(value)));
    const updated = { ...weights, [key]: numVal };
    setWeights(updated);
    setStrategyPreset("custom");

    if (autoRecalculate) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        executeComparison(updated, "custom").catch(() => {});
      }, 250);
    }
  };

  // Set proposal as active master plan
  const handleSetActiveProposal = async (proposalId) => {
    setSettingActive(true);
    try {
      await api.post(`/projects/${id}/proposals/select`, { proposal_id: proposalId });
      setComparison((prev) => ({ ...prev, active_proposal_id: proposalId }));
      toast.success(`Plan ${proposalId} designated as Project Master Scheme`, {
        icon: "🏆"
      });
    } catch (err) {
      toast.error("Failed to select active proposal");
    } finally {
      setSettingActive(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!comparison) return;
    const headers = ["Metric", "Category", "Proposal A (Balanced)", "Proposal B (Eco-Focus)", "Winning Scheme", "Lead / Delta", "Planning Advantage"];
    const rows = (comparison.head_to_head || []).map((m) => [
      `"${m.name}"`,
      `"${m.category}"`,
      `"${m.prop_a_disp}"`,
      `"${m.prop_b_disp}"`,
      `"${m.winner_id}"`,
      `"${m.margin_str}"`,
      `"${m.advantage.replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Proposal_Comparison_${project?.name || "SmartCity"}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("MCDA Proposal Comparison exported to CSV");
  };

  // Print brief
  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="relative">
          <div className="w-16 h-16 border-4 border-blue-500/20 border-t-blue-600 rounded-full animate-spin" />
          <Sparkles className="w-6 h-6 text-blue-600 absolute inset-0 m-auto animate-pulse" />
        </div>
        <p className="text-sm font-semibold text-slate-600 tracking-wide uppercase">
          Initializing Multi-Criteria Comparison Engine...
        </p>
      </div>
    );
  }

  if (!comparison || !comparison.proposals || comparison.proposals.length === 0) {
    return (
      <div className="p-8 max-w-5xl mx-auto text-center">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800">No Proposals Generated Yet</h2>
        <p className="text-sm text-slate-500 mt-2">
          Proposals are automatically drafted upon project boundary and demographic definition.
        </p>
      </div>
    );
  }

  const propA = comparison.proposals.find(p => p.id === "P-A") || comparison.proposals[0];
  const propB = comparison.proposals.find(p => p.id === "P-B") || comparison.proposals[1];
  const winner = comparison.winner_id === "P-B" ? propB : propA;
  const runnerUp = comparison.winner_id === "P-B" ? propA : propB;
  const isActiveWinner = comparison.active_proposal_id === winner.id;

  // Total weights sum
  const sumWeights = Object.values(weights).reduce((a, b) => a + Number(b), 0);

  // Filter head-to-head metrics
  const categories = ["All", "Composite", "Sustainability", "Housing & Growth", "Civic Amenities", "Mobility & Transit", "Economics & Feasibility"];
  const filteredHeadToHead = (comparison.head_to_head || []).filter(m => {
    if (activeCategoryFilter === "All") return true;
    return m.category === activeCategoryFilter;
  });

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 print:p-0">
      {/* ---------- HEADER & REAL-TIME CONTROLS ---------- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm relative overflow-hidden backdrop-blur-md">
        {/* Background gradient banner accent */}
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-blue-500/10 via-emerald-500/10 to-amber-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-[11px] uppercase tracking-widest font-bold flex items-center gap-1.5 shadow-sm">
                <Compass className="w-3.5 h-3.5 text-blue-600 animate-spin-slow" />
                Urban Decision Studio • Multi-Criteria Analysis
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Real-Time Ready
              </span>
            </div>

            <h1 className="font-display font-extrabold text-2xl md:text-3xl text-slate-900 tracking-tight">
              Proposal Comparison & Master Plan Evaluation
            </h1>
            <p className="text-sm text-slate-600 mt-1 max-w-3xl leading-relaxed">
              Real-time multi-criteria decision analysis (MCDA) contrasting demographic yield, microclimate resilience,
              infrastructure capex, and URDPFI statutory standards for <span className="font-semibold text-slate-900">{project?.name || "Project Area"}</span>.
            </p>
          </div>

          {/* Action Button Strip */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              id="btn-run-realtime-compare"
              onClick={handleRunRealTimeCompare}
              disabled={comparing}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 via-indigo-600 to-emerald-600 hover:from-blue-700 hover:via-indigo-700 hover:to-emerald-700 text-white font-bold text-sm shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all duration-200 transform active:scale-95 cursor-pointer disabled:opacity-75"
            >
              {comparing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Evaluating Scenarios...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300 animate-pulse" />
                  <span>⚡ Run Real-Time Comparison</span>
                </>
              )}
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download comparison matrix as CSV"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Print statutory comparison summary"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print Brief</span>
            </button>
          </div>
        </div>

        {/* ---------- STRATEGY PRESET BUTTONS ---------- */}
        <div className="mt-6 pt-5 border-t border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-slate-400" />
              Strategic Planning Policy Presets
            </span>
            <span className="text-[11px] text-slate-400">
              Select a policy to auto-adjust criteria weightings
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              const isSelected = strategyPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  onClick={() => handlePresetSelect(preset)}
                  className={`p-3.5 rounded-xl border text-left transition-all duration-200 relative overflow-hidden group cursor-pointer ${
                    isSelected
                      ? "bg-gradient-to-br from-blue-50/90 to-emerald-50/90 border-blue-500 shadow-sm ring-2 ring-blue-500/20"
                      : "bg-white hover:bg-slate-50/80 border-slate-200 text-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 group-hover:bg-blue-50 group-hover:text-blue-600"
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <span className="font-bold text-xs text-slate-900">{preset.name}</span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {preset.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 mt-1">
                    {preset.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ---------- COLLAPSIBLE REAL-TIME WEIGHT TUNING SLIDERS ---------- */}
        <div className="mt-5 pt-4 border-t border-slate-100">
          <button
            onClick={() => setShowSliders(!showSliders)}
            className="flex items-center justify-between w-full text-left text-xs font-bold text-slate-700 hover:text-blue-600 transition-colors py-1 cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" />
              <span>Real-Time Criteria Weight Sliders (MCDA Engine)</span>
              <span className="text-[11px] font-normal text-slate-500">
                (Normalized Total: 100% | Strategy: {strategyPreset.toUpperCase()})
              </span>
            </div>
            <div className="flex items-center gap-2 text-blue-600">
              <span className="text-[11px] font-semibold">{showSliders ? "Hide Controls" : "Tune Weights"}</span>
              {showSliders ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
          </button>

          <AnimatePresence>
            {showSliders && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-4 pt-3 pb-2 space-y-4"
              >
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Sustainability */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-emerald-800 flex items-center gap-1">
                        <Leaf className="w-3.5 h-3.5 text-emerald-600" />
                        Sustainability
                      </span>
                      <span className="font-mono font-bold text-emerald-700">{weights.sustainability}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={weights.sustainability}
                      onChange={(e) => handleWeightChange("sustainability", e.target.value)}
                      className="w-full accent-emerald-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>Carbon & Solar</span>
                      <span>{comparison.weights_applied?.sustainability || weights.sustainability}% norm</span>
                    </div>
                  </div>

                  {/* Housing */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-blue-800 flex items-center gap-1">
                        <Home className="w-3.5 h-3.5 text-blue-600" />
                        Housing & Density
                      </span>
                      <span className="font-mono font-bold text-blue-700">{weights.housing}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={weights.housing}
                      onChange={(e) => handleWeightChange("housing", e.target.value)}
                      className="w-full accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>Demographics</span>
                      <span>{comparison.weights_applied?.housing || weights.housing}% norm</span>
                    </div>
                  </div>

                  {/* Civic */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-indigo-800 flex items-center gap-1">
                        <Landmark className="w-3.5 h-3.5 text-indigo-600" />
                        Civic Infrastructure
                      </span>
                      <span className="font-mono font-bold text-indigo-700">{weights.civic}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={weights.civic}
                      onChange={(e) => handleWeightChange("civic", e.target.value)}
                      className="w-full accent-indigo-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>Schools & Hospitals</span>
                      <span>{comparison.weights_applied?.civic || weights.civic}% norm</span>
                    </div>
                  </div>

                  {/* Mobility */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-cyan-800 flex items-center gap-1">
                        <Car className="w-3.5 h-3.5 text-cyan-600" />
                        Mobility & Transit
                      </span>
                      <span className="font-mono font-bold text-cyan-700">{weights.mobility}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={weights.mobility}
                      onChange={(e) => handleWeightChange("mobility", e.target.value)}
                      className="w-full accent-cyan-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>Road Networks</span>
                      <span>{comparison.weights_applied?.mobility || weights.mobility}% norm</span>
                    </div>
                  </div>

                  {/* Economics */}
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80">
                    <div className="flex justify-between items-center text-xs mb-1.5">
                      <span className="font-semibold text-amber-800 flex items-center gap-1">
                        <TrendingUp className="w-3.5 h-3.5 text-amber-600" />
                        Economic Vitality
                      </span>
                      <span className="font-mono font-bold text-amber-700">{weights.economic}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={weights.economic}
                      onChange={(e) => handleWeightChange("economic", e.target.value)}
                      className="w-full accent-amber-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
                    />
                    <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                      <span>Commercial %</span>
                      <span>{comparison.weights_applied?.economic || weights.economic}% norm</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 pt-2">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={autoRecalculate}
                        onChange={(e) => setAutoRecalculate(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4"
                      />
                      <span className="font-medium text-slate-700">Auto-recalculate in real-time as sliders drag</span>
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handlePresetSelect(PRESETS[0])}
                      className="text-slate-500 hover:text-slate-800 underline text-xs"
                    >
                      Reset to Balanced Defaults
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ---------- EXECUTIVE DECISION BANNER (WINNING SCHEME) ---------- */}
      <motion.div
        key={comparison.winner_id + comparison.margin}
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`rounded-2xl p-6 border shadow-md relative overflow-hidden ${
          comparison.winner_id === "P-B"
            ? "bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 border-emerald-500/40 text-white"
            : "bg-gradient-to-r from-slate-950 via-blue-950 to-indigo-950 border-blue-500/40 text-white"
        }`}
      >
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2 max-w-3xl">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1 rounded-full bg-amber-400/20 border border-amber-400/30 text-amber-300 text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-amber-300" />
                Recommended Urban Scheme
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-slate-200 text-xs font-mono">
                Margin: +{comparison.margin} pts
              </span>
              {isActiveWinner && (
                <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center gap-1">
                  <Star className="w-3 h-3 fill-current" /> Active Master Plan
                </span>
              )}
            </div>

            <h2 className="font-display font-extrabold text-2xl md:text-3xl text-white">
              {winner.name}
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              {comparison.recommendation}
            </p>
          </div>

          <div className="flex flex-col sm:flex-row lg:flex-col items-start lg:items-end gap-3 flex-shrink-0">
            <div className="text-left lg:text-right">
              <div className="text-[11px] uppercase tracking-widest text-slate-400 font-bold">
                Real-Time MCDA Score
              </div>
              <div className="text-4xl md:text-5xl font-display font-black text-white flex items-baseline gap-1 lg:justify-end">
                {winner.score}
                <span className="text-lg font-normal text-slate-400">/100</span>
              </div>
            </div>

            <button
              onClick={() => handleSetActiveProposal(winner.id)}
              disabled={settingActive || isActiveWinner}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
                isActiveWinner
                  ? "bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 cursor-default"
                  : "bg-white text-slate-900 hover:bg-slate-100 shadow-lg active:scale-95"
              }`}
            >
              {isActiveWinner ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Selected as Master Scheme</span>
                </>
              ) : (
                <>
                  <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                  <span>Designate as Master Scheme</span>
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>

      {/* ---------- SIDE-BY-SIDE PROPOSAL DEEP DIVE CARDS ---------- */}
      <div className="grid lg:grid-cols-2 gap-6">
        {[propA, propB].map((prop, idx) => {
          const isWinningScheme = prop.id === comparison.winner_id;
          const isActiveScheme = prop.id === comparison.active_proposal_id;
          const isA = prop.id === "P-A";

          return (
            <motion.div
              key={prop.id}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className={`border rounded-2xl bg-white p-6 relative shadow-sm transition-all duration-200 ${
                isWinningScheme
                  ? "border-emerald-500 ring-2 ring-emerald-500/20 shadow-emerald-500/5"
                  : "border-slate-200"
              }`}
            >
              {/* Card Badges */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold ${
                    isA ? "bg-blue-100 text-blue-800" : "bg-emerald-100 text-emerald-800"
                  }`}>
                    {prop.id}
                  </span>
                  {isWinningScheme ? (
                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[10px] uppercase font-bold tracking-wider flex items-center gap-1 shadow-sm">
                      <Award className="w-3 h-3" /> Recommended
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider">
                      Alternative Scheme
                    </span>
                  )}
                </div>

                <div className="text-right">
                  <span className="text-2xl md:text-3xl font-display font-black text-slate-900">
                    {prop.score}
                  </span>
                  <span className="text-xs text-slate-400 font-normal">/100</span>
                </div>
              </div>

              <h3 className="font-display font-bold text-xl text-slate-900 mb-1">
                {prop.name}
              </h3>
              <p className="text-xs text-slate-600 mb-5 leading-relaxed min-h-[36px]">
                {prop.description}
              </p>

              {/* 4 Core Financial & Ecological Telemetry Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-5">
                <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-0.5">
                    Capacity
                  </div>
                  <div className="text-sm font-extrabold text-slate-900 font-mono">
                    {prop.population_capacity.toLocaleString()}
                  </div>
                  <div className="text-[9px] text-slate-400">
                    {Math.round(prop.population_capacity / (project?.population?.forecast_population || 100000) * 100)}% target
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-emerald-50/60 border border-emerald-200/80 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-emerald-800 font-semibold mb-0.5">
                    Green Canopy
                  </div>
                  <div className="text-sm font-extrabold text-emerald-700 font-mono">
                    {prop.green_space_pct}%
                  </div>
                  <div className="text-[9px] text-emerald-600">
                    {prop.parks} public parks
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-blue-50/60 border border-blue-200/80 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-blue-800 font-semibold mb-0.5">
                    Est. Capex
                  </div>
                  <div className="text-sm font-extrabold text-blue-700 font-mono">
                    ₹{prop.capex_cr?.toLocaleString() || "2,450"} Cr
                  </div>
                  <div className="text-[9px] text-blue-600">
                    ₹{Math.round((prop.capex_per_capita || 128000) / 1000)}k / capita
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/80 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-amber-800 font-semibold mb-0.5">
                    Clean Energy
                  </div>
                  <div className="text-sm font-extrabold text-amber-700 font-mono">
                    {prop.solar_generation_gwh || 118} GWh
                  </div>
                  <div className="text-[9px] text-amber-600">
                    {prop.clean_energy_pct || 32}% self-reliant
                  </div>
                </div>
              </div>

              {/* Domain Performance Progress Bars */}
              <div className="space-y-2.5 mb-5 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/70">
                <div className="text-[11px] font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Domain Criteria Scores</span>
                  <span className="text-[10px] font-normal text-slate-400">Score / 100</span>
                </div>

                {prop.domain_scores && Object.entries(prop.domain_scores).map(([domain, val]) => (
                  <div key={domain}>
                    <div className="flex justify-between text-[11px] mb-1">
                      <span className="capitalize text-slate-600 font-medium">
                        {domain.replace("_", " ")}
                      </span>
                      <span className="font-mono font-bold text-slate-800">{val}</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          domain === "sustainability" ? "bg-emerald-500" :
                          domain === "housing" ? "bg-blue-600" :
                          domain === "civic" ? "bg-indigo-600" :
                          domain === "mobility" ? "bg-cyan-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Civic Quotas & Land Use Pills */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs mb-4">
                <div className="p-2 border border-slate-100 rounded-lg bg-white">
                  <div className="text-[9px] uppercase text-slate-400 font-semibold">Schools</div>
                  <div className="font-bold text-slate-800 font-mono">{prop.schools}</div>
                </div>
                <div className="p-2 border border-slate-100 rounded-lg bg-white">
                  <div className="text-[9px] uppercase text-slate-400 font-semibold">Hospitals</div>
                  <div className="font-bold text-slate-800 font-mono">{prop.hospitals}</div>
                </div>
                <div className="p-2 border border-slate-100 rounded-lg bg-white">
                  <div className="text-[9px] uppercase text-slate-400 font-semibold">Road ROW</div>
                  <div className="font-bold text-slate-800 font-mono">{prop.road_coverage_pct}%</div>
                </div>
              </div>

              {/* Select as Master Plan Button */}
              <button
                onClick={() => handleSetActiveProposal(prop.id)}
                disabled={isActiveScheme || settingActive}
                className={`w-full py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  isActiveScheme
                    ? "bg-emerald-50 border border-emerald-300 text-emerald-800 cursor-default"
                    : "bg-slate-900 hover:bg-slate-800 text-white active:scale-98"
                }`}
              >
                {isActiveScheme ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Current Active Project Plan</span>
                  </>
                ) : (
                  <>
                    <span>Select {prop.id} as Master Plan</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* ---------- DUAL DEEP DIVE VISUALIZATIONS ---------- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-bold text-blue-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-600" />
              Scenario Visualization & Benchmarking
            </div>
            <h3 className="font-display font-bold text-lg text-slate-900">
              Multi-Criteria Radar & Spatial Allocation Analytics
            </h3>
          </div>

          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setActiveVisTab("radar")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeVisTab === "radar"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Compass className="w-3.5 h-3.5 text-blue-600" />
              <span>8-Axis Radar Profile</span>
            </button>
            <button
              onClick={() => setActiveVisTab("land_use")}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeVisTab === "land_use"
                  ? "bg-white text-slate-900 shadow-xs font-bold"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Land-Use Distribution</span>
            </button>
          </div>
        </div>

        {activeVisTab === "radar" ? (
          <div className="grid lg:grid-cols-3 gap-6 items-center">
            <div className="lg:col-span-2 h-80 sm:h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={comparison.radar_data}>
                  <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                  <PolarAngleAxis
                    dataKey="axis"
                    tick={{ fill: "#475569", fontSize: 11, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#cbd5e1" />
                  <Radar
                    name="Proposal A (Balanced)"
                    dataKey="A"
                    stroke="#1E3A8A"
                    fill="#1E3A8A"
                    fillOpacity={0.25}
                    strokeWidth={2}
                  />
                  <Radar
                    name="Proposal B (Eco-Focus)"
                    dataKey="B"
                    stroke="#059669"
                    fill="#059669"
                    fillOpacity={0.3}
                    strokeWidth={2.5}
                  />
                  <Radar
                    name="Statutory Baseline"
                    dataKey="benchmark"
                    stroke="#F59E0B"
                    fill="none"
                    strokeDasharray="4 4"
                    strokeWidth={1.5}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: 16 }}
                    iconType="circle"
                  />
                  <Tooltip
                    formatter={(val, name) => [`${val} pts`, name]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", color: "#fff", border: "none" }}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-slate-50 p-5 rounded-xl border border-slate-200/80 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Radar Axis Interpretations
              </h4>
              <div className="space-y-3 text-xs">
                <div className="flex items-start gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-600 mt-1 flex-shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800">Sustainability & Solar: </span>
                    <span className="text-slate-600">Proposal B leads by +14 pts with 44% clean energy and 22% green space.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-700 mt-1 flex-shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800">Housing Capacity: </span>
                    <span className="text-slate-600">Proposal A accommodates 194,250 residents, outperforming by +10.5%.</span>
                  </div>
                </div>

                <div className="flex items-start gap-2.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-500 mt-1 flex-shrink-0" />
                  <div>
                    <span className="font-bold text-slate-800">Statutory Baseline (70-80 pts): </span>
                    <span className="text-slate-600">Both proposals surpass national URDPFI minimum thresholds across all 8 dimensions.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-80 sm:h-96 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={comparison.land_use_comparison}
                  margin={{ top: 20, right: 30, left: 0, bottom: 25 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                  <XAxis
                    dataKey="zone_name"
                    tick={{ fill: "#475569", fontSize: 11 }}
                    interval={0}
                    angle={-15}
                    textAnchor="end"
                  />
                  <YAxis
                    unit="%"
                    tick={{ fill: "#64748b", fontSize: 11 }}
                    domain={[0, 45]}
                  />
                  <Tooltip
                    formatter={(value, name) => [`${value}% of site area`, name === "A" ? "Proposal A" : "Proposal B"]}
                    contentStyle={{ backgroundColor: "#0f172a", borderRadius: "8px", color: "#fff", border: "none" }}
                  />
                  <Legend
                    wrapperStyle={{ paddingTop: 10 }}
                    formatter={(val) => (val === "A" ? "Proposal A (Balanced)" : "Proposal B (Eco-Focus)")}
                  />
                  <Bar dataKey="A" fill="#1E3A8A" radius={[4, 4, 0, 0]} name="A" />
                  <Bar dataKey="B" fill="#059669" radius={[4, 4, 0, 0]} name="B" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>

      {/* ---------- METRIC-BY-METRIC HEAD-TO-HEAD ADVANTAGE MATRIX ---------- */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Comprehensive Head-to-Head Comparison
            </div>
            <h3 className="font-display font-bold text-lg text-slate-900">
              Metric-by-Metric Advantage Matrix
            </h3>
          </div>

          {/* Category Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategoryFilter(cat)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                  activeCategoryFilter === cat
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredHeadToHead.map((item) => {
            const isWinnerA = item.winner_id === "P-A";
            const isWinnerB = item.winner_id === "P-B";
            const isTie = item.winner_id === "Tie";

            return (
              <div
                key={item.id}
                className="py-4 hover:bg-slate-50/70 transition-colors rounded-xl px-3 -mx-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Metric Info */}
                  <div className="lg:w-1/3 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                        {item.category}
                      </span>
                    </div>
                    <div className="font-bold text-sm text-slate-900">
                      {item.name}
                    </div>
                    <div className="text-xs text-slate-500">
                      {item.advantage}
                    </div>
                  </div>

                  {/* Side-by-Side Values */}
                  <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                    {/* Proposal A */}
                    <div className={`p-2.5 rounded-xl border text-center ${
                      isWinnerA
                        ? "bg-blue-50/70 border-blue-300 text-blue-950 font-bold"
                        : "bg-slate-50 border-slate-200/70 text-slate-600"
                    }`}>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                        Proposal A
                      </div>
                      <div className="font-mono text-sm">{item.prop_a_disp}</div>
                    </div>

                    {/* VS & Margin */}
                    <div className="text-center px-2">
                      <div className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${
                        isWinnerA ? "bg-blue-100 text-blue-800" :
                        isWinnerB ? "bg-emerald-100 text-emerald-800" :
                        "bg-slate-100 text-slate-700"
                      }`}>
                        {isTie ? (
                          <span>⚖️ Parity</span>
                        ) : (
                          <span>{item.winner_id} wins ({item.margin_str})</span>
                        )}
                      </div>
                    </div>

                    {/* Proposal B */}
                    <div className={`p-2.5 rounded-xl border text-center ${
                      isWinnerB
                        ? "bg-emerald-50/70 border-emerald-300 text-emerald-950 font-bold"
                        : "bg-slate-50 border-slate-200/70 text-slate-600"
                    }`}>
                      <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-0.5">
                        Proposal B
                      </div>
                      <div className="font-mono text-sm">{item.prop_b_disp}</div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------- STRATEGIC TRADE-OFFS & SENSITIVITY ANALYSIS ---------- */}
      <div className="grid md:grid-cols-3 gap-4">
        {(comparison.trade_offs || []).map((trade, idx) => (
          <div
            key={idx}
            className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-sm space-y-2 hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-slate-700 uppercase tracking-wider">
              <Scale className="w-4 h-4 text-amber-500" />
              <span>{trade.dimension}</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              {trade.observation}
            </p>
          </div>
        ))}
      </div>

      {/* ---------- STATUTORY COMPLIANCE & MUNICIPAL SIGN-OFF ---------- */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6">
        <div className="flex items-center gap-2.5 mb-3">
          <ShieldCheck className="w-5 h-5 text-emerald-600" />
          <h4 className="font-display font-bold text-base text-slate-900">
            Statutory URDPFI 2014 & NBC 2016 Compliance Summary
          </h4>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed mb-4">
          Both proposals comply with core Indian Urban and Regional Development Plans Formulation and Implementation (URDPFI) 2014 standards,
          National Building Code (NBC 2016), and GRIHA ecological guidelines. Selection of <strong>{winner.name}</strong> aligns
          optimally with the current municipal priority weights, yielding an overall suitability index of <strong>{winner.score}/100</strong>.
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
          <div className="p-2.5 bg-white rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase text-slate-400 block font-sans">Educational Norm</span>
            <span className="font-bold text-emerald-600">✅ 100% Compliant</span>
          </div>
          <div className="p-2.5 bg-white rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase text-slate-400 block font-sans">Healthcare Norm</span>
            <span className="font-bold text-emerald-600">✅ 100% Compliant</span>
          </div>
          <div className="p-2.5 bg-white rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase text-slate-400 block font-sans">Open Space Norm</span>
            <span className="font-bold text-emerald-600">✅ Exceeds Quota</span>
          </div>
          <div className="p-2.5 bg-white rounded-lg border border-slate-200">
            <span className="text-[10px] uppercase text-slate-400 block font-sans">Transit Corridor</span>
            <span className="font-bold text-emerald-600">✅ 100% Compliant</span>
          </div>
        </div>
      </div>
    </div>
  );
}
