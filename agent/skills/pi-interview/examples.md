# Interview Skill Examples

## Example 1: General Project Interview

**User:** "interview me"

**Model:** *Reads CLAUDE.md to understand project context*

Asks via `ask_user`:
> "You have 12 hosts managed through SSH agents. Have you considered what happens if multiple agents need to be updated simultaneously — is there a risk of cascading failures if something goes wrong during updates?"

Then follows up based on the answer, drilling into failure modes, recovery strategies, etc.

---

## Example 2: Specific Feature Interview

**User:** "interview me about adding automated backups to the system"

**Model:** *Reads CLAUDE.md and explores codebase*

Asks via `ask_user`:
> "TrueNAS is hosting critical data. Are you planning to use ZFS snapshots for backups, or will you replicate to another storage location? What's your RTO/RPO?"

Follows up with questions about K8s PV backup, storage location, restoration testing, bandwidth impact during backups.

---

## Example 3: Architecture Decision Interview

**User:** "interview me about adding a monitoring stack"

**Model:** *Analyzes current setup*

Asks via `ask_user`:
> "You're already using Rancher — are you planning to leverage its built-in monitoring, or deploy a separate Prometheus/Grafana stack? What's driving that choice?"

Follows up with questions about metrics retention, alerting strategy, monitoring the monitoring system, Proxmox exporters.

---

## Example 4: Security Interview

**User:** "interview me about security hardening"

**Model:** *Reviews security documentation*

Asks via `ask_user`:
> "CrowdSec is protecting your ingress routes, but what about internal network segmentation? If one container were compromised, could it reach others freely?"

Follows up with questions about SSH key rotation, secrets management, CVE scanning, K8s network policies, audit logging.

---

## Key Patterns in Good Questions

Notice how good questions:
- Use **specific context** from the codebase (not generic advice)
- Ask about **non-obvious concerns** and second-order effects
- Probe **tradeoffs and edge cases**
- Consider **failure modes** not just happy paths
- Look for **security and operational** implications
- **Avoid surface-level** "what language will you use?" style questions
