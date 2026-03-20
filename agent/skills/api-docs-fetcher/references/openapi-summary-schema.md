# OpenAPI Summary Helper Output Schema

This reference explains the JSON produced by `scripts/openapi_summary.py`.

Use it when you want to turn a raw OpenAPI or Swagger document into per-resource markdown files without repeatedly re-parsing the original spec.

## Command

```bash
./scripts/openapi_summary.py path/to/openapi.yaml
```

The script writes JSON to stdout.

## Top-level shape

```json
{
  "title": "Example API",
  "version": "v1",
  "openapi": "3.0.3",
  "servers": ["https://api.example.com"],
  "resourceCount": 2,
  "resources": []
}
```

## Top-level fields

- `title` — API title from `info.title` when present
- `version` — API version from `info.version` when present
- `openapi` — OpenAPI or Swagger version string
- `servers` — array of server URLs from `servers[*].url`
- `resourceCount` — number of grouped resources in the output
- `resources` — array of grouped resource summaries

## Resource object

Each item in `resources` looks like this:

```json
{
  "name": "organizations",
  "basePaths": ["/organizations"],
  "methods": ["GET", "POST"],
  "endpointCount": 2,
  "endpoints": []
}
```

Fields:

- `name` — resource slug derived from tag, path segment, or operationId prefix
- `basePaths` — inferred base path candidates for the resource
- `methods` — distinct HTTP methods seen across the resource
- `endpointCount` — number of endpoints grouped into this resource
- `endpoints` — detailed endpoint records

## Endpoint object

Each item in `endpoints` looks like this:

```json
{
  "method": "GET",
  "path": "/organizations",
  "summary": "List organizations",
  "operationId": "listOrganizations",
  "parameters": [],
  "requestBody": null,
  "responses": []
}
```

Fields:

- `method` — HTTP method in uppercase
- `path` — exact API path from the spec
- `summary` — `summary` or `description` from the operation
- `operationId` — operation id when present
- `parameters` — normalized parameter list
- `requestBody` — normalized request body summary or `null`
- `responses` — normalized response list

## Parameter object

```json
{
  "name": "page",
  "in": "query",
  "required": false,
  "type": "integer",
  "description": "Page number"
}
```

- `name` — parameter name
- `in` — where the parameter appears, such as `query`, `path`, or `header`
- `required` — boolean required flag
- `type` — schema type when present
- `description` — source description when present

## Request body object

```json
{
  "required": true,
  "mediaTypes": ["application/json"],
  "description": "Payload to create an organization"
}
```

- `required` — whether the request body is required
- `mediaTypes` — content types listed under `content`
- `description` — request body description when present

## Response object

```json
{
  "status": "200",
  "description": "Successful response"
}
```

- `status` — response code or response key
- `description` — response description when present

## Grouping rules

Resources are grouped using this priority:

1. first tag in the operation
2. operationId prefix before `_`, `-`, or `.`
3. first concrete path segment

This makes the output stable enough for automated doc generation while still matching common API naming patterns.

## Practical use in the skill

A good workflow is:

1. Save the spec into `apidocs/source/`
2. Run the helper script
3. Read the JSON summary
4. Generate `apidocs/resources/<resource>.md` from each `resources[]` item
5. Use top-level fields and cross-resource patterns to build `apidocs/README.md` and files in `apidocs/reference/`

## Caveats

- The helper does not fully resolve `$ref` schemas.
- It summarizes operation structure, not complete schema definitions.
- YAML parsing falls back to Ruby if PyYAML is unavailable.
- If the spec is malformed, the script will fail instead of guessing.
