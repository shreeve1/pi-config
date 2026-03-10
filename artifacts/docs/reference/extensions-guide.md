# Extensions Guide

Extensions let you customize Pi's behavior by adding new tools, commands, and integrations. They're TypeScript files that hook into Pi's lifecycle and provide custom capabilities.

## Loading Extensions

### Via Command Flag

```bash
pi --extension /path/to/extension.ts
```

Example:
```bash
pi --extension examples/extensions/permission-gate.ts
```

### Auto-Discovery

Copy extensions to the auto-load directory:
```bash
cp my-extension.ts ~/.pi/agent/extensions/
```

Extensions in this directory are automatically loaded every time you start Pi.

## Extension Categories

### Safety & Lifecycle Extensions

These extensions protect your system and manage critical operations:

**Permission Gate** (`permission-gate.ts`)
- Prompts for confirmation before dangerous bash commands
- Protects against: `rm -rf`, `sudo`, and other destructive operations
- Usage: Ensures you review and approve risky commands

**Protected Paths** (`protected-paths.ts`)
- Blocks writes to sensitive directories
- Prevents overwrites to: `.env`, `.git/`, `.gitignore`, and other critical files
- Ensures you don't accidentally commit secrets or corrupt important configs

### Custom Tools

Build domain-specific capabilities tailored to your workflow:

**Todo List** (`todo.ts`)
- Adds a persistent todo tracking tool
- Maintains state across sessions
- Example of a stateful custom tool

**SSH Integration** (`ssh.ts`)
- Delegates all operations to remote machines
- Enables remote development workflows
- Shows how to redirect execution context

### Commands & UI Extensions

Enhance the user interface and add interactive features:

**Preset Configurations** (`preset.ts`)
- Create named model configurations
- Switch between different AI provider setups
- Enables quick model/provider switching

**Tools Toggle** (`tools.ts`)
- Enable/disable capabilities dynamically
- Control which tools are available in your session
- Useful for focusing on specific tasks

**Games** (`snake.ts`)
- Example of custom rendering
- Shows how to implement interactive UI features
- Demonstrates extending Pi beyond code tasks

### System Integration

Connect Pi to your OS and development environment:

**macOS Theme Sync** (`mac-system-theme.ts`)
- Automatically sync Pi's theme with OS dark/light mode
- Adapts interface based on system preferences
- Platform-specific customization example

**Git Checkpoint** (`git-checkpoint.ts`)
- Create git stashes at each conversation turn
- Build an automatic backup trail of your work
- Shows Git integration patterns

### Custom Providers

Implement support for alternative AI services:

**OAuth Support** (`oauth-provider.ts`)
- Implement authentication flows
- Connect to services requiring API authentication
- Pattern for securing external service access

**Provider Implementation** (Qwen, GitLab Duo examples)
- Add custom AI providers beyond built-in support
- Implement streaming and API compatibility
- Shows provider abstraction patterns

## Extension Patterns

### Use StringEnum for Parameters

When building custom tools with string parameters, use TypeScript's `enum` for compatibility:

```typescript
enum MyTool {
  Option1 = 'option1',
  Option2 = 'option2',
}

// This ensures compatibility across different API implementations
```

## Common Use Cases

### Add a Custom Tool

Create a new capability that Pi doesn't have built-in:
1. Write a TypeScript extension
2. Implement the tool interface
3. Load via `--extension` flag or auto-discovery
4. AI model can now use your tool

### Protect Sensitive Operations

Add security gates for destructive commands:
1. Hook into bash execution
2. Check against dangerous patterns
3. Prompt for confirmation or block outright
4. Prevents accidental data loss

### Create Development Workflows

Build extensions that streamline your specific workflow:
1. Add custom commands for common tasks
2. Integrate with your tools and services
3. Create prompt templates for recurring patterns
4. Package as a shareable Pi Package for your team

## Sharing Extensions

### As a Pi Package

Distribute your extension and related tools:
1. Create an npm package with your extension
2. Include documentation on setup and usage
3. Other developers can install via npm
4. Share via package.json dependency

### Via Git

Share extensions directly:
1. Commit to a git repository
2. Others can clone and use the extension path
3. Enables collaborative extension development

## Next Steps

- Review example extensions in `examples/extensions/` for patterns
- Start with a simple extension that adds a custom tool
- Use the permission gate and protected paths extensions for safety
- Share useful extensions with your team or the community
