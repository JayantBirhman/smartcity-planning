import { MapContainer, TileLayer, Polygon, CircleMarker, Popup, Tooltip, useMap } from "react-leaflet";
import { useEffect, useState } from "react";
import { buildZonePolygons, buildInfraPoints } from "@/lib/project";

function Recenter({ center }) {
  const map = useMap();
  useEffect(() => { if (center) map.setView(center, 14); }, [center, map]);
  return null;
}

export default function MapView({ project, onZoneClick, selectedZoneId, layers }) {
  const [polys, setPolys] = useState([]);
  const [infra, setInfra] = useState([]);

  useEffect(() => {
    if (!project) return;
    setPolys(buildZonePolygons(project));
    setInfra(buildInfraPoints(project));
  }, [project]);

  if (!project) return null;
  const center = [project.location.lat, project.location.lng];
  const L = layers || { zones: true, schools: true, hospitals: true, parks: true, roads: true };

  return (
    <MapContainer center={center} zoom={14} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; OpenStreetMap contributors'
      />
      <Recenter center={center} />

      {L.zones && polys.map((p) => (
        <Polygon
          key={p.key}
          positions={p.positions}
          pathOptions={{
            color: p.zone.color,
            weight: selectedZoneId === p.zone.id ? 3 : 1.5,
            fillColor: p.zone.color,
            fillOpacity: selectedZoneId === p.zone.id ? 0.55 : 0.32,
          }}
          eventHandlers={{ click: () => onZoneClick && onZoneClick(p.zone) }}
        >
          <Tooltip direction="top" opacity={0.95} sticky>
            <div className="text-xs font-semibold">{p.zone.name}</div>
            <div className="text-[10px] text-slate-500">{p.zone.percentage}% • {p.zone.area_sqkm} sq.km</div>
          </Tooltip>
        </Polygon>
      ))}

      {infra.filter(pt => (L[pt.type + "s"] ?? true)).map((pt) => (
        <CircleMarker
          key={pt.id}
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
