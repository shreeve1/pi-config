# Infrastructure Safety Validation Template

**Trigger:** Runs when task modifies infrastructure, deployments, or operations

**Purpose:** Verify infrastructure changes are safe, secure, and operationally sound

```
Task tool (general-purpose):
  description: "Validate infrastructure safety for operational changes"
  prompt: |
    You are validating that infrastructure changes are safe for production deployment.

    ## Git Range to Analyze

    **Base:** {BASE_SHA}
    **Head:** {HEAD_SHA}

    ```bash
    git diff --stat {BASE_SHA}..{HEAD_SHA}
    git diff {BASE_SHA}..{HEAD_SHA}
    ```

    ## Conditional Trigger

    **Only proceed if changes include:**
    - Infrastructure as Code (Terraform, CloudFormation, Pulumi, CDK)
    - Dockerfile or container configuration changes
    - Kubernetes manifests (deployments, services, configs)
    - CI/CD pipeline changes
    - Environment configuration (.env, config files)
    - Secrets or credential handling changes
    - Network/security group changes
    - Database or cache infrastructure changes

    If no infrastructure changes, report: "No infrastructure changes detected"

    ## What to Analyze

    ### Security Analysis

    **Secrets Handling:**
    - [ ] No hardcoded secrets, API keys, or passwords
    - [ ] Secrets loaded from environment or secret manager
    - [ ] Secret access properly scoped (least privilege)
    - [ ] No secrets in logs or error messages

    **Network Security:**
    - [ ] Security groups allow only required traffic
    - [ ] No public exposure of internal services
    - [ ] Proper TLS/SSL configuration
    - [ ] CORS configured appropriately

    **Access Control:**
    - [ ] IAM roles properly scoped
    - [ ] Service accounts have minimum permissions
    - [ ] No overly permissive policies (e.g., `*` actions)

    ### Operational Safety

    **High Availability:**
    - [ ] Multi-AZ/region deployment (if applicable)
    - [ ] Health checks configured
    - [ ] Auto-scaling policies appropriate
    - [ ] Load balancer configuration correct

    **Rollback Capability:**
    - [ ] Changes are reversible
    - [ ] Previous version can be deployed
    - [ ] Data migrations have rollback path
    - [ ] Feature flags for gradual rollout (if applicable)

    **Monitoring & Alerting:**
    - [ ] Metrics exposed for new services
    - [ ] Alerts configured for failures
    - [ ] Logging enabled and structured
    - [ ] Dashboards updated (if applicable)

    ### Resource Configuration

    **Compute:**
    - [ ] Instance sizes appropriate (not over/under-provisioned)
    - [ ] Resource limits set (CPU, memory)
    - [ ] Timeout values reasonable

    **Storage:**
    - [ ] Storage capacity adequate
    - [ ] Backup strategy defined
    - [ ] Retention policies configured

    **Cost Impact:**
    - [ ] New resources justified
    - [ ] Cost estimate documented
    - [ ] Unused resources cleaned up

    ## Your Job

    1. Read all infrastructure files changed
    2. Check for security vulnerabilities
    3. Verify operational safety
    4. Assess resource configuration
    5. Identify any risks or concerns

    ## Report Format

    ### Summary
    [One sentence: "All infrastructure changes are safe" OR "X concerns found"]

    ### Changes Analyzed

    | File | Type | Risk Level | Status |
    |------|------|------------|--------|
    | {file} | {terraform/k8s/docker/ci} | {Low/Med/High} | {Reviewed} |

    ### Security Concerns

    For each concern:

    **{N}. {Issue Description}**
    - **Location:** {file:line}
    - **Type:** {secrets | network | access | encryption}
    - **Risk:** {what could happen if exploited}
    - **Severity:** {Critical | High | Medium | Low}
    - **Fix:** {specific remediation}

    ### Operational Concerns

    For each concern:

    **{N}. {Issue Description}**
    - **Location:** {file:line}
    - **Type:** {availability | rollback | monitoring | capacity}
    - **Impact:** {what could go wrong in production}
    - **Severity:** {Critical | High | Medium | Low}
    - **Mitigation:** {how to address}

    ### Pre-Deployment Checklist

    - [ ] Security review complete
    - [ ] Cost impact estimated
    - [ ] Rollback tested or testable
    - [ ] Monitoring/alerting configured
    - [ ] Documentation updated (runbooks, architecture)
    - [ ] Team notified of changes

    ### Cost Impact

    | Resource | Before | After | Monthly Change |
    |----------|--------|-------|----------------|
    | {resource} | {cost} | {cost} | {+/- $X} |

    ### Recommendations

    - [Specific recommendations for safer deployment]

    ### Assessment

    **Safe to deploy?** [Yes | Yes with fixes | No - revise required]

    **Reasoning:** [1-2 sentence technical assessment]

    ## Critical Rules

    **DO:**
    - Flag ANY hardcoded secrets immediately (Critical severity)
    - Verify rollback path exists for all changes
    - Check that monitoring covers new failure modes
    - Consider blast radius of any failures

    **DON'T:**
    - Let security concerns slide as "we'll fix later"
    - Assume infrastructure works without verifying config
    - Ignore cost implications
    - Skip validation because changes "look standard"
```
