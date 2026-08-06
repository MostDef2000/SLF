# VPS API request body size contract

## Purpose

The VPS API must reject oversized authenticated request bodies before JSON parsing and collection persistence can consume unbounded memory or storage resources.

## Configuration

`vps/api/server.py` configures Flask `MAX_CONTENT_LENGTH` from:

```text
SLF_API_MAX_CONTENT_LENGTH
```

Rules:

- default: `8388608` bytes (8 MiB);
- override: a positive base-10 integer in bytes;
- zero, negative values and non-integers fail application startup;
- absence of the variable uses the default;
- the limit applies to request bytes, not decoded row count.

The repository does not change `/root/slf-server/slf_api.env`. Any production override is a separate operational action with deployment and rollback evidence.

## Rejection response

Flask raises `RequestEntityTooLarge` before `request.get_json()` completes. The API returns HTTP `413` with:

```json
{
  "error": "Request body too large",
  "kind": "request_too_large",
  "maxBytes": 8388608
}
```

`maxBytes` reflects the effective configuration, not necessarily the default.

Authentication remains the first application-level check in `api_post`. A request with an invalid bearer token returns `401` without parsing or persisting the body, including when its declared payload exceeds the configured limit.

## Persistence invariant

A rejected append or replace request must not:

- create or replace the collection JSON file;
- change existing collection bytes;
- create leftover temporary files;
- acquire a collection transaction for persistence;
- alter deduplication or analysis counters.

Successful requests below the limit retain existing endpoint paths, payload schemas and response formats.

## Regression evidence

`tools/test-api-request-size-limit.py` verifies:

- the 8 MiB default;
- startup rejection for `0`, negative and non-integer overrides;
- a successful request below a 1024-byte test limit;
- stable JSON `413` responses for oversized append and replace requests;
- byte-for-byte preservation of the existing collection after rejection;
- authentication order for an oversized request with an invalid token;
- successful subsequent append and clean temporary-file state.

The test is run by both the path-filtered security workflow and the always-running aggregate quality gate.

## Capacity changes

Increasing the limit should be based on observed legitimate payload sizes. A larger value increases worst-case parser memory and storage exposure and therefore requires a reviewed reason, tests and deployment evidence. Disabling the boundary with zero or a negative value is not supported.

## Rollback

Revert the request-size commits. For an emergency compatibility adjustment, deploy a separately reviewed larger positive `SLF_API_MAX_CONTENT_LENGTH`. Existing JSON data requires no migration in either direction.
