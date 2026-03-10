# Dependency Graph Validation Template

**Trigger:** Runs when task modifies architecture or module structure

**Purpose:** Verify dependency structure is correct and no cycles or violations exist

```
Task tool (general-purpose):
  description: "Validate dependency graph integrity"
  prompt: |
    You are validating the dependency graph after architectural changes.

    ## Git Range to Analyze

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Conditional Trigger

    **Only proceed if changes include:**
    - New files or directories
    - Moved files (changed import paths)
    - New dependencies added (package.json)
    - Refactored module structure
    - Changed import/export patterns

    If only internal logic changes without structural modifications, report:
    "No structural changes affecting dependency graph"

    ## What to Analyze

    ### Module Structure Changes

    **New Dependencies:**
    - Check package.json for new dependencies
    - Verify new dependencies are appropriate
    - Check for version conflicts with existing deps

    **Import Path Changes:**
    - Files moved to different directories
    - Imports updated to new paths
    - Circular imports introduced

    **Layer Violations:**
    - Lower layers importing higher layers (e.g., domain importing UI)
    - Cross-module imports that violate architecture
    - Feature modules importing each other (should go through shared)

    ### Dependency Analysis

    **Find Import Patterns:**
    ```bash
    # List all imports of changed files
    grep -r "from.*{changed-module}" src/

    # Check what the changed files import
    grep "import.*from" {changed-files}
    ```

    **Check for Cycles:**
    - A imports B, B imports A
    - Longer cycles: A → B → C → A
    - Indirect cycles through re-exports

    ### Architecture Compliance

    Verify the changes comply with project architecture:

    **Common Patterns:**
    - Features should not import each other directly
    - Shared code should not import feature-specific code
    - Infrastructure layer should be leaf nodes (nothing imports them)
    - Domain layer should not depend on framework layer

    **Your project's architecture:**
    [If architecture documentation exists, reference it]
    [Otherwise, infer from existing patterns]

    ## Your Job

    1. Identify all structural changes
    2. Map new import relationships
    3. Check for cycles in dependency graph
    4. Verify architecture layer rules
    5. Identify any violations

    ## Report Format

    ### Summary
    [One sentence: "Dependency graph is valid" OR "X violations found"]

    ### Structural Changes

    | File | Change | New Dependencies | Removed Dependencies |
    |------|--------|------------------|---------------------|
    | {file} | {moved/created/refactored} | {list} | {list} |

    ### Dependency Violations

    For each violation:

    **{N}. {Violation Type}**
    - **Location:** {file:line}
    - **Violation:** {importing module} → {imported module}
    - **Why it's wrong:** {architecture rule violated}
    - **Severity:** {Critical | High | Medium | Low}
    - **Fix:** {how to resolve}

    ### Cycle Detection

    [List any circular dependencies found]

    **{N}. Cycle Detected**
    - **Cycle:** {A → B → C → A}
    - **Files involved:** {list files}
    - **Fix:** {how to break cycle}

    ### New External Dependencies

    | Package | Version | Purpose | Approved? |
    |---------|---------|---------|-----------|
    | {name} | {version} | {why added} | [ ] |

    ### Recommendations

    - [ ] Fix listed violations before merge
    - [ ] Update architecture documentation if patterns changed
    - [ ] Add dependency lint rules to prevent future violations
    - [ ] Consider refactoring to eliminate cycles

    ### Assessment

    **Dependency graph valid?** [Yes | Yes with fixes | No - structural issues]

    **Reasoning:** [1-2 sentence technical assessment]

    ## Critical Rules

    **DO:**
    - Trace every new import to its source
    - Check for both direct and indirect cycles
    - Verify imports comply with architecture layers
    - Flag any new external dependencies for review

    **DON'T:**
    - Assume import paths are correct without verification
    - Miss long dependency chains that create cycles
    - Ignore "convenience" imports that violate architecture
    - Let minor violations slide without documenting them
```
