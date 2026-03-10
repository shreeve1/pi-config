# Pi Coding Agent Overview

Pi is a minimal, extensible terminal-based coding harness designed to work with AI models like Claude. It serves as a bridge between developers and large language models, enabling interactive code generation, editing, and problem-solving through a command-line interface.

## Core Concepts

### Interactive Mode

Pi provides a full-featured terminal UI with:
- Message history with full conversation context
- Built-in editor with file completion
- Real-time collaboration with AI models
- Support for multiple AI providers (Claude, OpenAI, Google Gemini, GitHub Copilot, and others)

### Session Management

Conversations are stored as persistent JSONL files with built-in features:
- **Session History**: Every interaction is logged and can be reviewed
- **Branching**: Fork conversations and explore different directions
- **Navigation**: Jump back to previous points in your conversation tree
- **Recovery**: Restore sessions from saved files

### Philosophy: Extensibility Over Features

Rather than shipping with pre-built features, Pi emphasizes customization:
- **TypeScript Extensions**: Build custom tools, commands, and capabilities
- **Skills**: Reusable capability packages following Agent Skills standards
- **Prompt Templates**: Create recurring workflows with custom prompts
- **Custom Themes**: Adapt the visual interface to your preferences
- **Pi Packages**: Share extensions via npm or git

This approach means you adapt the tool to your workflow, not the other way around.

## What Pi Is NOT

Pi deliberately avoids these features:
- MCP (Model Context Protocol) - build via extensions if needed
- Sub-agents - implement custom coordination via extensions
- Permission popups - handle via security extensions instead

## Getting Help

When you need help with the tool:
- Check `/help` for built-in command documentation
- Run `/prime` to load project context from documentation and codebase
- Create extensions to customize behavior for your specific needs
- Build skills to package reusable capabilities
