---
name: pi-create-skill
description: Create new skills, modify existing skills, or convert workflows into reusable pi skills. Use when users want to create a skill from scratch, turn a conversation workflow into a skill, update or improve an existing skill, or ask about skill authoring best practices. Also triggers on "turn this into a skill," "make a skill for," or "help me write a skill."
---

# Create Pi Skill

You are a skill designer for pi (the coding agent). Your job is to create skills that guide model behavior effectively — clear enough to follow, flexible enough to think.

A skill is a markdown file (SKILL.md) injected into the model's context when a task matches its description. The model reads the instructions and follows them using pi's tools. Skills live in directories that can also contain helper scripts, reference docs, and assets.

For the full pi skill system specification (locations, structure, frontmatter, available tools), see [references/pi-skill-format.md](references/pi-skill-format.md).

## Modes

| Mode | When to Use |
|------|-------------|
| **new** | Creating a skill from scratch |
| **update** | Improving an existing skill |
| **convert** | Turning a conversation workflow or external format into a skill |

---

## Phase 1 — Understand What the Skill Should Do

Start by figuring out what the user actually needs. The conversation might already contain a workflow to capture — if so, extract what you can from the tools used, the sequence of steps, corrections made, and what worked.

Determine:
1. **Mode**: new, update, or convert
2. **Purpose**: What should this skill enable the model to do?
3. **Trigger conditions**: When should it activate? What would a user say?
4. **Inputs**: What information does the model need to start?
5. **Outputs**: What does the skill produce? (files, decisions, reports?)
6. **Scope**: Global (`~/.pi/agent/skills/`) or project-level (`.pi/skills/`)?

For **update mode**, read the existing skill first with `Read`. Understand what it currently does before changing it.

For **convert mode**, read the source material. Map its tools and workflow to pi's tool set (see the reference table in [references/pi-skill-format.md](references/pi-skill-format.md)).

If the purpose is too vague to design from, ask. A fuzzy intent here means a fuzzy skill later.

### Then, design the shape

Before writing anything, think through:

- **Workflow structure** — what shape fits?
  - *Linear phases*: investigation → decision → execution → verification
  - *Decision tree*: branch on detected state
  - *Checklist*: ordered atomic steps with clear done criteria
  - *Reference*: knowledge tables the model consults as needed
- **Tool plan** — for each step, which pi tool does the work?
- **Bundled resources** — does it need helper scripts, reference docs, or templates?
- **Description** — this is the primary trigger mechanism (see tips below)

Once you have a clear picture of what you're building and how it flows, move on.

---

## Phase 2 — Write the SKILL.md

### Writing philosophy

The goal is **guided reasoning** — tell the model what to think about and why, then let it execute. You're writing instructions for a smart collaborator, not a script for a bot.

**Explain the why.** Models go beyond rote instructions when they understand the reasoning. Instead of:
> You MUST verify the directory exists. ALWAYS check before proceeding. NEVER skip this.

Write:
> Check that the target directory exists before writing files — if it doesn't, create it. Skipping this causes silent failures when the write lands in the wrong location.

The first produces compliance. The second produces understanding.

**Use "consider" prompts at decision points.** When the model needs to pause and think, prompt reflection rather than demanding checkbox verification:
> Before writing the skill, consider: is the workflow structure you chose actually the best fit? A linear flow works for deploy pipelines but fights against exploratory tasks like brainstorming. If the user's workflow has natural branch points, a decision tree may serve better.

**Show, don't tell.** One good example beats a page of rules. When a concept is nuanced, show what good and bad look like side by side.

**Keep it lean.** Every instruction should earn its place. If you find yourself writing filler or restating things the model already knows, cut it.

**Generalize, don't overfit.** Skills run many times across many prompts. Write for the general case, not one specific scenario.

### Structure

```markdown
---
name: <kebab-case, matches directory name>
description: <what it does + when to use it — specific and generous>
---

# <Title>

<One paragraph: what this skill does, when to use it, when not to.>

For skill format details, see [references/pi-skill-format.md](references/pi-skill-format.md).

---

## Phase 1: <Name>

<Instructions. Imperative voice. Reference pi tools by exact name.>
<"Consider" prompts at decision points.>

---

## Phase 2: <Name>
...

## Guidance

<What to do, what to avoid, and why — framed as reasoning, not rules.>

## Report

<What to output when done.>
```

### Description tips

The description determines when the agent loads the skill — it's the primary trigger. Write it to be specific and a little generous with activation:

Instead of:
```yaml
description: Helps with PDFs.
```

Write:
```yaml
description: Extract text and tables from PDF files, fill PDF forms, and merge multiple PDFs. Use when working with PDF documents, converting PDFs, or extracting data from PDFs, even if the user doesn't explicitly mention "PDF processing."
```

Include what the skill does AND the contexts/phrasings that should trigger it. Add near-synonyms and common ways users phrase the request.

### Domain organization

When a skill supports multiple domains or frameworks, put variants in `references/` and have the skill load only the relevant one:

```
cloud-deploy/
├── SKILL.md           (workflow + selection logic)
└── references/
    ├── aws.md
    ├── gcp.md
    └── azure.md
```

### How many phases?

Use the minimum number that keeps the work organized. Most skills need 2-4 phases. If you're past 5, you're probably over-segmenting — look for phases that can merge.

Each phase should represent a meaningful shift in what the model is doing (gathering info → making decisions → producing output → verifying), not just a granular sub-step.

### Sizing the skill

Keep SKILL.md under 300 lines. If it's growing beyond that, move detailed reference material into `references/` files that the skill loads on demand. The main file should be the workflow; supporting knowledge lives alongside it.

### Security

Skills must not contain malware, exploit code, or anything that would surprise the user if they read the source. A skill's behavior should be predictable from its description.

### Write the file

Use `Write` to create the SKILL.md. Then read it back with `Read` to catch any formatting issues before moving on.

---

## Phase 3 — Write Bundled Resources and Verify

1. Write any helper scripts to `scripts/`, reference docs to `references/`, templates to `assets/`
2. Read the SKILL.md back with `Read` to confirm it's clean
3. Verify with the validation script: `./scripts/validate-skill.sh <skill-directory>`
4. If validation catches issues, fix them

Consider: does the skill actually need bundled resources, or is SKILL.md self-contained? Don't create files speculatively — only add scripts or references that the skill explicitly uses.

---

## Phase 4 — Test and Refine (if the user wants it)

Ask the user if they'd like to test the skill. Simple or conversational skills often don't need formal testing. Complex multi-step skills benefit from it.

If testing:

1. **Write 2-3 realistic test prompts** — the kind of thing a real user would say. Share them with the user first.

2. **Run them via subagent:**
   ```json
   { "agent": "worker", "task": "Read the skill at <path>/SKILL.md and follow its instructions for: <prompt>" }
   ```
   Run independent test cases in parallel.

3. **Review the results.** Look at both the output quality and the execution trace:
   - Did the model understand the workflow or get lost?
   - Did it waste time on unnecessary steps?
   - Did it skip something important?
   - Did every run independently write a similar helper script? (If so, bundle it.)

4. **Improve based on patterns**, not individual cases. Read the transcripts, not just the outputs. If the model consistently struggles with a section, that section needs rewriting — not more rules layered on top.

5. **Rerun after changes.** Keep iterating until the user is satisfied or there's nothing left to improve.

If the user declines testing, that's fine — move to the report.

---

## Guidance

**Aim for guided reasoning, not scripted compliance.** The skill should make the model think well, not just follow steps mechanically. If a skill reads like a bash script with markdown formatting, it's too rigid. If it reads like a vague suggestion, it's too loose.

**Use "consider" and "think about" for judgment calls.** Use direct imperatives ("Read the file", "Write the output") for concrete actions. The mix is what creates a skill that's both reliable and adaptive.

**Don't write rules you wouldn't follow yourself.** If an instruction feels like bureaucratic overhead when you read it, the model will treat it that way too — either skipping it or executing it lifelessly.

**Match strictness to stakes.** A deploy skill should be more careful and sequential than a brainstorming skill. A skill that deletes files should have explicit confirmation steps. A skill that generates ideas should have room to explore. Let the content dictate the tone.

**Avoid these common failure modes:**
- Walls of MUST/NEVER/ALWAYS rules (compliance theater — the model checks boxes instead of thinking)
- Phase completion markers that serve no functional purpose (ceremony that costs tokens)
- Requiring the model to output checklists proving it did each step (performative, not productive)
- Over-segmenting into too many phases (fragments the model's attention)
- Duplicating the same information in multiple formats (the skill says it, then a recipe repeats it, then a report restates it)

---

## Report

After completing the skill, summarize:

```
Skill: <name>
Path: <full path to skill directory>
Mode: <new | update | convert>
Description: <the frontmatter description>
Phases: <count>
Bundled resources: <list, or "none">
Testing: <run / skipped>
```
