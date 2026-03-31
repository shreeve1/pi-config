# Team Knowledge Base

## Project Conventions
- All source code is in `src/`
- Tests are co-located in `__tests__/` directories
- Configuration files live at project root
- Use TypeScript strict mode

## Architecture Patterns
- Extensions are TypeScript files interpreted by Pi runtime
- Agent definitions use YAML frontmatter + markdown body
- Team configuration is folder-based under `agents/teams/{team}/`
- Session notes are JSONL, expertise files are markdown
