# Infrastructure Ops Team — Dispatch Guide

## Team Overview
Infrastructure operations team for MSP small-business deployments. CEO + 6 specialists managing heterogeneous environments over SSH. Invocable agent IDs are namespaced with `infra-`. 

## Model Assignments

| Agent ID | Model | Rationale |
|----------|-------|-----------|
| infra-dispatcher | opus-4-6 | Orchestration and triage reasoning |
| infra-analyst | opus-4-6 | Root cause analysis complexity |
| infra-scout | openai-codex/gpt-5.3-codex | Structured discovery tasks |
| infra-responder | openai-codex/gpt-5.4 | Pattern-based incident response |
| infra-operator | openai-codex/gpt-5.3-codex | Procedural maintenance routines |
| infra-hardener | openai-codex/gpt-5.4 | Framework-based security auditing |
| infra-documenter | openai-codex/gpt-5.3-codex | Structured documentation output |

## Dispatch Patterns

### Baseline Phase (New Client Onboarding)
```
infra-scout → infra-documenter → infra-operator → infra-hardener
```
1. Scout explores and maps the environment
2. Documenter structures findings into baselines
3. Operator verifies infrastructure health and backup configuration
4. Hardener audits security posture

### Incident Response
```
infra-responder → infra-analyst → infra-hardener → infra-documenter
```
1. Responder stabilizes (restore service)
2. Analyst investigates root cause
3. Hardener reviews security implications
4. Documenter captures runbook entry

### Proactive Maintenance
```
infra-operator → infra-hardener → infra-documenter
```
1. Operator performs scheduled maintenance
2. Hardener verifies security posture post-change
3. Documenter updates baselines and change logs

### Security Audit
```
infra-scout → infra-hardener → infra-documenter
```
1. Scout maps current state
2. Hardener audits against benchmarks
3. Documenter captures findings and remediation plan

## Tension-Aware Routing

When routing decisions, consider these tensions:

| Tension | Speed Side | Depth Side | Default |
|---------|-----------|------------|---------|
| Speed vs Depth | Responder | Analyst | Speed for P1, Depth for recurring |
| Harden vs Access | Hardener | Responder, Operator | Access unless risk is high |
| Explore vs Docs | Scout, Analyst | Documenter | Explore for new, Docs for known |
| Standardize vs Adapt | Documenter, Operator | Scout | Standardize unless env is novel |

## Incident Lifecycle States
1. Detected — Alert fires
2. Triage — Dispatcher assesses, routes
3. Stabilized — Responder restores service
4. Root Cause Analysis — Analyst investigates
5. Hardening — Hardener and Operator review implications
6. Documentation — Documenter captures artifacts
7. Closed — Dispatcher confirms closure

## Baseline Completion Gate
Baseline is complete when documented for each host/service:
- Host inventory, service map, network topology
- Backup verification, security posture snapshot
- Monitoring confirmation (Uptime Kuma active)
Scout confirms coverage. Documenter confirms structure. Dispatcher declares complete.

## Multi-Alert Protocol
Prioritize by blast radius and revenue impact, not arrival order. Dispatch parallel specialists for independent issues. Serial for dependent. Preempt lower-severity for critical alerts.

## Escalation
Escalate to human operator when:
- Stakes exceed team authority
- Specialists disagree and evidence is inconclusive
- Security-access tradeoff requires business judgment