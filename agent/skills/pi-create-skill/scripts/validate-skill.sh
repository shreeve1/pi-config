#!/bin/bash
# Validate a pi skill directory structure
# Usage: ./validate-skill.sh <skill-directory>

set -e

SKILL_DIR="${1:-.}"

if [ ! -d "$SKILL_DIR" ]; then
    echo "❌ Error: Directory does not exist: $SKILL_DIR"
    exit 1
fi

SKILL_FILE="$SKILL_DIR/SKILL.md"
RECIPE_FILE="$SKILL_DIR/recipe.yaml"

if [ ! -f "$SKILL_FILE" ]; then
    echo "❌ Error: SKILL.md not found in $SKILL_DIR"
    exit 1
fi

echo "Validating: $SKILL_DIR"
echo ""

# ============================================
# SKILL.md VALIDATION
# ============================================

echo "--- SKILL.md ---"

# Check frontmatter has name
NAME=$(grep '^name:' "$SKILL_FILE" | head -1 | sed 's/name: *//')
if [ -z "$NAME" ]; then
    echo "❌ FAIL: Frontmatter missing 'name' field"
    exit 1
fi
echo "✓ name: $NAME"

# Check frontmatter has description
DESC=$(grep '^description:' "$SKILL_FILE" | head -1)
if [ -z "$DESC" ]; then
    echo "❌ FAIL: Frontmatter missing 'description' field"
    exit 1
fi
echo "✓ description: present"

# Check name matches directory
DIR_NAME=$(basename "$SKILL_DIR")
if [ "$NAME" != "$DIR_NAME" ]; then
    echo "❌ FAIL: name '$NAME' does not match directory '$DIR_NAME'"
    exit 1
fi
echo "✓ name matches directory: $NAME"

# Check name format (lowercase, hyphens, alphanumeric)
if ! echo "$NAME" | grep -qE '^[a-z0-9-]+$'; then
    echo "❌ FAIL: name must be lowercase with hyphens only (a-z, 0-9, -)"
    exit 1
fi
echo "✓ name format valid"

# Check name length
if [ ${#NAME} -gt 64 ]; then
    echo "❌ FAIL: name exceeds 64 characters (${#NAME} chars)"
    exit 1
fi
echo "✓ name length: ${#NAME} chars"

# Check description length
DESC_LEN=$(grep '^description:' "$SKILL_FILE" | head -1 | sed 's/description: *//' | wc -c | tr -d ' ')
if [ "$DESC_LEN" -gt 1024 ]; then
    echo "❌ FAIL: description exceeds 1024 characters ($DESC_LEN chars)"
    exit 1
fi
echo "✓ description length: $DESC_LEN chars"

# Count phases (## Phase N — with em-dash, not templates with colon)
PHASE_COUNT=$(grep -cE '^## Phase [0-9]+ —' "$SKILL_FILE" || echo "0")
echo "✓ phases found: $PHASE_COUNT"

# Count phase completion markers
MARKER_COUNT=$(grep -cE '^\[Phase [0-9]+ COMPLETE\]' "$SKILL_FILE" || echo "0")
echo "✓ phase completion markers: $MARKER_COUNT"

# Count checkpoints
CHECKPOINT_COUNT=$(grep -cE '^\*\*Checkpoint' "$SKILL_FILE" || echo "0")
echo "✓ checkpoints: $CHECKPOINT_COUNT"

# Check for invalid tool names
INVALID_TOOLS=$(grep -oE '\b(ask|fetch|task|lsp|notebook|puppeteer|EnterPlanMode)\b' "$SKILL_FILE" || true)
if [ -n "$INVALID_TOOLS" ]; then
    echo "⚠️  WARNING: Potentially invalid tool names found: $INVALID_TOOLS"
    echo "   Check references/pi-skill-format.md for correct tool names"
else
    echo "✓ no invalid tool names detected"
fi

# Check line count
LINE_COUNT=$(wc -l < "$SKILL_FILE" | tr -d ' ')
if [ "$LINE_COUNT" -gt 500 ]; then
    echo "⚠️  WARNING: SKILL.md exceeds 500 lines ($LINE_COUNT lines). Consider moving detail to references/"
else
    echo "✓ line count: $LINE_COUNT"
fi

echo ""

# ============================================
# recipe.yaml VALIDATION
# ============================================

echo "--- recipe.yaml ---"

if [ ! -f "$RECIPE_FILE" ]; then
    echo "❌ FAIL: recipe.yaml not found in $SKILL_DIR"
    echo "   Every skill must have a recipe.yaml execution contract"
    exit 1
fi
echo "✓ recipe.yaml exists"

# Validate YAML syntax
if ! python3 -c "import yaml; yaml.safe_load(open('$RECIPE_FILE'))" 2>/dev/null; then
    echo "❌ FAIL: recipe.yaml has invalid YAML syntax"
    exit 1
fi
echo "✓ YAML syntax valid"

# Check version field
VERSION=$(grep '^version:' "$RECIPE_FILE" | head -1 | sed 's/version: *//' | tr -d '"')
if [ -z "$VERSION" ]; then
    echo "❌ FAIL: recipe.yaml missing 'version' field"
    exit 1
fi
echo "✓ version: $VERSION"

# Check title field
TITLE=$(grep '^title:' "$RECIPE_FILE" | head -1 | sed 's/title: *//' | tr -d '"')
if [ -z "$TITLE" ]; then
    echo "❌ FAIL: recipe.yaml missing 'title' field"
    exit 1
fi
echo "✓ title: $TITLE"

# Check description field
RECIPE_DESC=$(grep '^description:' "$RECIPE_FILE" | head -1 | sed 's/description: *//' | tr -d '"')
if [ -z "$RECIPE_DESC" ]; then
    echo "❌ FAIL: recipe.yaml missing 'description' field"
    exit 1
fi
echo "✓ description: present"

# Count workflow steps
STEP_COUNT=$(grep -cE '^\s+- step:' "$RECIPE_FILE" || echo "0")
echo "✓ workflow steps: $STEP_COUNT"

# Count parameters
PARAM_COUNT=$(grep -cE '^\s+- key:' "$RECIPE_FILE" || echo "0")
echo "✓ parameters: $PARAM_COUNT"

# Count outputs
OUTPUT_COUNT=$(grep -cE '^\s+- id:' "$RECIPE_FILE" || echo "0")
echo "✓ outputs: $OUTPUT_COUNT"

# Recipe line count
RECIPE_LINES=$(wc -l < "$RECIPE_FILE" | tr -d ' ')
if [ "$RECIPE_LINES" -gt 200 ]; then
    echo "⚠️  WARNING: recipe.yaml exceeds 200 lines ($RECIPE_LINES lines). Consider simplifying."
else
    echo "✓ recipe line count: $RECIPE_LINES"
fi

echo ""

# ============================================
# RECIPE-SKILL SYNC VALIDATION
# ============================================

echo "--- Sync Check ---"

# Check step count matches phase count
if [ "$STEP_COUNT" -ne "$PHASE_COUNT" ]; then
    echo "❌ FAIL: Recipe step count ($STEP_COUNT) does not match SKILL.md phase count ($PHASE_COUNT)"
    exit 1
fi
echo "✓ step count matches phase count: $STEP_COUNT"

# Check that recipe.yaml references SKILL.md
if ! grep -q 'See SKILL.md' "$RECIPE_FILE"; then
    echo "⚠️  WARNING: recipe.yaml should reference SKILL.md in a comment at the top"
else
    echo "✓ recipe references SKILL.md"
fi

echo ""

# ============================================
# SUMMARY
# ============================================

echo "✅ Skill validation passed: $SKILL_DIR"
echo ""
echo "Summary:"
echo "  SKILL.md: $LINE_COUNT lines, $PHASE_COUNT phases, $MARKER_COUNT markers, $CHECKPOINT_COUNT checkpoints"
echo "  recipe.yaml: $RECIPE_LINES lines, $STEP_COUNT steps, $PARAM_COUNT params, $OUTPUT_COUNT outputs"
