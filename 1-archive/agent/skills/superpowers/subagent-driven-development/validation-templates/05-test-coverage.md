# Test Coverage Validation Template

**Trigger:** Runs when task modifies logic or adds features

**Purpose:** Verify adequate test coverage exists for all changed code

```
Task tool (general-purpose):
  description: "Validate test coverage for changes"
  prompt: |
    You are validating that all code changes have adequate test coverage.

    ## Git Range to Analyze

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Conditional Trigger

    **Only proceed if changes include:**
    - New or modified business logic
    - New or changed functions/methods
    - New or modified components
    - Bug fixes
    - Feature additions

    Skip if changes are:
    - Documentation only
    - Comment changes
    - Formatting/style changes
    - Configuration only (no logic)

    If no testable logic changes, report: "No logic changes requiring test coverage"

    ## What to Analyze

    ### Changed Logic

    Identify all code that needs test coverage:
    - New functions, methods, classes
    - Modified existing functions
    - New conditional branches (if/else, switch)
    - New error handling paths
    - New edge cases introduced

    ### Test File Analysis

    For each changed file, find corresponding test file:
    - `{file}.test.ts` or `{file}.spec.ts`
    - `tests/{file}.ts`
    - `__tests__/{file}.ts`

    **Check:**
    - Does test file exist?
    - Does test file test the changed code?
    - Are new functions/methods tested?
    - Are edge cases covered?

    ### Coverage Quality

    For each test found:

    **Test Effectiveness:**
    - Does test verify actual behavior (not just call the function)?
    - Does test assert on outputs, not implementation details?
    - Are mocks used appropriately (not over-mocked)?
    - Are edge cases tested (empty input, null, errors, boundaries)?

    **Missing Scenarios:**
    - Happy path tested?
    - Error cases tested?
    - Edge cases tested?
    - Integration points tested?

    ### Coverage Metrics (if available)

    Run coverage if tooling exists:
    ```bash
    npm run test:coverage
    # or
    pytest --cov
    # or project-specific coverage command
    ```

    Compare:
    - Overall coverage % (should not decrease)
    - Coverage of changed files
    - Lines/branches added but not covered

    ## Your Job

    1. Identify all logic that needs testing
    2. Find or verify test files exist
    3. Assess test quality and coverage gaps
    4. Run coverage tools if available
    5. Report missing or inadequate tests

    ## Report Format

    ### Summary
    [X files changed, Y need tests, Z have adequate coverage]

    ### Changed Code Requiring Tests

    | File | Logic Changed | Test File | Coverage Status |
    |------|---------------|-----------|-----------------|
    | {file} | {new function/modified logic} | {test file} | {Adequate/Gap/Missing} |

    ### Coverage Gaps

    For each gap:

    **{N}. {Description}**
    - **Location:** {file:function or file:line}
    - **What's missing:** {specific code path or scenario}
    - **Risk:** {why this needs testing}
    - **Severity:** {Critical | High | Medium | Low}
    - **Suggested test:** {what test should cover this}

    ### Test Quality Issues

    For each quality concern:

    **{N}. {Issue}**
    - **Test file:** {file}
    - **Problem:** {mocking issue, weak assertion, etc.}
    - **Why it matters:** {what this fails to catch}
    - **Fix:** {how to improve the test}

    ### Coverage Metrics

    [If coverage tooling ran]

    | Metric | Before | After | Change |
    |--------|--------|-------|--------|
    | Lines | {X}% | {Y}% | {+/-Z}% |
    | Branches | {X}% | {Y}% | {+/-Z}% |
    | Functions | {X}% | {Y}% | {+/-Z}% |

    ### Missing Test Files

    [List any new files that need test files created]

    - [ ] `{new-file}.ts` → needs `{new-file}.test.ts`

    ### Recommendations

    - [ ] Create missing test files
    - [ ] Add tests for identified gaps
    - [ ] Improve weak tests
    - [ ] Run full test suite before merge

    ### Assessment

    **Test coverage adequate?** [Yes | Yes with minor gaps | No - significant gaps]

    **Reasoning:** [1-2 sentence technical assessment]

    ## Critical Rules

    **DO:**
    - Verify tests actually run (not skipped or disabled)
    - Check tests assert on behavior, not implementation
    - Flag any new code without tests
    - Run test suite to confirm tests pass

    **DON'T:**
    - Count line coverage as sufficient (branch coverage matters)
    - Trust test existence without reading test content
    - Accept tests that only test happy path
    - Let coverage decrease without justification
```
