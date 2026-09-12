import math
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import HTTPException
from shapely.geometry import Polygon as ShpPolygon, MultiPolygon, box as shp_box, shape as shp_shape, Point as ShpPoint
from shapely.ops import unary_union

M_PER_DEG_LAT = 110540.0
M_PER_DEG_LNG = 111320.0

def _to_local(coords, lat0: float, lng0: float):
    k = math.cos(math.radians(lat0))
    return [((lng - lng0) * M_PER_DEG_LNG * k, (lat - lat0) * M_PER_DEG_LAT) for lng, lat in coords]

def _to_latlng(poly, lat0: float, lng0: float):
    k = math.cos(math.radians(lat0))
    rings = []
    parts = poly.geoms if isinstance(poly, MultiPolygon) else [poly]
    for part in parts:
        if part.is_empty:
            continue
        rings.append([[lat0 + y / M_PER_DEG_LAT, lng0 + x / (M_PER_DEG_LNG * k)]
                      for x, y in part.exterior.coords])
    return rings

def extract_boundary(geojson: Dict[str, Any]) -> List[List[float]]:
    """Returns the largest polygon ring as [[lng, lat], ...]."""
    geoms = []
    def collect(node):
        t = node.get("type")
        if t == "FeatureCollection":
            for f in node.get("features", []):
                collect(f)
        elif t == "Feature":
            if node.get("geometry"):
                collect(node["geometry"])
        elif t in ("Polygon", "MultiPolygon", "GeometryCollection"):
            if t == "GeometryCollection":
                for g in node.get("geometries", []):
                    collect(g)
            else:
                geoms.append(shp_shape(node))
    collect(geojson)
    if not geoms:
        raise HTTPException(status_code=400, detail="No Polygon geometry found in the GeoJSON file")
    merged = unary_union(geoms)
    parts = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
    largest = max(parts, key=lambda p: p.area)
    return [[round(x, 7), round(y, 7)] for x, y in largest.exterior.coords]

def _cut(poly, frac: float, vertical: bool):
    if poly.is_empty or poly.area <= 0:
        return poly, poly
    frac = max(0.001, min(0.999, float(frac)))
    minx, miny, maxx, maxy = poly.bounds
    lo, hi = (minx, maxx) if vertical else (miny, maxy)
    target = poly.area * frac
    for _ in range(40):
        mid = (lo + hi) / 2
        clip = shp_box(minx, miny, mid, maxy) if vertical else shp_box(minx, miny, maxx, mid)
        try:
            if poly.intersection(clip).area < target:
                lo = mid
            else:
                hi = mid
        except Exception:
            lo = mid
    mid = (lo + hi) / 2
    clip = shp_box(minx, miny, mid, maxy) if vertical else shp_box(minx, miny, maxx, mid)
    p1 = poly.intersection(clip)
    p2 = poly.difference(clip)
    if not p1.is_valid:
        p1 = p1.buffer(0)
    if not p2.is_valid:
        p2 = p2.buffer(0)
    return p1, p2

def slice_polygon(poly, items: List[tuple]) -> List[tuple]:
    """Treemap-style slicing: items = [(key, weight)] -> [(key, polygon)] clipped inside poly."""
    if len(items) == 1 or poly.is_empty:
        return [(items[0][0], poly)] if items else []
    total = sum(w for _, w in items) or 1
    acc, idx = 0.0, 1
    for i, (_, w) in enumerate(items):
        if acc + w / 2 >= total / 2:
            idx = max(1, i)
            break
        acc += w
        idx = i + 1
    idx = min(idx, len(items) - 1)
    left, right = items[:idx], items[idx:]
    frac = sum(w for _, w in left) / total
    minx, miny, maxx, maxy = poly.bounds
    p1, p2 = _cut(poly, frac, (maxx - minx) >= (maxy - miny))
    return slice_polygon(p1, left) + slice_polygon(p2, right)

def sample_points_in(poly, count: int, lat0: float, lng0: float) -> List[List[float]]:
    if count <= 0 or poly.is_empty:
        return []
    minx, miny, maxx, maxy = poly.bounds
    k = math.cos(math.radians(lat0))
    pts = []
    # Halton-style low-discrepancy sampling with rejection — avoids visible grid patterns
    def halton(i: int, base: int) -> float:
        f, r = 1.0, 0.0
        while i > 0:
            f /= base
            r += f * (i % base)
            i //= base
        return r
    i = 1
    while len(pts) < count and i < count * 400:
        x = minx + (maxx - minx) * halton(i, 2)
        y = miny + (maxy - miny) * halton(i, 3)
        i += 1
        if poly.contains(ShpPoint(x, y)):
            pts.append([lat0 + y / M_PER_DEG_LAT, lng0 + x / (M_PER_DEG_LNG * k)])
    return pts

def build_geometry_from_boundary(ring: List[List[float]], zones: List[Dict], infra: Dict) -> Dict[str, Any]:
    lats = [c[1] for c in ring]
    lngs = [c[0] for c in ring]
    lat0, lng0 = sum(lats) / len(lats), sum(lngs) / len(lngs)
    local = ShpPolygon(_to_local(ring, lat0, lng0))
    if not local.is_valid:
        local = local.buffer(0)
    if local.is_empty or local.area <= 0:
        raise HTTPException(status_code=400, detail="Boundary polygon has no area")
    area_sqkm = round(local.area / 1_000_000, 4)

    sliced = dict(slice_polygon(local, [(z["id"], z["percentage"]) for z in zones]))
    for z in zones:
        part = sliced.get(z["id"])
        if part is None or part.is_empty:
            z["polygons"] = []
            continue
        z["polygons"] = _to_latlng(part, lat0, lng0)
        z["area_sqkm"] = round(part.area / 1_000_000, 4)

    def zone_poly(*types):
        parts = [sliced[z["id"]] for z in zones if z["type"] in types and z["id"] in sliced]
        parts = [p for p in parts if p and not p.is_empty]
        return unary_union(parts) if parts else local

    schools_area = zone_poly("residential", "institutional")
    hospitals_area = zone_poly("residential", "commercial")
    green_area = zone_poly("parks_green")
    infra_points = []
    for pt in sample_points_in(schools_area, min(infra["schools"]["required"], 24), lat0, lng0):
        infra_points.append({"type": "school", "label": "School", "color": "#2563EB", "lat": pt[0], "lng": pt[1]})
    for pt in sample_points_in(hospitals_area, min(infra["hospitals"]["required"], 12), lat0, lng0):
        infra_points.append({"type": "hospital", "label": "Hospital", "color": "#DC2626", "lat": pt[0], "lng": pt[1]})
    for pt in sample_points_in(green_area, min(infra["parks"]["required"], 18), lat0, lng0):
        infra_points.append({"type": "park", "label": "Park", "color": "#059669", "lat": pt[0], "lng": pt[1]})
    for i, p in enumerate(infra_points):
        p["id"] = f"{p['type']}-{i}"

    # Morphology metrics directly computed on the boundary
    perim_m = local.length
    compactness = (4.0 * math.pi * local.area) / (perim_m * perim_m) if perim_m > 0 else 0.785
    hull = local.convex_hull
    solidity = (local.area / hull.area) if hull.area > 0 else 1.0

    return {
        "zones": zones,
        "area_sqkm": area_sqkm,
        "centroid": {"lat": lat0, "lng": lng0},
        "boundary_latlngs": [[c[1], c[0]] for c in ring],
        "infra_points": infra_points,
        "morphology": {
            "compactness": round(compactness, 4),
            "solidity": round(solidity, 4),
            "perimeter_km": round(perim_m / 1000.0, 3),
        },
    }

def boundary_geojson(doc: Dict[str, Any]) -> Dict[str, Any]:
    ring = doc["boundary"]["ring"]
    return {"type": "FeatureCollection", "features": [{
        "type": "Feature",
        "properties": {"name": doc["name"], "site_area_sqkm": doc["site_area_sqkm"],
                       "location": doc["location"]["name"], "source": "SmartScape"},
        "geometry": {"type": "Polygon", "coordinates": [ring]},
    }]}

def zoning_geojson(doc: Dict[str, Any]) -> Dict[str, Any]:
    features = []
    for z in doc.get("zones", []):
        for ring in z.get("polygons", []) or []:
            features.append({"type": "Feature",
                             "properties": {"zone_id": z["id"], "type": z["type"], "name": z["name"],
                                            "percentage": z["percentage"], "area_sqkm": z["area_sqkm"],
                                            "color": z["color"]},
                             "geometry": {"type": "Polygon", "coordinates": [[[c[1], c[0]] for c in ring]]}})
    return {"type": "FeatureCollection", "features": features}

def full_master_plan_geojson(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Generates an RFC 7946-compliant GeoJSON FeatureCollection containing the boundary,
    all zoned polygons with urban specifications, and all infrastructure nodes."""
    features = []
    lat0 = doc.get("location", {}).get("lat", 18.5204)
    lng0 = doc.get("location", {}).get("lng", 73.8567)
    site_area = doc.get("site_area_sqkm", 10.0)

    ring = None
    if doc.get("boundary", {}).get("ring"):
        ring = doc["boundary"]["ring"]
    else:
        side_km = math.sqrt(site_area)
        d_lat = (side_km * 1000) / M_PER_DEG_LAT
        d_lng = (side_km * 1000) / (M_PER_DEG_LNG * math.cos(math.radians(lat0)))
        ring = [
            [round(lng0 - d_lng/2, 6), round(lat0 - d_lat/2, 6)],
            [round(lng0 + d_lng/2, 6), round(lat0 - d_lat/2, 6)],
            [round(lng0 + d_lng/2, 6), round(lat0 + d_lat/2, 6)],
            [round(lng0 - d_lng/2, 6), round(lat0 + d_lat/2, 6)],
            [round(lng0 - d_lng/2, 6), round(lat0 - d_lat/2, 6)],
        ]

    features.append({
        "type": "Feature",
        "id": f"boundary-{doc.get('id', 'proj')}",
        "properties": {
            "feature_type": "project_boundary",
            "name": doc.get("name", "Master Plan Boundary"),
            "site_area_sqkm": site_area,
            "site_area_hectares": round(site_area * 100, 1),
            "target_population": doc.get("population", {}).get("forecast_population"),
            "planning_score": doc.get("score", {}).get("overall"),
            "location": doc.get("location", {}).get("name"),
            "source": "SmartScape Urban GIS"
        },
        "geometry": {"type": "Polygon", "coordinates": [ring]}
    })

    has_polys = any(z.get("polygons") for z in doc.get("zones", []))
    if not has_polys:
        local = ShpPolygon(_to_local(ring, lat0, lng0))
        if not local.is_valid:
            local = local.buffer(0)
        sliced = dict(slice_polygon(local, [(z["id"], z["percentage"]) for z in doc.get("zones", [])]))
        for z in doc.get("zones", []):
            part = sliced.get(z["id"])
            if part and not part.is_empty:
                poly_coords = _to_latlng(part, lat0, lng0)
                spec = URDPFI_MASSING_SPECS.get(z["type"], {})
                for ring_coords in poly_coords:
                    features.append({
                        "type": "Feature",
                        "id": f"zone-{z['id']}",
                        "properties": {
                            "feature_type": "urban_zone",
                            "zone_id": z["id"],
                            "type": z["type"],
                            "name": z["name"],
                            "percentage": z["percentage"],
                            "area_sqkm": z.get("area_sqkm", round(part.area / 1_000_000, 3)),
                            "area_hectares": round((z.get("area_sqkm") or (part.area / 1_000_000)) * 100, 1),
                            "color": z.get("color"),
                            "purpose": z.get("purpose"),
                            "far": spec.get("far", 1.5),
                            "max_ground_coverage_pct": spec.get("max_ground_coverage_pct", 40.0),
                            "target_stories": spec.get("stories", 6)
                        },
                        "geometry": {"type": "Polygon", "coordinates": [[[c[1], c[0]] for c in ring_coords]]}
                    })
    else:
        for z in doc.get("zones", []):
            spec = URDPFI_MASSING_SPECS.get(z["type"], {})
            for ring_coords in z.get("polygons", []) or []:
                features.append({
                    "type": "Feature",
                    "id": f"zone-{z['id']}",
                    "properties": {
                        "feature_type": "urban_zone",
                        "zone_id": z["id"],
                        "type": z["type"],
                        "name": z["name"],
                        "percentage": z["percentage"],
                        "area_sqkm": z.get("area_sqkm"),
                        "area_hectares": round((z.get("area_sqkm") or 0) * 100, 1),
                        "color": z.get("color"),
                        "purpose": z.get("purpose"),
                        "far": spec.get("far", 1.5),
                        "max_ground_coverage_pct": spec.get("max_ground_coverage_pct", 40.0),
                        "target_stories": spec.get("stories", 6)
                    },
                    "geometry": {"type": "Polygon", "coordinates": [[[c[1], c[0]] for c in ring_coords]]}
                })

    infra_points = doc.get("infra_points")
    if not infra_points:
        schools_count = doc.get("infrastructure", {}).get("schools", {}).get("required", 15)
        hosp_count = doc.get("infrastructure", {}).get("hospitals", {}).get("required", 4)
        parks_count = doc.get("infrastructure", {}).get("parks", {}).get("required", 8)
        infra_points = []
        for i in range(min(12, schools_count)):
            infra_points.append({"type": "school", "label": f"Public School #{i+1}", "color": "#2563EB", "lat": lat0 + (i*0.003 - 0.015), "lng": lng0 + (i*0.004 - 0.02)})
        for i in range(min(5, hosp_count)):
            infra_points.append({"type": "hospital", "label": f"Community Hospital #{i+1}", "color": "#DC2626", "lat": lat0 + (i*0.005 - 0.01), "lng": lng0 + (i*0.002 - 0.01)})
        for i in range(min(8, parks_count)):
            infra_points.append({"type": "park", "label": f"Civic Park #{i+1}", "color": "#059669", "lat": lat0 + (i*0.004 - 0.008), "lng": lng0 + (i*0.006 - 0.015)})

    for i, pt in enumerate(infra_points):
        features.append({
            "type": "Feature",
            "id": f"infra-{pt.get('type')}-{i}",
            "properties": {
                "feature_type": "infrastructure_node",
                "type": pt.get("type"),
                "label": pt.get("label"),
                "color": pt.get("color")
            },
            "geometry": {"type": "Point", "coordinates": [round(pt["lng"], 6), round(pt["lat"], 6)]}
        })

    return {
        "type": "FeatureCollection",
        "crs": {
            "type": "name",
            "properties": {"name": "urn:ogc:def:crs:OGC:1.3:CRS84"}
        },
        "metadata": {
            "project_id": doc.get("id"),
            "project_name": doc.get("name"),
            "generator": "SmartScape Urban Intelligence GIS Engine",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "standard": "URDPFI 2014 & RFC 7946"
        },
        "features": features
    }

# ---------- URDPFI & Autodesk Forma 3D Massing Engine ----------
URDPFI_MASSING_SPECS: Dict[str, Dict[str, Any]] = {
    "residential": {
        "far": 2.25,
        "max_ground_coverage_pct": 35.0,
        "stories": 8,
        "floor_height_m": 3.2,
        "setback_m": 6.0,
        "carbon_intensity_kg": 360.0,
        "eui_kwh_sqm": 95.0,
        "typology": "Mid-Rise Residential Blocks",
        "description": "High-efficiency residential massing with continuous active street-wall podium and central courtyards.",
        "sda_pct": 82.0,
        "lawson_comfort": "Grade A (Sitting / Outdoor Dining)",
    },
    "commercial": {
        "far": 3.0,
        "max_ground_coverage_pct": 45.0,
        "stories": 12,
        "floor_height_m": 3.8,
        "setback_m": 9.0,
        "carbon_intensity_kg": 460.0,
        "eui_kwh_sqm": 150.0,
        "typology": "Commercial Core & Innovation Towers",
        "description": "Grade-A office and mixed corporate massing optimized for solar shading and natural aerodynamic flow.",
        "sda_pct": 74.0,
        "lawson_comfort": "Grade B (Standing / Transit Plaza)",
    },
    "mixed_use": {
        "far": 2.75,
        "max_ground_coverage_pct": 40.0,
        "stories": 10,
        "floor_height_m": 3.4,
        "setback_m": 7.5,
        "carbon_intensity_kg": 410.0,
        "eui_kwh_sqm": 120.0,
        "typology": "Active Podium Mixed-Use Development",
        "description": "Pedestrian-activated retail ground podium with residential and commercial towers above.",
        "sda_pct": 79.0,
        "lawson_comfort": "Grade A (Sitting / Courtyards)",
    },
    "institutional": {
        "far": 1.75,
        "max_ground_coverage_pct": 35.0,
        "stories": 5,
        "floor_height_m": 3.6,
        "setback_m": 9.0,
        "carbon_intensity_kg": 310.0,
        "eui_kwh_sqm": 85.0,
        "typology": "Civic, Health & Educational Campus",
        "description": "Low-to-mid rise institutional campus with expansive daylighting and shaded perimeter colonnades.",
        "sda_pct": 88.0,
        "lawson_comfort": "Grade A (Sitting / Academic Lawn)",
    },
    "industrial": {
        "far": 1.2,
        "max_ground_coverage_pct": 50.0,
        "stories": 3,
        "floor_height_m": 4.5,
        "setback_m": 12.0,
        "carbon_intensity_kg": 290.0,
        "eui_kwh_sqm": 110.0,
        "typology": "Eco-Industrial & Clean Logistics Hub",
        "description": "Clean manufacturing and distribution facilities with extensive solar-ready roofing.",
        "sda_pct": 71.0,
        "lawson_comfort": "Grade C (Strolling / Service Access)",
    },
    "parks_green": {
        "far": 0.05,
        "max_ground_coverage_pct": 5.0,
        "stories": 1,
        "floor_height_m": 3.5,
        "setback_m": 3.0,
        "carbon_intensity_kg": -45.0,
        "eui_kwh_sqm": 15.0,
        "typology": "Public Realm, Urban Forests & Bioswales",
        "description": "Ecological sponge park, retention ponds, tree canopy, and low-footprint civic pavilions.",
        "sda_pct": 98.0,
        "lawson_comfort": "Grade A (Sitting / Tranquil Park)",
    },
}

DEFAULT_MASSING_SPEC = {
    "far": 2.0,
    "max_ground_coverage_pct": 40.0,
    "stories": 6,
    "floor_height_m": 3.5,
    "setback_m": 6.0,
    "carbon_intensity_kg": 350.0,
    "eui_kwh_sqm": 100.0,
    "typology": "Urban Infill Development",
    "description": "Balanced urban massing meeting statutory master plan guidelines.",
    "sda_pct": 80.0,
    "lawson_comfort": "Grade B (Standing / Sidewalk)",
}

def compute_3d_massing(doc: Dict[str, Any], density_factor: float = 1.0) -> Dict[str, Any]:
    """
    Computes 3D massing building envelopes, footprints, heights, stories, FAR,
    and environmental attributes for all zoning parcels in the project.
    """
    density = max(0.6, min(2.5, float(density_factor)))
    centroid = doc.get("centroid") or {}
    loc = doc.get("location") or {}
    lat0 = centroid.get("lat") or loc.get("lat") or 18.5204
    lng0 = centroid.get("lng") or loc.get("lng") or 73.8567

    # If centroid wasn't present, derive from boundary
    ring = doc.get("boundary", {}).get("ring") or []
    if ring and (not centroid.get("lat") or not centroid.get("lng")):
        lat0 = sum(c[1] for c in ring) / len(ring)
        lng0 = sum(c[0] for c in ring) / len(ring)

    k = math.cos(math.radians(lat0))
    parcels: List[Dict[str, Any]] = []
    total_gfa_sqm = 0.0
    total_footprint_sqm = 0.0
    total_volume_m3 = 0.0
    total_embodied_carbon = 0.0
    total_solar_pv_mwh = 0.0

    zones = doc.get("zones", []) or []
    # If no polygons are defined yet (e.g. boundary not uploaded), synthesize parcel envelopes from site area
    has_polys = any(len(z.get("polygons", []) or []) > 0 for z in zones)
    if not has_polys and zones:
        site_sqkm = doc.get("site_area_sqkm") or 5.0
        side_m = math.sqrt(site_sqkm * 1_000_000.0)
        half = side_m / 2.0
        local_box = shp_box(-half, -half, half, half)
        sliced = dict(slice_polygon(local_box, [(z["id"], z.get("percentage", 10.0)) for z in zones]))
        working_zones = []
        for z in zones:
            z_copy = dict(z)
            part = sliced.get(z["id"])
            if part and not part.is_empty:
                z_copy["polygons"] = _to_latlng(part, lat0, lng0)
            else:
                z_copy["polygons"] = []
            working_zones.append(z_copy)
        zones = working_zones

    parcel_idx = 0

    for z in zones:
        z_type = z.get("type", "residential")
        spec = URDPFI_MASSING_SPECS.get(z_type, DEFAULT_MASSING_SPEC)
        color = z.get("color") or "#0284C7"

        stories = max(1, round(spec["stories"] * density))
        if z_type == "parks_green":
            stories = 1
        height_m = round(stories * spec["floor_height_m"], 1)
        far_actual = round(spec["far"] * density, 2)
        if z_type == "parks_green":
            far_actual = 0.05

        for poly_idx, poly_ring in enumerate(z.get("polygons", []) or []):
            if len(poly_ring) < 3:
                continue
            # poly_ring is [[lat, lng], ...]
            local_pts = [((lng - lng0) * M_PER_DEG_LNG * k, (lat - lat0) * M_PER_DEG_LAT)
                         for lat, lng in poly_ring]
            shp_p = ShpPolygon(local_pts)
            if not shp_p.is_valid:
                shp_p = shp_p.buffer(0)
            if shp_p.is_empty or shp_p.area <= 0:
                continue

            parcel_area_sqm = round(shp_p.area, 1)

            # Inset for setback
            setback_target = spec["setback_m"]
            setback = min(setback_target, max(1.5, math.sqrt(parcel_area_sqm) * 0.12))
            footprint_shp = shp_p.buffer(-setback)
            if footprint_shp.is_empty or footprint_shp.area < parcel_area_sqm * 0.15:
                footprint_shp = shp_p.buffer(-max(0.5, math.sqrt(parcel_area_sqm) * 0.04))
            if footprint_shp.is_empty or not footprint_shp.is_valid:
                footprint_shp = shp_p

            footprint_parts = footprint_shp.geoms if isinstance(footprint_shp, MultiPolygon) else [footprint_shp]
            main_footprint = max(footprint_parts, key=lambda p: p.area)
            footprint_sqm = round(main_footprint.area, 1)
            gfa_sqm = round(footprint_sqm * (stories if z_type != "parks_green" else 1), 1)
            volume_m3 = round(footprint_sqm * height_m, 1)
            embodied_carbon = round((gfa_sqm * spec["carbon_intensity_kg"]) / 1000.0, 1)
            # Rooftop PV: 70% roof, 1480 kWh/m2 insolation, 18.5% efficiency
            solar_pv_mwh = round((footprint_sqm * 0.70 * 1480.0 * 0.185) / 1000.0, 1) if z_type != "parks_green" else 0.0

            local_coords = [[round(x, 2), round(y, 2)] for x, y in main_footprint.exterior.coords]
            latlng_coords = [[round(lat0 + y / M_PER_DEG_LAT, 7), round(lng0 + x / (M_PER_DEG_LNG * k), 7)]
                             for x, y in local_coords]

            parcel_id = f"parcel-{z.get('id', 'z')}-{poly_idx}"
            p_data = {
                "id": parcel_id,
                "index": parcel_idx,
                "zone_id": z.get("id"),
                "zone_name": z.get("name", "Zone"),
                "zone_type": z_type,
                "color": color,
                "typology": spec["typology"],
                "description": spec["description"],
                "stories": stories,
                "height_m": height_m,
                "floor_height_m": spec["floor_height_m"],
                "far": far_actual,
                "ground_coverage_pct": spec["max_ground_coverage_pct"],
                "setback_m": round(setback, 1),
                "parcel_area_sqm": parcel_area_sqm,
                "footprint_sqm": footprint_sqm,
                "gfa_sqm": gfa_sqm,
                "volume_m3": volume_m3,
                "embodied_carbon_tonnes": embodied_carbon,
                "annual_solar_pv_mwh": solar_pv_mwh,
                "daylight_sda_pct": spec["sda_pct"],
                "lawson_wind_comfort": spec["lawson_comfort"],
                "local_coords": local_coords,
                "latlng_coords": latlng_coords,
                "centroid_latlng": [
                    round(lat0 + main_footprint.centroid.y / M_PER_DEG_LAT, 7),
                    round(lng0 + main_footprint.centroid.x / (M_PER_DEG_LNG * k), 7)
                ]
            }
            parcels.append(p_data)
            parcel_idx += 1
            total_gfa_sqm += gfa_sqm
            total_footprint_sqm += footprint_sqm
            total_volume_m3 += volume_m3
            total_embodied_carbon += embodied_carbon
            total_solar_pv_mwh += solar_pv_mwh

    site_area_sqm = (doc.get("site_area_sqkm") or 1.0) * 1_000_000.0
    overall_far = round(total_gfa_sqm / site_area_sqm, 2) if site_area_sqm > 0 else 2.0
    overall_coverage_pct = round((total_footprint_sqm / site_area_sqm) * 100.0, 1) if site_area_sqm > 0 else 35.0

    return {
        "project_id": doc.get("id"),
        "project_name": doc.get("name"),
        "density_factor": density,
        "parcels": parcels,
        "summary": {
            "parcel_count": len(parcels),
            "total_footprint_sqm": round(total_footprint_sqm, 1),
            "total_gfa_sqm": round(total_gfa_sqm, 1),
            "total_volume_m3": round(total_volume_m3, 1),
            "site_coverage_pct": overall_coverage_pct,
            "overall_far": overall_far,
            "total_embodied_carbon_tonnes": round(total_embodied_carbon, 1),
            "annual_clean_solar_pv_mwh": round(total_solar_pv_mwh, 1),
            "carbon_intensity_kg_sqm": round((total_embodied_carbon * 1000.0) / total_gfa_sqm, 1) if total_gfa_sqm > 0 else 380.0,
        },
        "centroid": {"lat": lat0, "lng": lng0},
    }

def forma_massing_geojson(massing: Dict[str, Any]) -> Dict[str, Any]:
    """Generates standard Autodesk Forma 3D GeoJSON FeatureCollection."""
    features = []
    for p in massing.get("parcels", []):
        coords = [[[c[1], c[0]] for c in p["latlng_coords"]]]
        # Close polygon if not closed
        if coords[0] and coords[0][0] != coords[0][-1]:
            coords[0].append(coords[0][0])
        features.append({
            "type": "Feature",
            "properties": {
                "id": p["id"],
                "zone_id": p["zone_id"],
                "zone_name": p["zone_name"],
                "zone_type": p["zone_type"],
                "color": p["color"],
                "typology": p["typology"],
                "stories": p["stories"],
                "height_m": p["height_m"],
                "floor_height_m": p["floor_height_m"],
                "far": p["far"],
                "footprint_sqm": p["footprint_sqm"],
                "gfa_sqm": p["gfa_sqm"],
                "volume_m3": p["volume_m3"],
                "embodied_carbon_tonnes": p["embodied_carbon_tonnes"],
                "annual_solar_pv_mwh": p["annual_solar_pv_mwh"],
                "daylight_sda_pct": p["daylight_sda_pct"],
                "lawson_wind_comfort": p["lawson_wind_comfort"],
            },
            "geometry": {
                "type": "Polygon",
                "coordinates": coords
            }
        })
    return {"type": "FeatureCollection", "features": features}

def export_wavefront_obj(massing: Dict[str, Any]) -> str:
    """
    Generates standard Wavefront OBJ 3D building envelope geometry with wall quads,
    roof caps, and material grouping ready for Autodesk Forma / Revit / Rhino / Blender.
    """
    lines: List[str] = [
        "# SmartScape — Autodesk Forma 3D Massing Export",
        f"# Project: {massing.get('project_name', 'SmartScape Plan')}",
        f"# Generated: {datetime.now(timezone.utc).isoformat()}",
        f"# Total Parcels: {len(massing.get('parcels', []))}",
        "",
        "mtllib materials.mtl",
        ""
    ]

    v_offset = 1  # OBJ vertices are 1-indexed

    for p in massing.get("parcels", []):
        local = p.get("local_coords", [])
        if len(local) < 3:
            continue
        # Deduplicate closing point if present
        pts = local[:-1] if local[0] == local[-1] else local[:]
        n = len(pts)
        if n < 3:
            continue

        height = float(p.get("height_m", 15.0))
        lines.append(f"g {p['id']}_{p['zone_type']}")
        lines.append(f"usemtl Mat_{p['zone_type']}")

        # 1. Base vertices (y = 0.0)
        # Note: In standard 3D CAD, X = East, Y = Up (elevation), Z = North
        for x, y in pts:
            lines.append(f"v {x:.3f} 0.000 {y:.3f}")

        # 2. Roof vertices (y = height)
        for x, y in pts:
            lines.append(f"v {x:.3f} {height:.3f} {y:.3f}")

        # 3. Wall quad faces
        for i in range(n):
            next_i = (i + 1) % n
            v_bot1 = v_offset + i
            v_bot2 = v_offset + next_i
            v_top2 = v_offset + n + next_i
            v_top1 = v_offset + n + i
            lines.append(f"f {v_bot1} {v_bot2} {v_top2} {v_top1}")

        # 4. Roof cap face (reversed for upward normal)
        roof_indices = [str(v_offset + n + i) for i in reversed(range(n))]
        lines.append(f"f {' '.join(roof_indices)}")

        v_offset += n * 2
        lines.append("")

    return "\n".join(lines)

