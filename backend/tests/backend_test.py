"""SmartScape backend tests: auth (JWT + cookie session + Google), Autodesk APS, projects/chat/search."""
import os
import time
import uuid
import pytest
import requests
from datetime import datetime, timezone, timedelta
from pymongo import MongoClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://smartcity-planning.preview.emergentagent.com"
# Frontend env fallback
if "REACT_APP_BACKEND_URL" not in os.environ:
    for line in (Path(__file__).resolve().parents[2] / "frontend" / ".env").read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"

MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
mongo = MongoClient(MONGO_URL)
db = mongo[DB_NAME]


# ---------- Fixtures ----------
@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/demo", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


@pytest.fixture(scope="module")
def seeded_session():
    """Insert a Google-style user+session directly in Mongo."""
    uid = f"test-user-{uuid.uuid4()}"
    token = f"test_session_{uuid.uuid4()}"
    db.users.insert_one({
        "id": uid, "email": f"TEST_{uid}@example.com", "name": "Test User",
        "role": "Urban Planner", "auth_provider": "google",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    yield {"user_id": uid, "token": token}
    db.users.delete_one({"id": uid})
    db.user_sessions.delete_many({"user_id": uid})
    db.projects.delete_many({"user_id": uid})
    db.aps_tokens.delete_many({"user_id": uid})


@pytest.fixture(scope="module")
def expired_session():
    uid = f"test-user-exp-{uuid.uuid4()}"
    token = f"test_expired_{uuid.uuid4()}"
    db.users.insert_one({"id": uid, "email": f"TEST_{uid}@example.com", "name": "Exp", "role": "Urban Planner"})
    db.user_sessions.insert_one({
        "user_id": uid, "session_token": token,
        "expires_at": datetime.now(timezone.utc) - timedelta(hours=1),
        "created_at": datetime.now(timezone.utc) - timedelta(days=8),
    })
    yield token
    db.users.delete_one({"id": uid})
    db.user_sessions.delete_many({"user_id": uid})


# ---------- Health ----------
def test_root():
    r = requests.get(f"{API}/", timeout=15)
    assert r.status_code == 200
    assert r.json().get("service") == "SmartScape API"


# ---------- Auth: existing flows ----------
class TestAuthExisting:
    def test_demo_login(self):
        r = requests.post(f"{API}/auth/demo", timeout=30)
        assert r.status_code == 200
        j = r.json()
        assert "token" in j and "user" in j
        assert j["user"]["email"] == "demo@smartscape.ai"

    def test_me_with_bearer(self, demo_headers):
        r = requests.get(f"{API}/auth/me", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["email"] == "demo@smartscape.ai"

    def test_me_without_token(self):
        r = requests.get(f"{API}/auth/me", timeout=15)
        assert r.status_code == 401

    def test_register_and_login(self):
        email = f"TEST_{uuid.uuid4()}@example.com"
        r = requests.post(f"{API}/auth/register", json={
            "email": email, "password": "pass1234", "name": "Reg User"
        }, timeout=15)
        assert r.status_code == 200, r.text
        assert "token" in r.json()

        # login
        r2 = requests.post(f"{API}/auth/login", json={"email": email, "password": "pass1234"}, timeout=15)
        assert r2.status_code == 200
        assert r2.json()["user"]["email"] == email

        # wrong password
        r3 = requests.post(f"{API}/auth/login", json={"email": email, "password": "wrong"}, timeout=15)
        assert r3.status_code == 401

        db.users.delete_one({"email": email})


# ---------- Auth: Session (cookie + bearer) ----------
class TestSessionAuth:
    def test_me_with_bearer_session_token(self, seeded_session):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {seeded_session['token']}"}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == seeded_session["user_id"]

    def test_me_with_cookie_session(self, seeded_session):
        r = requests.get(f"{API}/auth/me",
                         cookies={"session_token": seeded_session["token"]}, timeout=15)
        assert r.status_code == 200, r.text
        assert r.json()["id"] == seeded_session["user_id"]

    def test_expired_session_401(self, expired_session):
        r = requests.get(f"{API}/auth/me",
                         headers={"Authorization": f"Bearer {expired_session}"}, timeout=15)
        assert r.status_code == 401

    def test_google_session_bogus(self):
        r = requests.post(f"{API}/auth/google/session",
                          json={"session_id": "bogus-session-id-xxx"}, timeout=30)
        assert r.status_code == 401

    def test_logout_deletes_session(self, seeded_session):
        # create a fresh throwaway session for this test
        uid = seeded_session["user_id"]
        tok = f"test_logout_{uuid.uuid4()}"
        db.user_sessions.insert_one({
            "user_id": uid, "session_token": tok,
            "expires_at": datetime.now(timezone.utc) + timedelta(days=1),
            "created_at": datetime.now(timezone.utc),
        })
        r = requests.post(f"{API}/auth/logout",
                          headers={"Authorization": f"Bearer {tok}"}, timeout=15)
        assert r.status_code == 200
        assert db.user_sessions.find_one({"session_token": tok}) is None


# ---------- Autodesk ----------
class TestAutodesk:
    def test_status_disconnected(self, demo_headers):
        # ensure no token stored for demo user
        demo_user = db.users.find_one({"email": "demo@smartscape.ai"})
        if demo_user:
            db.aps_tokens.delete_one({"user_id": demo_user["id"]})
        r = requests.get(f"{API}/autodesk/status", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        j = r.json()
        assert j["connected"] is False
        assert j["configured"] is True
        assert j["callback_url"] and "/api/autodesk/callback" in j["callback_url"]

    def test_connect_url(self, demo_headers):
        r = requests.post(f"{API}/autodesk/connect-url",
                          headers=demo_headers,
                          json={"return_url": "https://example.com/integrations"}, timeout=15)
        assert r.status_code == 200, r.text
        j = r.json()
        url = j["url"]
        assert "developer.api.autodesk.com/authentication/v2/authorize" in url
        assert "client_id=" in url
        assert "redirect_uri=" in url
        assert "scope=" in url
        assert "state=" in url
        # state persisted
        state = url.split("state=")[1].split("&")[0]
        assert db.aps_states.find_one({"state": state}) is not None
        db.aps_states.delete_one({"state": state})

    def test_hubs_not_connected_409(self, demo_headers):
        r = requests.get(f"{API}/autodesk/hubs", headers=demo_headers, timeout=15)
        assert r.status_code == 409

    def test_hub_projects_not_connected_409(self, demo_headers):
        r = requests.get(f"{API}/autodesk/hubs/some-hub/projects", headers=demo_headers, timeout=15)
        assert r.status_code == 409

    def test_callback_invalid_state_redirects_error(self):
        # do not follow redirects
        r = requests.get(f"{API}/autodesk/callback",
                         params={"code": "fake", "state": "nonexistent-state"},
                         allow_redirects=False, timeout=15)
        assert r.status_code in (302, 307)
        loc = r.headers.get("location", "")
        assert "autodesk=error" in loc

    def test_callback_missing_state(self):
        r = requests.get(f"{API}/autodesk/callback", allow_redirects=False, timeout=15)
        assert r.status_code in (302, 307)
        assert "autodesk=error" in r.headers.get("location", "")


# ---------- Projects regression ----------
class TestProjects:
    project_id = None

    def test_create_project(self, demo_headers):
        payload = {
            "name": "TEST_project_regression",
            "location": {"name": "TestCity", "lat": 18.5, "lng": 73.8},
            "site_area_sqkm": 8.0, "existing_population": 40000, "target_population": 90000,
            "growth_rate": 2.5, "planning_horizon_years": 15,
            "existing_schools": 5, "existing_hospitals": 1, "existing_parks": 3,
            "existing_roads_km": 30, "existing_buildings": 3000,
        }
        r = requests.post(f"{API}/projects", headers=demo_headers, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert j["name"] == "TEST_project_regression"
        assert "zones" in j and len(j["zones"]) == 7
        assert "risks" in j and "proposals" in j
        TestProjects.project_id = j["id"]

    def test_list_projects(self, demo_headers):
        r = requests.get(f"{API}/projects", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_project(self, demo_headers):
        pid = TestProjects.project_id
        r = requests.get(f"{API}/projects/{pid}", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert r.json()["id"] == pid

    def test_zones(self, demo_headers):
        pid = TestProjects.project_id
        r = requests.get(f"{API}/projects/{pid}/zones", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) == 7

    def test_risks(self, demo_headers):
        pid = TestProjects.project_id
        r = requests.get(f"{API}/projects/{pid}/risks", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        assert len(r.json()) >= 3

    def test_chat(self, demo_headers):
        pid = TestProjects.project_id
        r = requests.post(f"{API}/chat", headers=demo_headers,
                          json={"project_id": pid, "message": "How many schools do we need?"}, timeout=90)
        assert r.status_code == 200, r.text
        assert "reply" in r.json() and len(r.json()["reply"]) > 0

    def test_search(self, demo_headers):
        r = requests.get(f"{API}/search",
                        headers=demo_headers, params={"q": "TEST_project"}, timeout=15)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_delete_project(self, demo_headers):
        pid = TestProjects.project_id
        r = requests.delete(f"{API}/projects/{pid}", headers=demo_headers, timeout=15)
        assert r.status_code == 200
        r2 = requests.get(f"{API}/projects/{pid}", headers=demo_headers, timeout=15)
        assert r2.status_code == 404


# ---------- Boundary + Autodesk-link features ----------
def _sample_polygon_feature_collection(lat0=18.5, lng0=73.8, d=0.02):
    """Simple square polygon around (lat0,lng0), ~2km x 2km."""
    ring = [
        [lng0 - d, lat0 - d],
        [lng0 + d, lat0 - d],
        [lng0 + d, lat0 + d],
        [lng0 - d, lat0 + d],
        [lng0 - d, lat0 - d],
    ]
    return {"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {}, "geometry": {"type": "Polygon", "coordinates": [ring]}}
    ]}


@pytest.fixture(scope="module")
def boundary_project(demo_headers):
    payload = {
        "name": "TEST_boundary_project",
        "location": {"name": "TestPlot", "lat": 18.5, "lng": 73.8},
        "site_area_sqkm": 10.0, "existing_population": 40000, "target_population": 90000,
        "growth_rate": 2.5, "planning_horizon_years": 15,
        "existing_schools": 5, "existing_hospitals": 1, "existing_parks": 3,
        "existing_roads_km": 30, "existing_buildings": 3000,
    }
    r = requests.post(f"{API}/projects", headers=demo_headers, json=payload, timeout=30)
    assert r.status_code == 200
    pid = r.json()["id"]
    yield pid
    requests.delete(f"{API}/projects/{pid}", headers=demo_headers, timeout=15)


class TestBoundary:
    def test_put_boundary_feature_collection(self, demo_headers, boundary_project):
        pid = boundary_project
        fc = _sample_polygon_feature_collection()
        r = requests.put(f"{API}/projects/{pid}/boundary",
                         headers=demo_headers,
                         json={"geojson": fc, "source_name": "test-plot.geojson"}, timeout=30)
        assert r.status_code == 200, r.text
        p = r.json()
        assert "boundary" in p and p["boundary"]["latlngs"], "boundary.latlngs missing"
        assert isinstance(p["boundary"]["latlngs"], list) and len(p["boundary"]["latlngs"]) >= 4
        assert p["site_area_sqkm"] > 0
        # zones have polygons and areas sum ~ site_area
        total_area = 0.0
        for z in p["zones"]:
            assert "polygons" in z, "zone missing polygons key"
            assert len(z["polygons"]) > 0, f"zone {z['id']} has empty polygons"
            total_area += z["area_sqkm"]
        assert abs(total_area - p["site_area_sqkm"]) / p["site_area_sqkm"] < 0.05, (
            f"zone areas sum {total_area} !~ site_area {p['site_area_sqkm']}")
        # infra_points
        assert "infra_points" in p and isinstance(p["infra_points"], list) and len(p["infra_points"]) > 0
        # location moved to centroid (~18.5, 73.8 for our test polygon)
        assert abs(p["location"]["lat"] - 18.5) < 0.01
        assert abs(p["location"]["lng"] - 73.8) < 0.01

    def test_put_boundary_bare_polygon(self, demo_headers, boundary_project):
        pid = boundary_project
        d = 0.01
        bare = {"type": "Polygon", "coordinates": [[
            [73.8 - d, 18.5 - d], [73.8 + d, 18.5 - d],
            [73.8 + d, 18.5 + d], [73.8 - d, 18.5 + d], [73.8 - d, 18.5 - d]]]}
        r = requests.put(f"{API}/projects/{pid}/boundary",
                         headers=demo_headers, json={"geojson": bare}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["boundary"]["latlngs"]

    def test_put_boundary_multipolygon(self, demo_headers, boundary_project):
        pid = boundary_project
        d = 0.01
        mp = {"type": "MultiPolygon", "coordinates": [
            [[[73.80 - d, 18.50 - d], [73.80 + d, 18.50 - d],
              [73.80 + d, 18.50 + d], [73.80 - d, 18.50 + d], [73.80 - d, 18.50 - d]]],
            [[[73.90 - d, 18.60 - d], [73.90 + d, 18.60 - d],
              [73.90 + d, 18.60 + d], [73.90 - d, 18.60 + d], [73.90 - d, 18.60 - d]]],
        ]}
        r = requests.put(f"{API}/projects/{pid}/boundary",
                         headers=demo_headers, json={"geojson": mp}, timeout=30)
        assert r.status_code == 200, r.text

    def test_put_boundary_invalid_returns_400(self, demo_headers, boundary_project):
        pid = boundary_project
        bad = {"type": "FeatureCollection", "features": [
            {"type": "Feature", "properties": {},
             "geometry": {"type": "Point", "coordinates": [73.8, 18.5]}}]}
        r = requests.put(f"{API}/projects/{pid}/boundary",
                         headers=demo_headers, json={"geojson": bad}, timeout=15)
        assert r.status_code == 400

    def test_put_boundary_unknown_project_404(self, demo_headers):
        r = requests.put(f"{API}/projects/no-such-id/boundary",
                         headers=demo_headers,
                         json={"geojson": _sample_polygon_feature_collection()}, timeout=15)
        assert r.status_code == 404

    def test_put_boundary_unauth_401(self, boundary_project):
        r = requests.put(f"{API}/projects/{boundary_project}/boundary",
                         json={"geojson": _sample_polygon_feature_collection()}, timeout=15)
        assert r.status_code == 401

    def test_delete_boundary_reverts(self, demo_headers, boundary_project):
        pid = boundary_project
        # ensure a boundary exists
        requests.put(f"{API}/projects/{pid}/boundary",
                     headers=demo_headers,
                     json={"geojson": _sample_polygon_feature_collection()}, timeout=30)
        r = requests.delete(f"{API}/projects/{pid}/boundary", headers=demo_headers, timeout=15)
        assert r.status_code == 200, r.text
        p = r.json()
        assert "boundary" not in p or not p.get("boundary")
        assert "infra_points" not in p or not p.get("infra_points")
        assert p["site_area_sqkm"] == p["inputs"]["site_area_sqkm"]
        # zone polygons removed
        for z in p["zones"]:
            assert not z.get("polygons")


class TestAutodeskLink:
    def test_link_without_connect_409(self, demo_headers, boundary_project):
        # ensure not connected
        demo_user = db.users.find_one({"email": "demo@smartscape.ai"})
        db.aps_tokens.delete_one({"user_id": demo_user["id"]})
        r = requests.put(f"{API}/projects/{boundary_project}/autodesk-link",
                         headers=demo_headers,
                         json={"hub_id": "b.hub1", "aps_project_id": "b.proj1"}, timeout=15)
        assert r.status_code == 409

    def test_contents_without_link_404(self, demo_headers, boundary_project):
        r = requests.get(f"{API}/projects/{boundary_project}/autodesk-contents",
                         headers=demo_headers, timeout=15)
        assert r.status_code == 404

    def test_unlink_idempotent(self, demo_headers, boundary_project):
        r = requests.delete(f"{API}/projects/{boundary_project}/autodesk-link",
                            headers=demo_headers, timeout=15)
        assert r.status_code == 200
        # second call also ok
        r2 = requests.delete(f"{API}/projects/{boundary_project}/autodesk-link",
                             headers=demo_headers, timeout=15)
        assert r2.status_code == 200

    def test_link_with_fake_token_then_contents_graceful(self, demo_headers, boundary_project):
        demo_user = db.users.find_one({"email": "demo@smartscape.ai"})
        uid = demo_user["id"]
        # inject fake APS token
        db.aps_tokens.update_one({"user_id": uid}, {"$set": {
            "user_id": uid,
            "access_token": "bogus-access-token",
            "refresh_token": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "scope": "data:read",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        try:
            r = requests.put(f"{API}/projects/{boundary_project}/autodesk-link",
                             headers=demo_headers,
                             json={"hub_id": "b.hub-fake", "hub_name": "FakeHub",
                                   "aps_project_id": "b.proj-fake", "aps_project_name": "FakeProj",
                                   "root_folder": "urn:adsk.wipprod:fs.folder:co.fake"}, timeout=15)
            assert r.status_code == 200, r.text
            link = r.json()
            assert link["hub_id"] == "b.hub-fake"
            assert link["aps_project_id"] == "b.proj-fake"
            assert link["last_synced_at"] is None
            assert "linked_at" in link
            # verify stored on project
            proj = db.projects.find_one({"id": boundary_project})
            assert proj["autodesk"]["hub_id"] == "b.hub-fake"

            # contents fails gracefully (409 or 4xx from Autodesk, NOT 500)
            r2 = requests.get(f"{API}/projects/{boundary_project}/autodesk-contents",
                              headers=demo_headers, timeout=30)
            assert r2.status_code != 500, f"got 500: {r2.text}"
            assert 400 <= r2.status_code < 500
        finally:
            db.aps_tokens.delete_one({"user_id": uid})
            requests.delete(f"{API}/projects/{boundary_project}/autodesk-link",
                            headers=demo_headers, timeout=15)


# ---------- Zoning edit + reset ----------
LAND_USE_KEYS = ["residential", "commercial", "institutional", "industrial",
                 "roads_transport", "parks_green", "public_utility"]
RECOMMENDED = {"residential": 38, "commercial": 10, "institutional": 10, "industrial": 5,
               "roads_transport": 15, "parks_green": 15, "public_utility": 7}


@pytest.fixture(scope="module")
def zoning_project(demo_headers):
    payload = {
        "name": "TEST_zoning_project",
        "location": {"name": "TestZonePlot", "lat": 18.5, "lng": 73.8},
        "site_area_sqkm": 10.0, "existing_population": 40000, "target_population": 90000,
        "growth_rate": 2.5, "planning_horizon_years": 15,
        "existing_schools": 5, "existing_hospitals": 1, "existing_parks": 3,
        "existing_roads_km": 30, "existing_buildings": 3000,
    }
    r = requests.post(f"{API}/projects", headers=demo_headers, json=payload, timeout=30)
    assert r.status_code == 200
    pid = r.json()["id"]
    yield pid
    requests.delete(f"{API}/projects/{pid}", headers=demo_headers, timeout=15)


class TestZoning:
    def test_zoning_preview_no_persist(self, demo_headers, zoning_project):
        # Change allocations, more parks_green
        alloc = {"residential": 30, "commercial": 10, "institutional": 10, "industrial": 5,
                 "roads_transport": 15, "parks_green": 23, "public_utility": 7}
        original = requests.get(f"{API}/projects/{zoning_project}",
                                headers=demo_headers, timeout=15).json()
        original_score = original["score"]["overall"]
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         headers=demo_headers,
                         json={"allocations": alloc, "persist": False}, timeout=30)
        assert r.status_code == 200, r.text
        j = r.json()
        assert "zones" in j and len(j["zones"]) == 7
        # green_space_pct should equal parks_green (23%)
        assert abs(j["sustainability"]["green_space_pct"] - 23) < 0.1
        # score changed
        assert j["score"]["overall"] != original_score
        # zone percentages match
        pct_map = {z["type"]: z["percentage"] for z in j["zones"]}
        for k, v in alloc.items():
            assert abs(pct_map[k] - v) < 0.5, f"{k}: got {pct_map[k]} vs {v}"
        # NOT persisted
        after = requests.get(f"{API}/projects/{zoning_project}",
                             headers=demo_headers, timeout=15).json()
        assert after["score"]["overall"] == original_score
        assert "land_use_custom" not in after or not after.get("land_use_custom")

    def test_zoning_persist(self, demo_headers, zoning_project):
        alloc = {"residential": 40, "commercial": 12, "institutional": 8, "industrial": 5,
                 "roads_transport": 15, "parks_green": 13, "public_utility": 7}
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         headers=demo_headers,
                         json={"allocations": alloc, "persist": True}, timeout=30)
        assert r.status_code == 200
        # verify persisted
        p = requests.get(f"{API}/projects/{zoning_project}",
                        headers=demo_headers, timeout=15).json()
        pct_map = {z["type"]: z["percentage"] for z in p["zones"]}
        assert abs(pct_map["residential"] - 40) < 0.5
        assert p.get("land_use_custom") == alloc

    def test_zoning_missing_keys_400(self, demo_headers, zoning_project):
        alloc = {"residential": 50, "commercial": 50}  # missing keys
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         headers=demo_headers,
                         json={"allocations": alloc}, timeout=15)
        assert r.status_code == 400

    def test_zoning_extra_keys_400(self, demo_headers, zoning_project):
        alloc = {**RECOMMENDED, "farmland": 5}
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         headers=demo_headers,
                         json={"allocations": alloc}, timeout=15)
        assert r.status_code == 400

    def test_zoning_negative_400(self, demo_headers, zoning_project):
        alloc = {**RECOMMENDED, "residential": -5, "commercial": 53}
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         headers=demo_headers,
                         json={"allocations": alloc}, timeout=15)
        assert r.status_code == 400

    def test_zoning_sum_off_400(self, demo_headers, zoning_project):
        alloc = {"residential": 20, "commercial": 10, "institutional": 10, "industrial": 5,
                 "roads_transport": 5, "parks_green": 5, "public_utility": 5}  # sum=60
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         headers=demo_headers,
                         json={"allocations": alloc}, timeout=15)
        assert r.status_code == 400
        assert "100" in r.json().get("detail", "")

    def test_zoning_unknown_project_404(self, demo_headers):
        r = requests.post(f"{API}/projects/nope/zoning",
                         headers=demo_headers,
                         json={"allocations": RECOMMENDED}, timeout=15)
        assert r.status_code == 404

    def test_zoning_unauth_401(self, zoning_project):
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         json={"allocations": RECOMMENDED}, timeout=15)
        assert r.status_code == 401

    def test_zoning_with_boundary_clips(self, demo_headers, zoning_project):
        # Apply boundary
        fc = _sample_polygon_feature_collection()
        requests.put(f"{API}/projects/{zoning_project}/boundary",
                    headers=demo_headers, json={"geojson": fc}, timeout=30)
        alloc = {"residential": 30, "commercial": 15, "institutional": 10, "industrial": 5,
                 "roads_transport": 15, "parks_green": 18, "public_utility": 7}
        r = requests.post(f"{API}/projects/{zoning_project}/zoning",
                         headers=demo_headers,
                         json={"allocations": alloc, "persist": False}, timeout=30)
        assert r.status_code == 200
        j = r.json()
        # zones must have polygons (clipped to boundary)
        for z in j["zones"]:
            assert "polygons" in z and len(z["polygons"]) > 0
        # areas roughly sum to site_area
        total = sum(z["area_sqkm"] for z in j["zones"])
        assert abs(total - j["site_area_sqkm"]) / j["site_area_sqkm"] < 0.05

    def test_zoning_reset(self, demo_headers, zoning_project):
        # First set a custom alloc
        alloc = {"residential": 45, "commercial": 10, "institutional": 10, "industrial": 5,
                 "roads_transport": 15, "parks_green": 8, "public_utility": 7}
        requests.post(f"{API}/projects/{zoning_project}/zoning",
                     headers=demo_headers,
                     json={"allocations": alloc, "persist": True}, timeout=30)
        r = requests.post(f"{API}/projects/{zoning_project}/zoning/reset",
                        headers=demo_headers, timeout=30)
        assert r.status_code == 200
        p = r.json()
        pct_map = {z["type"]: z["percentage"] for z in p["zones"]}
        for k, v in RECOMMENDED.items():
            assert abs(pct_map[k] - v) < 0.5, f"{k}: got {pct_map[k]} vs {v}"
        assert not p.get("land_use_custom")


# ---------- Push to Autodesk ----------
class TestAutodeskPush:
    def test_push_no_link_404(self, demo_headers, zoning_project):
        # ensure no autodesk link
        db.projects.update_one({"id": zoning_project}, {"$unset": {"autodesk": ""}})
        files = {"brief": ("brief.pdf", b"%PDF-1.4 fake", "application/pdf")}
        data = {"include_boundary": "true", "include_zoning": "true"}
        r = requests.post(f"{API}/projects/{zoning_project}/autodesk-push",
                        headers=demo_headers, files=files, data=data, timeout=30)
        assert r.status_code == 404

    def test_push_with_fake_token_graceful(self, demo_headers, zoning_project):
        demo_user = db.users.find_one({"email": "demo@smartscape.ai"})
        uid = demo_user["id"]
        # Inject fake APS token + link
        db.aps_tokens.update_one({"user_id": uid}, {"$set": {
            "user_id": uid, "access_token": "bogus", "refresh_token": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "scope": "data:read data:write data:create", "updated_at": datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        # link the project
        requests.put(f"{API}/projects/{zoning_project}/autodesk-link",
                    headers=demo_headers,
                    json={"hub_id": "b.hub-fake", "hub_name": "FakeHub",
                          "aps_project_id": "b.proj-fake", "aps_project_name": "FakeProj",
                          "root_folder": "urn:adsk.wipprod:fs.folder:co.fake"}, timeout=15)
        try:
            files = {"brief": ("brief.pdf", b"%PDF-1.4 fake pdf content", "application/pdf")}
            data = {"include_boundary": "false", "include_zoning": "false"}
            r = requests.post(f"{API}/projects/{zoning_project}/autodesk-push",
                            headers=demo_headers, files=files, data=data, timeout=60)
            assert r.status_code != 500, f"got 500: {r.text}"
            assert 400 <= r.status_code < 600
            # project doc should still be intact
            proj = db.projects.find_one({"id": zoning_project})
            assert proj is not None and proj["name"] == "TEST_zoning_project"
        finally:
            db.aps_tokens.delete_one({"user_id": uid})
            requests.delete(f"{API}/projects/{zoning_project}/autodesk-link",
                           headers=demo_headers, timeout=15)

    def test_push_nothing_to_upload_400(self, demo_headers, zoning_project):
        demo_user = db.users.find_one({"email": "demo@smartscape.ai"})
        uid = demo_user["id"]
        db.aps_tokens.update_one({"user_id": uid}, {"$set": {
            "user_id": uid, "access_token": "bogus", "refresh_token": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "scope": "data:create", "updated_at": datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        # remove boundary first to make zoning polygons empty
        requests.delete(f"{API}/projects/{zoning_project}/boundary",
                       headers=demo_headers, timeout=15)
        requests.put(f"{API}/projects/{zoning_project}/autodesk-link",
                    headers=demo_headers,
                    json={"hub_id": "b.hub-fake", "aps_project_id": "b.proj-fake",
                          "root_folder": "urn:adsk.wipprod:fs.folder:co.fake"}, timeout=15)
        try:
            # no brief file, no boundary => nothing to push
            data = {"include_boundary": "true", "include_zoning": "true"}
            r = requests.post(f"{API}/projects/{zoning_project}/autodesk-push",
                            headers=demo_headers, data=data, timeout=30)
            assert r.status_code == 400
            assert "Nothing to push" in r.json().get("detail", "") or "nothing" in r.json().get("detail", "").lower()
        finally:
            db.aps_tokens.delete_one({"user_id": uid})
            requests.delete(f"{API}/projects/{zoning_project}/autodesk-link",
                           headers=demo_headers, timeout=15)


# ---------- Scope warning: old token missing data:create ----------
class TestScopeWarning:
    def test_status_reports_older_scope(self, demo_headers):
        demo_user = db.users.find_one({"email": "demo@smartscape.ai"})
        uid = demo_user["id"]
        db.aps_tokens.update_one({"user_id": uid}, {"$set": {
            "user_id": uid, "access_token": "bogus", "refresh_token": None,
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "scope": "data:read data:write account:read user:read openid",  # NO data:create
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }}, upsert=True)
        try:
            r = requests.get(f"{API}/autodesk/status", headers=demo_headers, timeout=15)
            assert r.status_code == 200
            j = r.json()
            assert j["connected"] is True
            assert "data:create" not in (j.get("scope") or "")
        finally:
            db.aps_tokens.delete_one({"user_id": uid})

