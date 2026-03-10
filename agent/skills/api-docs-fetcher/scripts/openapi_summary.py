#!/usr/bin/env python3
import json
import re
import subprocess
import sys
from collections import defaultdict
from pathlib import Path

HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def load_spec(path: Path):
    text = load_text(path)
    suffix = path.suffix.lower()

    if suffix == ".json":
        return json.loads(text)

    # Try PyYAML first if available.
    try:
        import yaml  # type: ignore

        return yaml.safe_load(text)
    except Exception:
        pass

    # Fall back to Ruby's stdlib YAML parser, commonly available on macOS/Linux.
    try:
        result = subprocess.run(
            [
                "ruby",
                "-ryaml",
                "-rjson",
                "-e",
                "data = YAML.load_file(ARGV[0]); puts JSON.generate(data)",
                str(path),
            ],
            check=True,
            capture_output=True,
            text=True,
        )
        return json.loads(result.stdout)
    except Exception as exc:
        raise RuntimeError(
            "Could not parse YAML. Provide JSON, install PyYAML, or run on a system with Ruby YAML support."
        ) from exc


def slugify(value: str) -> str:
    value = value.strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "default"


def path_resource(path: str) -> str:
    parts = [p for p in path.split("/") if p and not p.startswith("{")]
    return slugify(parts[0]) if parts else "root"


def operation_resource(path: str, method: str, operation: dict) -> str:
    tags = operation.get("tags") or []
    if tags:
        return slugify(str(tags[0]))

    operation_id = operation.get("operationId")
    if operation_id:
        prefix = re.split(r"[_\-.]", str(operation_id))[0]
        if prefix:
            return slugify(prefix)

    return path_resource(path)


def summarize_parameter(param: dict) -> dict:
    schema = param.get("schema") or {}
    return {
        "name": param.get("name"),
        "in": param.get("in"),
        "required": bool(param.get("required")),
        "type": schema.get("type"),
        "description": param.get("description"),
    }


def summarize_request_body(body: dict) -> dict:
    content = body.get("content") or {}
    media_types = sorted(content.keys())
    return {
        "required": bool(body.get("required")),
        "mediaTypes": media_types,
        "description": body.get("description"),
    }


def summarize_responses(responses: dict) -> list:
    items = []
    for status, response in responses.items():
        if not isinstance(response, dict):
            items.append({"status": str(status), "description": None})
            continue
        items.append({"status": str(status), "description": response.get("description")})
    return items


def main() -> int:
    if len(sys.argv) != 2 or sys.argv[1] in {"-h", "--help"}:
        print("Usage: openapi_summary.py <openapi.{json,yaml,yml}>", file=sys.stderr)
        return 0 if len(sys.argv) == 2 else 2

    path = Path(sys.argv[1])
    spec = load_spec(path)
    if not isinstance(spec, dict):
        raise RuntimeError("Parsed spec is not an object")

    paths = spec.get("paths") or {}
    resources = defaultdict(lambda: {"basePaths": set(), "methods": set(), "endpoints": []})

    for api_path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS or not isinstance(operation, dict):
                continue

            resource = operation_resource(api_path, method, operation)
            resources[resource]["basePaths"].add("/" + path_resource(api_path) if path_resource(api_path) != "root" else "/")
            resources[resource]["methods"].add(method.upper())
            resources[resource]["endpoints"].append(
                {
                    "method": method.upper(),
                    "path": api_path,
                    "summary": operation.get("summary") or operation.get("description"),
                    "operationId": operation.get("operationId"),
                    "parameters": [summarize_parameter(p) for p in operation.get("parameters") or [] if isinstance(p, dict)],
                    "requestBody": summarize_request_body(operation.get("requestBody") or {}) if isinstance(operation.get("requestBody"), dict) else None,
                    "responses": summarize_responses(operation.get("responses") or {}),
                }
            )

    payload = {
        "title": ((spec.get("info") or {}).get("title") if isinstance(spec.get("info"), dict) else None),
        "version": ((spec.get("info") or {}).get("version") if isinstance(spec.get("info"), dict) else None),
        "openapi": spec.get("openapi") or spec.get("swagger"),
        "servers": [s.get("url") for s in spec.get("servers") or [] if isinstance(s, dict) and s.get("url")],
        "resourceCount": len(resources),
        "resources": [],
    }

    for name in sorted(resources):
        item = resources[name]
        payload["resources"].append(
            {
                "name": name,
                "basePaths": sorted(item["basePaths"]),
                "methods": sorted(item["methods"]),
                "endpointCount": len(item["endpoints"]),
                "endpoints": sorted(item["endpoints"], key=lambda e: (e["path"], e["method"])),
            }
        )

    json.dump(payload, sys.stdout, indent=2)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
