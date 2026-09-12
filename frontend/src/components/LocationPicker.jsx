import { MapContainer, TileLayer, CircleMarker, Circle, Tooltip, useMapEvents, useMap, ScaleControl } from "react-leaflet";
import { useEffect, useState, useMemo } from "react";
import { Search, Crosshair, Loader2, MapPin, Copy, Layers, Compass, Check } from "lucide-react";
import { toast } from "sonner";
import { BASEMAPS } from "@/components/MapView";
import { api } from "@/lib/api";

function ClickPicker({ onPick }) {
  useMapEvents({
    click: (e) => onPick({ lat: e.latlng.lat, lng: e.latlng.lng }),
  });
  return null;
}

function Fly({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat && lng) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 13), { duration: 0.9 });
    }
  }, [lat, lng, map]);
  return null;
}

export const LocationPicker = ({
  lat,
  lng,
  onPick,
  siteAreaSqkm = 10,
  basemap = "satellite",
}) => {
  const [currentBasemap, setCurrentBasemap] = useState(basemap);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [locating, setLocating] = useState(false);

  // Manual input state
  const [manualLat, setManualLat] = useState(lat.toFixed(5));
  const [manualLng, setManualLng] = useState(lng.toFixed(5));

  useEffect(() => {
    setManualLat(lat.toFixed(5));
    setManualLng(lng.toFixed(5));
  }, [lat, lng]);

  // Radius for site area footprint circle: Area = pi * r^2  =>  r = sqrt(area_sqm / pi)
  const siteRadiusMeters = useMemo(() => {
    const areaSqm = (siteAreaSqkm || 10) * 1_000_000;
    return Math.sqrt(areaSqm / Math.PI);
  }, [siteAreaSqkm]);

  const bm = BASEMAPS[currentBasemap] || BASEMAPS.satellite;

  // Search geocoding debounce
  useEffect(() => {
    if (!searchQuery.trim() || searchQuery.trim().length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
        const places = (res.data || []).filter((i) => i.type === "place");
        setSearchResults(places);
      } catch (err) {
        setSearchResults([]);
      } finally {
        setSearchLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const selectPlace = (place) => {
    onPick({ lat: place.lat, lng: place.lng, name: place.title || place.name });
    setSearchQuery("");
    setShowResults(false);
    toast.success(`Positioned site pin at ${place.title || place.name}`);
  };

  const handleManualApply = () => {
    const parsedLat = parseFloat(manualLat);
    const parsedLng = parseFloat(manualLng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) {
      return toast.error("Please enter valid numeric latitude and longitude");
    }
    if (parsedLat < -90 || parsedLat > 90 || parsedLng < -180 || parsedLng > 180) {
      return toast.error("Coordinates out of bounds (Lat: -90..90, Lng: -180..180)");
    }
    onPick({ lat: parsedLat, lng: parsedLng });
    toast.success(`Coordinates updated to ${parsedLat.toFixed(4)}, ${parsedLng.toFixed(4)}`);
  };

  const locateUser = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        onPick({ lat: p.coords.latitude, lng: p.coords.longitude, name: "Current GPS Location" });
        setLocating(false);
        toast.success(`GPS locked (±${Math.round(p.coords.accuracy)} m)`);
      },
      () => {
        setLocating(false);
        toast.error("GPS permission denied");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const copyCoords = () => {
    const text = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    navigator.clipboard.writeText(text);
    toast.success(`Copied: ${text}`);
  };

  return (
    <div data-testid="location-picker" className="rounded-lg overflow-hidden border border-slate-200 bg-white shadow-sm">
      {/* Top Controls Bar */}
      <div className="p-2.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
        {/* Geocoding Search */}
        <div className="relative flex-1 min-w-[200px]">
          <div className="relative flex items-center rounded-md border border-slate-300 bg-white focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/20">
            <Search size={13} className="text-slate-400 ml-2.5 mr-1.5 shrink-0" />
            <input
              type="text"
              data-testid="picker-search-input"
              placeholder="Search any city or landmark…"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(true);
              }}
              onFocus={() => setShowResults(true)}
              className="w-full py-1 text-xs text-slate-800 placeholder-slate-400 outline-none"
            />
            {searchLoading && <Loader2 size={12} className="animate-spin text-emerald-600 mr-2 shrink-0" />}
          </div>

          {showResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl overflow-hidden z-[1000] max-h-48 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  data-testid={`picker-result-${i}`}
                  onClick={() => selectPlace(r)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-emerald-50 border-b border-slate-100 last:border-0 flex items-center gap-2"
                >
                  <MapPin size={11} className="text-emerald-600 shrink-0" />
                  <div className="truncate">
                    <span className="font-semibold text-slate-900">{r.title || r.name}</span>
                    <span className="text-[10px] text-slate-500 ml-1.5">{r.subtitle || r.display_name}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Basemap Chips */}
        <div className="flex items-center gap-1 bg-white p-0.5 rounded-md border border-slate-200">
          {["satellite", "streets", "dark", "light"].map((k) => (
            <button
              key={k}
              data-testid={`picker-basemap-${k}`}
              onClick={() => setCurrentBasemap(k)}
              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors capitalize ${
                currentBasemap === k
                  ? "bg-slate-900 text-white shadow-xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {/* GPS Button */}
        <button
          data-testid="picker-gps-btn"
          onClick={locateUser}
          disabled={locating}
          title="Detect Current GPS Location"
          className="h-7 px-2.5 rounded text-xs font-semibold bg-white border border-slate-300 hover:border-emerald-500 hover:text-emerald-700 text-slate-700 flex items-center gap-1.5 transition-colors"
        >
          {locating ? <Loader2 size={12} className="animate-spin text-emerald-600" /> : <Crosshair size={12} className="text-emerald-600" />}
          <span className="hidden sm:inline">GPS</span>
        </button>
      </div>

      {/* Interactive Map Canvas */}
      <div className="h-72 w-full relative">
        <MapContainer center={[lat, lng]} zoom={13} style={{ height: "100%", width: "100%" }} scrollWheelZoom>
          <TileLayer key={currentBasemap} url={bm.url} attribution={bm.attribution} maxZoom={19} />
          {bm.labels && <TileLayer key={`${currentBasemap}-labels`} url={bm.labels} maxZoom={19} />}
          <ScaleControl imperial={false} position="bottomleft" />
          <Fly lat={lat} lng={lng} />
          <ClickPicker onPick={onPick} />

          {/* Dynamic Site Area Radius Circle Preview */}
          <Circle
            center={[lat, lng]}
            radius={siteRadiusMeters}
            pathOptions={{
              color: "#10B981",
              weight: 2,
              dashArray: "6 6",
              fillColor: "#10B981",
              fillOpacity: 0.16,
            }}
          >
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span className="text-[10px] font-bold bg-slate-900/90 text-white px-1.5 py-0.5 rounded shadow">
                Footprint: {siteAreaSqkm} km² (Radius: ~{(siteRadiusMeters / 1000).toFixed(2)} km)
              </span>
            </Tooltip>
          </Circle>

          {/* Site Center Pin */}
          <CircleMarker
            center={[lat, lng]}
            radius={7}
            pathOptions={{ color: "#ffffff", weight: 2.5, fillColor: "#059669", fillOpacity: 1 }}
          />
        </MapContainer>

        {/* Floating map hint */}
        <div className="absolute top-2 left-2 z-[500] text-[10px] uppercase tracking-wider font-semibold bg-slate-900/80 backdrop-blur text-white px-2 py-1 rounded shadow">
          📍 Click anywhere to move site anchor
        </div>
      </div>

      {/* Bottom Coordinate Two-Way Sync Bar */}
      <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
            <Compass size={12} className="text-emerald-600" /> Lat/Lng:
          </span>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              data-testid="picker-manual-lat"
              value={manualLat}
              onChange={(e) => setManualLat(e.target.value)}
              className="w-24 h-7 px-2 text-xs font-mono font-semibold bg-white border border-slate-300 rounded focus:border-emerald-500 focus:outline-none"
              placeholder="Latitude"
            />
            <span className="text-slate-400">,</span>
            <input
              type="text"
              data-testid="picker-manual-lng"
              value={manualLng}
              onChange={(e) => setManualLng(e.target.value)}
              className="w-24 h-7 px-2 text-xs font-mono font-semibold bg-white border border-slate-300 rounded focus:border-emerald-500 focus:outline-none"
              placeholder="Longitude"
            />
            <button
              data-testid="picker-apply-coords-btn"
              onClick={handleManualApply}
              className="h-7 px-2 rounded bg-slate-900 text-white font-semibold text-[11px] hover:bg-slate-800 transition-colors flex items-center gap-1"
            >
              <Check size={11} /> Apply
            </button>
          </div>
        </div>

        <button
          data-testid="picker-copy-coords-btn"
          onClick={copyCoords}
          className="text-slate-500 hover:text-emerald-700 flex items-center gap-1 text-[11px] font-medium"
        >
          <Copy size={12} /> Copy Coordinates
        </button>
      </div>
    </div>
  );
};
