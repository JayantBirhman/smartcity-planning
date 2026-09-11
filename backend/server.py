from fastapi import FastAPI, APIRouter, HTTPException, Depends, status, Request, Response, UploadFile, File, Form
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
import httpx
import json
import re
import secrets
import urllib.parse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import math
import jwt
import bcrypt
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# ---------- Mongo ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGO = 'HS256'
JWT_EXP_DAYS = 30

EMERGENT_AUTH_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
SESSION_DAYS = 7

APS_CLIENT_ID = os.environ.get('APS_CLIENT_ID')
APS_CLIENT_SECRET = os.environ.get('APS_CLIENT_SECRET')
APS_CALLBACK_URL = os.environ.get('APS_CALLBACK_URL')
APS_BASE = "https://developer.api.autodesk.com"
APS_SCOPES = "data:read data:write data:create account:read user:read openid"

app = FastAPI(title="SmartScape API")
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("smartscape")

# ---------- Utilities ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()

def make_token(user_id: str) -> str:
    payload = {"sub": user_id, "exp": datetime.now(timezone.utc) + timedelta(days=JWT_EXP_DAYS)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def extract_token(request: Request) -> Optional[str]:
    token = request.cookies.get("session_token")
    if token:
        return token
    header = request.headers.get("authorization") or ""
    if header.lower().startswith("bearer "):
        return header.split(" ", 1)[1].strip()
    return None

async def resolve_session_user(token: str) -> Optional[Dict[str, Any]]:
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return None
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=401, detail="Session expired")
    return await db.users.find_one({"id": session["user_id"]}, {"_id": 0, "password": 0})

async def get_current_user(request: Request):
    token = extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing token")
    user = None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password": 0})
    except jwt.PyJWTError:
        user = await resolve_session_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user

# ---------- Models ----------
class RegisterIn(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: Optional[str] = "Urban Planner"

class LoginIn(BaseModel):
    email: EmailStr
    password: str

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

class ChatIn(BaseModel):
    project_id: Optional[str] = None
    message: str
    zone_context: Optional[Dict[str, Any]] = None

# ---------- Planning Engine ----------
PLANNING_RULES = {
    "schools_per_1000": 1 / 1500,       # 1 school per 1500 people (URDPFI-ish)
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
    return {"overall": round(overall, 1), "breakdown": breakdown}

def compute_risks(pop: int, deficit_schools: int, deficit_hospitals: int) -> List[Dict[str, Any]]:
    risks = [
        {"id": "R-01", "title": "Traffic Congestion", "level": "High", "probability": 78, "impact": 82, "category": "Transportation",
         "reason": "Rapid population growth with concentrated commercial nodes will stress arterial roads.",
         "mitigation": "Distribute commercial activity across multiple nodes and invest in BRT/transit corridors."},
        {"id": "R-02", "title": "Infrastructure Deficit", "level": "High" if deficit_schools + deficit_hospitals > 10 else "Medium",
         "probability": 70, "impact": 74, "category": "Public Services",
         "reason": f"Current facilities short by {deficit_schools} schools and {deficit_hospitals} hospitals versus projected demand.",
         "mitigation": "Prioritize phased development of schools and hospitals in under-served zones."},
        {"id": "R-03", "title": "Flood / Water Stress", "level": "Medium", "probability": 55, "impact": 78, "category": "Environmental",
         "reason": "Increased impervious surfaces reduce natural drainage capacity.",
         "mitigation": "Reserve 15%+ green space, implement rainwater harvesting and permeable pavement in Zone Z-06."},
        {"id": "R-04", "title": "Population Uncertainty", "level": "Medium", "probability": 60, "impact": 55, "category": "Demographics",
         "reason": "Migration and economic factors can shift the 20-year forecast by ±15%.",
         "mitigation": "Design flexible zoning that supports incremental density adjustments."},
        {"id": "R-05", "title": "Sustainability Trade-offs", "level": "Low", "probability": 40, "impact": 50, "category": "Sustainability",
         "reason": "Higher density improves land efficiency but may reduce daylight and green ratios.",
         "mitigation": "Balance FSI (Floor Space Index) and mandate green roofs on high-rise blocks."},
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

# ---------- Site Boundary Geometry ----------
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
    minx, miny, maxx, maxy = poly.bounds
    lo, hi = (minx, maxx) if vertical else (miny, maxy)
    target = poly.area * frac
    for _ in range(36):
        mid = (lo + hi) / 2
        clip = shp_box(minx, miny, mid, maxy) if vertical else shp_box(minx, miny, maxx, mid)
        if poly.intersection(clip).area < target:
            lo = mid
        else:
            hi = mid
    mid = (lo + hi) / 2
    clip = shp_box(minx, miny, mid, maxy) if vertical else shp_box(minx, miny, maxx, mid)
    return poly.intersection(clip), poly.difference(clip)

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

    return {
        "zones": zones,
        "area_sqkm": area_sqkm,
        "centroid": {"lat": lat0, "lng": lng0},
        "boundary_latlngs": [[c[1], c[0]] for c in ring],
        "infra_points": infra_points,
    }

# ---------- Auth Routes ----------
@api_router.post("/auth/register")
async def register(body: RegisterIn):
    if await db.users.find_one({"email": body.email}):
        raise HTTPException(status_code=400, detail="Email already registered")
    uid = str(uuid.uuid4())
    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    user = {"id": uid, "email": body.email, "name": body.name, "role": body.role,
            "password": hashed, "created_at": now_iso()}
    await db.users.insert_one(user)
    return {"token": make_token(uid), "user": {"id": uid, "email": body.email, "name": body.name, "role": body.role}}

@api_router.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email})
    if not user or not bcrypt.checkpw(body.password.encode(), user["password"].encode()):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": make_token(user["id"]),
            "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user.get("role", "Urban Planner")}}

@api_router.post("/auth/demo")
async def demo_login():
    email = "demo@smartscape.ai"
    user = await db.users.find_one({"email": email})
    if not user:
        uid = str(uuid.uuid4())
        hashed = bcrypt.hashpw(b"smartscape-demo", bcrypt.gensalt()).decode()
        user = {"id": uid, "email": email, "name": "SIH Demo Planner", "role": "Urban Planner",
                "password": hashed, "created_at": now_iso()}
        await db.users.insert_one(user)
    return {"token": make_token(user["id"]),
            "user": {"id": user["id"], "email": user["email"], "name": user["name"], "role": user.get("role")}}

@api_router.get("/auth/me")
async def me(user=Depends(get_current_user)):
    return user

class GoogleSessionIn(BaseModel):
    session_id: str

@api_router.post("/auth/google/session")
async def google_session(body: GoogleSessionIn, response: Response):
    async with httpx.AsyncClient(timeout=20) as http:
        r = await http.get(EMERGENT_AUTH_SESSION_URL, headers={"X-Session-ID": body.session_id})
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="Invalid or expired Google session")
    data = r.json()

    user = await db.users.find_one({"email": data["email"]}, {"_id": 0})
    if user:
        await db.users.update_one({"id": user["id"]},
                                  {"$set": {"name": data.get("name") or user.get("name"),
                                            "picture": data.get("picture"),
                                            "auth_provider": "google",
                                            "updated_at": now_iso()}})
        uid = user["id"]
    else:
        uid = str(uuid.uuid4())
        await db.users.insert_one({"id": uid, "email": data["email"], "name": data.get("name") or data["email"],
                                   "role": "Urban Planner", "picture": data.get("picture"),
                                   "auth_provider": "google", "created_at": now_iso()})

    session_token = data["session_token"]
    await db.user_sessions.update_one(
        {"session_token": session_token},
        {"$set": {"user_id": uid, "session_token": session_token,
                  "expires_at": datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS),
                  "created_at": datetime.now(timezone.utc)}},
        upsert=True,
    )
    response.set_cookie("session_token", session_token, httponly=True, secure=True,
                        samesite="none", path="/", max_age=SESSION_DAYS * 24 * 3600)
    out = await db.users.find_one({"id": uid}, {"_id": 0, "password": 0})
    return {"token": session_token, "user": out}

@api_router.post("/auth/logout")
async def logout(request: Request, response: Response):
    token = extract_token(request)
    if token:
        await db.user_sessions.delete_one({"session_token": token})
    response.delete_cookie("session_token", path="/")
    return {"ok": True}

# ---------- Autodesk Platform Services (APS / Forma) ----------
class AutodeskConnectIn(BaseModel):
    return_url: str

@api_router.post("/autodesk/connect-url")
async def autodesk_connect_url(body: AutodeskConnectIn, user=Depends(get_current_user)):
    if not APS_CLIENT_ID or not APS_CALLBACK_URL:
        raise HTTPException(status_code=500, detail="Autodesk app credentials are not configured")
    state = secrets.token_urlsafe(24)
    await db.aps_states.insert_one({"state": state, "user_id": user["id"], "return_url": body.return_url,
                                    "created_at": datetime.now(timezone.utc)})
    params = {
        "response_type": "code",
        "client_id": APS_CLIENT_ID,
        "redirect_uri": APS_CALLBACK_URL,
        "scope": APS_SCOPES,
        "state": state,
        "prompt": "login",
    }
    return {"url": f"{APS_BASE}/authentication/v2/authorize?{urllib.parse.urlencode(params)}",
            "callback_url": APS_CALLBACK_URL}

async def aps_token_request(form: Dict[str, str]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.post(f"{APS_BASE}/authentication/v2/token", data=form,
                            auth=(APS_CLIENT_ID, APS_CLIENT_SECRET),
                            headers={"Content-Type": "application/x-www-form-urlencoded"})
    if r.status_code != 200:
        logger.warning(f"APS token error {r.status_code}: {r.text}")
        raise HTTPException(status_code=400, detail=f"Autodesk token exchange failed: {r.text[:200]}")
    return r.json()

async def store_aps_token(user_id: str, tok: Dict[str, Any]):
    doc = {
        "user_id": user_id,
        "access_token": tok["access_token"],
        "refresh_token": tok.get("refresh_token"),
        "expires_at": (datetime.now(timezone.utc) + timedelta(seconds=tok.get("expires_in", 3600) - 60)).isoformat(),
        "scope": tok.get("scope", APS_SCOPES),
        "updated_at": now_iso(),
    }
    await db.aps_tokens.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)
    return doc

async def get_aps_access_token(user_id: str) -> str:
    doc = await db.aps_tokens.find_one({"user_id": user_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=409, detail="Autodesk account not connected")
    expires_at = datetime.fromisoformat(doc["expires_at"])
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at > datetime.now(timezone.utc):
        return doc["access_token"]
    if not doc.get("refresh_token"):
        raise HTTPException(status_code=409, detail="Autodesk session expired — reconnect required")
    tok = await aps_token_request({"grant_type": "refresh_token", "refresh_token": doc["refresh_token"],
                                   "scope": APS_SCOPES})
    fresh = await store_aps_token(user_id, tok)
    return fresh["access_token"]

async def aps_get(user_id: str, path: str, base: str = APS_BASE) -> Dict[str, Any]:
    token = await get_aps_access_token(user_id)
    async with httpx.AsyncClient(timeout=30) as http:
        r = await http.get(f"{base}{path}", headers={"Authorization": f"Bearer {token}"})
    if r.status_code == 401:
        raise HTTPException(status_code=409, detail="Autodesk session invalid — reconnect required")
    if r.status_code >= 400:
        raise HTTPException(status_code=r.status_code, detail=f"Autodesk API error: {r.text[:200]}")
    return r.json()

@api_router.get("/autodesk/callback")
async def autodesk_callback(request: Request, code: Optional[str] = None, state: Optional[str] = None,
                            error: Optional[str] = None, error_description: Optional[str] = None):
    st = await db.aps_states.find_one({"state": state}, {"_id": 0}) if state else None
    return_url = st["return_url"] if st else "/integrations"
    if error or not code or not st:
        detail = error_description or error or "invalid_state"
        return RedirectResponse(f"{return_url}?autodesk=error&reason={urllib.parse.quote(detail)}")
    tok = await aps_token_request({"grant_type": "authorization_code", "code": code,
                                   "redirect_uri": APS_CALLBACK_URL})
    await store_aps_token(st["user_id"], tok)
    try:
        profile = await aps_get(st["user_id"], "/userinfo", base="https://api.userprofile.autodesk.com")
        await db.aps_tokens.update_one({"user_id": st["user_id"]}, {"$set": {"profile": profile}})
    except Exception as e:
        logger.warning(f"APS profile fetch failed: {e}")
    await db.aps_states.delete_one({"state": state})
    return RedirectResponse(f"{return_url}?autodesk=connected")

@api_router.get("/autodesk/status")
async def autodesk_status(user=Depends(get_current_user)):
    doc = await db.aps_tokens.find_one({"user_id": user["id"]}, {"_id": 0})
    configured = bool(APS_CLIENT_ID and APS_CLIENT_SECRET and APS_CALLBACK_URL)
    if not doc:
        return {"connected": False, "configured": configured, "callback_url": APS_CALLBACK_URL}
    return {"connected": True, "configured": configured, "callback_url": APS_CALLBACK_URL,
            "profile": doc.get("profile"), "scope": doc.get("scope"), "connected_at": doc.get("updated_at")}

@api_router.post("/autodesk/disconnect")
async def autodesk_disconnect(user=Depends(get_current_user)):
    await db.aps_tokens.delete_one({"user_id": user["id"]})
    return {"ok": True}

@api_router.get("/autodesk/hubs")
async def autodesk_hubs(user=Depends(get_current_user)):
    data = await aps_get(user["id"], "/project/v1/hubs")
    return [{"id": h["id"], "name": h["attributes"].get("name"), "region": h["attributes"].get("region"),
             "type": h["attributes"].get("extension", {}).get("type", "")} for h in data.get("data", [])]

@api_router.get("/autodesk/hubs/{hub_id}/projects")
async def autodesk_projects(hub_id: str, user=Depends(get_current_user)):
    data = await aps_get(user["id"], f"/project/v1/hubs/{hub_id}/projects")
    out = []
    for p in data.get("data", []):
        attrs = p.get("attributes", {})
        out.append({"id": p["id"], "name": attrs.get("name"),
                    "type": attrs.get("extension", {}).get("type", ""),
                    "root_folder": p.get("relationships", {}).get("rootFolder", {}).get("data", {}).get("id")})
    return out

@api_router.get("/autodesk/projects/{project_id}/contents")
async def autodesk_project_contents(project_id: str, folder_id: str, user=Depends(get_current_user)):
    data = await aps_get(user["id"], f"/data/v1/projects/{project_id}/folders/{urllib.parse.quote(folder_id, safe='')}/contents")
    out = []
    for item in data.get("data", []):
        attrs = item.get("attributes", {})
        out.append({"id": item["id"], "type": item.get("type"), "name": attrs.get("displayName") or attrs.get("name"),
                    "extension": attrs.get("extension", {}).get("type", ""),
                    "updated_at": attrs.get("lastModifiedTime")})
    return out

# ---------- Projects ----------
@api_router.post("/projects")
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

@api_router.get("/projects")
async def list_projects(user=Depends(get_current_user)):
    docs = await db.projects.find({"user_id": user["id"]}, {"_id": 0}).sort("created_at", -1).to_list(200)
    return docs

@api_router.get("/projects/{pid}")
async def get_project(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    return doc

@api_router.delete("/projects/{pid}")
async def delete_project(pid: str, user=Depends(get_current_user)):
    await db.projects.delete_one({"id": pid, "user_id": user["id"]})
    return {"ok": True}

@api_router.get("/projects/{pid}/zones")
async def project_zones(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc["zones"]

@api_router.get("/projects/{pid}/risks")
async def project_risks(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Not found")
    return doc["risks"]

@api_router.get("/rules")
async def get_rules():
    return PLANNING_RULES

class BoundaryIn(BaseModel):
    geojson: Dict[str, Any]
    source_name: Optional[str] = None

@api_router.put("/projects/{pid}/boundary")
async def set_boundary(pid: str, body: BoundaryIn, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
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
    await db.projects.update_one({"id": pid}, {"$set": update})
    return await db.projects.find_one({"id": pid}, {"_id": 0})

@api_router.delete("/projects/{pid}/boundary")
async def clear_boundary(pid: str, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
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

class AutodeskLinkIn(BaseModel):
    hub_id: str
    hub_name: Optional[str] = None
    aps_project_id: str
    aps_project_name: Optional[str] = None
    root_folder: Optional[str] = None

@api_router.put("/projects/{pid}/autodesk-link")
async def link_autodesk(pid: str, body: AutodeskLinkIn, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Project not found")
    await get_aps_access_token(user["id"])  # 409 if not connected
    link = {**body.model_dump(), "linked_at": now_iso(), "last_synced_at": None}
    await db.projects.update_one({"id": pid}, {"$set": {"autodesk": link, "updated_at": now_iso()}})
    return link

@api_router.delete("/projects/{pid}/autodesk-link")
async def unlink_autodesk(pid: str, user=Depends(get_current_user)):
    await db.projects.update_one({"id": pid, "user_id": user["id"]}, {"$unset": {"autodesk": ""}})
    return {"ok": True}

@api_router.get("/projects/{pid}/autodesk-contents")
async def linked_autodesk_contents(pid: str, folder_id: Optional[str] = None, user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc or not doc.get("autodesk"):
        raise HTTPException(status_code=404, detail="No Autodesk project linked to this plan")
    link = doc["autodesk"]
    folder = folder_id or link.get("root_folder")
    if not folder:
        raise HTTPException(status_code=400, detail="Linked Autodesk project has no root folder")
    data = await aps_get(user["id"],
                         f"/data/v1/projects/{urllib.parse.quote(link['aps_project_id'], safe='')}"
                         f"/folders/{urllib.parse.quote(folder, safe='')}/contents")
    items = []
    for item in data.get("data", []):
        attrs = item.get("attributes", {})
        items.append({"id": item["id"], "type": item.get("type"),
                      "name": attrs.get("displayName") or attrs.get("name"),
                      "extension": attrs.get("extension", {}).get("type", ""),
                      "updated_at": attrs.get("lastModifiedTime")})
    synced = now_iso()
    await db.projects.update_one({"id": pid}, {"$set": {"autodesk.last_synced_at": synced}})
    return {"folder_id": folder, "items": items, "last_synced_at": synced,
            "root_folder": link.get("root_folder")}

class ZoningIn(BaseModel):
    allocations: Dict[str, float]
    persist: bool = False

@api_router.post("/projects/{pid}/zoning")
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

@api_router.post("/projects/{pid}/zoning/reset")
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

# ---------- Push files into the linked Autodesk project ----------
JSONAPI = "application/vnd.api+json"

async def aps_request(user_id: str, method: str, path: str, *, json_body=None,
                      params=None, content_type: Optional[str] = None) -> httpx.Response:
    token = await get_aps_access_token(user_id)
    headers = {"Authorization": f"Bearer {token}", "Accept": JSONAPI}
    if content_type:
        headers["Content-Type"] = content_type
    async with httpx.AsyncClient(timeout=120) as http:
        return await http.request(method, f"{APS_BASE}{path}", headers=headers, json=json_body, params=params)

def _split_storage_id(storage_id: str) -> tuple:
    prefix = "urn:adsk.objects:os.object:"
    if not storage_id.startswith(prefix):
        raise HTTPException(status_code=502, detail="Autodesk returned an invalid storage id")
    bucket, _, object_key = storage_id[len(prefix):].partition("/")
    if not bucket or not object_key:
        raise HTTPException(status_code=502, detail="Cannot parse Autodesk storage id")
    return bucket, object_key

async def aps_upload_file(user_id: str, aps_project_id: str, folder_id: str,
                          filename: str, data: bytes) -> Dict[str, Any]:
    pid_enc = urllib.parse.quote(aps_project_id, safe="")
    storage_body = {
        "jsonapi": {"version": "1.0"},
        "data": {"type": "objects", "attributes": {"name": filename},
                 "relationships": {"target": {"data": {"type": "folders", "id": folder_id}}}},
    }
    r = await aps_request(user_id, "POST", f"/data/v1/projects/{pid_enc}/storage",
                          json_body=storage_body, content_type=JSONAPI)
    if r.status_code != 201:
        raise HTTPException(status_code=r.status_code if r.status_code < 500 else 502,
                            detail=f"Autodesk storage creation failed: {r.text[:250]}")
    storage_id = r.json()["data"]["id"]

    bucket, object_key = _split_storage_id(storage_id)
    signed_path = f"/oss/v2/buckets/{bucket}/objects/{urllib.parse.quote(object_key, safe='')}/signeds3upload"
    r = await aps_request(user_id, "GET", signed_path, params={"parts": 1})
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Autodesk signed upload failed: {r.text[:250]}")
    signed = r.json()
    async with httpx.AsyncClient(timeout=180) as http:
        s3 = await http.put(signed["urls"][0], content=data)  # signed URL: no Authorization header
    if s3.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Upload to Autodesk storage failed ({s3.status_code})")
    r = await aps_request(user_id, "POST", signed_path,
                          json_body={"uploadKey": signed["uploadKey"]}, content_type="application/json")
    if r.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Finalizing upload failed: {r.text[:250]}")

    item_body = {
        "jsonapi": {"version": "1.0"},
        "data": {
            "type": "items",
            "attributes": {"displayName": filename,
                           "extension": {"type": "items:autodesk.core:File", "version": "1.0"}},
            "relationships": {"tip": {"data": {"type": "versions", "id": "1"}},
                              "parent": {"data": {"type": "folders", "id": folder_id}}},
        },
        "included": [{
            "type": "versions", "id": "1",
            "attributes": {"name": filename,
                           "extension": {"type": "versions:autodesk.core:File", "version": "1.0"}},
            "relationships": {"storage": {"data": {"type": "objects", "id": storage_id}}},
        }],
    }
    r = await aps_request(user_id, "POST", f"/data/v1/projects/{pid_enc}/items",
                          json_body=item_body, content_type=JSONAPI)
    if r.status_code == 201:
        return {"name": filename, "mode": "created", "item_id": r.json()["data"]["id"]}
    if r.status_code != 409:
        raise HTTPException(status_code=r.status_code if r.status_code < 500 else 502,
                            detail=f"Creating Autodesk item failed: {r.text[:250]}")

    contents = await aps_request(user_id, "GET",
                                 f"/data/v1/projects/{pid_enc}/folders/{urllib.parse.quote(folder_id, safe='')}/contents",
                                 params={"filter[type]": "items"})
    item_id = next((i["id"] for i in contents.json().get("data", [])
                    if i.get("attributes", {}).get("displayName") == filename), None)
    if not item_id:
        raise HTTPException(status_code=409, detail="Autodesk reported a name conflict but the item was not found")
    version_body = {
        "jsonapi": {"version": "1.0"},
        "data": {"type": "versions",
                 "attributes": {"name": filename, "displayName": filename,
                                "extension": {"type": "versions:autodesk.core:File", "version": "1.0"}},
                 "relationships": {"item": {"data": {"type": "items", "id": item_id}},
                                   "storage": {"data": {"type": "objects", "id": storage_id}}}},
    }
    r = await aps_request(user_id, "POST", f"/data/v1/projects/{pid_enc}/versions",
                          json_body=version_body, content_type=JSONAPI)
    if r.status_code != 201:
        raise HTTPException(status_code=502, detail=f"Creating new version failed: {r.text[:250]}")
    return {"name": filename, "mode": "new_version", "item_id": item_id}

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

@api_router.post("/projects/{pid}/autodesk-push")
async def push_to_autodesk(pid: str, brief: Optional[UploadFile] = File(None),
                           include_boundary: bool = Form(True),
                           include_zoning: bool = Form(True),
                           user=Depends(get_current_user)):
    doc = await db.projects.find_one({"id": pid, "user_id": user["id"]}, {"_id": 0})
    if not doc or not doc.get("autodesk"):
        raise HTTPException(status_code=404, detail="No Autodesk project linked to this plan")
    link = doc["autodesk"]
    folder = link.get("root_folder")
    if not folder:
        raise HTTPException(status_code=400, detail="Linked Autodesk project has no root folder")

    safe_name = re.sub(r"[^A-Za-z0-9_\-]+", "_", doc["name"]).strip("_") or "SmartScape_Plan"
    uploads: List[tuple] = []
    if brief is not None:
        content = await brief.read()
        if content:
            uploads.append((f"{safe_name}_Design_Brief.pdf", content))
    if include_boundary and doc.get("boundary", {}).get("ring"):
        uploads.append((f"{safe_name}_Site_Boundary.geojson",
                        json.dumps(boundary_geojson(doc), indent=2).encode()))
    if include_zoning:
        zoning = zoning_geojson(doc)
        if zoning["features"]:
            uploads.append((f"{safe_name}_Zoning.geojson", json.dumps(zoning, indent=2).encode()))
    if not uploads:
        raise HTTPException(status_code=400, detail="Nothing to push — generate a brief or upload a site boundary first")

    results = []
    for filename, data in uploads:
        try:
            res = await aps_upload_file(user["id"], link["aps_project_id"], folder, filename, data)
            res["size_kb"] = round(len(data) / 1024, 1)
            results.append({**res, "ok": True})
        except HTTPException as e:
            logger.warning(f"APS push failed for {filename}: {e.detail}")
            results.append({"name": filename, "ok": False, "error": str(e.detail)})
    pushed_at = now_iso()
    await db.projects.update_one({"id": pid}, {"$set": {"autodesk.last_pushed_at": pushed_at,
                                                        "autodesk.last_push_results": results}})
    if not any(r["ok"] for r in results):
        raise HTTPException(status_code=502, detail=results[0].get("error", "Autodesk push failed"))
    return {"results": results, "pushed_at": pushed_at, "folder_id": folder}

# ---------- Chatbot ----------
def build_system_prompt(project: Optional[Dict], zone_ctx: Optional[Dict]) -> str:
    base = (
        "You are SmartScape AI Planner, an expert urban planning assistant helping planners "
        "make data-driven decisions for Indian smart cities. You are integrated with a planning "
        "analytics engine and answer using the specific project data provided. Keep answers concise "
        "(3-6 short bullet points), practical and reference the numbers from the project when relevant. "
        "Avoid emojis. Do NOT claim to run live Autodesk Forma analysis."
    )
    if project:
        p = project
        base += f"\n\nCURRENT PROJECT CONTEXT:\n- Name: {p.get('name')}\n- Location: {p.get('location', {}).get('name')}\n"
        base += f"- Site area: {p.get('site_area_sqkm')} sq.km\n- Target population: {p.get('population', {}).get('forecast_population'):,}\n"
        infra = p.get("infrastructure", {})
        base += f"- Infra deficits — Schools: {infra.get('schools',{}).get('deficit')}, Hospitals: {infra.get('hospitals',{}).get('deficit')}, Parks: {infra.get('parks',{}).get('deficit')}\n"
        base += f"- Overall planning score: {p.get('score',{}).get('overall')}/100\n"
        base += "- Zones: " + ", ".join(f"{z['name']} ({z['percentage']}%)" for z in p.get("zones", [])) + "\n"
    if zone_ctx:
        base += f"\nSELECTED MAP CONTEXT: {zone_ctx}\n"
    return base

@api_router.post("/chat")
async def chat(body: ChatIn, user=Depends(get_current_user)):
    project = None
    if body.project_id:
        project = await db.projects.find_one({"id": body.project_id, "user_id": user["id"]}, {"_id": 0})

    system_prompt = build_system_prompt(project, body.zone_context)

    # Try Emergent LLM (Claude Sonnet 5) — graceful fallback if unavailable
    reply = None
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        session_id = f"{user['id']}-{body.project_id or 'global'}"
        chat = LlmChat(
            api_key=os.environ.get("EMERGENT_LLM_KEY"),
            session_id=session_id,
            system_message=system_prompt,
        ).with_model("anthropic", "claude-sonnet-5")
        response = await chat.send_message(UserMessage(text=body.message))
        reply = response if isinstance(response, str) else str(response)
    except Exception as e:
        logger.warning(f"LLM fallback: {e}")
        reply = _fallback_reply(body.message, project, body.zone_context)

    # persist
    msg = {"id": str(uuid.uuid4()), "user_id": user["id"], "project_id": body.project_id,
           "message": body.message, "reply": reply, "zone_context": body.zone_context, "created_at": now_iso()}
    await db.chat_messages.insert_one(msg)
    msg.pop("_id", None)
    return {"reply": reply, "message_id": msg["id"]}

def _fallback_reply(msg: str, project: Optional[Dict], zone_ctx: Optional[Dict]) -> str:
    m = msg.lower()
    if project:
        p = project
        pop = p.get("population", {}).get("forecast_population", 0)
        infra = p.get("infrastructure", {})
        if "school" in m:
            return f"• Required schools: {infra['schools']['required']} for a projected population of {pop:,}\n• Existing: {infra['schools']['existing']}\n• Deficit: {infra['schools']['deficit']}\n• Distribute new schools across residential zones with a 1km walking radius."
        if "hospital" in m:
            return f"• Required hospitals: {infra['hospitals']['required']}\n• Existing: {infra['hospitals']['existing']}\n• Deficit: {infra['hospitals']['deficit']}\n• Locate hospitals near arterial roads for accessibility."
        if "risk" in m or "challenge" in m:
            return "• Top risks: Traffic congestion (High), Infrastructure deficit (High), Flood risk (Medium)\n• Prioritize distributed commercial nodes and reserve 15%+ green space to mitigate."
        if "proposal" in m or "compare" in m:
            return f"• Proposal A (Balanced): score {p['proposals'][0]['score']}\n• Proposal B (Sustainable): score {p['proposals'][1]['score']}\n• Recommendation: Proposal B offers better green cover and sustainability metrics."
        if "sustain" in m:
            return f"• Green space: {p['sustainability']['green_space_pct']}%\n• Solar potential score: {p['sustainability']['solar_potential']['score']}/100\n• Boost sustainability by increasing green cover and rooftop solar mandates."
    if zone_ctx:
        return f"• Zone {zone_ctx.get('id')} — {zone_ctx.get('name')}: {zone_ctx.get('percentage')}% of site\n• Purpose: {zone_ctx.get('purpose')}\n• Reasoning: {zone_ctx.get('reasoning')}"
    return "• Please open a project first so I can answer with your specific planning context.\n• Tip: Ask about schools, hospitals, sustainability, risks or proposal comparison."

@api_router.get("/projects/{pid}/chat")
async def project_chat(pid: str, user=Depends(get_current_user)):
    docs = await db.chat_messages.find({"user_id": user["id"], "project_id": pid}, {"_id": 0}).sort("created_at", 1).to_list(500)
    return docs

# ---------- Search ----------
@api_router.get("/search")
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
    return results[:25]

# ---------- Demo Seed ----------
@api_router.post("/seed-demo")
async def seed_demo(user=Depends(get_current_user)):
    # only seed if user has no projects
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

# ---------- Root ----------
@api_router.get("/")
async def root():
    return {"service": "SmartScape API", "version": "1.0.0", "status": "operational"}

app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
