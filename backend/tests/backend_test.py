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

