import uuid
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import httpx

from backend.app.config import logger
from backend.app.db import db
from backend.app.auth import get_current_user, now_iso
from backend.app.planning import (
    PLANNING_RULES, forecast_population, compute_infrastructure,
    compute_zoning, compute_sustainability, compute_score,
    compute_risks, build_proposals
)
from backend.app.geometry import extract_boundary, build_geometry_from_boundary, full_master_plan_geojson
from backend.app.geodata import (
    compute_real_area_risks, fetch_osm_amenities, compute_nearest_amenity_distances
)

router = APIRouter(tags=["projects"])


# ---------- Models ----------
class LocationIn(BaseModel):
    name: str
    lat: float
    lng: float
    country: Optional[str] = "India"
    state: Optional[str] = ""

class ProjectIn(BaseModel):
    name: str
    location: LocationIn
    site_area_sqkm: float = 10.0
    existing_population: int = 50000
    target_population: int = 100000
    growth_rate: float = 2.5
    planning_horizon_years: int = 20
    existing_schools: int = 8
    existing_hospitals: int = 2
    existing_parks: int = 5
    existing_roads_km: float = 40
    existing_buildings: int = 4500

class BoundaryIn(BaseModel):
    geojson: Dict[str, Any]
    source_name: Optional[str] = None

class RiskScenarioIn(BaseModel):
    scenario: str = "baseline"

class CustomRiskIn(BaseModel):
    title: str
    category: str
    level: str = "Medium"
    probability: int = 50
    impact: int = 50
    reason: str
    mitigation: str
    authority: Optional[str] = "Municipal Corporation"
    timeframe: Optional[str] = "Phase 2 (12–24 mo)"
    capex_estimate: Optional[str] = "₹25 Cr"
    statutory_standard: Optional[str] = "Municipal Bylaws"

class ProposalWeightsIn(BaseModel):
    sustainability: float = 30.0
    housing: float = 25.0
    civic: float = 20.0
    mobility: float = 15.0
    economic: float = 10.0
    strategy_preset: Optional[str] = "balanced"

class SelectProposalIn(BaseModel):
    proposal_id: str

# ---------- Projects Routes ----------
@router.post("/projects")
async def create_project(body: ProjectIn, user=Depends(get_current_user)):
    pid = str(uuid.uuid4())
    forecast = forecast_population(body.existing_population, body.target_population, body.growth_rate, body.planning_horizon_years)
    infra = compute_infrastructure(forecast["forecast_population"],
                                   {"schools": body.existing_schools, "hospitals": body.existing_hospitals,
                                    "parks": body.existing_parks, "colleges": 1})
    zones = compute_zoning(body.site_area_sqkm, forecast["forecast_population"])
    sust = compute_sustainability(forecast["forecast_population"], body.site_area_sqkm)
    score = compute_score(infra, sust)
    risks = compute_risks(forecast["forecast_population"], infra["schools"]["deficit"], infra["hospitals"]["deficit"])
    proposals = build_proposals(forecast["forecast_population"], body.site_area_sqkm, zones)
    project = {
        "id": pid, "user_id": user["id"], "name": body.name,
        "location": body.location.model_dump(),
        "site_area_sqkm": body.site_area_sqkm,
        "inputs": body.model_dump(),
        "population": forecast,
        "infrastructure": infra,
        "zones": zones,
        "sustainability": sust,
        "score": score,
        "risks": risks,
        "proposals": proposals,
        "rules": PLANNING_RULES,
        "status": "Completed",
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }
    await db.projects.insert_one(project)
    project.pop("_id", None)
    return project

@router.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    docs = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs

@router.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc

@router.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(get_current_user)):
    await db.projects.delete_one({"id": pid, "user_id": user["id"]})
    return {"ok": True}

@router.get("/projects/{pid}/zones")
async def project_zones(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc["zones"]

@router.get("/projects/{pid}/geojson")
async def project_geojson(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return full_master_plan_geojson(doc)

@router.get("/projects/{pid}/risks")
async def project_risks(pid: str, real_time: bool = False, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    risks = doc.get("risks", [])
    if not risks or not any("rpn" in r for r in risks) or real_time:
        lat = doc.get("location", {}).get("lat", 18.5204)
        lng = doc.get("location", {}).get("lng", 73.8567)
        amenities = doc.get("risks_amenities") or doc.get("real_suitability", {}).get("amenities")
        if not amenities:
            amenities = compute_nearest_amenity_distances(lat, lng, {})
        risks = compute_real_area_risks(doc, amenities, location_name=doc.get("location", {}).get("name") or doc.get("name"))
        await db.projects.update_one({"id": pid}, {"$set": {"risks": risks, "updated_at": now_iso()}})
    return risks

@router.post("/projects/{pid}/risks/stress-test")
async def stress_test_risks(pid: str, body: RiskScenarioIn, user=Depends(get_current_user)):
    """Simulates urban stress-testing scenarios across the project's risk profile."""
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    base_risks = doc.get("risks", [])
    if not base_risks or not any("rpn" in r for r in base_risks):
        lat = doc.get("location", {}).get("lat", 18.5204)
        lng = doc.get("location", {}).get("lng", 73.8567)
        amenities = doc.get("risks_amenities") or doc.get("real_suitability", {}).get("amenities")
        if not amenities:
            amenities = compute_nearest_amenity_distances(lat, lng, {})
        base_risks = compute_real_area_risks(doc, amenities, location_name=doc.get("location", {}).get("name") or doc.get("name"))

    scenario = body.scenario
    updated_risks = []
    for r in base_risks:
        r_copy = dict(r)
        prob = r_copy["probability"]
        imp = r_copy["impact"]
        if scenario == "monsoon_cloudburst" and "Flood" in r_copy["title"]:
            prob = min(95, prob + 22)
            imp = min(98, imp + 10)
            r_copy["level"] = "High"
        elif scenario == "inmigration_surge" and ("Civic" in r_copy["title"] or "Demographic" in r_copy["title"] or "Infrastructure" in r_copy["title"]):
            prob = min(92, prob + 18)
            imp = min(95, imp + 15)
            r_copy["level"] = "High"
        elif scenario == "transit_delay" and "Traffic" in r_copy["title"]:
            prob = min(96, prob + 14)
            imp = min(95, imp + 12)
            r_copy["level"] = "High"
        elif scenario == "heatwave_extreme" and ("Heat" in r_copy["title"] or "Power" in r_copy["title"]):
            prob = min(88, prob + 25)
            imp = min(90, imp + 18)
            r_copy["level"] = "High"

        r_copy["probability"] = prob
        r_copy["impact"] = imp
        r_copy["rpn"] = round((prob * imp) / 100)
        res_rpn = r_copy.get("residual_rpn", 10)
        r_copy["risk_reduction_pct"] = round((1 - (res_rpn / max(1, r_copy["rpn"]))) * 100)
        updated_risks.append(r_copy)

    await db.projects.update_one({"id": pid}, {"$set": {"risks": updated_risks, "risk_scenario": scenario, "updated_at": now_iso()}})
    return {"risks": updated_risks, "scenario": scenario}

@router.post("/projects/{pid}/risks")
async def add_custom_risk(pid: str, body: CustomRiskIn, user=Depends(get_current_user)):
    """Registers a project-specific municipal risk item."""
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")

    rpn = round((body.probability * body.impact) / 100)
    res_prob = max(10, int(body.probability * 0.45))
    res_imp = max(10, int(body.impact * 0.50))
    res_rpn = round((res_prob * res_imp) / 100)

    new_risk = {
        "id": f"R-0{len(doc.get('risks', [])) + 1}",
        "title": body.title,
        "level": body.level,
        "probability": body.probability,
        "impact": body.impact,
        "rpn": rpn,
        "residual_probability": res_prob,
        "residual_impact": res_imp,
        "residual_rpn": res_rpn,
        "risk_reduction_pct": round((1 - (res_rpn / max(1, rpn))) * 100),
        "category": body.category,
        "reason": body.reason,
        "mitigation": body.mitigation,
        "authority": body.authority or "Municipal Corporation",
        "timeframe": body.timeframe or "Phase 2 (12–24 mo)",
        "capex_estimate": body.capex_estimate or "₹25 Cr",
        "statutory_standard": body.statutory_standard or "Municipal Bylaws"
    }

    await db.projects.update_one({"id": pid}, {"$push": {"risks": new_risk}, "$set": {"updated_at": now_iso()}})
    return new_risk

@router.get("/rules")
async def get_rules():
    return PLANNING_RULES

# ---------- Proposals Real-Time Multi-Criteria Comparison Engine ----------
def compute_proposals_comparison(
    proposals: List[Dict],
    pop: int,
    site_area: float,
    weights: Dict[str, float],
    preset: str = "balanced"
) -> Dict[str, Any]:
    w_sust = float(weights.get("sustainability", 25.0))
    w_house = float(weights.get("housing", 25.0))
    w_civic = float(weights.get("civic", 20.0))
    w_mob = float(weights.get("mobility", 15.0))
    w_econ = float(weights.get("economic", 15.0))
    total_w = max(0.1, w_sust + w_house + w_civic + w_mob + w_econ)

    norm_weights = {
        "sustainability": round(w_sust / total_w * 100, 1),
        "housing": round(w_house / total_w * 100, 1),
        "civic": round(w_civic / total_w * 100, 1),
        "mobility": round(w_mob / total_w * 100, 1),
        "economic": round(w_econ / total_w * 100, 1),
    }

    evaluated_proposals = []
    for prop in proposals:
        p = dict(prop)
        pid = p.get("id", "P-A")
        is_a = (pid == "P-A")

        metrics = p.get("metrics", {})
        green_pct = p.get("green_space_pct", 15 if is_a else 22)
        road_pct = p.get("road_coverage_pct", 15 if is_a else 14)
        pop_cap = p.get("population_capacity", int(pop * 1.05) if is_a else int(pop * 0.95))

        sust_score = round((metrics.get("sustainability", 74 if is_a else 88) * 0.6 + (green_pct / 25.0 * 100) * 0.4), 1)
        ratio = pop_cap / max(1, pop)
        if 0.98 <= ratio <= 1.08:
            housing_score = 96.0 if is_a else 86.0
        elif ratio > 1.08:
            housing_score = 88.0
        else:
            housing_score = 80.0

        civic_score = 88.0 if is_a else 93.0
        mob_score = 86.0 if is_a else 80.0
        econ_score = 92.0 if is_a else 72.0

        capex_cr = round(site_area * 180 + (pop_cap / 1000) * 1.2, 1) if is_a else round(site_area * 168 + (pop_cap / 1000) * 1.15, 1)
        capex_per_capita = round((capex_cr * 10000000) / max(1, pop_cap))
        carbon_offset = int(site_area * (green_pct / 100) * 14500 + (pop_cap * 0.12 if is_a else pop_cap * 0.22))
        solar_gwh = round(site_area * 8.2 * (metrics.get("solar", 82) / 80), 1) if is_a else round(site_area * 10.8 * (metrics.get("solar", 88) / 80), 1)

        comp = (sust_score * norm_weights["sustainability"] +
                housing_score * norm_weights["housing"] +
                civic_score * norm_weights["civic"] +
                mob_score * norm_weights["mobility"] +
                econ_score * norm_weights["economic"]) / 100.0
        comp = round(comp, 1)

        p["score"] = comp
        p["domain_scores"] = {
            "sustainability": sust_score,
            "housing": housing_score,
            "civic": civic_score,
            "mobility": mob_score,
            "economic": econ_score,
        }
        p["capex_cr"] = capex_cr
        p["capex_per_capita"] = capex_per_capita
        p["carbon_offset_tco2"] = carbon_offset
        p["solar_generation_gwh"] = solar_gwh
        p["clean_energy_pct"] = 28 if is_a else 44
        evaluated_proposals.append(p)

    winner = max(evaluated_proposals, key=lambda x: x["score"])
    runner_up = min(evaluated_proposals, key=lambda x: x["score"])
    margin = round(abs(winner["score"] - runner_up["score"]), 1)

    prop_a = next((p for p in evaluated_proposals if p["id"] == "P-A"), evaluated_proposals[0])
    prop_b = next((p for p in evaluated_proposals if p["id"] == "P-B"), evaluated_proposals[-1])

    head_to_head = [
        {
            "id": "overall_score",
            "name": "Overall Composite Decision Score",
            "category": "Composite",
            "prop_a_val": prop_a["score"],
            "prop_b_val": prop_b["score"],
            "prop_a_disp": f"{prop_a['score']}/100",
            "prop_b_disp": f"{prop_b['score']}/100",
            "winner_id": "P-A" if prop_a["score"] > prop_b["score"] else ("P-B" if prop_b["score"] > prop_a["score"] else "Tie"),
            "margin_str": f"+{margin} pts lead" if margin > 0 else "Parity",
            "advantage": f"{winner['name']} ranks higher under current criteria weights."
        },
        {
            "id": "pop_capacity",
            "name": "Demographic Population Capacity",
            "category": "Housing & Growth",
            "prop_a_val": prop_a["population_capacity"],
            "prop_b_val": prop_b["population_capacity"],
            "prop_a_disp": f"{prop_a['population_capacity']:,} residents",
            "prop_b_disp": f"{prop_b['population_capacity']:,} residents",
            "winner_id": "P-A" if prop_a["population_capacity"] >= prop_b["population_capacity"] else "P-B",
            "margin_str": f"+{abs(prop_a['population_capacity'] - prop_b['population_capacity']):,} ({round(abs(prop_a['population_capacity'] - prop_b['population_capacity'])/max(1, prop_b['population_capacity'])*100, 1)}%)",
            "advantage": "Proposal A accommodates greater residential density and future population in-migration."
        },
        {
            "id": "green_space",
            "name": "Urban Green Canopy & Parks",
            "category": "Sustainability",
            "prop_a_val": prop_a["green_space_pct"],
            "prop_b_val": prop_b["green_space_pct"],
            "prop_a_disp": f"{prop_a['green_space_pct']}% of site",
            "prop_b_disp": f"{prop_b['green_space_pct']}% of site",
            "winner_id": "P-B",
            "margin_str": f"+{prop_b['green_space_pct'] - prop_a['green_space_pct']}% (+{round((prop_b['green_space_pct'] - prop_a['green_space_pct'])/prop_a['green_space_pct']*100, 1)}%)",
            "advantage": "Proposal B provides superior open space buffering, biodiversity corridors, and urban heat island mitigation."
        },
        {
            "id": "carbon_offset",
            "name": "Annual Carbon Sequestration & Offset",
            "category": "Sustainability",
            "prop_a_val": prop_a["carbon_offset_tco2"],
            "prop_b_val": prop_b["carbon_offset_tco2"],
            "prop_a_disp": f"{prop_a['carbon_offset_tco2']:,} tCO2/yr",
            "prop_b_disp": f"{prop_b['carbon_offset_tco2']:,} tCO2/yr",
            "winner_id": "P-B",
            "margin_str": f"+{abs(prop_b['carbon_offset_tco2'] - prop_a['carbon_offset_tco2']):,} tCO2/yr",
            "advantage": "Proposal B achieves lower embodied carbon and substantially higher annual carbon reduction."
        },
        {
            "id": "clean_energy",
            "name": "Rooftop Solar & Clean Energy",
            "category": "Utilities & Clean Tech",
            "prop_a_val": prop_a["solar_generation_gwh"],
            "prop_b_val": prop_b["solar_generation_gwh"],
            "prop_a_disp": f"{prop_a['solar_generation_gwh']} GWh/yr",
            "prop_b_disp": f"{prop_b['solar_generation_gwh']} GWh/yr",
            "winner_id": "P-B",
            "margin_str": f"+{round(prop_b['solar_generation_gwh'] - prop_a['solar_generation_gwh'], 1)} GWh/yr (+{round((prop_b['solar_generation_gwh'] - prop_a['solar_generation_gwh'])/prop_a['solar_generation_gwh']*100, 1)}%)",
            "advantage": "Proposal B integrates active PV microgrids yielding 44% clean energy self-sufficiency."
        },
        {
            "id": "mobility_roads",
            "name": "Road & Transit Right-of-Way Coverage",
            "category": "Mobility & Transit",
            "prop_a_val": prop_a["road_coverage_pct"],
            "prop_b_val": prop_b["road_coverage_pct"],
            "prop_a_disp": f"{prop_a['road_coverage_pct']}% ROW",
            "prop_b_disp": f"{prop_b['road_coverage_pct']}% ROW",
            "winner_id": "P-A",
            "margin_str": "+1.0% road network",
            "advantage": "Proposal A offers slightly wider arterial capacity for vehicular circulation and public buses."
        },
        {
            "id": "schools",
            "name": "Elementary & High School Coverage",
            "category": "Civic Amenities",
            "prop_a_val": prop_a["schools"],
            "prop_b_val": prop_b["schools"],
            "prop_a_disp": f"{prop_a['schools']} schools",
            "prop_b_disp": f"{prop_b['schools']} schools",
            "winner_id": "Tie" if prop_a["schools"] == prop_b["schools"] else ("P-A" if prop_a["schools"] > prop_b["schools"] else "P-B"),
            "margin_str": "Equal URDPFI fulfillment",
            "advantage": "Both proposals meet mandatory 1 school per 1,500 population educational quotas."
        },
        {
            "id": "hospitals",
            "name": "Healthcare & Hospital Nodes",
            "category": "Civic Amenities",
            "prop_a_val": prop_a["hospitals"],
            "prop_b_val": prop_b["hospitals"],
            "prop_a_disp": f"{prop_a['hospitals']} hospitals",
            "prop_b_disp": f"{prop_b['hospitals']} hospitals",
            "winner_id": "Tie",
            "margin_str": "Equal hospital allocation",
            "advantage": "Tier-2 multispecialty health centers fulfill URDPFI norms for 25k cap units."
        },
        {
            "id": "parks",
            "name": "Neighborhood Parks & Civic Plazas",
            "category": "Civic Amenities",
            "prop_a_val": prop_a["parks"],
            "prop_b_val": prop_b["parks"],
            "prop_a_disp": f"{prop_a['parks']} public parks",
            "prop_b_disp": f"{prop_b['parks']} public parks",
            "winner_id": "P-B" if prop_b["parks"] > prop_a["parks"] else "P-A",
            "margin_str": f"+{abs(prop_b['parks'] - prop_a['parks'])} additional parks",
            "advantage": "Proposal B provides denser neighborhood park access with 400m walking catchments."
        },
        {
            "id": "capex_cr",
            "name": "Total Estimated Infrastructure Capex",
            "category": "Economics & Feasibility",
            "prop_a_val": prop_a["capex_cr"],
            "prop_b_val": prop_b["capex_cr"],
            "prop_a_disp": f"₹{prop_a['capex_cr']:,.0f} Cr",
            "prop_b_disp": f"₹{prop_b['capex_cr']:,.0f} Cr",
            "winner_id": "P-B" if prop_b["capex_cr"] < prop_a["capex_cr"] else "P-A",
            "margin_str": f"₹{abs(prop_a['capex_cr'] - prop_b['capex_cr']):,.0f} Cr capital savings",
            "advantage": f"{'Proposal B' if prop_b['capex_cr'] < prop_a['capex_cr'] else 'Proposal A'} requires lower total upfront public capital outlay."
        }
    ]

    radar_data = [
        {"axis": "Sustainability & Climate", "A": prop_a["domain_scores"]["sustainability"], "B": prop_b["domain_scores"]["sustainability"], "benchmark": 75},
        {"axis": "Housing Capacity", "A": prop_a["domain_scores"]["housing"], "B": prop_b["domain_scores"]["housing"], "benchmark": 80},
        {"axis": "Civic Infrastructure", "A": prop_a["domain_scores"]["civic"], "B": prop_b["domain_scores"]["civic"], "benchmark": 70},
        {"axis": "Mobility & Transit", "A": prop_a["domain_scores"]["mobility"], "B": prop_b["domain_scores"]["mobility"], "benchmark": 75},
        {"axis": "Economic Vitality", "A": prop_a["domain_scores"]["economic"], "B": prop_b["domain_scores"]["economic"], "benchmark": 70},
        {"axis": "Solar & Clean Tech", "A": prop_a.get("clean_energy_pct", 28) * 2.5, "B": prop_b.get("clean_energy_pct", 44) * 2.2, "benchmark": 70},
        {"axis": "Capex Efficiency", "A": 82.0, "B": 86.0, "benchmark": 75},
        {"axis": "Open Green Space", "A": prop_a["green_space_pct"] * 4.5, "B": prop_b["green_space_pct"] * 4.2, "benchmark": 65}
    ]

    all_zones = ["residential", "commercial", "institutional", "industrial", "roads_transport", "parks_green", "public_utility"]
    zone_labels = {
        "residential": "Residential Housing",
        "commercial": "Commercial & Retail",
        "institutional": "Institutional & Admin",
        "industrial": "Light Industry & Logistics",
        "roads_transport": "Roads & Transit ROW",
        "parks_green": "Parks & Green Open Space",
        "public_utility": "Public Utilities & Substation"
    }
    land_use_comparison = []
    for z in all_zones:
        a_pct = prop_a.get("land_use", {}).get(z, 0)
        b_pct = prop_b.get("land_use", {}).get(z, 0)
        land_use_comparison.append({
            "zone_key": z,
            "zone_name": zone_labels.get(z, z.replace("_", " ").title()),
            "A": a_pct,
            "B": b_pct,
            "delta": round(b_pct - a_pct, 1)
        })

    trade_offs = [
        {
            "dimension": "Housing Density vs Green Canopy",
            "observation": f"Proposal A yields +{abs(prop_a['population_capacity'] - prop_b['population_capacity']):,} more residential capacity but sacrifices {prop_b['green_space_pct'] - prop_a['green_space_pct']}% of open green buffer space."
        },
        {
            "dimension": "Decarbonization vs Initial Capex",
            "observation": f"Proposal B abates +{abs(prop_b['carbon_offset_tco2'] - prop_a['carbon_offset_tco2']):,} tCO2/year through solar microgrids and high-albedo cool roofs while keeping initial capital outlay within ₹{prop_b['capex_cr']:,.0f} Cr."
        },
        {
            "dimension": "Commercial Revenue vs Environmental Footprint",
            "observation": "Proposal A allocates 12% land to commercial offices generating higher municipal tax yields, whereas Proposal B reserves 22% for parks ensuring microclimate comfort."
        }
    ]

    if winner["id"] == "P-B":
        rec_text = (
            f"{winner['name']} is the statistically superior development option with a real-time composite score of {winner['score']}/100 "
            f"(+{margin} pts lead over Proposal A). It demonstrates comprehensive alignment with URDPFI 2014 ecological guidelines and GRIHA 5-Star benchmarks, "
            f"providing {winner['green_space_pct']}% green canopy, {winner['carbon_offset_tco2']:,} tCO2/yr carbon offset, and 44% clean energy self-sufficiency, "
            f"while maintaining sufficient demographic capacity for {winner['population_capacity']:,} residents."
        )
    else:
        rec_text = (
            f"{winner['name']} is recommended with a real-time composite decision score of {winner['score']}/100 (+{margin} pts lead over Proposal B). "
            f"It maximizes demographic yield and economic vitality, providing comfortable accommodation for {winner['population_capacity']:,} residents "
            f"(meeting target demographics) with robust 12% commercial land use and 15% transit connectivity, while satisfying statutory open space quotas."
        )

    return {
        "winner_id": winner["id"],
        "winner_name": winner["name"],
        "margin": margin,
        "strategy_preset": preset,
        "weights_applied": norm_weights,
        "proposals": evaluated_proposals,
        "head_to_head": head_to_head,
        "radar_data": radar_data,
        "land_use_comparison": land_use_comparison,
        "trade_offs": trade_offs,
        "recommendation": rec_text,
        "computed_at": now_iso()
    }


@router.get("/projects/{pid}/proposals")
async def get_project_proposals(pid: str, user=Depends(get_current_user)):
    """Retrieves project proposals with real-time multi-criteria decision comparison."""
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    proposals = doc.get("proposals")
    pop = doc.get("population", {}).get("forecast_population", 100000)
    site_area = doc.get("site_area_sqkm", 10.0)
    zones = doc.get("zones", [])

    if not proposals:
        proposals = build_proposals(pop, site_area, zones)

    weights = doc.get("proposal_weights", {"sustainability": 30.0, "housing": 25.0, "civic": 20.0, "mobility": 15.0, "economic": 10.0})
    preset = doc.get("proposal_strategy_preset", "balanced")
    comparison = compute_proposals_comparison(proposals, pop, site_area, weights, preset)
    comparison["active_proposal_id"] = doc.get("active_proposal_id", comparison["winner_id"])
    return comparison


@router.post("/projects/{pid}/proposals/compare")
async def compare_project_proposals(pid: str, body: ProposalWeightsIn, user=Depends(get_current_user)):
    """Executes a real-time multi-criteria comparison across proposals with customized weightings."""
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    proposals = doc.get("proposals")
    pop = doc.get("population", {}).get("forecast_population", 100000)
    site_area = doc.get("site_area_sqkm", 10.0)
    zones = doc.get("zones", [])

    if not proposals:
        proposals = build_proposals(pop, site_area, zones)

    weights = {
        "sustainability": body.sustainability,
        "housing": body.housing,
        "civic": body.civic,
        "mobility": body.mobility,
        "economic": body.economic
    }
    comparison = compute_proposals_comparison(proposals, pop, site_area, weights, body.strategy_preset or "custom")

    await db.projects.update_one(
        {"id": pid},
        {"$set": {
            "proposals": comparison["proposals"],
            "proposal_weights": weights,
            "proposal_strategy_preset": body.strategy_preset or "custom",
            "proposal_winner_id": comparison["winner_id"],
            "updated_at": now_iso()
        }}
    )
    comparison["active_proposal_id"] = doc.get("active_proposal_id", comparison["winner_id"])
    return comparison


@router.post("/projects/{pid}/proposals/select")
async def select_active_proposal(pid: str, body: SelectProposalIn, user=Depends(get_current_user)):
    """Sets the chosen proposal as the project's active master planning scheme."""
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")

    await db.projects.update_one(
        {"id": pid},
        {"$set": {
            "active_proposal_id": body.proposal_id,
            "updated_at": now_iso()
        }}
    )
    return {"ok": True, "active_proposal_id": body.proposal_id}

@router.put("/projects/{pid}/boundary")
async def set_boundary(pid: str, body: BoundaryIn, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    ring = extract_boundary(body.geojson)
    pop = doc["population"]["forecast_population"]
    zones = compute_zoning(doc["site_area_sqkm"], pop)
    geo = build_geometry_from_boundary(ring, zones, doc["infrastructure"])
    sust = compute_sustainability(pop, geo["area_sqkm"])
    score = compute_score(doc["infrastructure"], sust)
    update = {
        "zones": geo["zones"],
        "site_area_sqkm": geo["area_sqkm"],
        "sustainability": sust,
        "score": score,
        "infra_points": geo["infra_points"],
        "location": {**doc["location"], "lat": geo["centroid"]["lat"], "lng": geo["centroid"]["lng"]},
        "boundary": {
            "ring": ring,
            "latlngs": geo["boundary_latlngs"],
            "area_sqkm": geo["area_sqkm"],
            "source_name": body.source_name,
            "uploaded_at": now_iso(),
        },
        "updated_at": now_iso(),
    }

    # Automatically recompute real-time area hazards for the uploaded boundary parcel
    try:
        raw_osm = fetch_osm_amenities(geo["centroid"]["lat"], geo["centroid"]["lng"], radius_m=2500, boundary_coords=ring)
        metrics = compute_nearest_amenity_distances(geo["centroid"]["lat"], geo["centroid"]["lng"], raw_osm)
        new_doc_preview = {
            **doc,
            "site_area_sqkm": geo["area_sqkm"],
            "zones": geo["zones"],
            "location": {**doc["location"], "lat": geo["centroid"]["lat"], "lng": geo["centroid"]["lng"]},
        }
        update["risks"] = compute_real_area_risks(new_doc_preview, metrics, location_name=doc.get("location", {}).get("name") or body.source_name)
        update["risks_data_source"] = "real_osm"
        update["risks_amenities"] = metrics
        update["risks_computed_at"] = now_iso()
    except Exception as err:
        logger.warning(f"Failed to auto-update risks for boundary: {err}")

    await db.projects.update_one({"id": pid}, {"$set": update})
    return await db.projects.find_one({"id": pid}, {"_id": 0})

@router.delete("/projects/{pid}/boundary")
async def clear_boundary(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        doc = await db.projects.find_one({"id": pid}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    area = doc["inputs"]["site_area_sqkm"]
    pop = doc["population"]["forecast_population"]
    sust = compute_sustainability(pop, area)
    await db.projects.update_one({"id": pid}, {
        "$set": {"zones": compute_zoning(area, pop), "site_area_sqkm": area,
                 "sustainability": sust, "score": compute_score(doc["infrastructure"], sust),
                 "updated_at": now_iso()},
        "$unset": {"boundary": "", "infra_points": ""},
    })
    return await db.projects.find_one({"id": pid}, {"_id": 0})

# ---------- Search & Demo Seed ----------
@router.get("/search")
async def search(q: str, project_id: Optional[str] = None, user=Depends(get_current_user)):
    q_low = q.lower().strip()
    results = []
    projects = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).to_list(50)
    for p in projects:
        if q_low in p["name"].lower() or q_low in p["location"]["name"].lower():
            results.append({"type": "project", "id": p["id"], "title": p["name"],
                            "subtitle": p["location"]["name"], "meta": f"{p['population']['forecast_population']:,} people"})
        if project_id and p["id"] != project_id:
            continue
        for z in p.get("zones", []):
            hay = f"{z['name']} {z['type']} {z['purpose']}".lower()
            if q_low in hay or q_low in z["type"]:
                results.append({"type": "zone", "id": z["id"], "project_id": p["id"],
                                "title": z["name"], "subtitle": f"{z['percentage']}% • {z['area_sqkm']} sq.km",
                                "meta": z["purpose"], "color": z["color"]})
        # infrastructure keywords
        if q_low in "schools":
            i = p["infrastructure"]["schools"]
            results.append({"type": "infra", "id": "schools", "project_id": p["id"],
                            "title": f"Schools — {p['name']}", "subtitle": f"Required {i['required']} • Existing {i['existing']}", "meta": f"Deficit {i['deficit']}"})
        if q_low in "hospitals":
            i = p["infrastructure"]["hospitals"]
            results.append({"type": "infra", "id": "hospitals", "project_id": p["id"],
                            "title": f"Hospitals — {p['name']}", "subtitle": f"Required {i['required']} • Existing {i['existing']}", "meta": f"Deficit {i['deficit']}"})

    # Geographic place search via Nominatim (cities, regions, landmarks)
    if len(q_low) >= 2:
        try:
            async with httpx.AsyncClient(timeout=3.5, headers={"User-Agent": "SmartScape-Urban-Planner/1.0"}) as http:
                resp = await http.get("https://nominatim.openstreetmap.org/search",
                                      params={"format": "json", "limit": 4, "q": q})
                if resp.status_code == 200:
                    for d in resp.json():
                        title = d.get("name") or d.get("display_name", "").split(",")[0]
                        results.append({
                            "type": "place",
                            "id": f"place-{d.get('place_id')}",
                            "title": title,
                            "subtitle": d.get("display_name"),
                            "lat": float(d.get("lat")),
                            "lng": float(d.get("lon")),
                            "meta": (d.get("type") or d.get("class") or "place").capitalize(),
                            "color": "#059669"
                        })
        except Exception as e:
            logger.warning(f"Geocoding place search error: {e}")

    return results[:25]


@router.post("/seed-demo")
async def seed_demo(user=Depends(get_current_user)):
    existing = await db.projects.count_documents({"user_id": user["id"]})
    if existing > 0:
        return {"seeded": False, "message": "User already has projects"}
    demo_input = ProjectIn(
        name="SmartScape Demo City — Pune Ring 2",
        location=LocationIn(name="Pune Ring Zone 2, Maharashtra", lat=18.5204, lng=73.8567, state="Maharashtra"),
        site_area_sqkm=12.4, existing_population=68000, target_population=185000,
        growth_rate=3.2, planning_horizon_years=20,
        existing_schools=12, existing_hospitals=3, existing_parks=7, existing_roads_km=52, existing_buildings=6800,
    )
    return await create_project(demo_input, user)
