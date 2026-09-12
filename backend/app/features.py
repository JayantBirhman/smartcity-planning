"""
SmartScape Data Processing & Feature Extraction Pipeline
=========================================================
Extracts multi-dimensional spatial, morphological, network, environmental,
and demographic feature vectors from raw site boundaries, URDPFI zoning data,
and OpenStreetMap (OSM) infrastructure layers.
"""

import math
import io
import csv
import json
from typing import Dict, Any, Optional, List
from fastapi import APIRouter, HTTPException, Depends, Response
from pydantic import BaseModel
from shapely.geometry import Polygon as ShpPolygon

from backend.app.db import db
from backend.app.auth import get_current_user, now_iso
from backend.app.config import logger
from backend.app.geometry import _to_local
from backend.app.geodata import fetch_osm_amenities, compute_nearest_amenity_distances

router = APIRouter(tags=["features"])

# Benchmarks for normalizing metrics into [0.0, 1.0] for ML models
NORMALIZATION_BOUNDS = {
    "compactness": (0.2, 1.0),
    "solidity": (0.5, 1.0),
    "shape_regularity": (0.2, 1.0),
    "road_density": (2.0, 25.0),            # km / sq.km
    "school_proximity": (2000.0, 400.0),    # inverted: closer is better
    "hospital_proximity": (5000.0, 1000.0), # inverted: closer is better
    "park_proximity": (1500.0, 300.0),      # inverted: closer is better
    "transit_access": (40.0, 95.0),
    "mixed_use_entropy": (0.4, 1.0),
    "green_ratio": (0.05, 0.35),
    "solar_potential": (50.0, 100.0),
    "daylight_score": (50.0, 95.0),
    "wind_comfort": (40.0, 90.0),
    "acoustic_score": (40.0, 90.0),
    "density_balance": (2000.0, 25000.0),   # people / sq.km
    "land_efficiency": (50.0, 95.0),
}

FEATURE_METADATA = {
    "compactness": {"name": "Polsby-Popper Compactness", "domain": "Spatial Morphology", "unit": "ratio", "desc": "Ratio of area to perimeter squared, normalized to circle = 1.0"},
    "solidity": {"name": "Convex Hull Solidity", "domain": "Spatial Morphology", "unit": "ratio", "desc": "Ratio of site area to its convex hull area"},
    "shape_regularity": {"name": "Bounding Box Regularity", "domain": "Spatial Morphology", "unit": "ratio", "desc": "Ratio of site area to minimum bounding box"},
    "road_density": {"name": "Road Network Density", "domain": "Network & Proximity", "unit": "km/km²", "desc": "Total road length per square kilometer of site area"},
    "school_access": {"name": "School Proximity Index", "domain": "Network & Proximity", "unit": "meters", "desc": "Walking distance proximity to nearest educational facilities"},
    "hospital_access": {"name": "Healthcare Proximity Index", "domain": "Network & Proximity", "unit": "meters", "desc": "Distance to emergency and community healthcare centers"},
    "park_access": {"name": "Recreational Greenspace Access", "domain": "Network & Proximity", "unit": "meters", "desc": "Walking accessibility to public recreational parks"},
    "transit_access": {"name": "Transit Accessibility Score", "domain": "Network & Proximity", "unit": "score (0-100)", "desc": "Coverage score for bus rapid transit & metro stops"},
    "mixed_use_entropy": {"name": "Shannon Land-Use Entropy", "domain": "Urban Diversity", "unit": "entropy", "desc": "Equitability and functional mix of URDPFI zoning allocation"},
    "green_ratio": {"name": "Green Cover Ratio", "domain": "Urban Diversity", "unit": "ratio", "desc": "Proportion of total site area allocated to open/green spaces"},
    "solar_potential": {"name": "Solar Insolation Potential", "domain": "Climate & Resilience", "unit": "kWh/m²", "desc": "Simulated rooftop solar generation exposure score"},
    "daylight": {"name": "Daylight Autonomy Score", "domain": "Climate & Resilience", "unit": "% autonomy", "desc": "Natural daylight availability across building envelopes"},
    "wind_comfort": {"name": "Pedestrian Wind Comfort", "domain": "Climate & Resilience", "unit": "% safe", "desc": "Lawson wind comfort criteria compliance score"},
    "acoustic_quality": {"name": "Acoustic Buffer Score", "domain": "Climate & Resilience", "unit": "% buffered", "desc": "Arterial noise attenuation and buffer performance"},
    "density_balance": {"name": "Demographic Density Balance", "domain": "Socio-Demographics", "unit": "ppl/km²", "desc": "Forecasted population density relative to carrying capacity"},
    "land_efficiency": {"name": "Land Utilization Efficiency", "domain": "Socio-Demographics", "unit": "score (0-100)", "desc": "URDPFI infrastructure utilization efficiency rating"},
}

RAW_KEY_MAP = {
    "compactness": "compactness",
    "solidity": "solidity",
    "shape_regularity": "shape_regularity",
    "road_density": "road_density_km_sqkm",
    "school_access": "school_proximity_m",
    "hospital_access": "hospital_proximity_m",
    "park_access": "park_proximity_m",
    "transit_access": "transit_accessibility_score",
    "mixed_use_entropy": "mixed_use_entropy",
    "green_ratio": "green_space_ratio",
    "solar_potential": "solar_potential_score",
    "daylight": "daylight_score",
    "wind_comfort": "wind_comfort_score",
    "acoustic_quality": "acoustic_score",
    "density_balance": "population_density_per_sqkm",
    "land_efficiency": "land_efficiency_score",
}



def _norm(val: Optional[float], min_val: float, max_val: float) -> float:
    """Normalizes a value to [0.0, 1.0] with clamping."""
    if val is None or math.isnan(val):
        return 0.5
    if min_val == max_val:
        return 0.5
    # When min_val > max_val, lower value is better (e.g. proximity in meters)
    if min_val > max_val:
        normalized = (min_val - val) / (min_val - max_val)
    else:
        normalized = (val - min_val) / (max_val - min_val)
    return round(max(0.0, min(1.0, float(normalized))), 4)


def extract_morphology(boundary_coords: Optional[List[List[float]]],
                       lat0: float, lng0: float,
                       fallback_area_sqkm: float = 10.0) -> Dict[str, Any]:
    """
    Computes rigorous 2D spatial morphology indicators using Shapely:
    - Polsby-Popper Compactness ratio: 4 * pi * Area / Perimeter^2
    - Solidity / Convexity: Area / Convex Hull Area
    - Aspect ratio & shape regularity
    - Boundary Perimeter and Area
    """
    if boundary_coords and len(boundary_coords) >= 3:
        try:
            local_pts = _to_local(boundary_coords, lat0, lng0)
            poly = ShpPolygon(local_pts)
            if not poly.is_valid:
                poly = poly.buffer(0)

            area_m2 = poly.area
            perimeter_m = poly.length

            if area_m2 > 0 and perimeter_m > 0:
                area_sqkm = area_m2 / 1_000_000.0
                convex_hull = poly.convex_hull
                hull_area = convex_hull.area if convex_hull else area_m2
                solidity = min(1.0, area_m2 / hull_area) if hull_area > 0 else 1.0

                # Polsby-Popper isoperimetric quotient (circle = 1.0)
                compactness = (4.0 * math.pi * area_m2) / (perimeter_m * perimeter_m)
                compactness = min(1.0, max(0.05, compactness))

                minx, miny, maxx, maxy = poly.bounds
                w = max(maxx - minx, 1.0)
                h = max(maxy - miny, 1.0)
                aspect_ratio = max(w, h) / min(w, h)
                shape_regularity = min(w, h) / max(w, h)
                perim_area_ratio = perimeter_m / area_m2

                return {
                    "has_real_boundary": True,
                    "area_sqkm": round(area_sqkm, 3),
                    "perimeter_m": round(perimeter_m, 1),
                    "perimeter_km": round(perimeter_m / 1000.0, 3),
                    "compactness": round(compactness, 4),
                    "solidity": round(solidity, 4),
                    "aspect_ratio": round(aspect_ratio, 2),
                    "shape_regularity": round(shape_regularity, 4),
                    "perimeter_area_ratio": round(perim_area_ratio, 6),
                    "bounding_box_m": {"width": round(w, 1), "height": round(h, 1)},
                }
        except Exception as e:
            logger.warning(f"Error extracting boundary morphology: {e}")

    # Theoretical square grid approximation if boundary is simulated
    side_m = math.sqrt(fallback_area_sqkm * 1_000_000.0)
    perim_m = 4.0 * side_m
    compactness = (4.0 * math.pi * (side_m * side_m)) / (perim_m * perim_m)  # pi / 4 ~= 0.7854
    return {
        "has_real_boundary": False,
        "area_sqkm": round(fallback_area_sqkm, 3),
        "perimeter_m": round(perim_m, 1),
        "perimeter_km": round(perim_m / 1000.0, 3),
        "compactness": round(compactness, 4),
        "solidity": 0.985,
        "aspect_ratio": 1.08,
        "shape_regularity": 0.925,
        "perimeter_area_ratio": round(perim_m / (fallback_area_sqkm * 1_000_000.0), 6),
        "bounding_box_m": {"width": round(side_m, 1), "height": round(side_m, 1)},
    }


def compute_shannon_entropy(zones: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Computes the Shannon Entropy Index of land-use distribution:
    H = - sum(p_i * ln(p_i))
    Measures the functional diversity and vibrancy of the urban mix.
    """
    if not zones:
        return {"entropy": 0.0, "normalized_entropy": 0.0, "simpson_index": 0.0, "assessment": "Mono-functional"}

    total_pct = sum(z.get("percentage", 0) for z in zones) or 100.0
    probabilities = [z.get("percentage", 0) / total_pct for z in zones if z.get("percentage", 0) > 0]

    h = 0.0
    simpson = 0.0
    for p in probabilities:
        if p > 0:
            h -= p * math.log(p)
            simpson += p * p

    # Max possible entropy for N zones is ln(N)
    n = len(probabilities)
    max_h = math.log(n) if n > 1 else 1.0
    norm_entropy = round(h / max_h, 4) if max_h > 0 else 0.0
    simpson_diversity = round(1.0 - simpson, 4)

    if norm_entropy >= 0.85:
        assessment = "High Urban Diversity (Balanced URDPFI Mixed-Use)"
    elif norm_entropy >= 0.65:
        assessment = "Moderate Diversity (Developing Mixed-Use Hub)"
    else:
        assessment = "Low Diversity (Monocentric / Single-Use Sprawl)"

    return {
        "entropy": round(h, 4),
        "shannon_entropy": round(h, 4),
        "max_entropy": round(max_h, 4),
        "normalized_entropy": norm_entropy,
        "effective_diversity_index": norm_entropy,
        "simpson_diversity": simpson_diversity,
        "active_zone_classes": n,
        "assessment": assessment,
    }


def process_features_pipeline(project: Dict[str, Any],
                              boundary_coords: Optional[List[List[float]]] = None,
                              fetch_live_osm: bool = False) -> Dict[str, Any]:
    """
    Executes the full data processing and feature extraction pipeline on a project.
    Returns structured features, domain metrics, and an ML-ready feature vector.
    """
    loc = project.get("location", {})
    lat = float(loc.get("lat", 18.5204))
    lng = float(loc.get("lng", 73.8567))
    site_area = float(project.get("site_area_sqkm", 10.0))
    zones = project.get("zones", [])
    pop = project.get("population", {}).get("forecast_population", 50000)
    sust = project.get("sustainability", {})
    score = project.get("score", {})

    boundary_ring = boundary_coords or project.get("boundary", {}).get("ring")

    # 1. Spatial Morphology Features
    morphology = extract_morphology(boundary_ring, lat, lng, site_area)

    # 2. Land-Use Diversity & Entropy Features
    entropy_metrics = compute_shannon_entropy(zones)

    # 3. Accessibility & Network Amenities (OSM Proximity / Baseline)
    real_suit = project.get("real_suitability", {})
    amenities = real_suit.get("amenities") or project.get("amenities")
    if not amenities and fetch_live_osm:
        try:
            raw_osm = fetch_osm_amenities(lat, lng, radius_m=2500, boundary_coords=boundary_ring)
            amenities = compute_nearest_amenity_distances(lat, lng, raw_osm)
        except Exception as e:
            logger.warning(f"Live OSM fetch skipped: {e}")
            amenities = {}
    elif not amenities:
        amenities = {
            "schools": {"nearest_distance_m": 850.0},
            "hospitals": {"nearest_distance_m": 2200.0},
            "parks": {"nearest_distance_m": 620.0},
            "roads": {"nearest_distance_m": 150.0},
        }

    sch_dist = amenities.get("schools", {}).get("nearest_distance_m") or 850.0
    hosp_dist = amenities.get("hospitals", {}).get("nearest_distance_m") or 2200.0
    park_dist = amenities.get("parks", {}).get("nearest_distance_m") or 620.0
    road_dist = amenities.get("roads", {}).get("nearest_distance_m") or 150.0
    road_density = round(project.get("inputs", {}).get("existing_roads_km", 40.0) / max(site_area, 0.1), 2)

    # 4. Urban Sustainability & Climate Features
    solar_val = sust.get("solar_potential", {}).get("score", 84)
    daylight_val = sust.get("daylight", {}).get("value", 78)
    wind_val = sust.get("wind", {}).get("value", 65)
    noise_val = sust.get("noise", {}).get("score", 62)
    green_pct = sust.get("green_space_pct", 15.0) / 100.0

    # 5. Demographic & Density Features
    pop_density = round(pop / max(site_area, 0.1), 1)
    land_eff = sust.get("land_efficiency", 81)

    # Compile Raw Features
    raw_features = {
        # Morphology
        "compactness": morphology["compactness"],
        "solidity": morphology["solidity"],
        "shape_regularity": morphology["shape_regularity"],
        "aspect_ratio": morphology["aspect_ratio"],
        "perimeter_to_area": morphology["perimeter_area_ratio"],
        "site_area_sqkm": morphology["area_sqkm"],
        # Network & Proximity
        "road_density_km_sqkm": road_density,
        "school_proximity_m": sch_dist,
        "hospital_proximity_m": hosp_dist,
        "park_proximity_m": park_dist,
        "arterial_proximity_m": road_dist,
        "transit_accessibility_score": score.get("breakdown", [{}, {}, {"score": 76}])[2].get("score", 76),
        # Diversity & Entropy
        "mixed_use_entropy": entropy_metrics["normalized_entropy"],
        "shannon_entropy_raw": entropy_metrics["entropy"],
        "simpson_diversity": entropy_metrics["simpson_diversity"],
        "green_space_ratio": green_pct,
        # Environmental & Resilience
        "solar_potential_score": solar_val,
        "daylight_score": daylight_val,
        "wind_comfort_score": wind_val,
        "acoustic_score": noise_val,
        "carbon_intensity_score": sust.get("embodied_carbon", {}).get("score", 72),
        # Demographics
        "population_density_per_sqkm": pop_density,
        "land_efficiency_score": land_eff,
        "overall_planning_score": score.get("overall", 70.5),
    }

    # 6. Assemble 16-Dimensional Normalized ML Feature Vector
    normalized_features = {
        "compactness": _norm(raw_features["compactness"], *NORMALIZATION_BOUNDS["compactness"]),
        "solidity": _norm(raw_features["solidity"], *NORMALIZATION_BOUNDS["solidity"]),
        "shape_regularity": _norm(raw_features["shape_regularity"], *NORMALIZATION_BOUNDS["shape_regularity"]),
        "road_density": _norm(raw_features["road_density_km_sqkm"], *NORMALIZATION_BOUNDS["road_density"]),
        "school_access": _norm(raw_features["school_proximity_m"], *NORMALIZATION_BOUNDS["school_proximity"]),
        "hospital_access": _norm(raw_features["hospital_proximity_m"], *NORMALIZATION_BOUNDS["hospital_proximity"]),
        "park_access": _norm(raw_features["park_proximity_m"], *NORMALIZATION_BOUNDS["park_proximity"]),
        "transit_access": _norm(raw_features["transit_accessibility_score"], *NORMALIZATION_BOUNDS["transit_access"]),
        "mixed_use_entropy": _norm(raw_features["mixed_use_entropy"], *NORMALIZATION_BOUNDS["mixed_use_entropy"]),
        "green_ratio": _norm(raw_features["green_space_ratio"], *NORMALIZATION_BOUNDS["green_ratio"]),
        "solar_potential": _norm(raw_features["solar_potential_score"], *NORMALIZATION_BOUNDS["solar_potential"]),
        "daylight": _norm(raw_features["daylight_score"], *NORMALIZATION_BOUNDS["daylight_score"]),
        "wind_comfort": _norm(raw_features["wind_comfort_score"], *NORMALIZATION_BOUNDS["wind_comfort"]),
        "acoustic_quality": _norm(raw_features["acoustic_score"], *NORMALIZATION_BOUNDS["acoustic_score"]),
        "density_balance": _norm(raw_features["population_density_per_sqkm"], *NORMALIZATION_BOUNDS["density_balance"]),
        "land_efficiency": _norm(raw_features["land_efficiency_score"], *NORMALIZATION_BOUNDS["land_efficiency"]),
    }

    # Radar Chart Profiles (6 axes grouped by domain)
    radar_axes = [
        {"axis": "Spatial Morphology", "score": round((normalized_features["compactness"] + normalized_features["solidity"]) * 50, 1), "benchmark": 75.0},
        {"axis": "Network & Access", "score": round((normalized_features["road_density"] + normalized_features["transit_access"]) * 50, 1), "benchmark": 70.0},
        {"axis": "Civic Proximity", "score": round((normalized_features["school_access"] + normalized_features["hospital_access"]) * 50, 1), "benchmark": 80.0},
        {"axis": "Mixed-Use Diversity", "score": round(normalized_features["mixed_use_entropy"] * 100, 1), "benchmark": 85.0},
        {"axis": "Climate & Environment", "score": round((normalized_features["solar_potential"] + normalized_features["daylight"] + normalized_features["green_ratio"]) * 33.3, 1), "benchmark": 78.0},
        {"axis": "Land Efficiency", "score": round(normalized_features["land_efficiency"] * 100, 1), "benchmark": 80.0},
    ]

    vector_values = list(normalized_features.values())

    ml_feature_vector = []
    for k, norm_val in normalized_features.items():
        meta = FEATURE_METADATA.get(k, {})
        raw_key = RAW_KEY_MAP.get(k, k)
        ml_feature_vector.append({
            "key": k,
            "name": meta.get("name", k.replace("_", " ").title()),
            "domain": meta.get("domain", "Urban"),
            "raw_value": raw_features.get(raw_key),
            "normalized": norm_val,
            "unit": meta.get("unit", ""),
            "description": meta.get("desc", ""),
        })

    domains = {
        "morphology": morphology,
        "network": {
            "road_density": raw_features.get("road_density_km_sqkm"),
            "school_proximity_m": raw_features.get("school_proximity_m"),
            "hospital_proximity_m": raw_features.get("hospital_proximity_m"),
            "park_proximity_m": raw_features.get("park_proximity_m"),
            "transit_access_pct": raw_features.get("transit_accessibility_score"),
        },
        "diversity": entropy_metrics,
        "resilience": {
            "solar_potential_score": raw_features.get("solar_potential_score"),
            "daylight_score": raw_features.get("daylight_score"),
            "wind_comfort_score": raw_features.get("wind_comfort_score"),
            "acoustic_score": raw_features.get("acoustic_score"),
            "green_ratio_pct": round(raw_features.get("green_space_ratio", 0) * 100, 1),
        }
    }

    return {
        "pipeline_status": "Completed",
        "status": "completed",
        "processed_at": now_iso(),
        "project_id": project.get("id"),
        "project_name": project.get("name"),
        "location": loc,
        "domains": domains,
        "morphology": morphology,
        "entropy": entropy_metrics,
        "raw_features": raw_features,
        "normalized_features": normalized_features,
        "ml_feature_vector": ml_feature_vector,
        "feature_vector_16d": vector_values,
        "radar_profile": radar_axes,
        "summary": {
            "total_extracted_features": len(raw_features),
            "ml_vector_dimensions": len(vector_values),
            "dominant_characteristic": entropy_metrics["assessment"],
            "data_sources": ["Boundary Geometry", "URDPFI Land-Use Matrix", "OSM Amenities", "Environmental Simulation"],
        },
        "pipeline_metadata": {
            "total_extracted_features": len(raw_features),
            "ml_vector_dimensions": len(vector_values),
            "dominant_characteristic": entropy_metrics["assessment"],
            "data_sources": ["Boundary Geometry", "URDPFI Land-Use Matrix", "OSM Amenities", "Environmental Simulation"],
        },
    }


# ---------- API Routes ----------

class RawExtractionIn(BaseModel):
    name: Optional[str] = "Custom Analysis Sector"
    location: Optional[Dict[str, Any]] = None
    site_area_sqkm: Optional[float] = 10.0
    zones: Optional[List[Dict[str, Any]]] = None
    land_use_mix: Optional[Dict[str, float]] = None
    population: Optional[Dict[str, Any]] = None
    target_density_pph: Optional[float] = None
    boundary: Optional[Dict[str, Any]] = None
    boundary_geojson: Optional[Dict[str, Any]] = None


@router.post("/projects/{pid}/features/process")
async def process_project_features(pid: str, user=Depends(get_current_user)):
    """Runs the feature extraction pipeline on the project and saves to database."""
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    features_output = process_features_pipeline(doc)

    await db.projects.update_one(
        {"id": pid},
        {"$set": {"features_data": features_output, "updated_at": now_iso()}}
    )

    return features_output


@router.get("/projects/{pid}/features")
async def get_project_features(pid: str, user=Depends(get_current_user)):
    """Retrieves extracted features for a project (auto-computes if not yet cached)."""
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    cached = doc.get("features_data")
    if cached:
        return cached

    # Compute on the fly if not yet cached
    features_output = process_features_pipeline(doc)
    await db.projects.update_one(
        {"id": pid},
        {"$set": {"features_data": features_output, "updated_at": now_iso()}}
    )
    return features_output


@router.post("/features/extract-raw")
async def extract_features_raw(body: RawExtractionIn, user=Depends(get_current_user)):
    """Stateless feature extraction on arbitrary spatial / demographic payloads."""
    zones = body.zones
    if not zones and body.land_use_mix:
        zones = [
            {"id": f"Z-{idx+1:02d}", "type": k, "percentage": float(v)}
            for idx, (k, v) in enumerate(body.land_use_mix.items())
        ]

    pop = body.population
    if not pop and body.target_density_pph:
        pop = {"forecast_population": int(body.target_density_pph * (body.site_area_sqkm or 10.0))}

    mock_project = {
        "id": "stateless-preview",
        "name": body.name,
        "location": body.location or {"name": "Preview Site", "lat": 18.5204, "lng": 73.8567},
        "site_area_sqkm": body.site_area_sqkm,
        "zones": zones or [
            {"id": "Z-01", "type": "residential", "percentage": 38.0},
            {"id": "Z-02", "type": "commercial", "percentage": 10.0},
            {"id": "Z-03", "type": "institutional", "percentage": 10.0},
            {"id": "Z-04", "type": "industrial", "percentage": 15.0},
            {"id": "Z-05", "type": "roads_transport", "percentage": 15.0},
            {"id": "Z-06", "type": "parks_green", "percentage": 12.0},
        ],
        "population": pop or {"forecast_population": 100000},
        "boundary": body.boundary or {},
        "sustainability": {"solar_potential": {"score": 84}, "daylight": {"value": 78}, "wind": {"value": 65}, "noise": {"score": 62}},
        "score": {"overall": 72.0},
    }

    boundary_ring = None
    if body.boundary and "ring" in body.boundary:
        boundary_ring = body.boundary["ring"]
    elif body.boundary_geojson:
        coords = body.boundary_geojson.get("coordinates", [[]])[0]
        boundary_ring = [{"lat": c[1], "lng": c[0]} if isinstance(c, (list, tuple)) else c for c in coords]

    return process_features_pipeline(mock_project, boundary_coords=boundary_ring)


@router.get("/projects/{pid}/features/export")
async def export_features(pid: str, format: str = "json", user=Depends(get_current_user)):
    """Exports processed feature vector as CSV or JSON for machine learning models."""
    fmt = format.lower()
    if fmt not in ["csv", "json"]:
        raise HTTPException(status_code=400, detail=f"Unsupported format '{format}'. Use 'csv' or 'json'.")

    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    features_output = doc.get("features_data") or process_features_pipeline(doc)
    safe_name = "".join(c if c.isalnum() else "_" for c in doc.get("name", "project")).strip("_")

    if fmt == "csv":
        out = io.StringIO()
        writer = csv.writer(out)
        writer.writerow(["feature_key", "feature_name", "domain", "raw_value", "normalized_score", "unit"])
        for item in features_output.get("ml_feature_vector", []):
            writer.writerow([
                item.get("key"),
                item.get("name"),
                item.get("domain"),
                item.get("raw_value"),
                item.get("normalized"),
                item.get("unit", "")
            ])
        return Response(
            content=out.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="smartscape_features_{safe_name}.csv"'}
        )

    json_str = json.dumps(features_output, indent=2)
    return Response(
        content=json_str,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="smartscape_features_{safe_name}.json"'}
    )
