---
name: pi-brainstorm
description: "Use only when explicitly invoked with /skill:pi-brainstorm (or a direct request to run this skill). Run a structured brainstorm for the current project: quick repo review, mandatory goal-and-preference interview, creative option generation, prioritization, and convergence to one actionable next step. Do not use for direct coding or full implementation planning."
---

# Pi Brainstorm

Use this skill for deliberate, collaborative ideation when the user wants to think through options before planning or coding. This skill is intentionally interview-driven: review project context first, clarify goal and preference signals, then generate options and converge to exactly one actionable next step. Do not use this as a replacement for implementation planning or execution.

For execution discipline, treat `recipe.yaml` in this directory as the authoritative contract and follow its workflow steps in order.

---

## Phase 1 — Confirm Invocation and Review Project Context

This skill should run only when explicitly invoked (for example with `/skill:pi-brainstorm`, or when the user clearly asks to run this skill by name).

1. Confirm explicit invocation intent from the user message.
2. Capture the brainstorm topic in one sentence. If unclear, use `ask_user`.
3. Review the project before interviewing:
   - Use `Bash` to inspect repository structure.
   - Use `Read` on key files (README, package manifests, core docs, or obvious entry points).
   - Build a short project-context brief: what exists, what constraints are visible, and where ideas could fit.
4. If the user provides feasibility findings from `pi-dev-validate`, treat those as constraints for brainstorming.

Keep this review lightweight but concrete so later ideas are grounded.

### Phase 1 Complete

Output this marker before proceeding:

[Phase 1 COMPLETE] Invocation and project review ready
  Topic: <one-line topic>
  Project context reviewed: <yes | no>
  Constraint inputs: <none | summarized>

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] Invocation is explicit (manual skill use or direct request)
- [ ] Topic is stated in one sentence
- [ ] Project context was reviewed (or inability was clearly stated)
- [ ] Any validate-style constraints were captured when provided

---

## Phase 2 — Mandatory Goal and Preference Interview

Do not generate ideas yet.

1. Restate your understanding of the topic and project context in 1-2 sentences.
2. Run a focused interview using `ask_user` to capture at least:
   - the goal (required)
   - preference signals (required): style, constraints, risk appetite, novelty vs practicality, timeline, or similar
3. If goal is vague, prompt with follow-up questions until it is specific enough to guide trade-offs.
4. Reflect the captured inputs back to the user and request confirmation.

Do not proceed to ideation until the user confirms the goal statement.

### Phase 2 Complete

Output this marker before proceeding:

[Phase 2 COMPLETE] Interview locked
  Goal: <confirmed goal>
  Preference signals: <bullet summary>

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] Goal is explicit and user-confirmed
- [ ] Preference signals are captured
- [ ] Any hard constraints are listed
- [ ] User confirmed readiness to brainstorm options

---

## Phase 3 — Generate Structured Creative Options

Now diverge creatively while staying aligned to the confirmed goal.

1. Generate 4-7 distinct options.
2. Ensure option diversity (for example: product, technical, workflow, or scope angles).
3. For each option, include:
   - why it could work in this project
   - main upside
   - main risk or uncertainty
4. Ask the user which options resonate and why.
5. If no option resonates, revise once using feedback and present a refreshed set.

Be imaginative, but keep every option connected to the confirmed goal and project context.

### Phase 3 Complete

Output this marker before proceeding:

[Phase 3 COMPLETE] Option set explored
  Options generated: <count>
  User feedback captured: <yes | no>

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] At least 4 distinct options were presented
- [ ] Each option includes upside and risk
- [ ] User preference feedback was captured
- [ ] A shortlist exists for convergence

---

## Phase 4 — Offer Optional Web Research

Before converging, explicitly offer external research.

1. Ask whether the user wants web research to strengthen decision quality.
2. If yes:
   - Use `web_search` to find relevant sources.
   - Use `web_fetch` to read the 2-3 most relevant links in full.
   - Summarize only insights that affect option selection, feasibility, or risk.
3. If no, continue with current project-grounded evidence.
4. Confirm whether the evidence base is sufficient to prioritize.

Keep this phase focused. The goal is decision support, not broad open-ended research.

### Phase 4 Complete

Output this marker before proceeding:

[Phase 4 COMPLETE] Web research decision complete
  Research requested: <yes | no>
  External insights added: <yes | no>

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] User was explicitly offered web research
- [ ] If requested, search and source-reading were completed
- [ ] Research summary is relevant to option prioritization
- [ ] User confirmed readiness to converge

---

## Phase 5 — Prioritize and Converge to One Actionable Next Step

Converge from options to one concrete next move.

1. Compare shortlisted options with concise criteria:
   - goal alignment
   - repo fit / feasibility
   - expected impact
   - time-to-value
2. Recommend one direction with a short rationale.
3. Translate the recommendation into one actionable next step:
   - clear action
   - expected output
   - immediate start point
4. Confirm this single next step with the user. If not accepted, adjust and reconverge.

End this phase only when one next step is agreed.

### Phase 5 Complete

Output this marker before proceeding:

[Phase 5 COMPLETE] Converged to one next step
  Selected direction: <name>
  Actionable next step: <single concrete step>

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] Prioritization criteria were applied
- [ ] One direction was recommended
- [ ] Exactly one actionable next step is defined
- [ ] User accepted or refined the final next step

---

## Phase 6 — Wrap Up and Optional Save

1. Provide a concise wrap-up:
   - confirmed goal
   - selected direction
   - single actionable next step
   - why this is the best immediate move
2. Ask whether to save a summary.
3. If yes, use `Bash` to ensure `artifacts/brainstorming/` exists, then use `Write` to create:
   - `artifacts/brainstorming/brainstorm-<topic-slug>-<date>.md`

Use this file template when saving:

```markdown
# Brainstorm: <topic>

## Goal
<confirmed goal>

## Preference Signals
- <signal>

## Project Context Snapshot
- <constraint or opportunity>

## Options Considered
### <option>
- Upside: <text>
- Risk: <text>

## Selected Direction
<selected direction>

## Single Actionable Next Step
<exact next step>

## Why This Next
<short rationale>
```

### Phase 6 Complete

Output this marker before finishing:

[Phase 6 COMPLETE] Brainstorm delivered
  Single next step chosen: <yes | no>
  Summary saved: <yes | no>
  File: <path | none>

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] Final output includes one actionable next step
- [ ] Rationale for that step is included
- [ ] Save preference was asked
- [ ] If saving was requested, file was written successfully

---

## Guardrails

**Do NOT:**
- Auto-run this skill for generic planning or coding prompts without explicit invocation
- Start ideation before goal confirmation
- End with multiple competing next steps

**DO:**
- Keep the interview short but sufficient to confirm goal and preference signals
- Keep options creative and varied
- Converge decisively to one immediate actionable next step

---

## Report

After completing the skill, report:
- invocation mode confirmation
- topic and confirmed goal
- preference signals captured
- whether project context was reviewed
- number of options explored
- whether optional web research was offered and used
- selected direction
- single actionable next step
- whether a summary file was saved and its path
- suggested follow-up skill (if useful)
