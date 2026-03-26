#!/bin/bash
# Validate a pi skill directory structure
# Usage: ./validate-skill.sh <skill-directory>

set -e

SKILL_DIR="$(cd "${1:-.}" && pwd)"

if [ ! -d "$SKILL_DIR" ]; then
    echo "❌ Directory does not exist: $SKILL_DIR"
    exit 1
fi

SKILL_FILE="$SKILL_DIR/SKILL.md"

if [ ! -f "$SKILL_FILE" ]; then
    echo "❌ SKILL.md not found in $SKILL_DIR"
    exit 1
fi

echo "Validating: $SKILL_DIR"
echo ""

ERRORS=0

# --- Frontmatter checks ---

NAME=$(grep '^name:' "$SKILL_FILE" | head -1 | sed 's/name: *//')
if [ -z "$NAME" ]; then
    echo "❌ Frontmatter missing 'name' field"
    ERRORS=$((ERRORS + 1))
else
    echo "✓ name: $NAME"
fi

DESC=$(grep '^description:' "$SKILL_FILE" | head -1)
if [ -z "$DESC" ]; then
    echo "❌ Frontmatter missing 'description' field"
    ERRORS=$((ERRORS + 1))
else
    echo "✓ description: present"
fi

# Name matches directory
DIR_NAME=$(basename "$SKILL_DIR")
if [ -n "$NAME" ] && [ "$NAME" != "$DIR_NAME" ]; then
    echo "❌ name '$NAME' does not match directory '$DIR_NAME'"
    ERRORS=$((ERRORS + 1))
else
    echo "✓ name matches directory"
fi

# Name format
if [ -n "$NAME" ] && ! echo "$NAME" | grep -qE '^[a-z0-9-]+$'; then
    echo "❌ name must be lowercase with hyphens only (a-z, 0-9, -)"
    ERRORS=$((ERRORS + 1))
else
    echo "✓ name format valid"
fi

# Name length
if [ -n "$NAME" ] && [ ${#NAME} -gt 64 ]; then
    echo "❌ name exceeds 64 characters (${#NAME})"
    ERRORS=$((ERRORS + 1))
fi

# Description length
DESC_TEXT=$(grep '^description:' "$SKILL_FILE" | head -1 | sed 's/description: *//')
if [ -n "$DESC_TEXT" ] && [ ${#DESC_TEXT} -gt 1024 ]; then
    echo "⚠️  description is long (${#DESC_TEXT} chars, max 1024)"
fi

echo ""

# --- Structure checks ---

# Count phases
PHASE_COUNT=$(awk 'BEGIN{in_code=0; c=0} /^```/{in_code=!in_code; next} !in_code && /^## Phase [0-9]+/{c++} END{print c}' "$SKILL_FILE")
echo "✓ phases: $PHASE_COUNT"

if [ "$PHASE_COUNT" -eq 0 ]; then
    echo "⚠️  No phases found — skill may lack structure"
fi

if [ "$PHASE_COUNT" -gt 6 ]; then
    echo "⚠️  $PHASE_COUNT phases is a lot — consider whether some can merge"
fi

# Check for invalid tool names (look for backtick-wrapped tool calls, not prose words)
INVALID_TOOLS=$(grep -oE '`(ask|fetch|task|lsp|notebook|puppeteer|EnterPlanMode)`' "$SKILL_FILE" | tr -d '`' || true)
if [ -n "$INVALID_TOOLS" ]; then
    echo "⚠️  Potentially invalid tool names: $INVALID_TOOLS"
else
    echo "✓ no invalid tool names detected"
fi

# Line count
LINE_COUNT=$(wc -l < "$SKILL_FILE" | tr -d ' ')
echo "✓ lines: $LINE_COUNT"
if [ "$LINE_COUNT" -gt 300 ]; then
    echo "⚠️  Over 300 lines — consider moving detail to references/"
fi

echo ""

# --- Summary ---

if [ "$ERRORS" -gt 0 ]; then
    echo "❌ Validation failed with $ERRORS error(s)"
    exit 1
fi

echo "✅ Skill looks good: $SKILL_DIR"
echo "   $LINE_COUNT lines, $PHASE_COUNT phases"

# List bundled resources if any
SCRIPTS=$(find "$SKILL_DIR/scripts" -type f 2>/dev/null | wc -l | tr -d ' ')
REFS=$(find "$SKILL_DIR/references" -type f 2>/dev/null | wc -l | tr -d ' ')
ASSETS=$(find "$SKILL_DIR/assets" -type f 2>/dev/null | wc -l | tr -d ' ')
if [ "$SCRIPTS" -gt 0 ] || [ "$REFS" -gt 0 ] || [ "$ASSETS" -gt 0 ]; then
    echo "   Resources: ${SCRIPTS} scripts, ${REFS} references, ${ASSETS} assets"
fi
