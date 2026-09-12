from typing import Dict
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from backend.app.db import db
from backend.app.auth import get_current_user, now_iso
from backend.app.planning import (
    PLANNING_RULES, compute_zoning, compute_sustainability, compute_score
)
from backend.app.geometry import build_geometry_from_boundary

router = APIRouter(tags=["zoning"])

class ZoningIn(BaseModel):
    allocations: Dict[str, float]
    persist: bool = False

@router.post("/projects/{pid}/zoning")
async def recompute_zoning(pid: str, body: ZoningIn, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    keys = set(PLANNING_RULES["land_use"].keys())
    if set(body.allocations.keys()) != keys:
        raise HTTPException(status_code=400, detail=f"Allocations must cover exactly: {sorted(keys)}")
    if any(v < 0 for v in body.allocations.values()):
        raise HTTPException(status_code=400, detail="Allocations cannot be negative")
    total = sum(body.allocations.values())
    if total <= 0 or abs(total - 100) > 1.5:
        raise HTTPException(status_code=400, detail=f"Allocations must total 100% (got {round(total, 2)}%)")
    land_use = {k: v / total for k, v in body.allocations.items()}

    pop = doc["population"]["forecast_population"]
    area = doc["site_area_sqkm"]
    zones = compute_zoning(area, pop, land_use)
    infra_points = doc.get("infra_points", [])
    if doc.get("boundary", {}).get("ring"):
        geo = build_geometry_from_boundary(doc["boundary"]["ring"], zones, doc["infrastructure"])
        zones, infra_points = geo["zones"], geo["infra_points"]
    sust = compute_sustainability(pop, area, land_use["parks_green"])
    score = compute_score(doc["infrastructure"], sust)
    result = {"zones": zones, "sustainability": sust, "score": score,
              "infra_points": infra_points, "land_use_custom": body.allocations,
              "site_area_sqkm": area}
    if body.persist:
        await db.projects.update_one({"id": pid}, {"$set": {**result, "updated_at": now_iso()}})
    return result

@router.post("/projects/{pid}/zoning/reset")
async def reset_zoning(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    pop = doc["population"]["forecast_population"]
    area = doc["site_area_sqkm"]
    zones = compute_zoning(area, pop)
    infra_points = doc.get("infra_points", [])
    if doc.get("boundary", {}).get("ring"):
        geo = build_geometry_from_boundary(doc["boundary"]["ring"], zones, doc["infrastructure"])
        zones, infra_points = geo["zones"], geo["infra_points"]
    sust = compute_sustainability(pop, area)
    score = compute_score(doc["infrastructure"], sust)
    await db.projects.update_one({"id": pid}, {
        "$set": {"zones": zones, "sustainability": sust, "score": score,
                 "infra_points": infra_points, "updated_at": now_iso()},
        "$unset": {"land_use_custom": ""},
    })
    return await db.projects.find_one({"id": pid}, {"_id": 0})
