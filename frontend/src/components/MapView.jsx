import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Circle, Popup, Tooltip, useMap, useMapEvents, ScaleControl } from "react-leaflet";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Crosshair, Loader2, Ruler, Shapes, Maximize2, Minimize2,
  Copy, Download, Eye, RotateCcw, Compass, MapPin, Footprints
} from "lucide-react";
import { toast } from "sonner";
import { buildZonePolygons, buildInfraPoints } from "@/lib/project";

export const BASEMAPS = {
  satellite: {
    label: "Satellite",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Imagery &copy; Esri, Maxar, Earthstar Geographics",
    labels: "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  },
  streets: {
    label: "Streets",
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  terrain: {
    label: "Terrain",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenTopoMap (CC-BY-SA)",
  },
  dark: {
    label: "Dark Matter",
    url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; <a href=\"https://carto.com/\">CARTO</a> &copy; OpenStreetMap",
  },
  light: {
    label: "Positron",
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
    attribution: "&copy; <a href=\"https://carto.com/\">CARTO</a> &copy; OpenStreetMap",
  },
};

// Geodesic math helpers
export function haversineDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function computePolylineDistanceMeters(coords) {
  if (!coords || coords.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    total += haversineDistanceMeters(coords[i][0], coords[i][1], coords[i + 1][0], coords[i + 1][1]);
  }
  return total;
}

export function computePolygonAreaSqMeters(coords) {
  if (!coords || coords.length < 3) return 0;
  const R = 6371000;
  let total = 0;
  const len = coords.length;
  for (let i = 0; i < len; i++) {
    const p1 = coords[i];
    const p2 = coords[(i + 1) % len];
    const lat1 = (p1[0] * Math.PI) / 180;
    const lat2 = (p2[0] * Math.PI) / 180;
    const lonDiff = ((p2[1] - p1[1]) * Math.PI) / 180;
    total += lonDiff * (2 + Math.sin(lat1) + Math.sin(lat2));
  }
  return Math.abs((total * R * R) / 2.0);
}

function Recenter({ center, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds?.length > 2) map.fitBounds(bounds, { padding: [40, 40] });
    else if (center) map.setView(center, 14);
  }, [center?.[0], center?.[1], bounds?.length, map]);
  return null;
}

function FlyToPlace({ target }) {
  const map = useMap();
  useEffect(() => {
    if (target?.lat && target?.lng) {
      map.flyTo([target.lat, target.lng], 14, { duration: 1.5 });
    }
  }, [target?.lat, target?.lng, map]);
  return null;
}

function MapEventsHandler({ measureMode, onMapClick, onCursorMove }) {
  useMapEvents({
    click: (e) => {
      if (measureMode !== "none") {
        onMapClick([e.latlng.lat, e.latlng.lng]);
      }
    },
    mousemove: (e) => {
      onCursorMove({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

function LiveLocation() {
  const map = useMap();
  const [pos, setPos] = useState(null);
  const [busy, setBusy] = useState(false);

  const locate = () => {
    if (!navigator.geolocation) return toast.error("Geolocation is not supported by this browser");
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const next = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        setPos(next);
        map.flyTo([next.lat, next.lng], 15, { duration: 1.2 });
        setBusy(false);
        toast.success(`Live location locked (±${Math.round(next.acc)} m)`);
      },
      () => { setBusy(false); toast.error("Location permission denied"); },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  };

  return (
    <>
      <div className="leaflet-top leaflet-right" style={{ marginTop: 96, marginRight: 12 }}>
        <div className="leaflet-control leaflet-bar" style={{ border: "none" }}>
          <button
            data-testid="map-locate-btn"
            onClick={locate}
            title="Use my live location (GPS)"
            className="w-9 h-9 grid place-items-center rounded-md bg-white/95 backdrop-blur border border-slate-200 shadow text-slate-700 hover:text-emerald-600 transition-colors"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
          </button>
        </div>
      </div>
      {pos && (
        <CircleMarker center={[pos.lat, pos.lng]} radius={7}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#2563EB", fillOpacity: 1 }}>
          <Tooltip permanent direction="top" offset={[0, -8]}>
            <span className="text-[10px] font-semibold">You are here (±{Math.round(pos.acc)}m)</span>
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
}

export default function MapView({
  project,
  onZoneClick,
  selectedZoneId,
  layers,
  basemap = "satellite",
  targetPlace,
  zoneOpacity = 0.45,
  onZoneOpacityChange,
  showToolbar = true,
}) {
  const [measureMode, setMeasureMode] = useState("none"); // "none" | "distance" | "area"
  const [measurePoints, setMeasurePoints] = useState([]);
  const [cursorCoords, setCursorCoords] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [localOpacity, setLocalOpacity] = useState(zoneOpacity);
  const containerRef = useRef(null);

  const currentOpacity = onZoneOpacityChange ? zoneOpacity : localOpacity;

  const hasRealGeometry = project?.zones?.some((z) => z.polygons?.length);
  const polys = useMemo(() => {
    if (!project) return [];
    if (!hasRealGeometry) return buildZonePolygons(project);
    return project.zones.flatMap((z) =>
      (z.polygons || []).map((ring, i) => ({ key: `${z.id}-${i}`, zone: z, positions: ring }))
    );
  }, [project, hasRealGeometry]);

  const infra = useMemo(
    () => (!project ? [] : project.infra_points?.length ? project.infra_points : buildInfraPoints(project)),
    [project]
  );

  if (!project) return null;

  const center = [project.location?.lat || 18.5204, project.location?.lng || 73.8567];
  const boundary = project.boundary?.latlngs;
  const L = layers || { zones: true, schools: true, hospitals: true, parks: true, boundary: true, walkBuffers: false };
  const bm = BASEMAPS[basemap] || BASEMAPS.satellite;

  // Compute live measurement values
  const linearDistance = computePolylineDistanceMeters(measurePoints);
  const polygonArea = computePolygonAreaSqMeters(measurePoints);

  const handleMapClick = (latlng) => {
    setMeasurePoints((prev) => [...prev, latlng]);
  };

  const handleCursorMove = (coords) => {
    setCursorCoords(coords);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const copyCoordinates = () => {
    if (!cursorCoords) return;
    const text = `${cursorCoords.lat.toFixed(6)}, ${cursorCoords.lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    toast.success(`Coordinates copied: ${text}`);
  };

  const exportGeoJSON = () => {
    const geojson = {
      type: "FeatureCollection",
      crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
      features: [
        ...(project.boundary?.latlngs ? [{
          type: "Feature",
          id: `boundary-${project.id || "proj"}`,
          properties: { feature_type: "project_boundary", name: project.name, site_area_sqkm: project.site_area_sqkm },
          geometry: {
            type: "Polygon",
            coordinates: [project.boundary.latlngs.map(c => [c[1], c[0]])]
          }
        }] : []),
        ...polys.map(p => ({
          type: "Feature",
          id: `zone-${p.zone.id}`,
          properties: {
            feature_type: "urban_zone",
            zone_id: p.zone.id,
            type: p.zone.type,
            name: p.zone.name,
            percentage: p.zone.percentage,
            area_sqkm: p.zone.area_sqkm,
            color: p.zone.color
          },
          geometry: {
            type: "Polygon",
            coordinates: [p.positions.map(c => [c[1], c[0]])]
          }
        })),
        ...infra.map((pt, i) => ({
          type: "Feature",
          id: `infra-${pt.type}-${i}`,
          properties: { feature_type: "infrastructure_node", type: pt.type, label: pt.label, color: pt.color },
          geometry: { type: "Point", coordinates: [pt.lng, pt.lat] }
        }))
      ]
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: "application/geo+json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(project.name || "smartscape_plan").toLowerCase().replace(/[^a-z0-9]+/g, "_")}_gis.geojson`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("GIS GeoJSON downloaded successfully");
  };

  return (
    <div ref={containerRef} className={`relative w-full h-full ${isFullscreen ? "bg-slate-950" : ""}`}>
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: "100%", width: "100%", cursor: measureMode !== "none" ? "crosshair" : "grab" }}
        scrollWheelZoom
      >
        <TileLayer key={basemap} url={bm.url} attribution={bm.attribution} maxZoom={19} />
        {bm.labels && <TileLayer key={`${basemap}-labels`} url={bm.labels} maxZoom={19} />}
        <ScaleControl imperial={false} position="bottomleft" />
        
        {!targetPlace && <Recenter center={center} bounds={L.boundary !== false ? boundary : null} />}
        <FlyToPlace target={targetPlace} />
        <LiveLocation />
        <MapEventsHandler measureMode={measureMode} onMapClick={handleMapClick} onCursorMove={handleCursorMove} />

        {/* Searched Location Marker */}
        {targetPlace && (
          <CircleMarker
            center={[targetPlace.lat, targetPlace.lng]}
            radius={9}
            pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#10B981", fillOpacity: 0.95 }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span className="text-xs font-bold text-slate-900 bg-white/95 px-2 py-0.5 rounded shadow border border-emerald-500">
                📍 {targetPlace.name || targetPlace.title || "Searched Place"}
              </span>
            </Tooltip>
            <Popup autoPan>
              <div className="p-1 min-w-[180px]">
                <div className="font-display font-bold text-sm text-slate-900">{targetPlace.name || targetPlace.title || "Location"}</div>
                <div className="text-xs text-slate-500 mt-0.5">{targetPlace.lat.toFixed(4)}, {targetPlace.lng.toFixed(4)}</div>
                <button
                  onClick={() => onZoneClick && project?.zones?.[0] && onZoneClick(project.zones[0])}
                  className="mt-2 block w-full text-left text-xs font-semibold text-emerald-600 hover:text-emerald-700 underline cursor-pointer"
                >
                  Inspect Zones of this area →
                </button>
              </div>
            </Popup>
          </CircleMarker>
        )}

        {/* Project Boundary */}
        {boundary && L.boundary !== false && (
          <Polyline positions={boundary} pathOptions={{ color: "#F8FAFC", weight: 3, dashArray: "6 6", opacity: 0.95 }} />
        )}

        {/* Master Zoning Polygons with variable opacity */}
        {L.zones && polys.map((p) => (
          <Polygon
            key={p.key}
            positions={p.positions}
            pathOptions={{
              color: p.zone.color,
              weight: selectedZoneId === p.zone.id ? 3.5 : 1.5,
              fillColor: p.zone.color,
              fillOpacity: selectedZoneId === p.zone.id ? Math.min(0.9, currentOpacity + 0.25) : currentOpacity,
            }}
            eventHandlers={{ click: () => onZoneClick && onZoneClick(p.zone) }}
          >
            <Tooltip direction="top" opacity={0.95} sticky>
              <div className="text-xs font-semibold">{p.zone.name}</div>
              <div className="text-[10px] text-slate-500">{p.zone.percentage}% • {p.zone.area_sqkm} sq.km · Click to inspect</div>
            </Tooltip>
          </Polygon>
        ))}

        {/* URDPFI Pedestrian Walking Catchment Buffers (400m & 800m) */}
        {L.walkBuffers && infra.map((pt, i) => (
          <span key={`buffer-group-${pt.id || i}`}>
            {/* 400m 5-minute walk buffer */}
            <Circle
              center={[pt.lat, pt.lng]}
              radius={400}
              pathOptions={{
                color: pt.color,
                weight: 1.5,
                dashArray: "4 4",
                fillColor: pt.color,
                fillOpacity: 0.12,
              }}
            >
              <Tooltip direction="top">
                <span className="text-[11px] font-semibold">400m (5-min walk): {pt.label}</span>
              </Tooltip>
            </Circle>
            {/* 800m 10-minute walk buffer */}
            <Circle
              center={[pt.lat, pt.lng]}
              radius={800}
              pathOptions={{
                color: pt.color,
                weight: 1,
                dashArray: "8 4",
                fillColor: pt.color,
                fillOpacity: 0.05,
              }}
            >
              <Tooltip direction="bottom">
                <span className="text-[10px]">800m (10-min walk): {pt.label}</span>
              </Tooltip>
            </Circle>
          </span>
        ))}

        {/* Infrastructure Nodes */}
        {infra.filter((pt) => (L[pt.type + "s"] ?? true)).map((pt, i) => (
          <CircleMarker
            key={pt.id || i}
            center={[pt.lat, pt.lng]}
            radius={6}
            pathOptions={{ color: "#ffffff", weight: 2, fillColor: pt.color, fillOpacity: 1 }}
          >
            <Popup>
              <div className="text-xs font-semibold">{pt.label}</div>
              <div className="text-[10px] text-slate-500 capitalize">{pt.type} Node</div>
              <div className="text-[10px] text-emerald-600 font-mono mt-1">{pt.lat.toFixed(5)}, {pt.lng.toFixed(5)}</div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Measurement Overlays */}
        {measureMode === "distance" && measurePoints.length > 0 && (
          <>
            <Polyline positions={measurePoints} pathOptions={{ color: "#06B6D4", weight: 3, dashArray: "4 4" }} />
            {measurePoints.map((pt, idx) => (
              <CircleMarker
                key={`meas-pt-${idx}`}
                center={pt}
                radius={5}
                pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#06B6D4", fillOpacity: 1 }}
              >
                <Tooltip permanent direction="top" offset={[0, -6]}>
                  <span className="text-[10px] font-mono font-bold bg-cyan-900 text-cyan-200 px-1 py-0.5 rounded">
                    #{idx + 1}
                  </span>
                </Tooltip>
              </CircleMarker>
            ))}
          </>
        )}

        {measureMode === "area" && measurePoints.length > 0 && (
          <>
            {measurePoints.length >= 3 && (
              <Polygon
                positions={measurePoints}
                pathOptions={{ color: "#F59E0B", weight: 2.5, dashArray: "5 5", fillColor: "#F59E0B", fillOpacity: 0.3 }}
              />
            )}
            {measurePoints.length < 3 && (
              <Polyline positions={measurePoints} pathOptions={{ color: "#F59E0B", weight: 2, dashArray: "4 4" }} />
            )}
            {measurePoints.map((pt, idx) => (
              <CircleMarker
                key={`meas-area-${idx}`}
                center={pt}
                radius={5}
                pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#F59E0B", fillOpacity: 1 }}
              />
            ))}
          </>
        )}
      </MapContainer>

      {/* GIS Floating Toolbar (Top-Right under basemap control) */}
      {showToolbar && (
        <div className="absolute top-20 right-4 z-[500] flex flex-col items-end gap-2 pointer-events-auto">
          {/* Main Action Bar */}
          <div className="glass rounded-lg p-1.5 flex items-center gap-1 shadow-lg border border-slate-200/80 bg-white/95">
            {/* Linear Distance Ruler */}
            <button
              data-testid="gis-measure-distance-btn"
              onClick={() => {
                if (measureMode === "distance") {
                  setMeasureMode("none");
                  setMeasurePoints([]);
                } else {
                  setMeasureMode("distance");
                  setMeasurePoints([]);
                  toast.info("Distance Tool: Click anywhere on the map to measure distance");
                }
              }}
              title="Measure Linear Distance (meters/km)"
              className={`h-8 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                measureMode === "distance"
                  ? "bg-cyan-600 text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Ruler size={13} />
              <span className="hidden sm:inline">Distance</span>
            </button>

            {/* Polygon Area Tool */}
            <button
              data-testid="gis-measure-area-btn"
              onClick={() => {
                if (measureMode === "area") {
                  setMeasureMode("none");
                  setMeasurePoints([]);
                } else {
                  setMeasureMode("area");
                  setMeasurePoints([]);
                  toast.info("Area Tool: Click 3 or more points on the map to measure surface area");
                }
              }}
              title="Measure Polygon Area (hectares/sq.km)"
              className={`h-8 px-2.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                measureMode === "area"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Shapes size={13} />
              <span className="hidden sm:inline">Area</span>
            </button>

            <div className="h-4 w-px bg-slate-200 mx-1" />

            {/* Export GIS GeoJSON */}
            <button
              data-testid="gis-export-geojson-btn"
              onClick={exportGeoJSON}
              title="Download RFC 7946 GeoJSON FeatureCollection"
              className="h-8 px-2.5 rounded text-xs font-semibold text-slate-700 hover:bg-slate-100 flex items-center gap-1.5 transition-colors"
            >
              <Download size={13} className="text-emerald-600" />
              <span className="hidden sm:inline">GeoJSON</span>
            </button>

            {/* Fullscreen Map */}
            <button
              data-testid="gis-fullscreen-btn"
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Fullscreen Map"}
              className="h-8 w-8 grid place-items-center rounded text-slate-700 hover:bg-slate-100 transition-colors"
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            </button>
          </div>

          {/* Opacity Adjustment Pill */}
          <div className="glass rounded-lg px-2.5 py-1.5 shadow border border-slate-200/80 bg-white/95 flex items-center gap-2 text-xs">
            <Eye size={12} className="text-slate-400" />
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Opacity:</span>
            <input
              data-testid="gis-opacity-slider"
              type="range"
              min="0.1"
              max="0.9"
              step="0.05"
              value={currentOpacity}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (onZoneOpacityChange) onZoneOpacityChange(val);
                else setLocalOpacity(val);
              }}
              className="w-16 accent-emerald-600 cursor-pointer h-1.5"
            />
            <span className="font-mono text-[11px] font-semibold text-slate-700 min-w-[28px]">
              {Math.round(currentOpacity * 100)}%
            </span>
          </div>

          {/* Active Measurement Feedback HUD */}
          {measureMode !== "none" && (
            <div className="glass rounded-lg p-3 shadow-xl border border-slate-300 bg-white/95 min-w-[260px] animate-in fade-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  {measureMode === "distance" ? (
                    <>
                      <Ruler size={13} className="text-cyan-600" />
                      <span>Linear Distance</span>
                    </>
                  ) : (
                    <>
                      <Shapes size={13} className="text-amber-600" />
                      <span>Surface Area</span>
                    </>
                  )}
                </div>
                <button
                  data-testid="gis-clear-measurement-btn"
                  onClick={() => setMeasurePoints([])}
                  className="text-[10px] text-slate-400 hover:text-slate-700 flex items-center gap-0.5"
                >
                  <RotateCcw size={10} /> Clear
                </button>
              </div>

              {measureMode === "distance" && (
                <div>
                  <div className="text-lg font-extrabold font-mono text-cyan-700">
                    {linearDistance >= 1000
                      ? `${(linearDistance / 1000).toFixed(2)} km`
                      : `${Math.round(linearDistance)} m`}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {measurePoints.length} point{measurePoints.length === 1 ? "" : "s"} clicked · Click map to add legs
                  </div>
                </div>
              )}

              {measureMode === "area" && (
                <div>
                  <div className="text-lg font-extrabold font-mono text-amber-700">
                    {(polygonArea / 10000).toFixed(2)} ha
                    <span className="text-xs font-normal text-slate-500 ml-1.5">
                      ({(polygonArea / 1_000_000).toFixed(3)} km²)
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {measurePoints.length} verti{measurePoints.length === 1 ? "x" : "ces"} · Needs 3+ points to close polygon
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setMeasureMode("none");
                  setMeasurePoints([]);
                }}
                className="mt-2 w-full py-1 text-center text-[10px] font-semibold bg-slate-100 hover:bg-slate-200 rounded text-slate-700 transition-colors"
              >
                Done Measuring
              </button>
            </div>
          )}
        </div>
      )}

      {/* Live Cursor Coordinate HUD & Quick Copy (Bottom Right) */}
      <div className="absolute bottom-2 right-2 z-[500] pointer-events-auto">
        <div className="glass rounded-md px-3 py-1.5 text-[11px] font-mono text-slate-700 bg-white/95 shadow border border-slate-200/90 flex items-center gap-3">
          <div className="flex items-center gap-1 text-slate-500 font-sans text-[10px] uppercase font-bold tracking-wider">
            <Compass size={12} className="text-emerald-600" />
            <span>GIS Coords</span>
          </div>
          <div className="text-slate-900 font-semibold" data-testid="live-cursor-coords">
            {cursorCoords
              ? `${cursorCoords.lat.toFixed(5)}° N, ${cursorCoords.lng.toFixed(5)}° E`
              : `${center[0].toFixed(5)}° N, ${center[1].toFixed(5)}° E`}
          </div>
          <button
            data-testid="copy-cursor-coords-btn"
            onClick={copyCoordinates}
            title="Copy Latitude & Longitude"
            className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-emerald-700 transition-colors"
          >
            <Copy size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
