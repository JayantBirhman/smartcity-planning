"""
Test suite for SmartScape Data Processing & Feature Extraction Pipeline.
Validates spatial morphology, network proximity, Shannon entropy,
climate resilience, ML feature vectors, and CSV/JSON export.
"""

import os
import io
import csv
import json
import pytest
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "http://localhost:8000").rstrip("/")
API = f"{BASE_URL}/api"
DEMO_PROJECT_ID = "57c017bf-22f6-4789-ad92-62190881d3ad"


@pytest.fixture(scope="module")
def demo_token():
    r = requests.post(f"{API}/auth/demo", timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="module")
def demo_headers(demo_token):
    return {"Authorization": f"Bearer {demo_token}"}


def test_extract_raw_features(demo_headers):
    """Stateless raw extraction on custom geojson polygon."""
    sample_boundary = {
        "type": "Polygon",
        "coordinates": [[
            [73.8567, 18.5204],
            [73.8667, 18.5204],
            [73.8667, 18.5304],
            [73.8567, 18.5304],
            [73.8567, 18.5204]
        ]]
    }
    payload = {
        "boundary_geojson": sample_boundary,
        "land_use_mix": {
            "residential": 45.0,
            "commercial": 20.0,
            "public_semi_public": 15.0,
            "open_spaces": 12.0,
            "transportation": 8.0
        },
        "target_density_pph": 12000.0
    }
    r = requests.post(f"{API}/features/extract-raw", json=payload, headers=demo_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()

    # Structure checks
    assert "ml_feature_vector" in data
    assert "domains" in data
    assert "radar_profile" in data
    assert "pipeline_metadata" in data

    # Domain checks
    domains = data["domains"]
    assert "morphology" in domains
    assert "network" in domains
    assert "diversity" in domains
    assert "resilience" in domains

    # Morphology metrics
    morph = domains["morphology"]
    assert morph["compactness"] > 0
    assert morph["solidity"] > 0
    assert morph["area_sqkm"] > 0
    assert morph["perimeter_km"] > 0

    # Diversity metrics
    div = domains["diversity"]
    assert div["shannon_entropy"] > 0
    assert div["effective_diversity_index"] > 0
    assert any(term in div["assessment"] for term in ["Diversity", "Mixed-Use", "Sprawl"])

    # ML Feature Vector validation (16 dimensional, bounded [0, 1])
    ml_vec = data["ml_feature_vector"]
    assert len(ml_vec) == 16
    for item in ml_vec:
        assert "key" in item
        assert "name" in item
        assert "domain" in item
        assert "normalized" in item
        assert 0.0 <= item["normalized"] <= 1.0

    # Radar profile
    radar = data["radar_profile"]
    assert len(radar) == 6
    for axis in radar:
        assert 0 <= axis["score"] <= 100


def test_process_and_get_project_features(demo_headers):
    """Executes pipeline for an existing project and retrieves cached features."""
    # 1. Trigger process
    r_proc = requests.post(
        f"{API}/projects/{DEMO_PROJECT_ID}/features/process",
        headers=demo_headers,
        timeout=30
    )
    assert r_proc.status_code == 200, r_proc.text
    proc_data = r_proc.json()
    assert proc_data["project_id"] == DEMO_PROJECT_ID
    assert proc_data["status"] == "completed"
    assert "ml_feature_vector" in proc_data
    assert len(proc_data["ml_feature_vector"]) == 16

    # 2. Fetch features
    r_get = requests.get(
        f"{API}/projects/{DEMO_PROJECT_ID}/features",
        headers=demo_headers,
        timeout=30
    )
    assert r_get.status_code == 200, r_get.text
    get_data = r_get.json()
    assert get_data["project_id"] == DEMO_PROJECT_ID
    assert "ml_feature_vector" in get_data
    assert len(get_data["ml_feature_vector"]) == 16
    assert "radar_profile" in get_data


def test_export_project_features_csv(demo_headers):
    """Exports features as CSV attachment."""
    r = requests.get(
        f"{API}/projects/{DEMO_PROJECT_ID}/features/export?format=csv",
        headers=demo_headers,
        timeout=30
    )
    assert r.status_code == 200, r.text
    assert "text/csv" in r.headers.get("content-type", "")
    assert "attachment" in r.headers.get("content-disposition", "")
    assert "smartscape_features_" in r.headers.get("content-disposition", "")

    # Parse CSV content
    content = r.text
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    assert len(rows) == 16
    assert "feature_key" in rows[0]
    assert "feature_name" in rows[0]
    assert "domain" in rows[0]
    assert "raw_value" in rows[0]
    assert "normalized_score" in rows[0]


def test_export_project_features_json(demo_headers):
    """Exports features as downloadable JSON."""
    r = requests.get(
        f"{API}/projects/{DEMO_PROJECT_ID}/features/export?format=json",
        headers=demo_headers,
        timeout=30
    )
    assert r.status_code == 200, r.text
    assert "application/json" in r.headers.get("content-type", "")
    data = r.json()
    assert data["project_id"] == DEMO_PROJECT_ID
    assert "ml_feature_vector" in data
    assert "domains" in data


def test_features_nonexistent_project(demo_headers):
    """404 when querying features of a non-existent project."""
    r = requests.get(
        f"{API}/projects/nonexistent-uuid-9999/features",
        headers=demo_headers,
        timeout=30
    )
    assert r.status_code == 404


def test_export_invalid_format(demo_headers):
    """400 when requesting unsupported export format."""
    r = requests.get(
        f"{API}/projects/{DEMO_PROJECT_ID}/features/export?format=xml",
        headers=demo_headers,
        timeout=30
    )
    assert r.status_code == 400
