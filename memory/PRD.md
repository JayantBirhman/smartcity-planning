# SmartScape — Product Requirements Document

## Original problem statement
Build "SmartScape", an AI-powered Smart City Planning Assistant for Autodesk Forma (SIH 2026 prototype):
a full-stack web app with GIS/map planning, demographic forecasting, zoning recommendations, infrastructure
requirement calculations, proposal comparison, sustainability scores, risk analysis and a contextual AI chatbot.

Priorities: Leaflet map with clickable zone overlays · contextual Claude chatbot aware of the clicked zone ·
client-side jsPDF design briefs · Forma-style "architecture-ready" UI · deep navy/emerald aesthetic with
framer-motion · JWT auth with 1-click demo login.

## Stack
React 19 + Tailwind + Shadcn + Leaflet + framer-motion + jsPDF · FastAPI + Motor/MongoDB ·
Claude Sonnet 5 via Emergent LLM key · Emergent-managed Google Auth · Autodesk Platform Services (APS) OAuth.

## Implemented
### 2026-09 (session 5) — Backend modularization, APS hardening & real OSM geospatial layer
- **Backend modularization**: decomposed monolithic `backend/server.py` (~1170 lines) into clean, maintainable modules
  under `backend/app/` without changing any route paths or breaking contracts:
  - `backend/app/auth.py` (JWT + Emergent Google session exchange auth routes/helpers)
  - `backend/app/autodesk.py` (APS 3-legged OAuth, hubs/projects browsing, link/contents, and direct-to-S3 push)
  - `backend/app/projects.py` (project CRUD, site boundary upload/clearing, zones, risks, search, demo seed)
  - `backend/app/zoning.py` (live zoning recalculation, preview, apply, and URDPFI reset)
  - `backend/app/planning.py` (pure functions for demographic forecasting, infrastructure deficits, sustainability, scoring, proposals)
  - `backend/app/geometry.py` (Shapely boundary extraction, polygon treemap slicing, Halton sampling, GeoJSON builders)
  - `backend/app/chat.py` (chat endpoint with Claude Sonnet 5 integration and contextual fallback)
  - `backend/app/db.py` & `backend/app/config.py` (centralized AsyncIOMotorClient and environment variables)
  - `backend/server.py` shrunk from 1170 to 45 lines (only FastAPI app setup, middleware, router mounts, and shutdown handler).
- **Autodesk Platform Services (APS) hardening**: verified end-to-end error handling across all APS endpoints.
  Added defensive try/except handling around all `httpx` network calls and JSON decoding to ensure graceful degradation
  (409 not-connected / invalid session, 404 project not found / unlinked, 400 invalid / nothing to push, 502 upstream unreachable),
  guaranteeing raw 500 errors are never thrown. Added comprehensive failure-path tests covering all APS endpoints.
- **Real geospatial data layer (`backend/app/geodata.py`)**: added genuine data-driven scoring path alongside prototype simulation:
  - `fetch_osm_amenities`: extracts real OpenStreetMap features (roads, schools, hospitals, parks) using OSMnx.
  - `compute_nearest_amenity_distances`: calculates metric distances from site centroid to nearest amenities.
  - `POST /api/projects/{pid}/real-suitability-score`: returns suitability score and sustainability breakdown matching the
    existing shape, tagged with `"data_source": "real"` (vs existing `"data_source": "prototype"`), and caches in project document.
  - Added `geopandas` and `osmnx` to `backend/requirements.txt`.
  - Additive note: This layer uses OSM vector geometries; it does not yet include WorldPop population rasters or SRTM elevation/flood
    data, which require local GeoTIFF files and are out of scope for this pass.
- Testing: 63/63 backend pytest pass (49 existing regression tests + 11 Autodesk failure-path tests + 3 real-geodata tests)
  running both sequentially and in parallel with 2 xdist workers (`test_reports/pytest/pytest_results.xml`).

### 2026-06 (session 4) — Push to Autodesk + live zone editing
- **Push to Autodesk**: `POST /api/projects/{id}/autodesk-push` uploads the Design Brief PDF (generated client-side
  with jsPDF, shared builder in `frontend/src/lib/brief.js`), the site-boundary GeoJSON and a zoning GeoJSON into the
  linked ACC project folder using the APS direct-to-S3 flow (create storage → signed upload → finalize → create item,
  or create a new version on a 409 name conflict). UI lives on the plan's Autodesk Sync page with a result list and
  `last_pushed_at`. APS scope now includes `data:create` (existing connections must reconnect — a scope warning is shown).
- **Live zone editing**: draggable dividers on a land-use bar (`LandUseBar`) shift share between neighbouring zones;
  `POST /api/projects/{id}/zoning` previews recut polygons + sustainability + score instantly (persist:false) and saves
  on Apply (persist:true); `POST /api/projects/{id}/zoning/reset` restores the recommended URDPFI mix.
- **Autodesk error UX fix** (user-reported): prominent copyable callback-URL pre-flight card on `/integrations` and the
  Autodesk Sync page — the reported error was Autodesk's own "request error" caused by the callback URL not being
  registered in the user's APS app. All Autodesk endpoints verified to degrade gracefully (409/404/400/502, never 500).
- Testing: 49/49 backend tests pass, all frontend flows pass with 0 console errors (`/app/test_reports/iteration_3.json`).

### 2026-06 (session 3) — Autodesk project linking, real site boundaries, realistic maps
- **Autodesk project link (pull-only sync)**: new project page `/projects/:id/autodesk` (sidebar "Autodesk Sync").
  Pick Hub → Project → Link. Backend `PUT/DELETE /api/projects/{id}/autodesk-link` (gated on a connected
  account, returns 409 otherwise) and `GET /api/projects/{id}/autodesk-contents` which pulls the linked
  project's folders/files on demand and records `last_synced_at`.
- **GeoJSON site boundary**: `PUT /api/projects/{id}/boundary` accepts FeatureCollection / Feature / Polygon /
  MultiPolygon / GeometryCollection, projects it to local metres (shapely), recomputes real site area, and
  treemap-slices the plot into per-land-use sub-polygons clipped inside the actual shape. Zone areas, map
  centroid, sustainability and score are recomputed; infrastructure markers are Halton-sampled inside the
  relevant zones. `DELETE` reverts to the generated blocks. Upload/remove UI lives on the Zoning Map.
- **Realistic maps**: Esri World Imagery satellite (with labels) + Streets + Terrain basemap switcher,
  a live-GPS "locate me" map control with accuracy toast and marker, site-boundary layer toggle, and a
  click-to-pin satellite preview in the New Project wizard (alongside Nominatim search and Use My Location).
- Testing: 35/35 backend tests pass, all frontend flows pass with 0 console errors
  (`/app/test_reports/iteration_2.json`).

### 2026-06 (session 1)
- Backend planning engine: population forecast, infrastructure deficits (URDPFI-inspired norms), zoning
  allocation, sustainability metrics, weighted planning score, risks, two auto-generated proposals.
- Endpoints: `/api/auth/{register,login,demo,me}`, `/api/projects` CRUD + `/zones` `/risks`, `/api/chat`,
  `/api/search`, `/api/rules`, `/api/seed-demo`.
- 14 frontend pages: Landing, Login, Signup, Dashboard, NewProject, Projects, ZoningMap, Infrastructure,
  Sustainability, Blueprint (jsPDF export), Proposals, Risks, Reports + AppShell, MapView, ChatBot.

### 2026-06 (session 2) — Google auth + Autodesk APS
- **Emergent-managed Google Auth**: "Continue with Google" on Login/Signup, `AuthCallback` route detected from
  `useLocation().hash`, `POST /api/auth/google/session` exchanges session_id, stores a 7-day session in
  `user_sessions` + httpOnly `session_token` cookie, `POST /api/auth/logout`.
- Auth dependency rewritten: accepts cookie `session_token` OR `Authorization: Bearer <jwt|session_token>`.
- **Autodesk Platform Services 3-legged OAuth** (`/api/autodesk/*`): `connect-url` (state persisted in
  `aps_states`), `callback` (code→token with client secret, refresh-token support, userinfo profile),
  `status`, `disconnect`, `hubs`, `hubs/{id}/projects`, `projects/{id}/contents`.
- New `/integrations` page + sidebar entry: connect/disconnect Autodesk, browse hubs → projects → contents.
- Registered APS callback: `https://smartcity-planning.preview.emergentagent.com/api/autodesk/callback`
  (must be added in the APS app's Callback URL list).
- Testing: 24/24 backend pytest pass (`/app/backend/tests/backend_test.py`), all frontend flows pass with
  0 console errors (report `/app/test_reports/iteration_1.json`).

## Backlog
- **P1** Draw the site boundary by hand on the map (in addition to GeoJSON upload).
- **P2** Multi-user collaboration / share a project read-only link.
- **P2** Recharts ResponsiveContainer min-height warnings on Dashboard/Reports.
- **P3** Ingest raster datasets (WorldPop population GeoTIFF and SRTM digital elevation model) for topographic flood slope analysis.

## Known limits
- Autodesk Forma has no public external design-write API — Forma proposals are only visible through ACC project
  contents. Prototype sustainability figures remain available as a local simulation fallback, while
  `POST /api/projects/{pid}/real-suitability-score` provides data-driven scores computed from real OpenStreetMap
  geospatial datasets (tagged with `"data_source": "real"`).
- Real Google and Autodesk interactive logins cannot be automated in tests.
