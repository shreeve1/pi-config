# Breaking Changes Analysis Template

**Trigger:** ALWAYS runs (after every task)

**Purpose:** Identify any breaking changes that affect consumers of the codebase

```
Task tool (general-purpose):
  description: "Analyze breaking changes in recent commits"
  prompt: |
    You are analyzing code changes for breaking changes that affect consumers.

    ## Git Range to Analyze

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## What to Analyze

    Examine all changes in the diff for potential breaking changes:

    **Public API Changes:**
    - Removed or renamed exported functions, classes, interfaces, types
    - Changed function signatures (parameters added/removed/renamed, return type changes)
    - Changed behavior of existing functions (different error handling, different defaults)
    - Removed or changed exported constants

    **Module/Export Changes:**
    - Moved files (breaking import paths)
    - Removed re-exports
    - Changed module system (ESM ↔ CJS)
    - Modified package.json exports field

    **Schema/Data Structure Changes:**
    - Removed required fields from interfaces/types
    - Changed field types (string → number, optional → required)
    - Removed enum values
    - Changed database schemas

    **Behavior Changes:**
    - Stricter validation (previously accepted inputs now rejected)
    - Different error types or messages consumers might parse
    - Changed async/sync behavior
    - Modified side effects

    **Configuration Changes:**
    - Removed environment variables
    - Changed default config values
    - Removed CLI flags or changed their behavior

    ## Your Job

    1. Read the full diff
    2. Identify all breaking changes
    3. For each breaking change, document:
       - What changed (file:line)
       - Why it's breaking
       - Who/what is affected
       - Migration path (if applicable)

    ## Report Format

    ### Summary
    [One sentence: "No breaking changes detected" OR "X breaking changes found"]

    ### Breaking Changes Found

    For each breaking change:

    **{N}. {Brief Description}**
    - **Location:** {file:line}
    - **Change:** {old behavior → new behavior}
    - **Impact:** {who/what breaks}
    - **Severity:** {Critical | High | Medium | Low}
    - **Migration:** {how consumers should adapt}

    ### Non-Breaking Changes
    [Optional: List significant changes that are NOT breaking]

    ### Recommendations
    - [ ] Update CHANGELOG with breaking changes
    - [ ] Bump major/minor version per semver
    - [ ] Add migration guide to documentation
    - [ ] Notify affected consumers (if known)

    ## Critical Rules

    **DO:**
    - Be thorough (read every changed file)
    - Consider all consumers (internal and external)
    - Flag behavioral changes, not just signature changes
    - Provide actionable migration guidance

    **DON'T:**
    - Miss breaking changes (false negative is worse than false positive)
    - Flag internal refactors that don't affect public API
    - Be vague about what broke or how to fix it
```
