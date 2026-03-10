# Database Safety Validation Template

**Trigger:** Runs when task involves database changes

**Purpose:** Verify database changes are safe, reversible, and won't cause data loss

```
Task tool (general-purpose):
  description: "Validate database safety for schema changes"
  prompt: |
    You are validating that database changes are safe and production-ready.

    ## Git Range to Analyze

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Conditional Trigger

    **Only proceed if changes include:**
    - Database migration files
    - Schema definitions (SQL, Prisma, Drizzle, etc.)
    - Database model changes
    - Query changes affecting data structures

    If no database changes found, report: "No database changes detected - skipping validation"

    ## What to Analyze

    ### Migration Safety

    **Schema Changes:**
    - [ ] Column additions (safe if nullable or with default)
    - [ ] Column removals (DATA LOSS RISK - verify column is unused)
    - [ ] Column renames (requires careful migration)
    - [ ] Type changes (may require data migration)
    - [ ] Constraint additions (may fail on existing data)
    - [ ] Constraint removals (usually safe)
    - [ ] Index changes (verify performance impact)

    **Data Integrity:**
    - [ ] Foreign key relationships preserved
    - [ ] Unique constraints not violated
    - [ ] NOT NULL constraints satisfied by existing data
    - [ ] Default values make sense for existing rows

    **Rollback Safety:**
    - [ ] Down migration exists and is correct
    - [ ] Down migration won't cause data loss
    - [ ] Rollback tested or testable

    ### Code Changes Affecting Database

    **Query Changes:**
    - [ ] New queries use parameterization (no SQL injection)
    - [ ] Removed queries won't break existing functionality
    - [ ] Changed queries maintain same contract

    **Model Changes:**
    - [ ] Code updated to handle new schema
    - [ ] Old code paths removed or updated
    - [ ] Backwards compatibility considered

    ## Your Job

    1. Read all migration files in full
    2. Read the diff for all database-related code
    3. Verify each change is safe
    4. Identify any risks or concerns
    5. Validate rollback strategy

    ## Report Format

    ### Summary
    [One sentence assessment: "All database changes are safe" OR "X safety concerns found"]

    ### Changes Analyzed

    | File | Type | Action | Risk Level |
    |------|------|--------|------------|
    | {file} | {migration/schema} | {add/alter/remove} | {Low/Med/High} |

    ### Safety Concerns

    For each concern:

    **{N}. {Issue Description}**
    - **Location:** {file:line}
    - **Risk:** {data loss | downtime | corruption | integrity}
    - **Explanation:** {why this is risky}
    - **Severity:** {Critical | High | Medium | Low}
    - **Mitigation:** {how to make safe or work around}

    ### Rollback Verification

    - [ ] Down migrations exist for all up migrations
    - [ ] Down migrations tested or testable
    - [ ] Rollback procedure documented
    - [ ] Data recovery plan (if applicable)

    ### Pre-Deployment Checklist

    - [ ] Backup strategy defined
    - [ ] Migration tested on staging/development
    - [ ] Expected migration duration estimated
    - [ ] Downtime requirements documented (if any)
    - [ ] Rollback tested or testable

    ### Recommendations

    - [Specific recommendations for making changes safer]

    ### Assessment

    **Safe to deploy?** [Yes | Yes with fixes | No - revise required]

    **Reasoning:** [1-2 sentence technical assessment]

    ## Critical Rules

    **DO:**
    - Flag ANY potential data loss risk
    - Verify down migrations work correctly
    - Consider existing data when adding constraints
    - Check for N+1 query issues in new code

    **DON'T:**
    - Assume column is unused without checking
    - Trust that down migration is correct without reading it
    - Ignore performance implications of schema changes
    - Skip validation because changes "look simple"
```
