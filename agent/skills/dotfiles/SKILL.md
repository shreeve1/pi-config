---
name: dotfiles
description: "Set up and link dotfiles between a live home directory and ~/dotfiles. Use when the user wants to add a new config file or folder to their dotfiles repo, create or repair symlinks, bootstrap a config into ~/dotfiles, or map files from inside ~/dotfiles back to their target locations such as ~/.config/..., ~/.zshrc, or other home-directory paths."
---

# Dotfiles

Use this skill when a user wants help managing a dotfiles repository centered on `~/dotfiles` — moving a real config into the repo and symlinking it back, creating the matching symlink from inside `~/dotfiles`, or repairing broken links. Do not use it for generic file management unrelated to dotfiles syncing.

---

## When to Use

- The user says "add this config to dotfiles", "track this in ~/dotfiles", or "symlink this config"
- The user is working with shell rc files, app config folders, or files under `~/.config/`
- The user is inside `~/dotfiles` and wants to wire a repo path to its live destination
- The user wants to bootstrap a new file or directory in the dotfiles repo and install the symlink in one flow
- The user wants to repair a broken symlink or understand what target path should be linked

## Key Principles

- **Preserve user data first.** If a destination already exists as a real file or directory, move it into `~/dotfiles` or rename it to a `-bak` backup before linking. If that backup name exists, increment: `config-bak-2`, `config-bak-3`, etc.
- **Prefer inference over interruption.** Derive common target paths like `~/.config/<name>` or `~/.<name>` when the mapping is obvious. Only use `ask_user` when the destination genuinely can't be inferred.
- **Keep repo layout predictable.** Mirror the live filesystem shape inside `~/dotfiles` when practical — e.g. `~/dotfiles/.config/ghostty/config` for `~/.config/ghostty/config`.
- **Show the exact source and target paths** before or while performing the link so the user can see the mapping.
- **Avoid destructive replacement.** Never delete an existing non-symlink path unless the user explicitly asks.

---

## Workflow

### 1. Identify the Starting Point

Determine which case applies:

1. A live file or folder exists outside `~/dotfiles` and should be brought under dotfiles management
2. The user is already in `~/dotfiles` and wants to create the symlink to the live location
3. A symlink exists but is broken or points to the wrong target

Inspect the relevant paths with `Read` or `Bash` (using `ls -la`, `file`, `readlink`) first — don't guess blindly.

Use `Bash` with `find` or `ls` to locate candidate config files when you need to discover what exists.

### 2. Infer the Repo Path and Target Path

Use these defaults unless the repo already follows a different convention:

| Live path | Repo path |
|---|---|
| `~/.config/<app>/...` | `~/dotfiles/.config/<app>/...` |
| `~/.toolrc` | `~/dotfiles/.toolrc` |
| `~/.local/share/<app>/...` | `~/dotfiles/.local/share/<app>/...` (only when the user clearly wants it tracked) |

If the user is inside `~/dotfiles`, treat the repo-relative path as the source of truth and derive the live path by prefixing `~`.

If multiple targets are plausible and existing files don't disambiguate, use `ask_user` with one focused question and a recommended default.

### 3. Create Missing Parent Directories

Before moving or linking, ensure parent directories exist on both sides:

```bash
mkdir -p "$HOME/dotfiles/.config/ghostty"
mkdir -p "$HOME/.config/ghostty"
```

Use `Bash` with quoted absolute paths.

### 4. Move or Create the Managed File

**Adopting a live config into dotfiles:**

1. If the live path exists and is not a symlink → move it into the matching `~/dotfiles` location
2. If the live path doesn't exist → create the new file or directory directly inside `~/dotfiles`
3. If a symlink already exists and points correctly → leave it alone and report no change needed

**Linking a repo file outward:**

1. Confirm the repo file or folder exists, or create the requested starter file/folder in `~/dotfiles`
2. If the live target already exists as a non-symlink → rename it to `-bak` (incrementing `-bak-2`, `-bak-3`, etc. until unused)

### 5. Create the Symlink

Use `ln -s` for a new link. Use `ln -sfn` only when replacing an existing symlink that points somewhere else and replacement is clearly intended.

Common pattern:

```bash
mkdir -p "$HOME/.config/ghostty" && ln -s "$HOME/dotfiles/.config/ghostty/config" "$HOME/.config/ghostty/config"
```

For directories, link the directory itself rather than linking every child — unless the repo convention in that area is file-by-file.

### 6. Verify and Report

After linking, use `Bash` to verify:

```bash
ls -la "$HOME/.config/ghostty/config"
readlink "$HOME/.config/ghostty/config"
```

Then report:
- The repo-managed source path (canonical editable file in `~/dotfiles`)
- The live target path
- Any `-bak` backups created

---

## Common Patterns

### Adopt an existing config into dotfiles

1. Inspect `~/.config/app` or the target file with `Read` or `Bash`
2. Create `~/dotfiles/.config/app` if needed
3. Move the real file into `~/dotfiles`
4. Symlink the live path back to the repo copy

### Create a brand-new managed config

1. Create the file or folder under `~/dotfiles`
2. Create the live parent directories
3. Symlink the live path to the repo path

### Link from inside `~/dotfiles`

1. Treat the current repo path as the source
2. Derive the destination under `~`
3. Rename any conflicting live path to `-bak` (incrementing if needed)
4. Create the symlink

---

## Guardrails

- Never remove a real file or directory at the live target without either moving it into `~/dotfiles` or backing it up first.
- Don't assume every file under `~/.local` belongs in dotfiles — many are machine-specific state.
- Don't rewrite the user's broader dotfiles structure if an existing convention is already visible.
- Don't use `rm -rf` to clear conflicts unless the user explicitly asks.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `ln: File exists` | Inspect the destination. If it's a real file, rename to `-bak` first (incrementing if needed). If it's a symlink, verify whether it should be replaced. |
| Link points to the wrong file | Recreate the symlink with the correct absolute source path and verify after creation. |
| App ignores the symlinked config | Confirm the app reads that path and the repo layout matches the live layout the app expects. |
| Unsure whether to link a file or directory | Follow the repo's existing convention; otherwise prefer linking the whole directory when the app stores a cohesive config tree. |

---

## Report

After completing the task, output:

- The repo-managed source path
- The live target path
- Whether you moved, created, or backed up any files
- The exact symlink state after verification
