# Quick Start: Using Claude Code Skills in Pi

Your Claude Code skills (like `/interview`) now work in Pi! 🎉

---

## What Just Happened?

We created two extensions:

1. **ask-user.ts** - Native Pi question tool (full features)
2. **claude-code-compat.ts** - Translates Claude Code tools to Pi

---

## Try It Now

### Test 1: Simple Question

```
Ask me which framework I prefer: React, Vue, or Svelte
```

**Expected:** Selection dialog with 3 options

### Test 2: Interview Skill

```
/interview
```

**Expected:** Interview starts, asks questions using dialogs

### Test 3: Brain Dump

```
/brain-dump
```

**Expected:** Task capture workflow with questions

---

## What Skills Now Work?

Any skill that uses `AskUserQuestion` now works:

✅ `/interview` - Interview workflow  
✅ `/brain-dump` - Quick task capture  
✅ `/dev-workflow` - Development commands  
✅ Any custom skill using `AskUserQuestion`

---

## How It Works

```
Skill calls: AskUserQuestion({question, options})
       ↓
Compat layer intercepts
       ↓
Translates to: ask_user tool
       ↓
Pi shows dialog
       ↓
User answers
       ↓
Skill gets response (Claude Code format)
       ↓
Skill continues working
```

**Result:** Skills work without any modifications! 🚀

---

## Advanced Usage

### Native Pi Tool (More Features)

For new code, use `ask_user` directly:

```
Ask me for detailed config using the editor
```

LLM will call:
```json
{
  "question": "Enter detailed config:",
  "type": "editor",
  "timeout": 30000
}
```

### Question Types Available

| Type | When to Use | Example |
|------|-------------|---------|
| **input** | Short text | "What's the API key?" |
| **confirm** | Yes/No | "Delete this file?" |
| **select** | Multiple choice | "Choose: dev, staging, prod" |
| **editor** | Long text | "Enter full config JSON" |

---

## Troubleshooting

### Skill Not Working?

```bash
# 1. Check extensions are loaded
ls -la ~/.pi/agent/extensions/ask-user.ts
ls -la ~/.pi/agent/extensions/claude-code-compat.ts

# 2. Reload Pi
/reload

# 3. Try simple test
"Ask me a question"
```

### Dialog Not Appearing?

- Make sure you're in **interactive mode** (not `-p` flag)
- Check that skill actually calls `AskUserQuestion`
- Try restarting Pi

### Different Behavior Than Claude Code?

**Expected differences:**
- TUI styling (Pi's theme)
- Dialog layout (Pi's components)
- Keyboard shortcuts may differ

**Same behavior:**
- Question flow
- Answer capture
- Cancellation
- Response format

---

## What's Next?

1. **Try your skills** - Test `/interview`, `/brain-dump`, etc.
2. **Report issues** - Note any skills that don't work
3. **Explore ask_user** - Try advanced features (editor, timeout)
4. **Update documentation** - Document which skills work

---

## File Locations

```
~/.pi/agent/extensions/
├── ask-user.ts              ← Native Pi question tool
└── claude-code-compat.ts    ← Claude Code compatibility

artifacts/docs/
├── ask-user-extension.md              ← Full ask_user guide
├── claude-code-compat-extension.md    ← Compat layer guide
└── QUICKSTART-claude-code-skills.md   ← This file
```

---

## Example Session

```
You: /interview

Pi: I'll interview you about your project. First, let me read your 
    CLAUDE.md...

    [Reads context]

Pi: What aspect of your project would you like to focus on?
    
    [Dialog appears with options]
    1. Architecture
    2. Security
    3. Performance
    4. Testing

You: [Select "Architecture"]

Pi: Great! Let's dive into your architecture. How are you planning to 
    handle service discovery in your microservices architecture?

    [Text input dialog]

You: [Type answer]

Pi: Interesting. Have you considered...

    [Interview continues naturally]
```

---

## Summary

✅ **Two extensions installed**  
✅ **Claude Code skills now work**  
✅ **No skill modifications needed**  
✅ **Native Pi features available too**

**Just reload Pi and start using your skills!** 🎉

---

## Quick Commands

```bash
# Reload extensions
/reload

# Test a skill
/interview

# Try native ask_user
"Ask me for my name"

# Check loaded extensions
# (Extensions listed in system prompt)
```

---

## Need Help?

- **ask_user guide:** `artifacts/docs/ask-user-extension.md`
- **Compat layer guide:** `artifacts/docs/claude-code-compat-extension.md`
- **Test prompts:** `artifacts/docs/ask-user-test-prompts.md`

---

**Your Claude Code skills are now Pi-compatible!** 🔌
