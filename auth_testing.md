# Auth-Gated App Testing Playbook (SmartScape)

Auth methods available:
1. Email/password JWT (`POST /api/auth/login`) — token returned in `token`, sent as `Authorization: Bearer`.
2. One-click demo login (`POST /api/auth/demo`).
3. Emergent-managed Google Auth (`POST /api/auth/google/session` with `{session_id}`) — returns `session_token`
   stored in `db.user_sessions` AND set as httpOnly cookie `session_token`.

Backend accepts BOTH: cookie `session_token` or `Authorization: Bearer <jwt|session_token>`.

## Step 1: Create a Google-style test session directly in Mongo
```
mongosh --eval "
use('test_database');
var userId = 'test-user-' + Date.now();
var sessionToken = 'test_session_' + Date.now();
db.users.insertOne({ id: userId, email: 'test.user.'+Date.now()+'@example.com', name: 'Test User', role: 'Urban Planner', auth_provider: 'google', created_at: new Date().toISOString() });
db.user_sessions.insertOne({ user_id: userId, session_token: sessionToken, expires_at: new Date(Date.now()+7*24*60*60*1000), created_at: new Date() });
print('Session token: ' + sessionToken);
"
```
NOTE: users collection uses field `id` (not `user_id`). Sessions reference it via `user_id`.

## Step 2: Test backend
```
curl -s "$API/api/auth/me" -H "Authorization: Bearer $TOKEN"
curl -s "$API/api/projects" -H "Authorization: Bearer $TOKEN"
curl -s "$API/api/autodesk/status" -H "Authorization: Bearer $TOKEN"
```

## Step 3: Browser testing
Either set the cookie:
```
await page.context.add_cookies([{ "name": "session_token", "value": TOKEN, "domain": "<host>", "path": "/", "httpOnly": True, "secure": True, "sameSite": "None" }])
```
or seed localStorage (app reads `ss_token` / `ss_user`):
```
await page.add_init_script(f"localStorage.setItem('ss_token','{TOKEN}')")
```

## Google OAuth callback route
- App detects `#session_id=` from `useLocation().hash` during render (see `App.js` AppRouter) and renders `AuthCallback`.
- Never hardcode the redirect URL; it is `window.location.origin + '/dashboard'`.

## Autodesk APS (3-legged)
- `POST /api/autodesk/connect-url` returns the APS authorize URL (requires app auth).
- `GET /api/autodesk/callback` handles the code exchange and redirects back to `/integrations?autodesk=connected`.
- Real Autodesk login cannot be automated in tests — validate that `connect-url` returns a valid
  `developer.api.autodesk.com/authentication/v2/authorize` URL and that `/autodesk/hubs` returns 409 when not connected.

## Checklist
- [ ] `/api/auth/me` works with cookie AND bearer
- [ ] Protected pages load without redirect
- [ ] Logout clears cookie + session doc
