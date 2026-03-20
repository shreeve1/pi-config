# Adapted 5-Phase Workflow for pi-validate

This document adapts the dev-validate.md workflow structure for pi, replacing Claude Code tool names with pi equivalents.

## Key Tool Substitutions

| Claude Code Tool | pi Tool | Notes |
|------------------|---------|-------|
| `Task` | `subagent` | Use `mode: parallel` for validation agents |
| `TaskOutput` | (direct return) | Subagents return results directly |
| `AskUserQuestion` | `ask_user` | Use `type: select` for options |
| `haiku agent` | (removed) | pi handles model selection internally |

---

## Adapted Workflow Structure

### Phase 1: Plan Selection
**Goal:** Locate plan file and parse structure

**Steps:**

1. **Locate Plan**
   - If `PLAN_FILE` provided: verify it exists using `read`
   - If not provided, use Plan Discovery Protocol:
     1. Use `find` to list all `.md` files in `PLAN_DIRECTORIES` (`specs/` and `artifacts/plans/`)
     2. Take the most recent file (sort by modification date)
     3. Use `ask_user` to confirm: "Found plan: <filename>. Is this the correct plan?"
        - Type: `select`
        - Options: `["Yes, use this plan", "No, let me specify"]`
     4. If user selects "No", use `ask_user` (type: `input`) to request the path
     5. Read the confirmed plan file using `read`

2. **Parse Plan Structure**
   - Extract all sections: Task Description, Objective, Relevant Files, Step by Step Tasks, etc.
   - Identify files that will be modified or created
   - Extract all specific code changes, imports, and dependencies mentioned

---

### Phase 1.5: Understanding Verification
**Goal:** Confirm plan intent with user before analysis

**Steps:**

3. **Verify Understanding with User**
   - Use `ask_user` (type: `select`) to confirm understanding with 3 questions:

   **Question 1: Main Goal**
   - Paraphrase what the plan is trying to accomplish in plain English
   - Format: "Based on this plan, I understand we're: [summary]. Is this correct?"
   - Options: `["Yes, exactly right", "Close, but needs clarification", "No, the main goal is different"]`

   **Question 2: Critical Constraints**
   - Identify user flows/features that must keep working
   - Format: "Which existing features must continue working without changes?"
   - Options: List 3-4 key areas from the codebase + `["Other/All of them"]`

   **Question 3: Expected Outcome**
   - Describe what users would see/experience after this change
   - Format: "After this change, users should be able to: [outcome]. Does that match your vision?"
   - Options: `["Yes, that's the vision", "Partially, but also...", "No, different outcome expected"]`

   - If user selects clarifying options, incorporate feedback into understanding
   - Only proceed to risk analysis after confirmation

---

### Phase 2: Smart Validation Analysis
**Goal:** Determine which validations are needed (skip irrelevant checks)

**Steps:**

4. **Determine Required Validations**

   Spawn a single analysis subagent using `subagent` (mode: `single`) to analyze the plan:

   ```yaml
   agent: worker
   task: |
     Analyze this implementation plan to determine required validations.

     Plan: [plan content]

     Instructions:
     1. Analyze the "Relevant Files" section for file patterns
     2. Scan "Step by Step Tasks" for types of changes being made
     3. Identify risk categories based on semantic understanding

     Determine which validations are needed from:
     - Breaking Changes Analysis (ALWAYS REQUIRED - baseline safety)
     - Database Safety Validation (run if: *.prisma, *.sql, migrations/, models/, database-related keywords)
     - Component Impact Analysis (run if: *.tsx, *.jsx, *.vue, components/, UI-related changes)
     - Dependency Graph Validation (run if: package.json, requirements.txt, import/export changes)
     - Test Coverage Validation (run if: new features, critical path changes, missing test coverage)
     - Infrastructure Safety (run if: Dockerfile, *.yml, .env*, terraform/, deployment config)
     - Traceability Validation (run if: #req- tags found in plan's task list or a source PRD/spec is referenced)

     Return structured output:
     {
       "detected_changes": ["API", "Database"],
       "required_validations": [
         {"type": "breaking_changes", "reason": "...", "priority": "always"},
         {"type": "database_safety", "reason": "...", "priority": "high"}
       ],
       "skipped_validations": [
         {"type": "component_impact", "reason": "No UI changes detected"}
       ],
       "estimated_agents": 2
     }
   ```

   After analysis completes, report to user:
   ```
   📊 Validation Analysis
   Detected: [change types]
   Running: [N] validations: [list]
   Skipping: [N] irrelevant checks
   ```

---

### Phase 3: Targeted Parallel Validation
**Goal:** Run only relevant validation agents in parallel

**Steps:**

Launch only the required validation agents identified in Phase 2 using `subagent` (mode: `parallel`):

5. **Breaking Changes Analysis** (ALWAYS RUNS)
   ```
   Analyze the plan for API breaking changes:
   - Function signature changes (parameters added/removed/reordered)
   - Return type modifications
   - Endpoint URL or method changes
   - Interface/type definition changes
   - Public method visibility changes

   Search the codebase for all callers of affected functions/endpoints.
   Report: list of breaking changes with affected call sites.
   ```

6. **Database Safety Validation** (CONDITIONAL)
   ```
   Analyze the plan for database safety:
   - Schema migration risks (breaking changes, data loss)
   - ORM model consistency
   - Migration rollback strategy
   - Data integrity constraints
   - Index and performance impacts

   Check existing schema and migrations.
   Report: database risks and migration safety recommendations.
   ```

7. **Component Impact Analysis** (CONDITIONAL)
   ```
   Analyze the plan for UI component impacts:
   - React/Vue component prop type changes
   - Component usage patterns in codebase
   - Breaking changes to component APIs
   - Theme/style consistency
   - Accessibility considerations

   Find all usages of affected components.
   Report: component impact and consistency issues.
   ```

8. **Dependency Graph Validation** (CONDITIONAL)
   ```
   Analyze the plan for dependency/import impacts:
   - Module import/export changes
   - Renamed or moved files
   - Circular dependency risks
   - Package version conflicts
   - Breaking changes in upgraded dependencies

   Map the dependency graph for affected modules.
   Report: dependency risks with affected downstream modules.
   ```

9. **Test Coverage Validation** (CONDITIONAL)
   ```
   Analyze the plan for test coverage:
   - Tests that would fail due to planned changes
   - Test fixtures that need updating
   - Missing test coverage for new functionality
   - Integration test impacts

   Find all tests that touch affected files/functions.
   Report: tests that will break and coverage gaps.
   ```

10. **Infrastructure Safety** (CONDITIONAL)
    ```
    Analyze the plan for infrastructure impacts:
    - Configuration file consistency
    - Environment variable changes
    - Deployment risk assessment
    - Docker/container impacts
    - CI/CD pipeline changes

    Check existing infrastructure setup.
    Report: infrastructure risks and deployment recommendations.
    ```

11. **Traceability Validation** (CONDITIONAL)
    ```
    Analyze the plan for traceability completeness:
    - Scan the plan's Step by Step Tasks section for all #req-[id] tags
    - If a source PRD or spec is referenced in the plan, read it and extract all #req-[id] tags from the source
    - Cross-reference: flag any #req-[id] from the source that has no corresponding task in the plan
    - Cross-reference: flag any orphan #req-[id] in the plan that doesn't exist in the source
    - Verify each task with a [N.M] ID prefix has a checkbox (- [ ] or - [x])
    - Check that the Traceability Map section (if present) is consistent with task-level tags

    Report: traceability gaps, orphan tags, and coverage status.
    ```

**Parallel Execution Pattern:**
```yaml
subagent:
  mode: parallel
  tasks:
    - agent: worker
      task: [Breaking Changes Analysis prompt]
    - agent: worker
      task: [Database Safety Validation prompt]
    - agent: worker
      task: [Component Impact Analysis prompt]
    # ... only include validations from Phase 2 analysis
```

---

### Phase 4: Synthesize & Rewrite
**Goal:** Collect results, assess risks, rewrite risky steps

**Steps:**

12. **Collect Agent Results**
    - Gather results directly from parallel subagent execution (no separate output fetch needed)
    - Aggregate findings from all executed validations (1-7 depending on what ran)

13. **Risk Assessment**
    - Categorize each finding by severity: `critical` | `warning` | `info`
    - **Critical**: Will definitely break existing functionality
    - **Warning**: May cause issues, needs attention
    - **Info**: Suggestion for improvement

14. **Rewrite Risky Steps** (ONLY if issues found)
    For each step with `critical` or `warning` findings:
    - Preserve original step as strikethrough: `~~Original step text~~`
    - Write new safer version below with explanation
    - Include specific mitigations for identified risks
    - Add explicit validation checkpoints

15. **Pattern Alignment**
    - For any pattern deviations, suggest how to align with existing conventions
    - Reference specific files in the codebase as examples to follow

---

### Phase 5: Conditional Plan Update
**Goal:** Add Risk Analysis section if issues found, otherwise report clean

**Steps:**

16. **If Issues Found**: Add Validation Section and Save
    Insert a new section after "Step by Step Tasks":
    ```md
    ## Risk Analysis

    Validations Run: [list of validation types executed]

    ### Critical Issues
    <list critical issues that were addressed>

    ### Warnings
    <list warnings that were addressed>

    ### Pattern Recommendations
    <list pattern alignment suggestions>

    ### Validation Checkpoints
    <list checkpoints to verify during implementation>
    ```

    Then overwrite the original plan file using `write`.
    Ensure all original content is preserved (with risky steps shown as strikethrough).

17. **If No Issues Found**: Report Clean Validation
    - Do NOT modify the plan file
    - Report validation success to user with summary of checks performed

---

## Rewrite Format

When rewriting a risky step, use this format:

```md
### N. <Step Name>
<!-- VALIDATION: Risk detected - see explanation below -->

**Original Step (superseded):**
> ~~<original step content>~~

**Risk Identified:**
- <specific risk from analysis>
- <affected files/callers/tests>

**Validated Step:**
- <safer action that mitigates the risk>
- <additional safeguard>
- **Checkpoint**: <how to verify this step didn't break anything>
```

**IMPORTANT:** When rewriting task lines that contain `[N.M]` ID prefixes, preserve the existing checkbox state. If a task line is `- [x] [1.1] ...`, the rewritten version must keep `[x]`, not reset to `[ ]`.

---

## Report Formats

### Report Format A: Issues Found

```
✅ Plan Validated

File: <path to updated plan>

📊 Validation Summary:
Validations Run: <N> (<list types>)
Validations Skipped: <N> (<list types>)

Risk Summary:
- Critical issues found: <N> (all addressed)
- Warnings found: <N> (all addressed)
- Pattern recommendations: <N>

Key Changes Made:
- Step <N>: <brief description of change>
- Step <N>: <brief description of change>

Validation Checkpoints Added: <N>

The plan has been updated in place. Original risky steps preserved as strikethrough.

Ready to build? Run:
/dev-build <path to plan>
```

### Report Format B: No Issues Found

```
✅ Plan Validated - No Issues Found

File: <path to plan>

📊 Validation Summary:
Validations Run: <N> (<list types>)
Validations Skipped: <N> (<list types>)

All checks passed:
✓ <Validation Type 1>: No issues detected
✓ <Validation Type 2>: No issues detected

The plan is ready to build as-is. No modifications were made.

Ready to build? Run:
/dev-build <path to plan>
```

---

## Error Handling

- If no plans exist in either of the `PLAN_DIRECTORIES`: inform user and suggest running `/dev-plan` first
- If selected plan file doesn't exist: report error and re-prompt for selection using `ask_user`
- If agent analysis fails: report which analysis failed and continue with available results
- If plan has no risky steps: report clean validation with no changes needed

---

## Tool Reference Summary

| Phase | pi Tools Used |
|-------|---------------|
| Phase 1: Plan Selection | `find`, `read`, `ask_user` (type: select/input) |
| Phase 1.5: Understanding Verification | `ask_user` (type: select) |
| Phase 2: Smart Validation Analysis | `subagent` (mode: single) |
| Phase 3: Targeted Parallel Validation | `subagent` (mode: parallel) |
| Phase 4: Synthesize & Rewrite | Direct result aggregation (no tool needed) |
| Phase 5: Conditional Plan Update | `write` (if issues found) |
