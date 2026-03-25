---
name: pi-create-skill
description: Create new skills with mandatory SKILL.md and recipe.yaml, modify and improve existing skills, or upgrade skills to strict adherence format. Use when users want to create a skill from scratch, convert an existing workflow into a skill, update or optimize an existing skill, upgrade a skill to have strict phase/checkpoint structure, or improve a skill's description for better triggering accuracy. Also use when the user says "turn this into a skill" or asks about skill authoring best practices.
---

# Create Pi Skill

You are a skill architect for pi (the coding agent). Your job is to design, write, and iteratively improve skills that follow a **dual-artifact structure**:

1. **SKILL.md** — Natural language instructions with phase completion markers and checkpoints
2. **recipe.yaml** — Authoritative execution contract defining parameters, workflow, outputs, and validation

A skill is **passive content injected into the model's context on demand**. At startup, pi scans skill locations and puts names + descriptions in the system prompt. When a task matches, the agent uses `Read` to load the full SKILL.md body. The agent then follows the instructions, using relative paths to reference bundled scripts and assets.

## Modes of Operation

Determine which mode the user needs:

| Mode | When to Use |
|------|-------------|
| **new** | Creating a skill from scratch |
| **update** | Improving an existing skill (preserves name/directory) |
| **strictify** | Upgrading an existing skill to add recipe.yaml + phase markers + checkpoints |
| **convert** | Converting from another format (Claude Code, etc.) |

For the complete pi skill system specification (locations, structure, frontmatter, available tools), see [references/pi-skill-format.md](references/pi-skill-format.md).

For the recipe.yaml schema, see [references/recipe-schema.md](references/recipe-schema.md).

---

## Phase 1 — Capture Intent

Start by understanding what the user wants. The current conversation might already contain a workflow to capture (e.g., "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections made, input/output formats observed.

Determine:
1. **Mode**: new | update | strictify | convert
2. **Purpose**: What should this skill enable the model to do?
3. **Trigger conditions**: When should it activate? What user phrases/contexts?
4. **Inputs**: What information does the model need?
5. **Outputs**: What does the skill produce? (files, decisions, reports?)
6. **Scope**: Global (`~/.pi/agent/skills/`) or project-level (`.pi/skills/`)?

If the description is ambiguous, use `ask_user` to resolve before proceeding.

### Mode-Specific Actions

**For strictify mode:** Read the existing skill with `Read`. Inventory its phases/sections. This becomes the foundation for extracting the recipe.

**For convert mode:** Read the source file. Inventory its tools and workflow. Triage compatibility against pi's tool table.

### Phase 1 Complete

Output this marker before proceeding:

```
[Phase 1 COMPLETE] Intent captured for: <skill-name>
  Purpose: <one-line summary>
  Mode: <new | update | strictify | convert>
  Scope: <global | project>
```

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] Mode is determined
- [ ] Purpose is specific enough to write a description from
- [ ] At least one trigger condition is identified
- [ ] Output type is known (files, actions, decisions, etc.)
- [ ] Scope is decided (global vs project)

If any condition is not met, ask clarifying questions before proceeding.

---

## Phase 2 — Design the Skill

Before writing, decide:

1. **Frontmatter** — name (must match parent directory, lowercase + hyphens, ≤64 chars), description (≤1024 chars, see tips below)

2. **Activation contract** — one paragraph: when to use, when not to

3. **Workflow structure** — choose the right shape:
   - Linear phases (investigation → decision → execution → verification)
   - Decision tree (branch on detected state)
   - Checklist (ordered atomic steps with explicit done criteria)
   - Reference (knowledge tables + patterns the model consults)

4. **Tool plan** — for each step, which pi tool does the work? Verify every name against the reference table in [references/pi-skill-format.md](references/pi-skill-format.md).

5. **Output format** — if the skill produces a structured artifact, define the template now

6. **Bundled resources** — does the skill need helper scripts for deterministic/repetitive work, or reference docs for domain knowledge? Plan what goes in `scripts/`, `references/`, `assets/`.

7. **Recipe parameters** — what inputs will recipe.yaml accept? What workflow steps? What outputs? What validation?

### Description tips

The description determines when the agent loads the skill — it's the primary triggering mechanism. Claude tends to undertrigger skills, so be specific and a little "pushy":

Instead of:
```yaml
description: Helps with PDFs.
```

Write:
```yaml
description: Extracts text and tables from PDF files, fills PDF forms, and merges multiple PDFs. Use when working with PDF documents, converting PDFs, or extracting data from PDFs, even if the user doesn't explicitly mention "PDF processing."
```

Include both what the skill does AND specific contexts/phrasings that should trigger it. Add near-synonyms and common ways users phrase the request.

### Phase 2 Complete

Output this marker before proceeding:

```
[Phase 2 COMPLETE] Design ready for: <skill-name>
  Workflow type: <linear | decision-tree | checklist | reference>
  Recipe parameters: <count>
  Recipe workflow steps: <count>
  Bundled resources: <list or "none">
```

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] Frontmatter name and description are defined
- [ ] Activation contract is written (when to use / when not to)
- [ ] Workflow structure is chosen
- [ ] All tools are verified against pi's tool table
- [ ] Recipe parameters are identified
- [ ] Recipe workflow steps are planned (should match phase count)
- [ ] Bundled resources are planned (even if "none")

---

## Phase 3 — Write the SKILL.md

### Writing style

- **Use imperative voice** directed at the model ("Read the file with `Read`", "Use `Bash` to locate")
- **Explain the why.** Today's LLMs are smart — they have good theory of mind and can go beyond rote instructions when they understand the reasoning. Rather than heavy-handed MUSTs, explain why something matters. If you find yourself writing ALWAYS or NEVER in all caps, that's a yellow flag — reframe and explain the reasoning instead.
- **Keep it lean.** Remove things that aren't pulling their weight. Every instruction should earn its place.
- **Generalize, don't overfit.** Skills get used many times across many prompts. Make improvements help the general case, not just specific examples.
- **Include examples** at decision points — they're worth a thousand words of instruction
- **State what to do when conditions aren't met** — prefer explicit over implicit

### Structure template

```markdown
---
name: <kebab-case, matches directory name>
description: <what it does + when to use it, specific and pushy>
---

# <Title>

<Activation contract: one concise paragraph. When to use. When not to.>

---

## Phase 1: <Name>

<Instructions the model follows. Imperative voice. Reference pi tools by exact name.>

### Phase 1 Complete

Output this marker before proceeding:

[Phase 1 COMPLETE] <summary>

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] <condition 1>
- [ ] <condition 2>

---

(Continue with additional numbered phases...)

## Guardrails

**Do NOT:**
- <explicit prohibition>

**DO:**
- <explicit permission>

---

## Report

After completing the skill, output:
<template>
```

**Note:** Use `## Phase N:` (with colon) for actual phase headings to avoid conflicts with this template.

### Domain organization

When a skill supports multiple domains/frameworks, put variants in `references/` and have the skill read only the relevant one:

```
cloud-deploy/
├── SKILL.md           (workflow + selection logic)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

### Principle of Lack of Surprise

Skills must not contain malware, exploit code, or anything that could compromise security. A skill's contents should not surprise the user in their intent if described.

### Phase 3 Complete

Output this marker before proceeding:

```
[Phase 3 COMPLETE] SKILL.md written: <path>
  Lines: <count>
  Phases: <count>
  Checkpoints: <count>
  Bundled resources created: <list or "none">
```

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] SKILL.md exists on disk and reads back without corruption
- [ ] Frontmatter has `name` and `description` fields
- [ ] `name` matches directory name
- [ ] Description is specific enough to trigger correctly
- [ ] Every phase has a completion marker
- [ ] Every phase has a checkpoint with checkboxes
- [ ] No invalid tool names in body
- [ ] Body is under 500 lines (or overflow moved to `references/`)

---

## Phase 4 — Write the recipe.yaml

Every skill must have a `recipe.yaml` that defines its authoritative execution contract. The recipe pins: workflow steps, required parameters, expected outputs, and validation criteria.

See [references/recipe-schema.md](references/recipe-schema.md) for the complete schema.

### Extracting from SKILL.md

Since you just wrote (or are looking at) the SKILL.md, extract the recipe structure:

1. **Title and description**: Derive `title` from the SKILL.md's `# Title` heading and `description` from the frontmatter description (condensed to 1-2 sentences)

2. **Workflow steps**: Map each Phase heading to a workflow step. Use the phase name as the step name, summarize the description to 1-3 sentences.

3. **Parameters**: Look at `ask_user` tool usage patterns, Variables sections, and input references in the skill. Each distinct user input becomes a parameter with an inferred type.

4. **Outputs**: Look at `Write` tool usage, file creation patterns, and artifact references. Each distinct output becomes an output entry.

5. **Validation**: Look at verification sections, acceptance criteria, and `Bash` commands used for checking. Each becomes a validation entry.

6. **Decision points**: Any phase that pauses for user review or approval should have `decision_point: true`.

### Recipe template

```yaml
# See SKILL.md in this directory for detailed instructions
version: "1.0.0"
title: "<title>"
description: "<one-line summary>"

parameters:
  - key: "<param-name>"
    type: "<string|number|boolean|select|file>"
    required: <true|false>
    description: "<what it controls>"

workflow:
  - step: 1
    name: "<phase name>"
    description: "<1-3 sentences>"
    requires_input: ["<param-name>"]
    produces: ["<output-id>"]
    decision_point: <true|false>

outputs:
  - id: "<output-id>"
    description: "<what it is>"
    type: "<file|artifact|intermediate>"
    required: <true|false>

validation:
  - name: "<check name>"
    type: "<shell|content|exists>"
    command: "<command>"  # for shell
```

### Validation

After writing recipe.yaml:

1. Validate YAML syntax:
   ```bash
   python3 -c "import yaml; yaml.safe_load(open('<path>/recipe.yaml'))"
   ```

2. Verify step count matches SKILL.md phase count

3. Verify all parameter keys are referenced in at least one step's `requires_input`

4. Verify all output ids are referenced in at least one step's `produces`

### Phase 4 Complete

Output this marker before proceeding:

```
[Phase 4 COMPLETE] recipe.yaml written: <path>
  Parameters: <count>
  Workflow steps: <count>
  Outputs: <count>
  Validations: <count>
  YAML syntax: valid
  Recipe-skill sync: verified
```

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] recipe.yaml exists on disk and reads back without corruption
- [ ] YAML parses without errors
- [ ] Workflow step count matches SKILL.md phase count
- [ ] All parameter keys are referenced in at least one step's `requires_input`
- [ ] All output ids are referenced in at least one step's `produces`
- [ ] Decision points match phases that require user input

---

## Phase 5 — Write Bundled Resources and Verify

1. Write any bundled scripts, references, or assets
2. Read SKILL.md back with `Read` to confirm no corruption
3. Read recipe.yaml back to confirm no corruption
4. Run validation: `./scripts/validate-skill.sh <skill-directory>`
5. Verify recipe-skill sync manually

### Phase 5 Complete

Output this marker before proceeding:

```
[Phase 5 COMPLETE] Skill verified: <skill-name>
  SKILL.md: <lines> lines, <phases> phases
  recipe.yaml: <lines> lines, <steps> steps
  Validation: passed
  Files created: <list>
```

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] Skill directory exists with correct name
- [ ] SKILL.md reads back without corruption
- [ ] recipe.yaml reads back without corruption
- [ ] Validation script passes (or manual verification complete)
- [ ] All bundled resources are in place
- [ ] Recipe step count matches SKILL.md phase count

---

## Phase 6 — Test and Iterate (optional but recommended)

Ask the user if they'd like to test the skill. Skills with objectively verifiable outputs benefit most. Skills with subjective outputs often don't need it.

If the user declines testing, skip to Phase 7.

### Test cases

Come up with 2-3 realistic test prompts — the kind of thing a real user would actually say. Share them: "Here are test cases I'd like to try. Do these look right, or do you want to add more?"

### Running tests

For each test case, spawn a subagent that reads the skill and executes the prompt:

```json
{
  "agent": "worker",
  "task": "Read the skill at <path>/SKILL.md and follow its instructions to accomplish this task: <prompt>"
}
```

Run test cases in parallel via `subagent` when possible.

### Evaluate and improve

After test runs complete:
1. Review outputs and present them to the user
2. Ask for feedback on each test case
3. Look for patterns — are all runs independently writing the same helper script? Bundle it in `scripts/`. Is the model wasting time on unproductive steps? Trim the instructions causing it.
4. **Check phase compliance** — did the model output phase completion markers? Did it verify checkpoints?

### The improvement loop

When improving:
1. **Generalize from feedback.** Don't overfit to test examples.
2. **Read transcripts, not just outputs.** If the model wastes time, remove the instructions causing it.
3. **Look for repeated work.** If every run writes a similar script, bundle it so future invocations don't reinvent the wheel.
4. **Keep recipe in sync.** When you change SKILL.md phases, update recipe.yaml to match.
5. **Draft a revision, then review it fresh.**

After improving, rerun tests. Keep going until the user is happy or feedback is empty.

### Context management in the iterate loop

After each iteration cycle:
1. **Summarize the iteration** — capture which tests passed/failed, what changed
2. **Use workspace as external memory** — write to `iteration-N/summary.md`
3. **Limit active context** — only keep current iteration + cumulative summary

### Phase 6 Complete

Output this marker before proceeding:

```
[Phase 6 COMPLETE] Testing complete for: <skill-name>
  Test cases run: <count>
  Iterations: <count>
  Phase compliance: <percentage of runs that output all markers>
  User feedback: <addressed | none needed>
```

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] User was asked about testing (and accepted or declined)
- [ ] If tested: all test cases ran and outputs reviewed
- [ ] If tested: phase compliance was verified (markers output, checkpoints verified)
- [ ] If tested: user feedback was addressed (or none needed)
- [ ] Skill is stable (no more changes requested)
- [ ] recipe.yaml is still in sync with SKILL.md

If testing was declined, this checkpoint is automatically satisfied.

---

## Phase 7 — Optimize Description (optional)

After the skill is finalized, offer to optimize the description for better triggering. Create 15-20 eval queries — a mix of should-trigger and should-not-trigger:

**Should-trigger (8-10):** Different phrasings of the same intent — formal, casual, implicit. Include cases where the user doesn't name the skill but clearly needs it.

**Should-not-trigger (8-10):** Near-misses that share keywords but need something different. Don't make these obviously irrelevant — they should be genuinely tricky.

Make queries realistic and detailed — include file paths, personal context, casual speech. Not abstract requests.

Present to the user, then iteratively refine the description to maximize correct triggering while minimizing false positives.

### Phase 7 Complete

Output this marker when done:

```
[Phase 7 COMPLETE] Description optimization: <run | skipped>
  Before accuracy: <X/20 or "N/A">
  After accuracy: <Y/20 or "N/A">
  Description updated: <yes | no>
```

**Checkpoint — proceed only if ALL conditions are met:**
- [ ] User was offered description optimization (and accepted or declined)
- [ ] If run: eval queries were generated and reviewed
- [ ] If run: description was refined based on results
- [ ] Final skill is ready for use

---

## Guardrails

**Do NOT:**
- Skip phases even if the task seems simple
- Proceed past a checkpoint without verifying all conditions
- Create `-v2` variants of existing skills — edit in place
- Silently rewrite unrelated skills
- Overfit fixes to a single test case
- Auto-commit or auto-push changes
- Let recipe.yaml get out of sync with SKILL.md
- Create a skill without a recipe.yaml

**DO:**
- Output phase completion markers
- Verify checkpoints before proceeding
- Ask for clarification when intent is ambiguous
- Generalize improvements from feedback
- Keep the skill lean (under 500 lines, overflow to `references/`)
- Keep recipe.yaml in sync with SKILL.md phases
- Validate recipe.yaml syntax after every edit
- Ensure every skill has both SKILL.md and recipe.yaml

---

## Report

After completing the skill, output:

```
Skill: <name>
Path: <full path to SKILL.md>
Mode: <new | update | strictify | convert>

Artifacts:
  SKILL.md: <lines> lines, <phases> phases
  recipe.yaml: <lines> lines, <steps> steps

Frontmatter:
  name: <value>
  description: <value>

Sections: <list of H2 headings>
Bundled resources: <list, or "none">

Validation:
  name format ............. pass
  description length ...... pass
  frontmatter valid ....... pass
  body complete ........... pass
  recipe YAML valid ....... pass
  recipe-skill sync ....... pass

Test iterations: <N | skipped>
Description optimization: <run | skipped>

The skill is available immediately. Use /skill:<name> to invoke directly.
```
