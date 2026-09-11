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
