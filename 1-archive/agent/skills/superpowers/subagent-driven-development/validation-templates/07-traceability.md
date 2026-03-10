# Traceability Validation Template

**Trigger:** Runs after all other validations complete

**Purpose:** Verify complete traceability from requirements to implementation to tests

```
Task tool (general-purpose):
  description: "Validate traceability from requirements to implementation"
  prompt: |
    You are validating complete traceability between requirements, code, and tests.

    ## Context

    **Task:** {TASK_ID} - {TASK_NAME}
    **Plan File:** {path/to/plan.md}
    **Git Range:** {BASE_SHA}..{HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## What to Analyze

    ### Traceability Chain

    Verify the complete chain:

    ```
    Requirements → Implementation → Tests → Verification
    ```

    Each requirement should have:
    1. Corresponding implementation code
    2. Corresponding test coverage
    3. Verification of correctness

    ### Requirements Analysis

    **From the task/plan:**
    - Extract all stated requirements
    - List acceptance criteria
    - Identify constraints and assumptions

    **For each requirement:**
    - Is it implemented?
    - Is it tested?
    - Is it verified?

    ### Implementation Mapping

    **For each requirement, find:**
    - Code that implements it (file:line references)
    - Design decisions made
    - Any deviations from requirements

    ### Test Mapping

    **For each requirement, verify:**
    - Tests exist that verify it
    - Tests actually assert the requirement (not just call the code)
    - Tests pass

    ### Gap Analysis

    **Check for:**
    - Requirements without implementation
    - Implementation without tests
    - Tests that don't map to requirements
    - Code that doesn't serve any requirement (scope creep)

    ## Your Job

    1. Extract all requirements from the task/plan
    2. Map each requirement to implementation
    3. Map each requirement to tests
    4. Identify any gaps or mismatches
    5. Report on traceability completeness

    ## Report Format

    ### Summary
    [X requirements, Y implemented, Z tested, W fully traced]

    ### Requirements Extracted

    | ID | Requirement | Source | Status |
    |----|-------------|--------|--------|
    | R1 | {requirement} | {task:line} | {Implemented/Tested/Complete} |

    ### Traceability Matrix

    | Requirement | Implementation | Tests | Status |
    |---------------|----------------|-------|--------|
    | R1: {description} | {file:line} | {test-file:test-name} | ✅ Complete |
    | R2: {description} | {file:line} | {test-file:test-name} | ⚠️ Partial |
    | R3: {description} | {file:line} | Not tested | ❌ Missing Test |

    Status Legend:
    - ✅ Complete: Implemented and tested
    - ⚠️ Partial: Implemented but test gaps exist
    - ❌ Missing: Not implemented or not tested

    ### Gaps Found

    **Requirements Not Implemented:**
    - [ ] R{N}: {requirement} - {reason/ blocker}

    **Requirements Not Tested:**
    - [ ] R{N}: {requirement} - needs test coverage

    **Implementation Without Requirements:**
    - [ ] {file:function} - appears to be scope creep (no matching requirement)

    **Tests Without Requirements:**
    - [ ] {test-file:test-name} - what requirement does this verify?

    ### Implementation Deviations

    [Any cases where implementation differs from requirements]

    **{N}. Deviation from Requirement R{N}**
    - **Requirement:** {what was specified}
    - **Implementation:** {what was built}
    - **Reason:** {why it differs, if known}
    - **Impact:** {whether this is acceptable}

    ### Verification Status

    | Check | Status | Notes |
    |-------|--------|-------|
    | All requirements implemented | [ ] | |
    | All requirements tested | [ ] | |
    | All tests pass | [ ] | |
    | No scope creep | [ ] | |
    | Documentation updated | [ ] | |

    ### Recommendations

    - [ ] Implement missing requirements
    - [ ] Add tests for untested requirements
    - [ ] Remove or justify scope creep
    - [ ] Update documentation to match implementation
    - [ ] Clarify any requirement ambiguities

    ### Assessment

    **Traceability complete?** [Yes | Partially | No - significant gaps]

    **Reasoning:** [1-2 sentence assessment]

    **Blocked items:** [List any items blocking full traceability]

    ## Critical Rules

    **DO:**
    - Trace every requirement to specific code
    - Verify tests actually assert requirements (not just exist)
    - Flag any code that doesn't serve a requirement
    - Document any deviations from requirements

    **DON'T:**
    - Accept "tested" without verifying tests match requirements
    - Let scope creep go unnoticed
    - Assume implementation matches requirements without checking
    - Skip validation because task was "simple"
```
