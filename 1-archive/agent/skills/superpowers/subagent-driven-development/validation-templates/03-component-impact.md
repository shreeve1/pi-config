# Component Impact Analysis Template

**Trigger:** Runs when task modifies shared components

**Purpose:** Identify all consumers of changed components and assess impact

```
Task tool (general-purpose):
  description: "Analyze impact of component changes on consumers"
  prompt: |
    You are analyzing how changes to components affect the rest of the codebase.

    ## Git Range to Analyze

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Conditional Trigger

    **Only proceed if changes include:**
    - Shared components (UI components, utilities, services)
    - Base classes or parent components
    - Common hooks or utilities
    - Library modules used elsewhere in the codebase

    If changes are isolated to feature-specific code with no shared dependencies, report:
    "Changes are feature-isolated with no shared component impact"

    ## What to Analyze

    ### Identify Changed Components

    List all modified components:
    - Files changed that export functionality used elsewhere
    - Changed function signatures, props, or interfaces
    - Modified behavior that affects consumers

    ### Find All Consumers

    For each changed component, search for:

    **Import Statements:**
    ```bash
    grep -r "import.*{component}" src/
    grep -r "from.*{module}" src/
    ```

    **Usage Patterns:**
    - Direct imports
    - Re-exports
    - Dynamic imports
    - Dependencies that transitively depend on this

    ### Impact Assessment

    For each consumer found:

    **Breaking Impact:**
    - Consumer passes different props/arguments than new signature expects
    - Consumer relies on removed/changed behavior
    - Consumer import path is broken
    - Consumer expects different return type

    **Non-Breaking Impact:**
    - Consumer may benefit from new functionality
    - Consumer affected by performance changes
    - Consumer affected by behavioral refinements

    **No Impact:**
    - Consumer unaffected by the specific changes
    - Consumer already handles the change gracefully

    ## Your Job

    1. Identify all changed exports/components
    2. Find every consumer in the codebase
    3. Assess impact on each consumer
    4. Verify consumers are updated if needed
    5. Check for missing updates

    ## Report Format

    ### Summary
    [X components changed, Y consumers identified, Z require updates]

    ### Changed Components

    | Component | File | Change Type | Consumers Affected |
    |-----------|------|-------------|-------------------|
    | {name} | {file} | {signature/behavior/export} | {count} |

    ### Consumer Analysis

    For each changed component:

    #### {Component Name}

    **Consumers Found:**

    | Consumer File | Import | Impact Level | Status |
    |---------------|--------|--------------|--------|
    | {file} | {import statement} | {Breaking/Non-Breaking/None} | {Updated/Needs Update/N/A} |

    **Impact Details:**

    For each consumer with Breaking or Non-Breaking impact:
    - **Consumer:** {file}
    - **Impact:** {description of how consumer is affected}
    - **Required Change:** {what consumer needs to update}
    - **Verified:** [ ] Consumer updated in this commit

    ### Missing Updates

    [List any consumers that should have been updated but weren't]

    **{N}. {Consumer} requires update**
    - **Issue:** {why update needed}
    - **Fix:** {specific change required}

    ### Recommendations

    - [ ] Update listed consumers before merge
    - [ ] Add tests for affected consumers
    - [ ] Document breaking changes for consumers
    - [ ] Consider deprecation warnings for gradual migration

    ### Assessment

    **Consumer impact addressed?** [Yes | Partially | No - work required]

    **Reasoning:** [1-2 sentence assessment]

    ## Critical Rules

    **DO:**
    - Search exhaustively for all consumers
    - Check both direct and transitive dependencies
    - Verify consumers compile/type-check after changes
    - Flag any consumer that might be affected

    **DON'T:**
    - Assume a consumer is unaffected without checking
    - Miss consumers due to different import styles
    - Forget to check test files (they import components too)
    - Ignore TypeScript/IDE errors in consumer files
```
