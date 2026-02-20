# Adding a V3 Endpoint

Use this flow when adding a new endpoint to the isolated V3 module.

## 1) Create endpoint function

Add a file under `src/http/v3/endpoints/`, e.g. `stations.ts`.

- Accept a `V3Context`.
- Call `v3Request(ctx, { ... })` with the correct `domain`, `endpoint`, `method`, and `auth`.
- Keep response mapping in this file so transport/session code stays generic.

## 2) Export endpoint

Export it from `src/http/v3/endpoints/index.ts`.

If the endpoint should be part of the public V3 API wrapper, wire it in `src/http/v3-api.ts` as a method on `V3Api`.

## 3) Choose domain and auth

Before coding, decide:

- domain: `security`, `mega`, `house`, or `passport`.
- auth: `required`, `optional`, or `none`.

`domain` selects the crypto session; `auth` controls whether a missing token is a hard error.

## 4) Add focused tests

Create tests in `src/http/v3/__test__/`, e.g. `stations.test.ts`.

- Mock `v3Request` to verify endpoint request shape and response mapping.
- Cover success, non-OK API code, and fallback behavior.
- Add/extend `V3SessionManager` tests only when introducing new manager behavior (domain mapping, default auth behavior, invalidation behavior).

## 5) Keep transport/session boundaries clean

- Do not put endpoint-specific data shaping in `V3Session` or `V3SessionManager`.
- Do not bypass `v3Request` to call `sessionManager` directly from endpoint modules.
