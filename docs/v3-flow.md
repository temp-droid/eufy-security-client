# Isolated V3 Flow

## Purpose

V3 request encryption and session handling are separate from the legacy HTTP API. `V3SessionManager` caches per-domain crypto sessions; endpoints call through `transport.ts`.

## Architecture

- `src/http/v3-api.ts` builds a `V3SessionManager` from `HTTPApi` dependencies (token, user id, headers, invalidation hooks).
- `src/http/v3/session/V3SessionManager.ts` caches one `V3Session` per domain (`security`, `mega`, `house`, `passport`).
- `src/http/v3/session/V3Session.ts` performs key exchange, builds encrypted headers/body, executes requests, and decrypts response payloads.
- `src/http/v3/endpoints/*.ts` contains endpoint-specific behavior and response mapping.
- `src/http/v3/transport.ts` is the thin request entry point used by endpoints.

## Lifecycle

1. `createV3Api(api)` creates one manager bound to a region and dependency set.
2. An endpoint calls `v3Request(ctx, request)`.
3. The manager resolves a domain session, creating and caching it on first use.
4. `V3Session.ensureSession()` runs ECDH key exchange (once per domain session) and stores derived crypto headers in memory.
5. `V3Session.request()` sends encrypted request data, then decrypts string payloads in successful responses.
6. On `401`, token state is invalidated and the socket close event is emitted via deps.

## Auth vs. crypto session separation

Token auth and V3 crypto are decoupled: a token can rotate without rebuilding session objects, and a crypto session can be rebuilt per domain without touching global auth.

## Key exchange

V3 endpoints expect encrypted payloads and signed metadata. Each domain session performs ECDH key exchange on first use, deriving ephemeral signing and encryption keys. This scopes a compromise to a single in-memory session.

## Persisted vs ephemeral state

Persisted across runs (demo script):

- cloud auth token + expiration (`cloud_token`, `cloud_token_expiration`),
- HTTP API persistent profile (`httpApi`, including user/device key material used by `HTTPApi`).

Ephemeral (in-memory only):

- V3 per-domain crypto headers/signing key (`V3Session.crypto`),
- in-flight session initialization promise (`sessionPromise`).

## Demo script: `session.json`

`src/scripts/demo-v3-get-device-list.ts` stores `session.json` in the current working directory.

Run it with one command:

`EUFY_COUNTRY=US EUFY_USERNAME=you@example.com EUFY_PASSWORD='your-password' npm run demo:v3`

- Reuses values when country and login hash match.
- Clears token and `httpApi` data when identity changes or required key fields are incomplete.
- Writes updated token expiration and `httpApi` persistent data after a successful run.

`session.json` is gitignored and intended only for local demo convenience.
