#!/usr/bin/env python3

import importlib.util
import os
import tempfile
from pathlib import Path

ROOT = Path.cwd()
TOKEN = "cors-policy-test-token"
DEFAULT_ORIGINS = (
    "https://slf.fm",
    "https://www.slf.fm",
    "https://soccerlife.ru",
    "https://www.soccerlife.ru",
)


def load_server(data_dir: str, suffix: str, cors_value=None):
    os.environ["SLF_API_TOKEN"] = TOKEN
    os.environ["SLF_DATA_DIR"] = data_dir
    os.environ["SLF_FORUM_FAQ_DIR"] = str(Path(data_dir) / "forum_faq")
    if cors_value is None:
        os.environ.pop("SLF_API_CORS_ORIGINS", None)
    else:
        os.environ["SLF_API_CORS_ORIGINS"] = cors_value
    module_path = ROOT / "vps" / "api" / "server.py"
    spec = importlib.util.spec_from_file_location(f"slf_cors_policy_server_{suffix}", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("cannot load VPS API server module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    module.app.config.update(TESTING=True)
    return module


def auth_headers(origin=None):
    result = {"Authorization": f"Bearer {TOKEN}"}
    if origin is not None:
        result["Origin"] = origin
    return result


def split_header(value):
    return {item.strip().upper() for item in str(value or "").split(",") if item.strip()}


def main():
    with tempfile.TemporaryDirectory(prefix="slf-api-cors-") as data_dir:
        server = load_server(data_dir, "default")
        assert server.CORS_ORIGINS == DEFAULT_ORIGINS
        client = server.app.test_client()

        for origin in DEFAULT_ORIGINS:
            response = client.get("/api/analysis", headers=auth_headers(origin))
            assert response.status_code == 200
            assert response.headers.get("Access-Control-Allow-Origin") == origin
            assert response.headers.get("Access-Control-Allow-Origin") != "*"
            assert response.headers.get("Access-Control-Allow-Credentials") is None
            assert response.headers.get("Vary") == "Origin"

        disallowed = client.get(
            "/api/analysis",
            headers=auth_headers("https://attacker.example"),
        )
        assert disallowed.status_code == 200
        assert disallowed.headers.get("Access-Control-Allow-Origin") is None

        no_origin = client.get("/api/analysis", headers=auth_headers())
        assert no_origin.status_code == 200

        preflight = client.options(
            "/api/match_snapshots_v2",
            headers={
                "Origin": DEFAULT_ORIGINS[0],
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization, Content-Type",
            },
        )
        assert preflight.status_code in {200, 204}
        assert preflight.headers.get("Access-Control-Allow-Origin") == DEFAULT_ORIGINS[0]
        assert split_header(preflight.headers.get("Access-Control-Allow-Methods")) == {"GET", "POST", "OPTIONS"}
        assert split_header(preflight.headers.get("Access-Control-Allow-Headers")) == {"AUTHORIZATION", "CONTENT-TYPE"}
        assert preflight.headers.get("Access-Control-Allow-Credentials") is None

        denied_preflight = client.options(
            "/api/match_snapshots_v2",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "Authorization",
            },
        )
        assert denied_preflight.status_code in {200, 204}
        assert denied_preflight.headers.get("Access-Control-Allow-Origin") is None

        overridden = load_server(
            data_dir,
            "override",
            "https://custom.example:8443, https://slf.fm/, https://custom.example:8443",
        )
        assert overridden.CORS_ORIGINS == (
            "https://custom.example:8443",
            "https://slf.fm",
        )
        override_client = overridden.app.test_client()
        custom = override_client.get(
            "/api/analysis",
            headers=auth_headers("https://custom.example:8443"),
        )
        assert custom.status_code == 200
        assert custom.headers.get("Access-Control-Allow-Origin") == "https://custom.example:8443"
        removed_default = override_client.get(
            "/api/analysis",
            headers=auth_headers("https://soccerlife.ru"),
        )
        assert removed_default.status_code == 200
        assert removed_default.headers.get("Access-Control-Allow-Origin") is None

        invalid_values = (
            "*",
            "null",
            "not-an-origin",
            "https://slf.fm/path",
            "https://slf.fm?query=1",
            "https://user:pass@slf.fm",
            ",",
        )
        for index, invalid_value in enumerate(invalid_values):
            try:
                load_server(data_dir, f"invalid_{index}", invalid_value)
            except RuntimeError as error:
                assert "SLF_API_CORS_ORIGINS" in str(error)
            else:
                raise AssertionError(f"invalid CORS origin was accepted: {invalid_value}")

    print("[api-cors-policy] passed: defaults, exact allowlist, denied origin, preflight, no-Origin, validated override")


if __name__ == "__main__":
    main()
