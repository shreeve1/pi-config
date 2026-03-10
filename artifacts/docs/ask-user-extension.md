# Ask User Extension for Pi

An interactive question tool that enables the LLM to ask users questions during conversations, similar to Claude Code's `askUserQuestion` functionality.

---

## Overview

The `ask_user` extension provides four question interaction patterns:
- **input**: Single-line text input
- **confirm**: Yes/No confirmation dialogs
- **select**: Multiple-choice selection
- **editor**: Multi-line text editor

---

## Installation

The extension is already installed at:
```
~/.pi/agent/extensions/ask-user.ts
```

Pi automatically loads extensions from this directory. To verify it's loaded, check the system prompt or available tools in your Pi session.

---

## Usage

### For LLM (When to Use)

Use `ask_user` when you need:
- ✅ Clarification on ambiguous requirements
- ✅ User preferences or choices
- ✅ Confirmation before destructive actions
- ✅ Detailed multi-line input (config, specs, etc.)

Do NOT use for:
- ❌ Simple acknowledgments ("ok", "got it")
- ❌ When the context already provides the answer
- ❌ Rhetorical questions or explanations

---

## Tool Parameters

### Required Parameters

**`question`** (string)
- The question to ask the user
- Be clear and specific
- Example: "What port should the server listen on?"

**`type`** (enum: "input" | "confirm" | "select" | "editor")
- Type of interaction
- Choose based on expected answer format

### Optional Parameters

**`options`** (string[])
- **Required when `type: "select"`**
- List of choices for user to select from
- Example: `["Development", "Staging", "Production"]`

**`defaultValue`** (string)
- Placeholder or pre-filled text
- Used for `input` and `editor` types
- Example: `"localhost:3000"`

**`timeout`** (number)
- Auto-dismiss timeout in milliseconds
- Must be positive
- Example: `5000` (5 seconds)
- Defaults to no timeout

---

## Examples

### Example 1: Simple Text Input

**LLM Prompt:**
```
I need to know the API endpoint before proceeding.
```

**Tool Call:**
```json
{
  "question": "What is the API endpoint URL?",
  "type": "input",
  "defaultValue": "https://api.example.com"
}
```

**User Experience:**
```
┌─────────────────────────────────────────┐
│ What is the API endpoint URL?           │
│ > https://api.example.com_              │
└─────────────────────────────────────────┘
```

**Result:**
```json
{
  "question": "What is the API endpoint URL?",
  "type": "input",
  "answer": "https://api.production.com",
  "cancelled": false
}
```

---

### Example 2: Confirmation Dialog

**LLM Prompt:**
```
This operation will delete all data in the test database. I should confirm first.
```

**Tool Call:**
```json
{
  "question": "Delete all test database data? This cannot be undone.",
  "type": "confirm"
}
```

**User Experience:**
```
┌─────────────────────────────────────────┐
│ Confirmation                            │
│                                         │
│ Delete all test database data?          │
│ This cannot be undone.                  │
│                                         │
│ [ Yes ]  [ No ]                         │
└─────────────────────────────────────────┘
```

**Result:**
```json
{
  "question": "Delete all test database data? This cannot be undone.",
  "type": "confirm",
  "answer": true,
  "cancelled": false
}
```

---

### Example 3: Multiple Choice Selection

**LLM Prompt:**
```
The user needs to choose which environment to deploy to.
```

**Tool Call:**
```json
{
  "question": "Which environment should I deploy to?",
  "type": "select",
  "options": ["Development", "Staging", "Production"]
}
```

**User Experience:**
```
┌─────────────────────────────────────────┐
│ Which environment should I deploy to?   │
│                                         │
│ > 1. Development                        │
│   2. Staging                            │
│   3. Production                         │
│                                         │
│ ↑↓ navigate • Enter select • Esc cancel│
└─────────────────────────────────────────┘
```

**Result:**
```json
{
  "question": "Which environment should I deploy to?",
  "type": "select",
  "answer": "Production",
  "cancelled": false,
  "options": ["Development", "Staging", "Production"],
  "selectedIndex": 3
}
```

---

### Example 4: Multi-line Editor

**LLM Prompt:**
```
I need the user to provide their custom configuration settings.
```

**Tool Call:**
```json
{
  "question": "Enter your custom API configuration (JSON format):",
  "type": "editor",
  "defaultValue": "{\n  \"timeout\": 5000,\n  \"retries\": 3\n}"
}
```

**User Experience:**
```
┌─────────────────────────────────────────┐
│ Enter your custom API configuration:    │
│ (JSON format)                           │
│                                         │
│ {                                       │
│   "timeout": 10000,                     │
│   "retries": 5,                         │
│   "cache": true                         │
│ }                                       │
│                                         │
│ Ctrl+S save • Esc cancel                │
└─────────────────────────────────────────┘
```

**Result:**
```json
{
  "question": "Enter your custom API configuration (JSON format):",
  "type": "editor",
  "answer": "{\n  \"timeout\": 10000,\n  \"retries\": 5,\n  \"cache\": true\n}",
  "cancelled": false
}
```

---

### Example 5: Timeout Usage

**Tool Call:**
```json
{
  "question": "Proceed with deployment?",
  "type": "confirm",
  "timeout": 10000
}
```

**User Experience:**
```
┌─────────────────────────────────────────┐
│ Confirmation (10s)                      │
│                                         │
│ Proceed with deployment?                │
│                                         │
│ [ Yes ]  [ No ]                         │
│                                         │
│ Auto-cancel in 8 seconds...             │
└─────────────────────────────────────────┘
```

If timeout expires, returns `cancelled: true` with `timedOut: true`.

---

## Best Practices for LLM Prompts

### ✅ Good Question Patterns

**Clear and Specific:**
```
"What port should the development server listen on?"
```
Not: "Port?"

**Actionable:**
```
"Which files should I include in the backup?"
```
Not: "What do you think about these files?"

**Appropriate Type:**
- Use `confirm` for yes/no decisions
- Use `select` when options are known and limited
- Use `input` for short text (names, URLs, paths)
- Use `editor` for multi-line content (code, config, specs)

### ❌ Poor Question Patterns

**Too Vague:**
```
"What do you want?"
```

**Already Answered:**
```
// User just said: "Deploy to staging"
"Which environment should I deploy to?"
```

**Not Actually a Question:**
```
"I'm going to proceed with the migration now."
// This is a statement, use confirm: "Proceed with migration?"
```

---

## Response Format

### Success Response

```typescript
{
  content: [{ type: "text", text: "User answered: <answer>" }],
  details: {
    question: string,
    type: "input" | "confirm" | "select" | "editor",
    answer: string | boolean | null,
    cancelled: false,
    options?: string[],        // For select type
    selectedIndex?: number     // For select type (1-indexed)
  }
}
```

### Cancelled/Timeout Response

```typescript
{
  content: [{ type: "text", text: "User cancelled or timed out" }],
  details: {
    question: string,
    type: "input" | "confirm" | "select" | "editor",
    answer: null,
    cancelled: true,
    timedOut?: true,           // Present if timeout occurred
    options?: string[]         // For select type
  }
}
```

### Error Response

```typescript
{
  content: [{ type: "text", text: "Error: <message>" }],
  details: {
    question: string,
    type: "input" | "confirm" | "select" | "editor",
    answer: null,
    cancelled: true
  }
}
```

---

## Integration with Other Extensions

Other extensions can read question history from the session:

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function myExtension(pi: ExtensionAPI) {
  pi.on("session_start", (_event, ctx) => {
    // Read all ask_user tool results from session history
    const entries = ctx.sessionManager.getEntries();
    
    for (const entry of entries) {
      if (entry.type === "message" && entry.message.role === "toolResult") {
        if (entry.message.toolName === "ask_user") {
          const details = entry.message.details as QuestionDetails;
          console.log(`Question: ${details.question}`);
          console.log(`Answer: ${details.answer}`);
        }
      }
    }
  });
}

interface QuestionDetails {
  question: string;
  type: "input" | "confirm" | "select" | "editor";
  answer: string | boolean | null;
  cancelled: boolean;
  timedOut?: boolean;
  options?: string[];
  selectedIndex?: number;
}
```

---

## Known Limitations

1. **No concurrent questions:** Only one question can be active at a time
2. **Timeout pause:** Timeouts count down only when dialog is visible (paused during other tool execution)
3. **RPC mode:** In RPC mode, dialogs delegate to host (not tested yet)
4. **No validation:** Input fields don't have built-in validation (LLM should validate responses)
5. **No multi-question forms:** Each tool call is a single question (use multiple calls for wizard patterns)

---

## Troubleshooting

### Extension Not Loading

**Check Pi's extensions directory:**
```bash
ls -la ~/.pi/agent/extensions/ask-user.ts
```

**Check for syntax errors:**
```bash
# Extension should appear in startup log
pi --help | grep extensions
```

### Tool Not Appearing in System Prompt

**Restart Pi or reload extensions:**
```
/reload
```

**Check if tool is registered:**
Use the `all_tools` command if available.

### "UI not available" Error

**Cause:** Running in print mode (`-p`) or JSON mode.

**Solution:** Use Pi in interactive mode for `ask_user` tool.

### Timeout Not Working

**Cause:** Pi's built-in dialogs handle timeouts automatically.

**Solution:** Ensure you're passing a positive number in milliseconds:
```json
{ "timeout": 5000 }  // 5 seconds
```

### Select Type Missing Options

**Error:** "Error: 'select' type requires an 'options' array"

**Solution:** Always provide options array for select type:
```json
{
  "type": "select",
  "options": ["Option 1", "Option 2", "Option 3"]
}
```

---

## Future Enhancements

Potential features for future versions:

1. **Multi-question wizards** - Sequential related questions
2. **Input validation** - Regex or custom validation functions
3. **Rich formatting** - Markdown rendering in questions
4. **File picker** - Browse and select files/directories
5. **Progress indicators** - Show progress during long operations
6. **Custom themes** - Per-question styling
7. **History search** - Search previous Q&A pairs
8. **Templates** - Reusable question templates

---

## Support

For issues or feature requests:
- Check Pi documentation: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/`
- Review extension examples: `/opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/examples/extensions/`
- File issues in your project's issue tracker

---

## License

This extension follows Pi's license terms. See Pi documentation for details.
