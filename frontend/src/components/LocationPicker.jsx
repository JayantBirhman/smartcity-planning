import { MapContainer, TileLayer, CircleMarker, useMapEvents, useMap } from "react-leaflet";
import { useEffect } from "react";
import { BASEMAPS } from "@/components/MapView";

function ClickPicker({ onPick }) {
  useMapEvents({ click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

function Fly({ lat, lng }) {
  const map = useMap();
  useEffect(() => { map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.9 }); }, [lat, lng, map]);
  return null;
}

export const LocationPicker = ({ lat, lng, onPick, basemap = "satellite" }) => {
  const bm = BASEMAPS[basemap];
  return (
    <div data-testid="location-picker" className="h-72 rounded-md overflow-hidden border border-slate-200 relative">
      <MapContainer center={[lat, lng]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
        <TileLayer url={bm.url} attribution={bm.attribution} maxZoom={19} />
        {bm.labels && <TileLayer url={bm.labels} maxZoom={19} />}
        <Fly lat={lat} lng={lng} />
        <ClickPicker onPick={onPick} />
        <CircleMarker center={[lat, lng]} radius={8}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: "#10B981", fillOpacity: 1 }} />
      </MapContainer>
      <div className="absolute bottom-2 left-2 z-[500] text-[10px] uppercase tracking-widest bg-slate-900/80 text-white px-2 py-1 rounded">
        Click the map to drop your site pin
      </div>
    </div>
  );
};
