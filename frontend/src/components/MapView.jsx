import { MapContainer, TileLayer, Polygon, Polyline, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import { useEffect, useMemo, useState } from "react";
import { Crosshair, Loader2 } from "lucide-react";
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
};

function Recenter({ center, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds?.length > 2) map.fitBounds(bounds, { padding: [40, 40] });
    else if (center) map.setView(center, 14);
  }, [center?.[0], center?.[1], bounds?.length, map]);
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
            title="Use my live location"
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
            <span className="text-[10px] font-semibold">You are here</span>
          </Tooltip>
        </CircleMarker>
      )}
    </>
  );
}

export default function MapView({ project, onZoneClick, selectedZoneId, layers, basemap = "satellite" }) {
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

  const center = [project.location.lat, project.location.lng];
  const boundary = project.boundary?.latlngs;
  const L = layers || { zones: true, schools: true, hospitals: true, parks: true, boundary: true };
  const bm = BASEMAPS[basemap] || BASEMAPS.satellite;

  return (
    <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer key={basemap} url={bm.url} attribution={bm.attribution} maxZoom={19} />
      {bm.labels && <TileLayer key={`${basemap}-labels`} url={bm.labels} maxZoom={19} />}
      <Recenter center={center} bounds={L.boundary !== false ? boundary : null} />
      <LiveLocation />

      {boundary && L.boundary !== false && (
        <Polyline positions={boundary} pathOptions={{ color: "#F8FAFC", weight: 3, dashArray: "6 6", opacity: 0.95 }} />
      )}

      {L.zones && polys.map((p) => (
        <Polygon
          key={p.key}
          positions={p.positions}
          pathOptions={{
            color: p.zone.color,
            weight: selectedZoneId === p.zone.id ? 3 : 1.5,
            fillColor: p.zone.color,
            fillOpacity: selectedZoneId === p.zone.id ? 0.6 : 0.38,
          }}
          eventHandlers={{ click: () => onZoneClick && onZoneClick(p.zone) }}
        >
          <Tooltip direction="top" opacity={0.95} sticky>
            <div className="text-xs font-semibold">{p.zone.name}</div>
            <div className="text-[10px] text-slate-500">{p.zone.percentage}% • {p.zone.area_sqkm} sq.km</div>
          </Tooltip>
        </Polygon>
      ))}

      {infra.filter((pt) => (L[pt.type + "s"] ?? true)).map((pt, i) => (
        <CircleMarker
          key={pt.id || i}
          center={[pt.lat, pt.lng]}
          radius={5}
          pathOptions={{ color: "#ffffff", weight: 1.5, fillColor: pt.color, fillOpacity: 1 }}
        >
          <Popup>
            <div className="text-xs font-semibold">{pt.label}</div>
            <div className="text-[10px] text-slate-500">{pt.type}</div>
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
