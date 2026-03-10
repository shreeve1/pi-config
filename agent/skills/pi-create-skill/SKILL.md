---
name: pi-create-skill
description: Create new skills, modify and improve existing skills. Use when users want to create a skill from scratch, convert an existing workflow into a skill, update or optimize an existing skill, or improve a skill's description for better triggering accuracy. Also use when the user says "turn this into a skill" or asks about skill authoring best practices.
---

# Create Pi Skill

You are a skill architect for pi (the coding agent). Your job is to design, write, and iteratively improve `SKILL.md` files that encode reusable workflows or knowledge domains.

A skill is **passive content injected into the model's context on demand**. At startup, pi scans skill locations and puts names + descriptions in the system prompt. When a task matches, the agent uses `Read` to load the full SKILL.md body. The agent then follows the instructions, using relative paths to reference bundled scripts and assets.

Figure out where the user is in the process and help them progress:
- Want a new skill from scratch → interview, draft, test, iterate
- Have an existing workflow to capture → extract from conversation, draft, refine
- Have a draft to improve → go straight to testing and iteration
- Just want a quick skill → that's fine too, skip the eval loop

---

## Pi Skill System Reference

### Skill locations

- **Global** (all sessions): `~/.pi/agent/skills/` or `~/.agents/skills/`
- **Project** (one project): `.pi/skills/` or `.agents/skills/` in cwd and ancestor dirs
- Discovery: direct `.md` files in skills root, or recursive `SKILL.md` under subdirectories
- Skills register as `/skill:name` commands

### Skill structure

A skill is a directory with a `SKILL.md` file. Everything else is freeform:

```
my-skill/
├── SKILL.md              # Required: frontmatter + instructions
├── scripts/              # Optional: helper scripts the skill invokes
│   └── process.sh
├── references/           # Optional: detailed docs loaded on-demand
│   └── api-reference.md
└── assets/               # Optional: templates, files used in output
    └── template.json
```

Use relative paths from the skill directory to reference bundled resources:
```markdown
See [the reference guide](references/REFERENCE.md) for details.
Run `./scripts/process.sh <input>` to process.
```

### Frontmatter

```yaml
---
name: skill-name          # Required. Lowercase a-z, 0-9, hyphens. Must match parent dir. Max 64 chars.
description: "..."        # Required. Max 1024 chars. What it does + when to use it.
---
```

Skills with missing description are **not loaded**. Unknown frontmatter fields are ignored.

### Available tools in every pi session

| Name | Purpose |
|---|---|
| `ask_user` | Ask the user a question (type: input/confirm/select/editor) |
| `Bash` | Run shell commands |
| `Read` | Read file contents (text or images) |
| `Edit` | Surgical file edits by replacing exact text |
| `Write` | Create or overwrite a file |
| `web_fetch` | Fetch a URL and return readable content |
| `web_search` | Search the web and return results |
| `search_knowledge` | Search the persistent knowledge base |
| `save_to_memory` | Save content to the persistent knowledge base |
| `subagent` | Spawn subagents (single, parallel, or chain modes) |
| `subagent_create` | Spawn a background subagent |
| `subagent_continue` | Continue an existing background subagent |
| `subagent_list` | List all active/finished background subagents |
| `subagent_remove` | Remove a subagent |
| `todo_write` | Create or update the session todo list |
| `todo_read` | Read the current session todo list |
| `read_plan` | Read plan.md for the current implementation plan |
| `update_progress` | Mark a plan task as completed |
| `get_progress` | Get current plan progress |
| `ts_diagnostics` | Get TypeScript diagnostics |
| `ts_hover` | Get type info at a position |
| `ts_definition` | Find symbol definition |
| `ts_references` | Find all references to a symbol |

### Subagent tool

Modes:
- **single**: `{ "agent": "worker", "task": "..." }`
- **parallel**: `{ "tasks": [{ "agent": "worker", "task": "..." }, ...] }`
- **chain**: sequential array where each step can reference `{previous}` output

Agent scope: `"user"` (default, `~/.pi/agent/agents/`), `"project"` (`.pi/agents/`), or `"both"`.

### Tool name traps — do NOT use in skills

| Wrong | Correct pi equivalent |
|---|---|
| `ask` | `ask_user` |
| `find` / `grep` | `Bash` (with shell `find`/`grep`/`rg`) |
| `fetch` | `web_fetch` |
| `lsp` / `notebook` / `puppeteer` | Not available — omit |
| `task` | `subagent` |
| `EnterPlanMode` | Not available — omit |

---

## Phase 1 — Capture Intent

Start by understanding what the user wants. The current conversation might already contain a workflow to capture (e.g., "turn this into a skill"). If so, extract answers from the conversation history first — the tools used, the sequence of steps, corrections made, input/output formats observed.

Determine:
1. **Purpose**: What should this skill enable the model to do?
2. **Trigger conditions**: When should it activate? What user phrases/contexts?
3. **Inputs**: What information does the model need?
4. **Outputs**: What does the skill produce? (files, decisions, reports?)
5. **Scope**: Global (`~/.pi/agent/skills/`) or project-level (`.pi/skills/`)?

If the description is ambiguous, use `ask_user` to resolve before proceeding.

### Interview and Research

Proactively ask about edge cases, input/output formats, example files, success criteria, and dependencies. Don't start writing until you've ironed this out. If web research would help, do it now.

### Conversion path (when input is an existing file)

If the user provides a file path to an existing skill, read it with `Read`, inventory its tools and workflow, triage compatibility against pi's tool table, then convert:
1. **Keep** `name` and `description` frontmatter
2. **Drop** unsupported frontmatter fields (`model`, `hooks`, etc.) — pi ignores unknown fields
3. **Rewrite tool names** using the mapping tables above
4. **Replace unsupported tools** with a clearly marked note

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

4. **Tool plan** — for each step, which pi tool does the work? Verify every name against the reference table.

5. **Output format** — if the skill produces a structured artifact, define the template now

6. **Bundled resources** — does the skill need helper scripts for deterministic/repetitive work, or reference docs for domain knowledge? Plan what goes in `scripts/`, `references/`, `assets/`.

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

## <Phase or Section 1>

<Instructions the model follows. Imperative voice. Reference pi tools by exact name.>

## <Phase or Section 2>

<Continue pattern. Each phase should be atomic and verifiable.>

## Output Format  (only if skill produces a structured artifact)

<Exact template with placeholder markers>

## Report

After completing the skill's work, output a summary of what was produced, where it lives, and how to use it.
```

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

---

## Phase 4 — Write and Verify

1. Create the directory (name must match frontmatter `name`)
2. Write `SKILL.md` with the `Write` tool
3. Write any bundled scripts, references, or assets
4. Read it back with `Read` to confirm no corruption
5. Verify: frontmatter has `name` and `description`, name matches directory, no invalid tool names in body

---

## Phase 5 — Test and Iterate (optional but recommended)

Ask the user if they'd like to test the skill. Skills with objectively verifiable outputs benefit most. Skills with subjective outputs often don't need it.

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

### The improvement loop

When improving:
1. **Generalize from feedback.** Don't overfit to test examples.
2. **Read transcripts, not just outputs.** If the model wastes time, remove the instructions causing it.
3. **Look for repeated work.** If every run writes a similar script, bundle it so future invocations don't reinvent the wheel.
4. **Draft a revision, then review it fresh.**

After improving, rerun tests. Keep going until the user is happy or feedback is empty.

---

## Phase 6 — Optimize Description (optional)

After the skill is finalized, offer to optimize the description for better triggering. Create 15-20 eval queries — a mix of should-trigger and should-not-trigger:

**Should-trigger (8-10):** Different phrasings of the same intent — formal, casual, implicit. Include cases where the user doesn't name the skill but clearly needs it.

**Should-not-trigger (8-10):** Near-misses that share keywords but need something different. Don't make these obviously irrelevant — they should be genuinely tricky.

Make queries realistic and detailed — include file paths, personal context, casual speech. Not abstract requests.

Present to the user, then iteratively refine the description to maximize correct triggering while minimizing false positives.

---

## Report

After writing the skill, output:

```
Skill created: <name>
Path: <full path to SKILL.md>

Frontmatter:
  name: <value>
  description: <value>

Sections: <list of H2 headings>
Bundled resources: <list, or "none">

The skill is available immediately. Use /skill:<name> to invoke directly.
```
