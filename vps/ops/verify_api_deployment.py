#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import secrets
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

CANONICAL_COLLECTIONS = (
    "match_results_v2",
    "preset_events_v2",
    "preset_effects_v2",
    "match_snapshots_v2",
)
COMMIT_RE = re.compile(r"^[0-9a-fA-F]{40}$")
CANARY_COLLECTION_RE = re.compile(r"^ops_[a-zA-Z0-9_-]+$")


class VerificationError(RuntimeError):
    pass


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def validate_base_url(base_url: str) -> str:
    normalized = base_url.rstrip("/")
    parsed = urlsplit(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise VerificationError("base URL must be an absolute http or https URL")
    if parsed.username or parsed.password:
        raise VerificationError("base URL must not contain credentials")
    return normalized


def request_json(
    base_url: str,
    path: str,
    *,
    token: str | None = None,
    method: str = "GET",
    payload: Any | None = None,
    timeout: float = 15.0,
) -> tuple[int, Any]:
    data = None
    headers = {"Accept": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if payload is not None:
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(f"{base_url}{path}", data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=timeout) as response:
            status = int(response.status)
            raw = response.read()
    except HTTPError as error:
        status = int(error.code)
        raw = error.read()
    except URLError as error:
        raise VerificationError(f"request failed for {path}: {error.reason}") from error
    except TimeoutError as error:
        raise VerificationError(f"request timed out for {path}") from error

    if not raw:
        return status, None
    try:
        return status, json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise VerificationError(f"non-JSON response for {path} with HTTP {status}") from error


def read_deployed_commit(path: Path) -> str:
    try:
        value = path.read_text(encoding="utf-8").strip()
    except OSError as error:
        raise VerificationError(f"cannot read deployed commit marker: {path}: {error}") from error
    if not COMMIT_RE.fullmatch(value):
        raise VerificationError("deployed commit marker does not contain a full Git SHA")
    return value.lower()


def write_evidence(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary_path = Path(temporary_name)
    try:
        os.fchmod(descriptor, 0o600)
        with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary_path, path)
        try:
            directory_fd = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(directory_fd)
            finally:
                os.close(directory_fd)
        except OSError:
            pass
    finally:
        if temporary_path.exists():
            temporary_path.unlink(missing_ok=True)


def verify_api_deployment(
    *,
    base_url: str,
    token: str,
    expected_commit: str,
    deployed_commit_file: Path,
    timeout: float = 15.0,
    write_canary: bool = False,
    canary_collection: str = "ops_api_verification",
) -> dict[str, Any]:
    base_url = validate_base_url(base_url)
    expected_commit = expected_commit.lower()
    if not token:
        raise VerificationError("SLF_API_TOKEN is required in the environment")
    if not COMMIT_RE.fullmatch(expected_commit):
        raise VerificationError("expected commit must be a full 40-character Git SHA")
    if write_canary and not CANARY_COLLECTION_RE.fullmatch(canary_collection):
        raise VerificationError("canary collection must start with ops_ and contain only safe collection characters")
    if canary_collection in CANONICAL_COLLECTIONS:
        raise VerificationError("canary collection must not be a canonical tactical collection")

    deployed_commit = read_deployed_commit(deployed_commit_file)
    if deployed_commit != expected_commit:
        raise VerificationError(
            f"deployed commit mismatch: expected {expected_commit}, marker contains {deployed_commit}"
        )

    unauthenticated_status, _ = request_json(base_url, "/api/analysis", timeout=timeout)
    if unauthenticated_status != 401:
        raise VerificationError(
            f"unauthenticated analysis endpoint returned HTTP {unauthenticated_status}, expected 401"
        )

    analysis_status, analysis = request_json(
        base_url, "/api/analysis", token=token, timeout=timeout
    )
    if analysis_status != 200 or not isinstance(analysis, dict):
        raise VerificationError(
            f"authenticated analysis endpoint returned invalid response: HTTP {analysis_status}"
        )
    if analysis.get("status") != "ok":
        raise VerificationError(
            f"analysis endpoint reports non-healthy status: {analysis.get('status')!r}"
        )

    analysis_collections = analysis.get("collections")
    if not isinstance(analysis_collections, dict):
        raise VerificationError("analysis response does not contain collection health")

    collection_counts: dict[str, int] = {}
    collection_health: dict[str, dict[str, Any]] = {}
    for collection in CANONICAL_COLLECTIONS:
        health = analysis_collections.get(collection)
        if not isinstance(health, dict):
            raise VerificationError(f"analysis response is missing canonical collection: {collection}")
        if not health.get("exists") or not health.get("valid"):
            raise VerificationError(f"canonical collection is not healthy: {collection}")
        status, rows = request_json(
            base_url, f"/api/{collection}", token=token, timeout=timeout
        )
        if status != 200 or not isinstance(rows, list):
            raise VerificationError(
                f"canonical collection {collection} did not return a JSON array: HTTP {status}"
            )
        collection_counts[collection] = len(rows)
        collection_health[collection] = {
            "exists": True,
            "valid": True,
            "count": health.get("count"),
            "duplicateKeys": health.get("duplicateKeys"),
            "missingUniqueKeys": health.get("missingUniqueKeys"),
            "oldestTimestamp": health.get("oldestTimestamp"),
            "newestTimestamp": health.get("newestTimestamp"),
        }

    canary: dict[str, Any] = {"enabled": False}
    if write_canary:
        nonce = secrets.token_hex(16)
        canary_payload = {
            "schema": "slf_api_verification_canary_v1",
            "nonce": nonce,
            "expectedCommit": expected_commit,
            "verifiedAt": utc_now(),
        }
        write_status, write_response = request_json(
            base_url,
            f"/api/{canary_collection}?mode=replace",
            token=token,
            method="POST",
            payload=canary_payload,
            timeout=timeout,
        )
        if write_status != 200 or not isinstance(write_response, dict):
            raise VerificationError(f"canary write failed with HTTP {write_status}")
        read_status, read_response = request_json(
            base_url, f"/api/{canary_collection}", token=token, timeout=timeout
        )
        if read_status != 200 or not isinstance(read_response, dict):
            raise VerificationError(f"canary read failed with HTTP {read_status}")
        if (
            read_response.get("schema") != canary_payload["schema"]
            or read_response.get("nonce") != nonce
            or read_response.get("expectedCommit") != expected_commit
        ):
            raise VerificationError("canary read-back did not match the written payload")
        canary = {
            "enabled": True,
            "collection": canary_collection,
            "writeStatus": write_response.get("status"),
            "readVerified": True,
        }

    return {
        "schema": "slf_api_deployment_verification_v1",
        "generatedAt": utc_now(),
        "result": "passed",
        "baseUrl": base_url,
        "expectedCommit": expected_commit,
        "deployedCommit": deployed_commit,
        "deployedCommitFile": str(deployed_commit_file),
        "checks": {
            "unauthenticatedAnalysisStatus": unauthenticated_status,
            "authenticatedAnalysisStatus": analysis_status,
            "serverStatus": analysis.get("status"),
            "serverTime": analysis.get("serverTime"),
            "games": analysis.get("games"),
            "collectionCounts": collection_counts,
            "collectionHealth": collection_health,
            "canary": canary,
        },
        "secretsIncluded": False,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify an exact SLF API deployment without exposing credentials."
    )
    parser.add_argument("--base-url", default="http://127.0.0.1:5000")
    parser.add_argument("--expected-commit", required=True)
    parser.add_argument("--evidence", required=True, type=Path)
    parser.add_argument(
        "--deployed-commit-file",
        type=Path,
        default=Path("/root/slf-server/DEPLOYED_GIT_COMMIT"),
    )
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--write-canary", action="store_true")
    parser.add_argument("--canary-collection", default="ops_api_verification")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    token = os.environ.get("SLF_API_TOKEN", "").strip()
    try:
        evidence = verify_api_deployment(
            base_url=args.base_url,
            token=token,
            expected_commit=args.expected_commit,
            deployed_commit_file=args.deployed_commit_file,
            timeout=args.timeout,
            write_canary=args.write_canary,
            canary_collection=args.canary_collection,
        )
    except Exception as error:
        safe_error = str(error)
        if token:
            safe_error = safe_error.replace(token, "[redacted]")
        evidence = {
            "schema": "slf_api_deployment_verification_v1",
            "generatedAt": utc_now(),
            "result": "failed",
            "baseUrl": args.base_url,
            "expectedCommit": args.expected_commit.lower(),
            "error": safe_error,
            "secretsIncluded": False,
        }
        write_evidence(args.evidence, evidence)
        print(f"[slf-api-verify] failed: {safe_error}", file=os.sys.stderr)
        return 1

    write_evidence(args.evidence, evidence)
    print(
        f"[slf-api-verify] passed commit={evidence['deployedCommit']} evidence={args.evidence}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
