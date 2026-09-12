import math
from datetime import datetime
from typing import List, Optional, Dict, Any

# ---------- Planning Engine ----------
PLANNING_RULES = {
    "schools_per_1000": 1 / 10000,      # 1 school per 10,000 people (15-20 for 150k-200k population)
    "hospitals_per_1000": 1 / 25000,    # 1 hospital per 25000 people
    "colleges_per_1000": 1 / 60000,
    "parks_per_1000": 1 / 5000,
    "clinics_per_1000": 1 / 8000,
    "land_use": {
        "residential": 0.38,
        "commercial": 0.10,
        "institutional": 0.10,
        "industrial": 0.05,
        "roads_transport": 0.15,
        "parks_green": 0.15,
        "public_utility": 0.07,
    },
    "density_persons_per_sqkm": 12000,
    "road_km_per_sqkm": 8,
}

def forecast_population(current: int, target: int, growth: float, years: int) -> Dict[str, Any]:
    projected = current * ((1 + growth / 100) ** years)
    final = max(int(projected), target)
    return {
        "current": current,
        "target": target,
        "forecast_year": datetime.now().year + years,
        "forecast_population": final,
        "annual_growth_rate": growth,
        "cagr_reasoning": f"Compound growth of {growth}% per annum over {years} years",
    }

def compute_infrastructure(pop: int, existing: Dict[str, int]) -> Dict[str, Any]:
    req_schools = math.ceil(pop * PLANNING_RULES["schools_per_1000"])
    req_hospitals = math.ceil(pop * PLANNING_RULES["hospitals_per_1000"])
    req_colleges = math.ceil(pop * PLANNING_RULES["colleges_per_1000"])
    req_parks = math.ceil(pop * PLANNING_RULES["parks_per_1000"])
    req_clinics = math.ceil(pop * PLANNING_RULES["clinics_per_1000"])
    return {
        "schools": {"required": req_schools, "existing": existing.get("schools", 0), "deficit": max(0, req_schools - existing.get("schools", 0))},
        "hospitals": {"required": req_hospitals, "existing": existing.get("hospitals", 0), "deficit": max(0, req_hospitals - existing.get("hospitals", 0))},
        "colleges": {"required": req_colleges, "existing": existing.get("colleges", 0), "deficit": max(0, req_colleges - existing.get("colleges", 0))},
        "parks": {"required": req_parks, "existing": existing.get("parks", 0), "deficit": max(0, req_parks - existing.get("parks", 0))},
        "clinics": {"required": req_clinics, "existing": 0, "deficit": req_clinics},
    }

def compute_zoning(site_area_sqkm: float, pop: int, land_use: Optional[Dict[str, float]] = None) -> List[Dict[str, Any]]:
    zones = []
    palette = {
        "residential": "#FBBF24",
        "commercial": "#F87171",
        "institutional": "#60A5FA",
        "industrial": "#A78BFA",
        "roads_transport": "#94A3B8",
        "parks_green": "#34D399",
        "public_utility": "#38BDF8",
    }
    purposes = {
        "residential": "Housing for target population with density-appropriate layouts",
        "commercial": "Retail, office and mixed-use commercial activity nodes",
        "institutional": "Schools, colleges, public offices and civic facilities",
        "industrial": "Light industrial and logistics areas with buffer zones",
        "roads_transport": "Primary and secondary road network with transit corridors",
        "parks_green": "Green open spaces, urban parks and ecological corridors",
        "public_utility": "Water, power, waste treatment and public services",
    }
    zid = 1
    for key, ratio in (land_use or PLANNING_RULES["land_use"]).items():
        area = round(site_area_sqkm * ratio, 3)
        cap = int(pop * ratio) if key == "residential" else 0
        zones.append({
            "id": f"Z-{zid:02d}",
            "type": key,
            "name": key.replace("_", " ").title(),
            "color": palette[key],
            "area_sqkm": area,
            "percentage": round(ratio * 100, 1),
            "population_served": cap if cap else int(pop * ratio * 0.4),
            "purpose": purposes[key],
            "reasoning": f"Allocated {round(ratio*100,1)}% based on URDPFI-inspired planning norms for a target population of {pop:,}.",
        })
        zid += 1
    return zones

def compute_sustainability(pop: int, site: float, green_ratio: Optional[float] = None) -> Dict[str, Any]:
    green_ratio = PLANNING_RULES["land_use"]["parks_green"] if green_ratio is None else green_ratio
    return {
        "embodied_carbon": {"value": round(pop * 0.0042, 1), "unit": "kt CO2e", "score": 72, "trend": "decreasing"},
        "solar_potential": {"value": round(site * 145, 1), "unit": "MWh/yr", "score": 84, "trend": "high"},
        "daylight": {"value": 78, "unit": "% avg", "score": 78},
        "wind": {"value": 65, "unit": "comfort score", "score": 65},
        "noise": {"value": 58, "unit": "dB avg", "score": 62},
        "green_space_pct": round(green_ratio * 100, 1),
        "land_efficiency": 81,
        "note": "Values marked as PROTOTYPE — connect Autodesk Forma for real analysis.",
        "data_source": "prototype",
    }

def compute_score(infra: Dict, sust: Dict) -> Dict[str, Any]:
    infra_fulfillment = 100 - min(60, sum(v["deficit"] for v in infra.values()) * 3)
    breakdown = [
        {"category": "Infrastructure Fulfillment", "weight": 25, "score": max(40, infra_fulfillment), "reason": "Based on schools/hospitals/parks required vs existing"},
        {"category": "Land Use Efficiency", "weight": 20, "score": 82, "reason": "Balanced residential + commercial + institutional distribution"},
        {"category": "Accessibility", "weight": 15, "score": 76, "reason": "Road coverage and facility distribution"},
        {"category": "Green / Open Space", "weight": 15, "score": min(100, sust["green_space_pct"] * 5), "reason": "% of site allocated to parks & greens"},
        {"category": "Sustainability", "weight": 15, "score": sust["solar_potential"]["score"], "reason": "Composite of solar, carbon, daylight, wind, noise"},
        {"category": "Population Capacity", "weight": 10, "score": 88, "reason": "Density feasibility vs target population"},
    ]
    overall = sum(b["score"] * b["weight"] for b in breakdown) / 100
    return {"overall": round(overall, 1), "breakdown": breakdown, "data_source": "prototype"}

def compute_risks(pop: int, deficit_schools: int, deficit_hospitals: int) -> List[Dict[str, Any]]:
    risks = [
        {
            "id": "R-01",
            "title": "Arterial Traffic Gridlock & Peak-Hour Bottlenecks",
            "level": "High",
            "probability": 78,
            "impact": 82,
            "rpn": 64,
            "residual_probability": 32,
            "residual_impact": 38,
            "residual_rpn": 12,
            "risk_reduction_pct": 81,
            "category": "Transportation",
            "reason": "Rapid population growth with concentrated commercial nodes will stress primary radial arterials beyond Level of Service (LoS) D.",
            "mitigation": "Implement Transit-Oriented Development (TOD), establish dedicated Bus Rapid Transit (BRT) corridors, and mandate multi-modal mobility hubs.",
            "authority": "Unified Metropolitan Transport Authority (UMTA) & PWD",
            "timeframe": "Phase 1 (0–24 months)",
            "capex_estimate": "₹85 Cr ($10.2M)",
            "statutory_standard": "IRC:106-1990 Urban Arterial Guidelines"
        },
        {
            "id": "R-02",
            "title": "Civic Infrastructure & Social Amenity Deficit",
            "level": "High" if deficit_schools + deficit_hospitals > 10 else "Medium",
            "probability": 70,
            "impact": 75,
            "rpn": 53,
            "residual_probability": 28,
            "residual_impact": 34,
            "residual_rpn": 10,
            "risk_reduction_pct": 81,
            "category": "Public Services",
            "reason": f"Current municipal facilities fall short by {deficit_schools} primary/secondary schools and {deficit_hospitals} healthcare facilities versus projected population demand.",
            "mitigation": "Fast-track public-private partnership (PPP) civic reservations in Zone Z-04 and enforce 15-minute neighborhood accessibility radii.",
            "authority": "Directorate of Municipal Administration & Health Dept",
            "timeframe": "Phase 1 (0–18 months)",
            "capex_estimate": "₹120 Cr ($14.4M)",
            "statutory_standard": "URDPFI 2014 Civic Facilities Norms"
        },
        {
            "id": "R-03",
            "title": "Hydrological Runoff & Urban Cloudburst Flood Stress",
            "level": "High",
            "probability": 62,
            "impact": 85,
            "rpn": 53,
            "residual_probability": 24,
            "residual_impact": 35,
            "residual_rpn": 8,
            "risk_reduction_pct": 85,
            "category": "Environmental & Hydrology",
            "reason": "65%+ impervious surface expansion increases peak stormwater runoff by 2.4x during high-intensity 100-year monsoon cloudburst events.",
            "mitigation": "Mandate permeable pavements, construct continuous bioswales, and engineer retention ponds with 15%+ open green sponge park buffer.",
            "authority": "State Disaster Management Authority (SDMA) & Drainage Board",
            "timeframe": "Phase 1 (0–12 months)",
            "capex_estimate": "₹42 Cr ($5.0M)",
            "statutory_standard": "NDMA National Urban Flood Guidelines"
        },
        {
            "id": "R-04",
            "title": "Demographic Volatility & Housing Affordability Shortfall",
            "level": "Medium",
            "probability": 58,
            "impact": 64,
            "rpn": 37,
            "residual_probability": 30,
            "residual_impact": 36,
            "residual_rpn": 11,
            "risk_reduction_pct": 70,
            "category": "Demographics & Housing",
            "reason": "Migration and economic factors can shift the 15-year population trajectory by ±18%, threatening informal settlement sprawl on peripheral boundaries.",
            "mitigation": "Zone 25%+ of residential envelopes for EWS / LIG inclusionary housing with phased incremental density buffers.",
            "authority": "State Housing & Area Development Authority (MHADA)",
            "timeframe": "Phase 2 (12–36 months)",
            "capex_estimate": "₹95 Cr ($11.4M)",
            "statutory_standard": "PMAY-U Inclusionary Housing Norms"
        },
        {
            "id": "R-05",
            "title": "Urban Heat Island & Microclimate Facade Trapping",
            "level": "Medium",
            "probability": 52,
            "impact": 60,
            "rpn": 31,
            "residual_probability": 22,
            "residual_impact": 28,
            "residual_rpn": 6,
            "risk_reduction_pct": 81,
            "category": "Climate & Sustainability",
            "reason": "Dense commercial masonry envelopes without sky view factor buffers elevate localized ambient summer temperatures by 2.8°C to 3.8°C.",
            "mitigation": "Mandate high-albedo cool roofs (SRI > 78), green living podiums, and enforce building setbacks for cross-ventilation aerodynamic corridors.",
            "authority": "Municipal Green Building Cell & State Pollution Control Board",
            "timeframe": "Phase 2 (18–36 months)",
            "capex_estimate": "₹18 Cr ($2.2M)",
            "statutory_standard": "ECBC 2017 & GRIHA 5-Star Guidelines"
        },
        {
            "id": "R-06",
            "title": "Peak Power Grid & Potable Water Demand Deficit",
            "level": "Medium",
            "probability": 48,
            "impact": 72,
            "rpn": 35,
            "residual_probability": 20,
            "residual_impact": 32,
            "residual_rpn": 6,
            "risk_reduction_pct": 83,
            "category": "Utilities & Energy",
            "reason": "Projected population surge creates a 28 MLD potable water deficit and 45 MW peak summer electrical grid strain.",
            "mitigation": "Mandate decentralized sewage treatment plants (STP) with dual-plumbing greywater reuse (85% recovery) and 20% mandatory rooftop solar PV.",
            "authority": "State Electricity Distribution Co. & Water Supply Board",
            "timeframe": "Phase 1 (0–18 months)",
            "capex_estimate": "₹65 Cr ($7.8M)",
            "statutory_standard": "CPHEEO Potable Water & Power Manuals"
        },
    ]
    return risks

def build_proposals(pop: int, site: float, zones: List[Dict]) -> List[Dict]:
    balanced = {
        "id": "P-A", "name": "Proposal A — Balanced Development",
        "description": "Balanced allocation prioritizing housing capacity and economic activity with adequate infrastructure.",
        "land_use": {z["type"]: z["percentage"] for z in zones},
        "population_capacity": int(pop * 1.05),
        "green_space_pct": 15, "road_coverage_pct": 15,
        "schools": math.ceil(pop / 1500), "hospitals": math.ceil(pop / 25000), "parks": math.ceil(pop / 5000),
        "metrics": {"embodied_carbon": 74, "daylight": 76, "wind": 68, "noise": 62, "solar": 82, "sustainability": 74},
        "score": 79.4,
    }
    sustain = {
        "id": "P-B", "name": "Proposal B — Sustainability Focused",
        "description": "Higher green cover, transit-oriented development and reduced embodied carbon with slightly lower density.",
        "land_use": {"residential": 34, "commercial": 9, "institutional": 11, "industrial": 3, "roads_transport": 14, "parks_green": 22, "public_utility": 7},
        "population_capacity": int(pop * 0.95),
        "green_space_pct": 22, "road_coverage_pct": 14,
        "schools": math.ceil(pop / 1500), "hospitals": math.ceil(pop / 25000), "parks": math.ceil(pop / 4000),
        "metrics": {"embodied_carbon": 84, "daylight": 82, "wind": 76, "noise": 70, "solar": 88, "sustainability": 88},
        "score": 84.2,
    }
    return [balanced, sustain]
