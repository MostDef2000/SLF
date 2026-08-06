# API CORS origin policy

## Purpose

CORS is a browser response policy. It is not authentication and does not replace the bearer token check.

The VPS API exposes CORS headers only for `/api/*` and only to reviewed origins.

## Default origins

- `https://slf.fm`
- `https://www.slf.fm`
- `https://soccerlife.ru`
- `https://www.soccerlife.ru`

The default set mirrors `SLF_GAME_DOMAINS` in the userscript source.

## Allowed browser request shape

- methods: `GET`, `POST`, `OPTIONS`;
- request headers: `Authorization`, `Content-Type`;
- credentials mode: disabled;
- wildcard origin: prohibited;
- preflight cache: 600 seconds;
- response varies by `Origin`.

A request from an unrelated origin may still receive the underlying HTTP response when executed outside browser CORS enforcement, but it does not receive `Access-Control-Allow-Origin` and cannot be read by a normal browser page.

## Tampermonkey transport

`GM_xmlhttpRequest` may omit the browser `Origin` header. Authenticated no-Origin requests remain valid. The API token remains mandatory.

## Override

`SLF_API_CORS_ORIGINS` is an optional comma-separated list of explicit origins:

```text
SLF_API_CORS_ORIGINS=https://slf.fm,https://soccerlife.ru
```

Each entry must:

- use `http` or `https`;
- contain a host;
- contain no credentials;
- contain no path other than `/`;
- contain no query or fragment;
- not be `*` or `null`.

Duplicate origins are removed after normalization. Invalid or empty effective configuration stops server startup.

## Verification

```bash
python3 tools/test-api-cors-policy.py
python3 tools/test-api-contract-compatibility.py
```

The dedicated test covers all default origins, denied origins, preflight, no-Origin transport, override normalization, disabled credential headers and invalid configuration.

## Deployment and rollback

This repository change does not modify `/root/slf-server/slf_api.env` or deploy the VPS. Adding an origin in production requires a separately reviewed environment change and post-deployment verification.

Rollback is a direct revert. Broad or wildcard CORS must not be restored without a separately reviewed threat-model decision.
