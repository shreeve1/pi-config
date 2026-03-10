# Ask User Extension - Quick Start

> Interactive question tool for Pi - Ask users questions during conversations

---

## 🚀 Quick Start

### Installation

Already installed at:
```
~/.pi/agent/extensions/ask-user.ts
```

Pi auto-loads it. Just restart Pi or use `/reload`.

### Basic Usage

In Pi, prompt the LLM:
```
Please ask me which environment to deploy to: dev, staging, or prod
```

The LLM will call `ask_user` tool and you'll see an interactive dialog.

---

## 📋 Question Types

| Type | Use Case | Example |
|------|----------|---------|
| **input** | Single-line text | "What's the API key?" |
| **confirm** | Yes/No decision | "Delete this file?" |
| **select** | Multiple choice | "Choose environment: dev, staging, prod" |
| **editor** | Multi-line text | "Enter your config JSON" |

---

## 📖 Documentation

- **Full User Guide:** [`ask-user-extension.md`](ask-user-extension.md)
- **Test Prompts:** [`ask-user-test-prompts.md`](ask-user-test-prompts.md)
- **Implementation Summary:** [`ask-user-implementation-summary.md`](ask-user-implementation-summary.md)

---

## 💡 Examples

### Simple Question
```
Ask me for the server port number with a default of 3000
```

### Confirmation
```
I'm about to delete all temp files. Please confirm this first.
```

### Multiple Choice
```
Ask me which database to use: PostgreSQL, MySQL, or MongoDB
```

### Long Form
```
I need a detailed description of the feature. Open an editor for me.
```

---

## ⚠️ Troubleshooting

**Extension not loading?**
```bash
ls -la ~/.pi/agent/extensions/ask-user.ts
/reload
```

**Tool not working?**
- Make sure you're in interactive mode (not `-p` flag)
- Check Pi's system prompt includes `ask_user`
- Try a simple test: "Ask me for my name"

**See errors?**
- Check extension syntax (should load without errors)
- Verify Pi version is current
- Review full documentation

---

## 🎯 When to Use

**✅ Use ask_user when:**
- You need user input to proceed
- Multiple valid options exist
- Confirming a destructive action
- Gathering detailed specifications

**❌ Don't use when:**
- Answer is obvious from context
- Just explaining what you're doing
- Asking rhetorical questions

---

## 🔧 For Developers

### Reading Q&A History

```typescript
// In your extension
pi.on("session_start", (_event, ctx) => {
  const entries = ctx.sessionManager.getEntries();
  
  for (const entry of entries) {
    if (entry.message?.toolName === "ask_user") {
      const details = entry.message.details;
      // Access question, answer, type, etc.
    }
  }
});
```

### QuestionDetails Interface

```typescript
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

## 📊 Status

**Version:** 1.0.0  
**Status:** ✅ Production Ready  
**Last Updated:** February 24, 2026

**Implemented:**
- ✅ All 4 question types
- ✅ Timeout support
- ✅ Custom rendering
- ✅ State persistence
- ✅ Full documentation

**Not Implemented (Optional):**
- ⏸️ Multi-question wizards
- ⏸️ Input validation
- ⏸️ Unit tests

---

## 🤝 Support

For questions or issues:
1. Check [Full Documentation](ask-user-extension.md)
2. Try [Test Prompts](ask-user-test-prompts.md)
3. Review Pi extension docs
4. File issue in your project tracker

---

## 📝 License

Follows Pi's license terms.

---

**Made with ❤️ for Pi**
