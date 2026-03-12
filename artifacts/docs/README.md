# Pi Coding Agent Documentation

Documentation for pi-mono's coding-agent package — a minimal, extensible terminal-based coding harness for AI-assisted development.

## Getting Started

- [Overview](getting-started/overview.md) — Understand Pi's core concepts, philosophy, and what it's designed for

## Guides

- [Adding LSP Extensions](guides/adding-lsp-extensions.md) — Build pi extensions that integrate Language Server Protocol servers for any language

## Reference

- [Extensions Guide](reference/extensions-guide.md) — Learn how to build, load, and use custom extensions to extend Pi's capabilities
- [Background Tasks Extension](reference/background-tasks-extension.md) — Run long-running commands (dev servers, log watchers) in a non-blocking widget with pause/resume controls
- [Web Fetch Tool](reference/web-fetch-tool.md) — Fetch URLs and receive clean, LLM-suitable content: HTML-to-text stripping, JSON pretty-printing, automatic truncation
- [Skills](reference/skills.md) — Self-contained capability packages: structure, frontmatter, discovery locations, and skill repositories
- [Auto-Delegate Extension](reference/auto-delegate-extension.md) — Automatic routing of prompts to subagents based on detected intent signals
- [Cron Scheduled Prompts Extension](reference/cron-scheduled-prompts-extension.md) — Technical spec for durable prompt-based scheduled tasks using a minute-tick scheduler and fresh pi runs
