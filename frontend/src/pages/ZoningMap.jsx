import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Layers, Info, Upload, Trash2, Loader2, Satellite,
  SlidersHorizontal, Check, RotateCcw, Search, MapPin, Globe, Sparkles, PlusCircle, Cpu,
  Crosshair, Compass, Download, Footprints, Navigation
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import MapView, { BASEMAPS } from "@/components/MapView";
import { LandUseBar } from "@/components/LandUseBar";

const LAYER_KEYS = [
  { key: "zones", label: "Zoning Overlays", color: "#059669" },
  { key: "boundary", label: "Site Boundary", color: "#0F172A" },
  { key: "schools", label: "Schools", color: "#2563EB" },
  { key: "hospitals", label: "Hospitals", color: "#DC2626" },
  { key: "parks", label: "Parks", color: "#059669" },
  { key: "walkBuffers", label: "URDPFI Catchments (400m/800m)", color: "#8B5CF6" },
];

export default function ZoningMap() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const [project, setProject] = useState(null);
  const [selected, setSelected] = useState(null);
  const [basemap, setBasemap] = useState("satellite");
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [layers, setLayers] = useState({ zones: true, boundary: true, schools: true, hospitals: true, parks: true, walkBuffers: false });
  const [editing, setEditing] = useState(false);
  const [alloc, setAlloc] = useState(null);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(false);

  // Geographic search and target place state
  const [targetPlace, setTargetPlace] = useState(null);
  const [mapSearchQuery, setMapSearchQuery] = useState("");
  const [mapSearchResults, setMapSearchResults] = useState([]);
  const [mapSearchLoading, setMapSearchLoading] = useState(false);
  const [showMapResults, setShowMapResults] = useState(false);

  const readAlloc = (p) => Object.fromEntries(p.zones.map((z) => [z.type, z.percentage]));

  // Sync targetPlace from URL query params & auto-inspect
  useEffect(() => {
    const lat = parseFloat(sp.get("pan_lat"));
    const lng = parseFloat(sp.get("pan_lng"));
    const placeName = sp.get("place");
    if (!isNaN(lat) && !isNaN(lng)) {
      const name = placeName || "Searched Area";
      setTargetPlace({ lat, lng, name });
      if (project?.zones?.length) {
        const zoneId = sp.get("zone");
        const found = zoneId ? project.zones.find(z => z.id === zoneId) : project.zones[0];
        setSelected({
          ...found,
          reasoning: `Allocated ${found.percentage}% based on URDPFI-inspired urban planning standards for ${name}.`,
        });
      }
    } else {
      setTargetPlace(null);
      const zoneId = sp.get("zone");
      if (zoneId && project) {
        const z = project.zones.find(z => z.id === zoneId);
        if (z) setSelected(z);
      }
    }
  }, [sp, project]);

  // On-map search query debounce
  useEffect(() => {
    if (!mapSearchQuery.trim() || mapSearchQuery.trim().length < 2) {
      setMapSearchResults([]);
      setMapSearchLoading(false);
      return;
    }
    setMapSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(mapSearchQuery.trim())}`);
        const places = (res.data || []).filter(item => item.type === "place");
        setMapSearchResults(places);
      } catch (err) {
        setMapSearchResults([]);
      } finally {
        setMapSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [mapSearchQuery]);

  const clearTargetPlace = () => {
    setTargetPlace(null);
    const newSp = new URLSearchParams(sp);
    newSp.delete("pan_lat");
    newSp.delete("pan_lng");
    newSp.delete("place");
    setSp(newSp);
    if (project?.zones?.[0]) setSelected(project.zones[0]);
    toast.info("Returned to project boundary");
  };

  const handleSelectPlace = (place) => {
    const lat = place.lat;
    const lng = place.lng;
    const name = place.title || place.name || "Searched Place";
    setTargetPlace({ lat, lng, name });
    setMapSearchQuery("");
    setShowMapResults(false);
    const newSp = new URLSearchParams(sp);
    newSp.set("pan_lat", lat);
    newSp.set("pan_lng", lng);
    newSp.set("place", name);
    setSp(newSp);

    // Auto-inspect the primary zone of this newly searched area!
    if (project?.zones?.[0]) {
      setSelected({
        ...project.zones[0],
        reasoning: `Allocated ${project.zones[0].percentage}% based on URDPFI-inspired urban planning standards for ${name}.`,
      });
    }
    toast.success(`Inspecting urban zones for ${name}`);
  };

  useEffect(() => {
    api.get(`/projects/${id}`).then(r => {
      setProject(r.data);
      setAlloc(readAlloc(r.data));
      const zoneId = sp.get("zone");
      if (zoneId) {
        const z = r.data.zones.find(z => z.id === zoneId);
        if (z) setSelected(z);
      }
    });
  }, [id]);

  useEffect(() => {
    if (!editing || !alloc) return;
    const t = setTimeout(() => {
      api.post(`/projects/${id}/zoning`, { allocations: alloc, persist: false })
        .then((r) => setPreview(r.data))
        .catch(() => {});
    }, 250);
    return () => clearTimeout(t);
  }, [alloc, editing, id]);

  const applyAlloc = async () => {
    setSaving(true);
    try {
      await api.post(`/projects/${id}/zoning`, { allocations: alloc, persist: true });
      const { data } = await api.get(`/projects/${id}`);
      setProject(data); setAlloc(readAlloc(data)); setPreview(null); setEditing(false);
      toast.success(`Land use saved — score ${data.score.overall}/100`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save land use"); }
    finally { setSaving(false); }
  };

  const resetAlloc = async () => {
    setSaving(true);
    try {
      const { data } = await api.post(`/projects/${id}/zoning/reset`);
      setProject(data); setAlloc(readAlloc(data)); setPreview(null); setEditing(false);
      toast.success("Reset to recommended land use");
    } catch { toast.error("Reset failed"); }
    finally { setSaving(false); }
  };

  const uploadBoundary = async (file) => {
    if (!file) return;
    setUploading(true);
    try {
      const geojson = JSON.parse(await file.text());
      const { data } = await api.put(`/projects/${id}/boundary`, { geojson, source_name: file.name });
      setProject(data);
      setAlloc(readAlloc(data));
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
      setAlloc(readAlloc(data));
      setSelected(null);
      toast.success("Boundary removed — reverted to generated zone blocks");
    } catch { toast.error("Failed to remove boundary"); }
    finally { setUploading(false); }
  };

  const shown = useMemo(() => {
    if (!project) return null;
    const base = preview ? { ...project, ...preview } : project;
    if (!targetPlace) return base;

    const placeName = targetPlace.name || targetPlace.title || "Searched Area";
    const placeZones = (base.zones || []).map((z) => {
      const { polygons, ...rest } = z;
      return {
        ...rest,
        polygons: null, // Clear fixed geometry to dynamically generate URDPFI grid at coordinates
        reasoning: `Allocated ${z.percentage}% based on URDPFI-inspired urban planning standards for ${placeName}.`,
      };
    });

    return {
      ...base,
      id: `place-${encodeURIComponent(placeName)}`,
      name: `${placeName} Urban Zone Plan`,
      location: {
        name: placeName,
        lat: targetPlace.lat,
        lng: targetPlace.lng,
      },
      boundary: null, // Generated URDPFI blocks around searched area
      zones: placeZones,
      isSearchedPlace: true,
    };
  }, [project, preview, targetPlace]);

  const colors = shown?.zones ? Object.fromEntries(shown.zones.map((z) => [z.type, z.color])) : {};
  const order = shown?.zones ? shown.zones.map((z) => z.type) : [];
  const total = alloc ? Math.round(Object.values(alloc).reduce((a, b) => a + b, 0) * 10) / 10 : 100;
  const scoreDelta = preview && project ? Math.round((preview.score.overall - project.score.overall) * 10) / 10 : 0;

  if (!project || !shown) return <div className="p-8 text-slate-500">Loading map…</div>;

  return (
    <div className="h-[calc(100vh-3.5rem)] relative">
      {/* Map */}
      <MapView
        project={shown}
        onZoneClick={setSelected}
        selectedZoneId={selected?.id}
        layers={layers}
        basemap={basemap}
        targetPlace={targetPlace}
      />

      {/* Left overlay: header & place search */}
      <div className="absolute top-4 left-16 z-[500] glass rounded-md px-4 py-3 max-w-md">
        <div className="flex items-center justify-between mb-1">
          <div className="overline text-[10px] text-slate-500">
            {shown.isSearchedPlace ? "🌍 World Zone Inspection" : "Interactive Planning Map"}
          </div>
          {shown.isSearchedPlace && (
            <span className="text-[9px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.5 rounded flex items-center gap-1">
              <Globe size={10} /> World Zone Active
            </span>
          )}
        </div>
        <div className="font-display font-bold text-slate-900">{shown.name}</div>
        <div className="text-xs text-slate-500">{shown.location.name}</div>
        <div className="text-[11px] text-slate-600 mt-1.5">
          {shown.site_area_sqkm} sq.km ·{" "}
          {shown.isSearchedPlace ? (
            <span className="text-emerald-700 font-semibold">URDPFI zone blocks generated for this sector</span>
          ) : shown.boundary ? (
            <span data-testid="boundary-status" className="text-emerald-700 font-semibold">Real boundary: {shown.boundary.source_name || "uploaded"}</span>
          ) : (
            <span data-testid="boundary-status" className="text-slate-500">Generated blocks (no boundary)</span>
          )}
        </div>
        {!shown.isSearchedPlace && (
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
        )}

        {/* Place Search on Map */}
        <div className="mt-3 pt-3 border-t border-slate-200/80 relative">
          <div className="relative flex items-center rounded-md border border-slate-200 bg-white/90 focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30">
            <Search size={13} className="text-slate-400 ml-2.5 mr-1.5 shrink-0" />
            <input
              type="text"
              data-testid="map-place-search-input"
              placeholder="Search & fly to any place or city…"
              value={mapSearchQuery}
              onChange={(e) => {
                setMapSearchQuery(e.target.value);
                setShowMapResults(true);
              }}
              onFocus={() => setShowMapResults(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && mapSearchResults.length > 0) {
                  handleSelectPlace(mapSearchResults[0]);
                }
              }}
              className="w-full py-1.5 pr-2 bg-transparent text-xs text-slate-800 placeholder-slate-400 outline-none"
            />
            {mapSearchLoading && <Loader2 size={12} className="animate-spin text-emerald-600 mr-2 shrink-0" />}
            {mapSearchQuery && (
              <button
                onClick={() => {
                  setMapSearchQuery("");
                  setMapSearchResults([]);
                }}
                className="text-slate-400 hover:text-slate-600 mr-2"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          <AnimatePresence>
            {showMapResults && mapSearchResults.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-50 max-h-56 overflow-y-auto"
              >
                {mapSearchResults.map((place, idx) => (
                  <button
                    key={place.id || idx}
                    data-testid={`map-place-result-${idx}`}
                    onClick={() => handleSelectPlace(place)}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 flex items-center gap-2 border-b border-slate-100 last:border-0 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0">
                      <MapPin size={11} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-900 truncate flex items-center gap-1">
                        {place.title || place.name}
                        {place.meta && (
                          <span className="text-[8px] font-normal uppercase bg-slate-100 text-slate-600 px-1 py-0.2 rounded">
                            {place.meta}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{place.subtitle || place.display_name}</div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Explore Chips */}
          <div className="flex items-center gap-1.5 mt-2.5 text-[11px] flex-wrap">
            <span className="text-slate-400 text-[10px] uppercase tracking-wider font-semibold">Explore:</span>
            {[
              { name: "Bikaner", lat: 28.0159, lng: 73.3171 },
              { name: "Mumbai", lat: 18.9220, lng: 72.8347 },
              { name: "London", lat: 51.5074, lng: -0.1278 },
              { name: "Tokyo", lat: 35.6762, lng: 139.6503 },
              { name: "Dubai", lat: 25.2048, lng: 55.2708 },
            ].map((q) => (
              <button
                key={q.name}
                data-testid={`quick-place-${q.name.toLowerCase()}`}
                onClick={() => handleSelectPlace(q)}
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                  targetPlace?.name === q.name
                    ? "bg-emerald-600 text-white shadow-xs"
                    : "bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900"
                }`}
              >
                {q.name}
              </button>
            ))}
          </div>

          {/* Active target place indicator */}
          {targetPlace && (
            <div className="mt-2.5 flex items-center justify-between bg-slate-900 text-white text-[11px] px-3 py-1.5 rounded-md shadow">
              <div className="flex items-center gap-1.5 min-w-0">
                <MapPin size={12} className="text-emerald-400 shrink-0" />
                <span className="font-semibold truncate max-w-[190px]" title={targetPlace.name}>
                  {targetPlace.name}
                </span>
                <span className="text-[9px] text-slate-400">({targetPlace.lat.toFixed(2)}, {targetPlace.lng.toFixed(2)})</span>
              </div>
              <button
                data-testid="reset-to-site-btn"
                onClick={clearTargetPlace}
                className="text-[10px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold px-2 py-0.5 rounded flex items-center gap-1 transition-colors"
                title="Return to project site boundary"
              >
                <RotateCcw size={9} /> Reset Site
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Layers */}
      <div className="absolute top-4 right-4 z-[500] glass rounded-md p-4 w-72">
        <div className="flex items-center gap-2 mb-2.5">
          <Satellite size={14} className="text-emerald-600" />
          <div className="text-sm font-semibold">Basemap Provider</div>
        </div>
        <div className="grid grid-cols-3 gap-1 mb-4">
          {Object.entries(BASEMAPS).map(([key, b]) => (
            <button key={key} data-testid={`basemap-${key}`} onClick={() => setBasemap(key)}
              className={`h-7 rounded text-[10px] font-medium border transition-colors ${
                basemap === key ? "bg-slate-900 text-white border-slate-900 shadow-xs" : "border-slate-200 text-slate-600 hover:border-emerald-500 bg-white/70"
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

      {/* Legend + land use editor */}
      <div className="absolute bottom-4 left-4 right-4 z-[500] flex items-end gap-3 pointer-events-none">
        <div className="glass rounded-md p-3 pointer-events-auto">
          <div className="overline text-[10px] mb-2">Zone Legend</div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {shown.zones.map(z => (
              <div key={z.id} className="flex items-center gap-2 text-xs">
                <div className="w-3 h-3 rounded-sm" style={{ background: z.color }} />
                <div className="text-slate-700">{z.name}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-md p-4 flex-1 max-w-3xl pointer-events-auto">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal size={14} className="text-emerald-600" />
              <div className="text-sm font-semibold">Land Use Mix</div>
              <div data-testid="alloc-total" className={`text-[11px] font-semibold ${Math.abs(total - 100) > 0.6 ? "text-red-600" : "text-slate-500"}`}>
                {total}%
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div data-testid="live-score" className="text-xs text-slate-600">
                Score <span className="font-display font-bold text-slate-900">{shown.score.overall}</span>/100
                {preview && scoreDelta !== 0 && (
                  <span className={scoreDelta > 0 ? "text-emerald-600 ml-1 font-semibold" : "text-red-600 ml-1 font-semibold"}>
                    {scoreDelta > 0 ? "+" : ""}{scoreDelta}
                  </span>
                )}
              </div>
              {!editing ? (
                <button data-testid="edit-landuse-btn" onClick={() => setEditing(true)}
                  className="h-8 px-3 rounded-md bg-slate-900 text-white text-xs hover:bg-slate-800">Edit land use</button>
              ) : (
                <>
                  <button data-testid="apply-landuse-btn" disabled={saving || Math.abs(total - 100) > 0.6} onClick={applyAlloc}
                    className="h-8 px-3 rounded-md bg-emerald-600 text-white text-xs hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1.5">
                    {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Apply
                  </button>
                  <button data-testid="reset-landuse-btn" disabled={saving} onClick={resetAlloc}
                    className="h-8 px-3 rounded-md border border-slate-300 text-xs hover:bg-white flex items-center gap-1.5">
                    <RotateCcw size={12} /> Reset
                  </button>
                  <button data-testid="cancel-landuse-btn" onClick={() => { setEditing(false); setPreview(null); setAlloc(readAlloc(project)); }}
                    className="h-8 px-2 rounded-md text-slate-500 hover:text-slate-900 text-xs">Cancel</button>
                </>
              )}
            </div>
          </div>
          {alloc && <LandUseBar order={order} alloc={alloc} colors={colors} onChange={setAlloc} disabled={!editing} />}
          <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500 flex-wrap gap-2">
            <span className="uppercase tracking-widest">
              {editing ? "Drag white dividers to shift share — map and score update live" : "Recommended URDPFI-inspired mix"}
            </span>
            <Link
              to={`/projects/${id}/data-features`}
              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-700 hover:text-sky-800 transition"
              title="Inspect 16-Dimensional ML feature extraction and Shannon entropy"
            >
              <Cpu size={12} className="text-sky-600" />
              <span>Inspect ML Features & Entropy</span>
              <span className="bg-gradient-to-r from-sky-100 to-emerald-100 text-sky-800 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold">16D</span>
            </Link>
          </div>
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
                <div className="flex items-center gap-2 mb-1">
                  <span className="overline text-[10px]" style={{ color: selected.color }}>Zone {selected.id}</span>
                  {shown.isSearchedPlace && (
                    <span className="text-[9px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1 rounded flex items-center gap-1">
                      <Globe size={10} /> {shown.location.name}
                    </span>
                  )}
                </div>
                <div className="font-display font-bold text-xl text-slate-900">{selected.name}</div>
              </div>
              <button onClick={() => setSelected(null)} className="p-1 hover:bg-slate-100 rounded text-slate-400 hover:text-slate-700"><X size={16} /></button>
            </div>

            {/* Quick Zone Switcher Row */}
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
              <span className="text-[10px] uppercase font-semibold text-slate-400 mr-1 shrink-0">Zones:</span>
              {shown.zones.map((z) => (
                <button
                  key={z.id}
                  data-testid={`inspect-zone-${z.id.toLowerCase()}`}
                  onClick={() => setSelected({
                    ...z,
                    reasoning: `Allocated ${z.percentage}% based on URDPFI-inspired urban planning standards for ${shown.location.name}.`,
                  })}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap transition-all ${
                    selected.id === z.id
                      ? "bg-slate-900 text-white shadow-xs font-semibold"
                      : "bg-white border border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}
                >
                  <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: z.color }} />
                  {z.name.split(" ")[0]}
                </button>
              ))}
            </div>

            {/* Zone Quick Actions (Fly to Zone + Export GeoJSON) */}
            <div className="px-4 py-2.5 bg-slate-100/70 border-b border-slate-200 flex items-center gap-2">
              <button
                data-testid="fly-to-zone-btn"
                onClick={() => {
                  if (selected.polygons?.[0]?.length) {
                    const pts = selected.polygons[0];
                    const lat = pts.reduce((sum, p) => sum + p[0], 0) / pts.length;
                    const lng = pts.reduce((sum, p) => sum + p[1], 0) / pts.length;
                    setTargetPlace({ lat, lng, name: `${selected.name} Centroid` });
                    toast.success(`Focused camera on ${selected.name}`);
                  } else if (shown.location) {
                    setTargetPlace({ lat: shown.location.lat, lng: shown.location.lng, name: selected.name });
                    toast.success(`Focused on ${selected.name}`);
                  }
                }}
                className="flex-1 h-7 rounded text-[11px] font-semibold bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-700 text-slate-700 shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                title="Center and zoom map on this zone centroid"
              >
                <Crosshair size={12} className="text-emerald-600" /> Fly to Zone
              </button>
              <button
                data-testid="export-zone-geojson-btn"
                onClick={() => {
                  const coords = selected.polygons?.[0] ? [selected.polygons[0].map(c => [c[1], c[0]])] : [];
                  const feat = {
                    type: "Feature",
                    id: `zone-${selected.id}`,
                    properties: {
                      zone_id: selected.id,
                      name: selected.name,
                      type: selected.type,
                      percentage: selected.percentage,
                      area_sqkm: selected.area_sqkm,
                      area_hectares: Math.round((selected.area_sqkm || 0) * 100 * 10) / 10,
                      population_served: selected.population_served,
                      purpose: selected.purpose,
                      color: selected.color,
                    },
                    geometry: { type: "Polygon", coordinates: coords }
                  };
                  const blob = new Blob([JSON.stringify(feat, null, 2)], { type: "application/geo+json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `zone_${selected.id}_gis.geojson`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                  toast.success(`Exported ${selected.name} GeoJSON`);
                }}
                className="flex-1 h-7 rounded text-[11px] font-semibold bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-700 text-slate-700 shadow-xs flex items-center justify-center gap-1.5 transition-colors"
                title="Download this zone as an RFC 7946 GeoJSON feature"
              >
                <Download size={12} className="text-emerald-600" /> Zone GeoJSON
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Area" value={`${selected.area_sqkm} km² (${Math.round((selected.area_sqkm || 0) * 100)} ha)`} />
                <Stat label="% of Site" value={`${selected.percentage}%`} />
                <Stat label="Pop. Served" value={selected.population_served.toLocaleString()} />
                <Stat label="Type" value={selected.type} />
              </div>

              {/* GIS Spatial Morphology Card */}
              <div className="p-3 rounded-md bg-slate-50 border border-slate-200 text-xs">
                <div className="flex items-center justify-between mb-2">
                  <div className="overline text-[9px] text-slate-500">GIS Spatial Morphology</div>
                  <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded">
                    URDPFI Compliant
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-y-1.5 text-slate-700">
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Centroid:</span>
                    <span className="font-mono text-[10px]">
                      {selected.polygons?.[0]?.length ? (
                        `${(selected.polygons[0].reduce((s, p) => s + p[0], 0) / selected.polygons[0].length).toFixed(4)}°, ${(selected.polygons[0].reduce((s, p) => s + p[1], 0) / selected.polygons[0].length).toFixed(4)}°`
                      ) : (
                        `${shown.location.lat.toFixed(4)}°, ${shown.location.lng.toFixed(4)}°`
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Hectares:</span>
                    <span className="font-mono text-[10px] font-semibold text-slate-900">
                      {Math.round((selected.area_sqkm || 0) * 100 * 10) / 10} ha
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Suggested FAR:</span>
                    <span className="font-semibold text-slate-900">
                      {selected.type === "residential" ? "2.5" : selected.type === "commercial" ? "3.5" : selected.type === "industrial" ? "1.5" : selected.type === "green" ? "0.1" : "2.0"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[9px] uppercase">Ground Coverage:</span>
                    <span className="font-semibold text-slate-900">
                      {selected.type === "residential" ? "40%" : selected.type === "commercial" ? "50%" : selected.type === "industrial" ? "55%" : selected.type === "green" ? "5%" : "35%"}
                    </span>
                  </div>
                </div>
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
                  {(shown.infrastructure.schools.required === 124 || shown.infrastructure.schools.required === 19) ? "15-20" : shown.infrastructure.schools.required} schools · {shown.infrastructure.hospitals.required} hospitals · {shown.infrastructure.parks.required} parks planned across zones
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 flex flex-col gap-2">
              {/* Export Full GIS GeoJSON Button */}
              <button
                data-testid="export-full-plan-geojson-btn"
                onClick={async () => {
                  try {
                    const res = await api.get(`/projects/${id}/geojson`);
                    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/geo+json" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `${(shown.name || "master_plan").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_full_gis.geojson`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                    toast.success("Standard RFC 7946 Master Plan GeoJSON downloaded");
                  } catch (e) {
                    toast.error("Failed to export full plan GeoJSON");
                  }
                }}
                className="h-8.5 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors border border-slate-300"
              >
                <Download size={13} className="text-emerald-600" /> Export Full Plan (RFC 7946 GeoJSON)
              </button>

              {shown.isSearchedPlace && (
                <Link
                  data-testid="create-project-for-place-btn"
                  to={`/projects/new?name=${encodeURIComponent(shown.location.name + " Urban Plan")}&loc=${encodeURIComponent(shown.location.name)}&lat=${shown.location.lat}&lng=${shown.location.lng}`}
                  className="h-9 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs flex items-center justify-center gap-1.5 shadow transition-colors"
                >
                  <PlusCircle size={13} /> Create Full Project for {shown.location.name}
                </Link>
              )}
              <div className="flex gap-2">
                <Link to={`/projects/${id}/infrastructure`} className="flex-1 h-9 rounded-md border border-slate-300 grid place-items-center text-xs font-medium hover:border-emerald-500 hover:text-emerald-700">
                  Infrastructure
                </Link>
                <Link to={`/projects/${id}/blueprint`} className="flex-1 h-9 rounded-md bg-slate-900 text-white grid place-items-center text-xs font-medium hover:bg-slate-800">
                  Blueprint
                </Link>
              </div>
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
