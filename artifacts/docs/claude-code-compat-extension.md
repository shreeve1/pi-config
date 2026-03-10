# Claude Code Compatibility Extension

A compatibility layer that allows skills and commands written for Claude Code to work seamlessly in Pi.

---

## Overview

Many skills (like `/interview`, `/brain-dump`, `/dev-workflow`) reference Claude Code tools that don't exist in Pi. This extension provides "shim" implementations that translate those tool calls to Pi equivalents.

**Currently Supported:**
- `AskUserQuestion` → Translates to `ask_user` tool

---

## Installation

Already installed at:
```
~/.pi/agent/extensions/claude-code-compat.ts
```

Pi automatically loads it. Just restart Pi or use `/reload`.

---

## How It Works

### AskUserQuestion Translation

When a skill calls `AskUserQuestion`:

```javascript
AskUserQuestion({
  question: "Which environment?",
  options: ["Development", "Staging", "Production"]
})
```

The compatibility layer:
1. Detects if `options` are provided
2. If **yes**: Maps to `ask_user` with type `"select"`
3. If **no**: Maps to `ask_user` with type `"input"`
4. Returns response in Claude Code format

### Translation Rules

| Claude Code | Pi Translation |
|-------------|----------------|
| `AskUserQuestion({ question, options })` | `ask_user({ question, type: "select", options })` |
| `AskUserQuestion({ question })` | `ask_user({ question, type: "input" })` |

---

## Supported Skills

These skills now work in Pi without modification:

✅ **interview** - Interviews you about project plans  
✅ **brain-dump** - Quick task capture workflow  
✅ **dev-workflow** - Development workflow commands  

And any other skills that use `AskUserQuestion`.

---

## Example Usage

### Before (Claude Code)

```
/interview
```

Claude Code would use `AskUserQuestion` tool to ask interview questions.

### After (Pi with Compat Layer)

```
/interview
```

Same command, same experience! The compatibility layer automatically translates `AskUserQuestion` calls to `ask_user`.

---

## Limitations

**What's Translated:**
- ✅ Question text
- ✅ Multiple choice options
- ✅ Free-form text input
- ✅ Cancellation handling

**What's NOT Supported (yet):**
- ❌ Confirm-only questions (use options workaround)
- ❌ Multi-line editor (always single-line)
- ❌ Timeout parameter (not in Claude Code API)
- ❌ Default values (not in Claude Code API)

**Workarounds:**

For confirm-style questions:
```javascript
// Claude Code pattern
AskUserQuestion({
  question: "Proceed with deployment?",
  options: ["Yes", "No"]
})
```

For multi-line input:
```javascript
// Use ask_user directly
ask_user({
  question: "Enter detailed config:",
  type: "editor"
})
```

---

## Response Format

### Original Claude Code Format

```javascript
{
  content: [{ type: "text", text: "User answered: Yes" }],
  details: {
    question: "Proceed with deployment?",
    answer: "Yes",
    cancelled: false
  }
}
```

This is preserved by the compatibility layer, so skills see exactly what they expect.

---

## For Skill Developers

### Using in Skills

No changes needed! Just reference `AskUserQuestion` as you would in Claude Code:

```markdown
Use AskUserQuestion:
- Question: "Which database to use?"
- Options: ["PostgreSQL", "MySQL", "MongoDB"]
```

The LLM will call `AskUserQuestion` and it will "just work" in Pi.

### Migrating to Native Pi

If you want to use Pi's enhanced features (editor, confirm, timeout), update your skill to use `ask_user` directly:

**Old (Claude Code style):**
```javascript
AskUserQuestion({
  question: "Enter API key:",
  options: []  // Empty options = text input
})
```

**New (Pi native):**
```javascript
ask_user({
  question: "Enter API key:",
  type: "input",
  timeout: 30000  // 30 seconds
})
```

---

## Technical Details

### Extension Implementation

```typescript
pi.registerTool({
  name: "AskUserQuestion",
  execute: async (toolCallId, params, signal, onUpdate, ctx) => {
    const hasOptions = params.options?.length > 0;
    
    if (hasOptions) {
      // Use select dialog
      const answer = await ctx.ui.select(params.question, params.options);
      // ... return in Claude Code format
    } else {
      // Use input dialog
      const answer = await ctx.ui.input(params.question, "Type your answer...");
      // ... return in Claude Code format
    }
  }
});
```

### Why a Compatibility Layer?

**Benefits:**
1. **No Skill Modifications** - Existing skills work immediately
2. **Gradual Migration** - Can migrate to native `ask_user` over time
3. **Backward Compatibility** - Skills work in both environments
4. **Reduced Friction** - Users don't need to rewrite skills

**Tradeoffs:**
- Extra layer of indirection
- Can't use advanced Pi features through compat layer
- Slight overhead (negligible)

---

## Troubleshooting

### Skill Still References Missing Tools

**Symptom:** Skill says "Tool not found: SomeOtherTool"

**Solution:** This compat layer only handles `AskUserQuestion`. If a skill uses other Claude Code-specific tools, they'll need separate shims or migration.

### Questions Look Different

**Symptom:** Dialog appearance differs from Claude Code

**Solution:** This is expected. Pi uses its own TUI components. Behavior is the same, styling may differ.

### Can't Use Advanced Features

**Symptom:** Want to use `type: "editor"` but `AskUserQuestion` doesn't support it

**Solution:** Use `ask_user` directly for advanced features:
```javascript
ask_user({
  question: "Enter config:",
  type: "editor",
  defaultValue: "..."
})
```

---

## Future Enhancements

Potential additions to the compatibility layer:

- [ ] Support more Claude Code tools
- [ ] Auto-detect confirm questions (Yes/No options)
- [ ] Map to `ask_user` editor for long questions
- [ ] Support additional response metadata

---

## Related Extensions

- **ask-user** - Native Pi question tool (more features)
- **plan-mode** - Plan/execute workflow

---

## Status

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Supported Tools:** `AskUserQuestion`

---

## Example: Interview Skill

The `/interview` skill now works in Pi:

```
User: /interview

Pi: I'll interview you about your project.

[Uses AskUserQuestion internally]
→ Translated to ask_user
→ Dialog appears in Pi
→ User answers
→ Interview continues

All happens transparently!
```

---

## Contributing

To add support for more Claude Code tools:

1. Identify the tool's API (parameters, response format)
2. Find the Pi equivalent (or create new tool)
3. Add translation logic in this extension
4. Update documentation

---

## License

Follows Pi's license terms.

---

**Making Claude Code skills work in Pi, transparently.** 🔌
