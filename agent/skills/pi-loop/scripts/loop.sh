#!/usr/bin/env bash
set -euo pipefail

# ============================================================================
# pi-loop: Autonomous development loop
# Reads .loop/requirements.md, executes tasks one at a time via `pi -p`,
# marks them complete, and continues until done or circuit breaker trips.
# ============================================================================

# --- Path setup ---
# SCRIPT_DIR = .loop/ (where this script lives when copied from the skill)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="${SCRIPT_DIR}/config.sh"
REQUIREMENTS_FILE="${SCRIPT_DIR}/requirements.md"
STATE_FILE="${SCRIPT_DIR}/.state"
LOCK_FILE="${SCRIPT_DIR}/.lock"
PROMPT_FILE="${SCRIPT_DIR}/.prompt.tmp"
SKIP_FILE="${SCRIPT_DIR}/.skip"

# Project root is parent of .loop/
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# --- Defaults (overridden by config.sh) ---
MAX_ITERATIONS=50
MAX_STUCK_COUNT=3
TIMEOUT_MINUTES=15
COOLDOWN_SECONDS=5
VALIDATION_CMD=""
GIT_SAFETY=true

# --- Load config ---
if [[ -f "$CONFIG_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$CONFIG_FILE"
fi

# --- Log file (set after config load in case config overrides it) ---
LOG_FILE="${LOG_FILE:-${SCRIPT_DIR}/logs/loop-$(date +%Y%m%d-%H%M%S).log}"

# --- State ---
iteration=0
stuck_count=0
last_task=""
consecutive_failures=0
loop_start_time=$(date +%s)

# --- Logging ---
mkdir -p "${SCRIPT_DIR}/logs"
exec > >(tee -a "$LOG_FILE") 2>&1

# Symlink latest.log so monitor always finds the current log
ln -sf "$(basename "$LOG_FILE")" "${SCRIPT_DIR}/logs/latest.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log_separator() {
    echo ""
    echo "════════════════════════════════════════════════════════════════"
    echo ""
}

# --- Preflight checks ---
preflight() {
    if ! command -v pi &>/dev/null; then
        log "ERROR: 'pi' not found on PATH. Install pi first."
        exit 1
    fi

    if [[ ! -f "$REQUIREMENTS_FILE" ]]; then
        log "ERROR: Requirements file not found: $REQUIREMENTS_FILE"
        log "Run the pi-loop skill first to generate requirements."
        exit 1
    fi

    if [[ ! -d "$PROJECT_DIR" ]]; then
        log "ERROR: Project directory not found: $PROJECT_DIR"
        exit 1
    fi
}

# --- Lock management ---
acquire_lock() {
    if [[ -f "$LOCK_FILE" ]]; then
        local pid
        pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
        if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
            log "ERROR: Another loop is running (PID: $pid)"
            log "Stop it first: kill $pid"
            exit 1
        else
            log "WARN: Stale lock file found, removing"
            rm -f "$LOCK_FILE"
        fi
    fi
    echo $$ > "$LOCK_FILE"
}

release_lock() {
    rm -f "$LOCK_FILE"
    rm -f "$PROMPT_FILE"
}

# --- Cleanup on exit ---
cleanup() {
    local exit_code=$?
    release_lock
    save_state
    log_separator
    if [[ $exit_code -eq 0 ]]; then
        log "Loop exited cleanly"
    else
        log "Loop exited with code $exit_code"
    fi
    local elapsed=$(( $(date +%s) - loop_start_time ))
    log "Total iterations: $iteration"
    log "Elapsed: $(format_duration $elapsed)"
    log "Log: $LOG_FILE"
    exit $exit_code
}
trap cleanup EXIT
trap 'log "Interrupted by user"; exit 130' INT TERM

# --- Utilities ---
format_duration() {
    local secs=$1
    local h=$((secs / 3600))
    local m=$(( (secs % 3600) / 60 ))
    local s=$((secs % 60))
    if [[ $h -gt 0 ]]; then
        printf "%dh%02dm%02ds" $h $m $s
    elif [[ $m -gt 0 ]]; then
        printf "%dm%02ds" $m $s
    else
        printf "%ds" $s
    fi
}

# --- State persistence ---
save_state() {
    # Use printf to safely escape the task description
    local escaped_task
    escaped_task=$(printf '%s' "$last_task" | sed "s/'/'\\\\''/g")
    cat > "$STATE_FILE" <<EOF
iteration=$iteration
stuck_count=$stuck_count
last_task='${escaped_task}'
consecutive_failures=$consecutive_failures
loop_start_time=$loop_start_time
timestamp=$(date +%s)
EOF
}

load_state() {
    if [[ -f "$STATE_FILE" ]]; then
        # shellcheck source=/dev/null
        source "$STATE_FILE"
        log "Resumed from iteration $iteration (stuck: $stuck_count, failures: $consecutive_failures)"
    fi
}

# --- Git safety ---
git_checkpoint() {
    if [[ "$GIT_SAFETY" != "true" ]]; then
        return 0
    fi
    if ! git -C "$PROJECT_DIR" rev-parse --git-dir &>/dev/null; then
        log "WARN: Not a git repo, skipping git safety"
        GIT_SAFETY=false
        return 0
    fi

    # Create a checkpoint commit of current state (if there are changes)
    if ! git -C "$PROJECT_DIR" diff --quiet 2>/dev/null || \
       ! git -C "$PROJECT_DIR" diff --cached --quiet 2>/dev/null; then
        log "Git: Creating safety checkpoint..."
        git -C "$PROJECT_DIR" add -A
        git -C "$PROJECT_DIR" commit -m "pi-loop: checkpoint before iteration $iteration" --no-verify --quiet 2>/dev/null || true
        log "Git: Checkpoint created"
    fi
}

git_rollback_last() {
    if [[ "$GIT_SAFETY" != "true" ]]; then
        return 0
    fi
    local last_msg
    last_msg=$(git -C "$PROJECT_DIR" log -1 --pretty=%s 2>/dev/null || echo "")
    if [[ "$last_msg" == pi-loop:* ]]; then
        log "Git: Rolling back last checkpoint..."
        git -C "$PROJECT_DIR" reset --hard HEAD~1 --quiet 2>/dev/null || true
    fi
}

# --- Task parsing ---
get_next_task() {
    # Check for skip file — if present, skip the current first task
    if [[ -f "$SKIP_FILE" ]]; then
        local skip_line
        skip_line=$(grep -n '^\- \[ \] ' "$REQUIREMENTS_FILE" | head -1 | cut -d: -f1 || true)
        if [[ -n "$skip_line" ]]; then
            log "Skipping task on line $skip_line (skip file detected)"
            mark_task_skipped "$skip_line"
        fi
        rm -f "$SKIP_FILE"
    fi

    # Find first unchecked task: "- [ ] Task N: description"
    local task
    task=$(grep -n '^\- \[ \] ' "$REQUIREMENTS_FILE" | head -1 || true)
    if [[ -z "$task" ]]; then
        echo ""
        return
    fi
    echo "$task"
}

get_task_description() {
    # Strip the line number and checkbox prefix
    echo "$1" | sed 's/^[0-9]*:- \[ \] //'
}

get_task_line() {
    echo "$1" | cut -d: -f1
}

mark_task_complete() {
    local line_num="$1"
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "${line_num}s/- \[ \]/- [x]/" "$REQUIREMENTS_FILE"
    else
        sed -i "${line_num}s/- \[ \]/- [x]/" "$REQUIREMENTS_FILE"
    fi
}

mark_task_skipped() {
    local line_num="$1"
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "${line_num}s/- \[ \]/- [~]/" "$REQUIREMENTS_FILE"
    else
        sed -i "${line_num}s/- \[ \]/- [~]/" "$REQUIREMENTS_FILE"
    fi
}

count_tasks() {
    local total completed skipped remaining
    total=$(grep -c '^\- \[[ x~]\] ' "$REQUIREMENTS_FILE" 2>/dev/null || echo 0)
    completed=$(grep -c '^\- \[x\] ' "$REQUIREMENTS_FILE" 2>/dev/null || echo 0)
    skipped=$(grep -c '^\- \[~\] ' "$REQUIREMENTS_FILE" 2>/dev/null || echo 0)
    remaining=$((total - completed - skipped))
    echo "$completed/$total done ($remaining remaining, $skipped skipped)"
}

# --- Circuit breaker ---
check_circuit_breaker() {
    if [[ $iteration -ge $MAX_ITERATIONS ]]; then
        log "CIRCUIT BREAKER: Max iterations ($MAX_ITERATIONS) reached"
        return 1
    fi

    if [[ $stuck_count -ge $MAX_STUCK_COUNT ]]; then
        log "CIRCUIT BREAKER: Stuck on same task $MAX_STUCK_COUNT times"
        log "Task: $last_task"
        log "Tip: create .loop/.skip to skip this task, or edit .loop/requirements.md"
        return 1
    fi

    if [[ $consecutive_failures -ge 5 ]]; then
        log "CIRCUIT BREAKER: $consecutive_failures consecutive failures"
        return 1
    fi

    return 0
}

# --- Validation ---
run_validation() {
    if [[ -z "$VALIDATION_CMD" ]]; then
        return 0
    fi
    log "Running validation: $VALIDATION_CMD"
    if (cd "$PROJECT_DIR" && eval "$VALIDATION_CMD") >> "$LOG_FILE" 2>&1; then
        log "✅ Validation passed"
        return 0
    else
        log "❌ Validation failed"
        return 1
    fi
}

# --- Build the prompt for pi ---
build_prompt() {
    local task_desc="$1"

    # Write prompt to a temp file to avoid shell quoting issues
    cat > "$PROMPT_FILE" <<'PROMPT_HEADER'
You are working through an autonomous development loop. Your job is to complete ONE task and stop.

## Current Task
PROMPT_HEADER

    echo "$task_desc" >> "$PROMPT_FILE"

    cat >> "$PROMPT_FILE" <<'PROMPT_MIDDLE'

## Full Requirements Context
PROMPT_MIDDLE

    cat "$REQUIREMENTS_FILE" >> "$PROMPT_FILE"

    cat >> "$PROMPT_FILE" <<'PROMPT_FOOTER'

## Rules
1. Complete ONLY the current task described above
2. Do NOT work on other tasks
3. Do NOT do unrelated cleanup or refactoring
4. Do NOT modify .loop/requirements.md — the loop manages that file
5. After completing the task, verify your work compiles/runs if possible
6. Be precise and minimal in your changes

## When Done
Report what you changed and whether the task is complete.
PROMPT_FOOTER
}

# --- Execute pi with the prompt file ---
run_pi() {
    local exit_code=0
    local prompt_content
    prompt_content=$(cat "$PROMPT_FILE")

    if [[ "$(uname)" == "Darwin" ]]; then
        if command -v gtimeout &>/dev/null; then
            (cd "$PROJECT_DIR" && gtimeout "${TIMEOUT_MINUTES}m" pi -p "$prompt_content") >> "$LOG_FILE" 2>&1 || exit_code=$?
        else
            (cd "$PROJECT_DIR" && pi -p "$prompt_content") >> "$LOG_FILE" 2>&1 || exit_code=$?
        fi
    else
        (cd "$PROJECT_DIR" && timeout "${TIMEOUT_MINUTES}m" pi -p "$prompt_content") >> "$LOG_FILE" 2>&1 || exit_code=$?
    fi

    return $exit_code
}

# --- Main loop ---
main() {
    preflight
    acquire_lock
    load_state

    log "╔══════════════════════════════════════════╗"
    log "║         pi-loop: Starting Loop           ║"
    log "╚══════════════════════════════════════════╝"
    log ""
    log "Project:    $PROJECT_DIR"
    log "Requirements: $REQUIREMENTS_FILE"
    log "Config:     $CONFIG_FILE"
    log "Max iterations: $MAX_ITERATIONS"
    log "Stuck threshold: $MAX_STUCK_COUNT"
    log "Timeout:    ${TIMEOUT_MINUTES}m"
    log "Git safety: $GIT_SAFETY"
    log "Progress:   $(count_tasks)"
    log ""

    while true; do
        log_separator
        iteration=$((iteration + 1))
        log "=== Iteration $iteration ==="
        log "Progress: $(count_tasks)"
        log "Elapsed:  $(format_duration $(( $(date +%s) - loop_start_time )))"

        # Circuit breaker check
        if ! check_circuit_breaker; then
            log ""
            log "🛑 Loop stopped by circuit breaker"
            save_state
            exit 1
        fi

        # Get next task
        local next_task
        next_task=$(get_next_task)

        if [[ -z "$next_task" ]]; then
            log ""
            log "🎉 All tasks complete!"
            log "Final progress: $(count_tasks)"

            if run_validation; then
                log "✅ Final validation passed — loop complete!"
            else
                log "⚠️  All tasks done but validation failed. Review needed."
            fi
            exit 0
        fi

        local task_desc
        task_desc=$(get_task_description "$next_task")
        local task_line
        task_line=$(get_task_line "$next_task")

        log "Task: $task_desc"
        log "Line: $task_line"

        # Stuck detection
        if [[ "$task_desc" == "$last_task" ]]; then
            stuck_count=$((stuck_count + 1))
            log "WARN: Same task again (stuck count: $stuck_count/$MAX_STUCK_COUNT)"
        else
            stuck_count=0
            last_task="$task_desc"
        fi

        # Git safety checkpoint
        git_checkpoint

        # Build prompt and execute
        build_prompt "$task_desc"

        log "Launching pi..."
        local start_time
        start_time=$(date +%s)

        local exit_code=0
        run_pi || exit_code=$?

        local end_time
        end_time=$(date +%s)
        local duration=$((end_time - start_time))
        log "Completed in $(format_duration $duration) (exit code: $exit_code)"

        # Handle result
        if [[ $exit_code -eq 0 ]]; then
            log "✅ Task appears successful"
            consecutive_failures=0

            if run_validation; then
                mark_task_complete "$task_line"
                log "✅ Task marked complete"
            else
                log "⚠️  Task ran but validation failed — not marking complete"
                consecutive_failures=$((consecutive_failures + 1))
                # Rollback on validation failure if git safety enabled
                git_rollback_last
            fi
        elif [[ $exit_code -eq 124 ]]; then
            log "⏰ Task timed out after ${TIMEOUT_MINUTES} minutes"
            consecutive_failures=$((consecutive_failures + 1))
            git_rollback_last
        else
            log "❌ Task failed (exit code: $exit_code)"
            consecutive_failures=$((consecutive_failures + 1))
            git_rollback_last
        fi

        save_state

        # Cooldown
        if [[ $COOLDOWN_SECONDS -gt 0 ]]; then
            log "Cooling down for ${COOLDOWN_SECONDS}s..."
            sleep "$COOLDOWN_SECONDS"
        fi
    done
}

main "$@"
