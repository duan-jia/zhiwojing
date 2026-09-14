# Authentication v1

Authentication v1 adds guest accounts and opaque, revocable sessions. Zhihu OAuth is deliberately out of scope for this version.

## API flow

1. `POST /api/auth/guest` creates a `kind=guest` user and returns `{ token, user }`. The plaintext token is returned only in this response. The database stores its SHA-256 digest. Sessions expire after 30 days by default.
2. Keep the token in client-controlled storage and send `Authorization: Bearer <token>` on every API request.
3. `GET /api/me` returns the authenticated user. RPGJS may use it to verify a connection token.
4. `POST /api/auth/logout` revokes the presented session immediately.
5. `POST /api/auth/dev-login` with `{ "user_id": 1 }` issues a token for an existing mock user only when `AUTH_DEV_MODE=1`. Never enable it in production.

`/api/health` and `/api/auth/*` are the only authentication-exempt API paths. Authentication errors use HTTP 401 and `detail: { code, message, retryable }`.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `AUTH_REQUIRED` | `0` | `1` enforces bearer authentication on business routes. |
| `AUTH_DEV_MODE` | `0` | `1` enables mock-user dev login. |
| `AUTH_SESSION_DAYS` | `30` | Guest/dev session lifetime in days. |
| `GUEST_CLEANUP_ENABLED` | `1` | Runs the daily 04:00 Asia/Shanghai deletion of all guest accounts and related data. |
| `AVATAR_API_URL` | `http://127.0.0.1:8000` | FastAPI URL used by the RPGJS authority. |

## Frontend and RPGJS contract

The frontend authentication flow now:

- calls `POST /api/auth/guest` (or dev-login locally), persists the returned token, and derives the visible user from the returned `user`/`GET /api/me` rather than a local identity picker;
- restores both guest and OAuth application sessions through `/api/me` after a reload;
- adds `Authorization: Bearer <token>` through the shared browser API helper for contacts, messages, persona, coldstart, Zhihu, draft, and agent chat calls; RPGJS forwards the same token for connection-scoped presence leases;
- connects to RPGJS with `?token=<token>` (the current client reads `zhiwojing.auth-token`); and
- clears the token after logout or an `INVALID_TOKEN` response.

With `AUTH_REQUIRED=1`, the RPGJS Node authority verifies the token against FastAPI before accepting the WebSocket. It replaces any client-supplied `avatar_id` with the verified user ID. Its presence, step, and chat calls forward that player's bearer token. With the switch off, the legacy `avatar_id` query remains available for migration/local demos.

Request fields/query parameters named `user_id`, `sender_id`, or the step `avatar_id` remain accepted for shape compatibility, but authenticated routes ignore them as identity claims. Target IDs (for example a message recipient or chat avatar) still select the intended peer.

## Migration

1. Deploy the backend and RPGJS authority with `AUTH_REQUIRED=0`; existing clients continue to work.
2. Deploy a frontend that implements the token contract above. Verify guest creation, reload via `/api/me`, WebSocket entry, and logout.
3. Set `AUTH_REQUIRED=1` on both FastAPI and the RPGJS authority and restart both processes. No request/response body shape changes are required.
4. `scripts/run-local.sh` enables `AUTH_REQUIRED=1` by default so guest sessions exercise the production authentication boundary. Optionally enable `AUTH_DEV_MODE=1` only on developer machines for multi-window mock-user testing.

Existing SQLite databases gain the `users.kind` column at startup. The `sessions` table is created automatically. A future migration will add real Zhihu OAuth account linking and token lifecycle; it must reuse the same session boundary instead of exposing provider credentials to the browser.
