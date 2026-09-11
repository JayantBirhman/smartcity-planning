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
- **P1** Push a SmartScape design brief / boundary GeoJSON into the linked Autodesk project folder (data:write).
- **P2** Recharts ResponsiveContainer min-height warnings on Dashboard/Reports.
- **P2** Multi-user collaboration / share a project read-only link.
- **P2** Split `server.py` (~950 lines) into auth / autodesk / geometry / planning modules.

## Known limits
- Autodesk Forma has no public external design API — Forma proposals are only visible through ACC project
  contents. All sustainability/solar/carbon figures are PROTOTYPE values computed locally, not from Forma.
- Real Google and Autodesk interactive logins cannot be automated in tests.
