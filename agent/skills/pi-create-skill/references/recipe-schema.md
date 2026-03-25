# Pi Recipe Schema

A recipe.yaml is the authoritative execution contract for a pi skill. It defines the inputs, workflow, outputs, and validation criteria that must be followed every time the skill executes.

## Purpose

- **Reproducibility** — Same inputs produce same outputs
- **Verification** — Each step can be validated
- **Traceability** — Know what was done and why
- **Compliance** — Models must follow the contract, not skip steps

## Schema

```yaml
# See SKILL.md in this directory for detailed instructions
version: "1.0.0"
title: "Human-readable title"
description: "One-line summary of what this skill accomplishes"

parameters:
  - key: "param-name"
    type: "string | number | boolean | select | file"
    required: true | false
    default: "optional default value"
    options: ["opt1", "opt2"]  # Only for type: select
    description: "What this parameter controls"

workflow:
  - step: 1
    name: "Step name"
    description: "1-3 sentences describing what happens"
    requires_input: ["param-name"]  # Which parameters this step uses
    produces: ["output-id"]         # What outputs this step creates
    decision_point: true | false    # Does this step pause for user input?

  - step: 2
    name: "Next step"
    description: "..."
    requires_input: ["param-name"]
    produces: ["output-id"]
    decision_point: false

outputs:
  - id: "output-id"
    description: "What this output is"
    type: "file | artifact | intermediate"
    pattern: "glob/pattern/*"  # For type: file
    required: true | false

validation:
  - name: "Validation check name"
    type: "shell | content | exists"
    # For type: shell
    command: "echo 'validation command'"
    # For type: content
    target: "output-id"
    contains: ["required text", "another string"]
    # For type: exists
    path: "path/to/file"
```

## Field Reference

### Top-Level Fields

| Field | Required | Description |
|-------|----------|-------------|
| `version` | Yes | Schema version, currently `"1.0.0"` |
| `title` | Yes | Human-readable skill title |
| `description` | Yes | One-line summary |
| `parameters` | No | Input parameters (can be empty) |
| `workflow` | Yes | Ordered list of steps |
| `outputs` | No | Expected outputs (can be empty) |
| `validation` | No | Validation checks (can be empty) |

### Parameter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `key` | Yes | Parameter name (kebab-case) |
| `type` | Yes | `string`, `number`, `boolean`, `select`, `file` |
| `required` | Yes | Whether parameter must be provided |
| `default` | No | Default value if not provided |
| `options` | Conditional | Required if `type: select` |
| `description` | Yes | What the parameter controls |

### Workflow Step Fields

| Field | Required | Description |
|-------|----------|-------------|
| `step` | Yes | Step number (sequential, starting at 1) |
| `name` | Yes | Short step name |
| `description` | Yes | 1-3 sentences describing the step |
| `requires_input` | No | List of parameter keys this step uses |
| `produces` | No | List of output ids this step creates |
| `decision_point` | No | Whether step pauses for user input (default: false) |

### Output Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Output identifier (kebab-case) |
| `description` | Yes | What this output is |
| `type` | Yes | `file`, `artifact`, `intermediate` |
| `pattern` | Conditional | Glob pattern (required if `type: file`) |
| `required` | Yes | Whether output must be produced |

### Validation Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable check name |
| `type` | Yes | `shell`, `content`, `exists` |
| `command` | Conditional | Shell command (required if `type: shell`) |
| `target` | Conditional | Output id to check (required if `type: content`) |
| `contains` | Conditional | Required strings (required if `type: content`) |
| `path` | Conditional | File path to check (required if `type: exists`) |

## Formatting Rules

- First line: `# See SKILL.md in this directory for detailed instructions`
- 2-space indentation (never tabs)
- Double-quote all string values
- `true`/`false` for booleans (not `yes`/`no`)
- Omit empty sections (don't include `[]` or `{}`)
- Keep lines under 120 characters
- Version is always `"1.0.0"`

## Example

```yaml
# See SKILL.md in this directory for detailed instructions
version: "1.0.0"
title: "Deploy to Production"
description: "Deploy a service to production with safety checks"

parameters:
  - key: "service-name"
    type: "string"
    required: true
    description: "Name of the service to deploy"

  - key: "environment"
    type: "select"
    required: true
    options: ["staging", "production"]
    description: "Target deployment environment"

  - key: "skip-tests"
    type: "boolean"
    required: false
    default: false
    description: "Skip pre-deployment tests"

workflow:
  - step: 1
    name: "Validate inputs"
    description: "Verify service-name exists and environment is accessible"
    requires_input: ["service-name", "environment"]
    decision_point: false

  - step: 2
    name: "Run tests"
    description: "Execute test suite unless skip-tests is true"
    requires_input: ["service-name", "skip-tests"]
    decision_point: true

  - step: 3
    name: "Deploy"
    description: "Deploy the service to the target environment"
    requires_input: ["service-name", "environment"]
    produces: ["deployment-log"]
    decision_point: false

  - step: 4
    name: "Verify deployment"
    description: "Check health endpoints and smoke tests"
    produces: ["health-check"]
    decision_point: false

outputs:
  - id: "deployment-log"
    description: "Log output from deployment command"
    type: "file"
    pattern: "deploy-*.log"
    required: true

  - id: "health-check"
    description: "Health check results"
    type: "intermediate"
    required: true

validation:
  - name: "Deployment log exists"
    type: "exists"
    path: "deploy-*.log"

  - name: "Health check passed"
    type: "content"
    target: "health-check"
    contains: ["status: healthy"]
```

## Sync Requirements

The recipe.yaml must stay synchronized with SKILL.md:

1. **Step count matches phase count** — If SKILL.md has 5 phases, recipe.yaml should have 5 workflow steps
2. **Parameter coverage** — Every parameter key must be referenced in at least one step's `requires_input`
3. **Output coverage** — Every output id must be referenced in at least one step's `produces`
4. **Decision points match** — If a phase says "ask the user", the corresponding step should have `decision_point: true`

## Minimal Recipe

Even simple skills should have a minimal recipe:

```yaml
# See SKILL.md in this directory for detailed instructions
version: "1.0.0"
title: "Quick Task"
description: "A simple skill with minimal structure"

workflow:
  - step: 1
    name: "Execute task"
    description: "Perform the core action"
    decision_point: false
```

This ensures every skill has at least one step that must be acknowledged.
