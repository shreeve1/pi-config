#!/usr/bin/env bash
# ============================================================================
# pi-loop monitor: Live dashboard for the autonomous loop
# Run: .loop/monitor.sh  or  watch -n 2 .loop/monitor.sh
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REQUIREMENTS_FILE="${SCRIPT_DIR}/requirements.md"
STATE_FILE="${SCRIPT_DIR}/.state"
LOCK_FILE="${SCRIPT_DIR}/.lock"
LOG_DIR="${SCRIPT_DIR}/logs"

# --- Colors ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

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

clear

echo -e "${BOLD}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BOLD}║              pi-loop Monitor Dashboard                  ║${NC}"
echo -e "${BOLD}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# --- Status ---
echo -e "${BOLD}Status${NC}"
running=false
if [[ -f "$LOCK_FILE" ]]; then
    pid=$(cat "$LOCK_FILE" 2>/dev/null || echo "")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
        echo -e "  State:  ${GREEN}● Running${NC} (PID: $pid)"
        running=true
    else
        echo -e "  State:  ${YELLOW}● Stopped${NC} (stale lock)"
    fi
else
    echo -e "  State:  ${DIM}○ Not running${NC}"
fi

# --- State ---
iteration=0
stuck_count=0
consecutive_failures=0
loop_start_time=""
timestamp=""

if [[ -f "$STATE_FILE" ]]; then
    # shellcheck source=/dev/null
    source "$STATE_FILE" 2>/dev/null || true
    echo -e "  Iteration:  ${CYAN}${iteration}${NC}"

    if [[ $stuck_count -gt 0 ]]; then
        echo -e "  Stuck count: ${YELLOW}${stuck_count}${NC}"
    else
        echo -e "  Stuck count: ${stuck_count}"
    fi

    if [[ $consecutive_failures -gt 0 ]]; then
        echo -e "  Failures:   ${RED}${consecutive_failures}${NC}"
    else
        echo -e "  Failures:   ${consecutive_failures}"
    fi

    # Elapsed time
    if [[ -n "$loop_start_time" && "$loop_start_time" -gt 0 ]] 2>/dev/null; then
        local_now=$(date +%s)
        elapsed=$((local_now - loop_start_time))
        echo -e "  Elapsed:    $(format_duration $elapsed)"
    fi

    # Last update
    if [[ -n "$timestamp" && "$timestamp" -gt 0 ]] 2>/dev/null; then
        if [[ "$(uname)" == "Darwin" ]]; then
            echo -e "  Last update: $(date -r "$timestamp" '+%H:%M:%S' 2>/dev/null || echo 'unknown')"
        else
            echo -e "  Last update: $(date -d "@$timestamp" '+%H:%M:%S' 2>/dev/null || echo 'unknown')"
        fi
    fi
fi

echo ""

# --- Progress ---
echo -e "${BOLD}Progress${NC}"
if [[ -f "$REQUIREMENTS_FILE" ]]; then
    total=$(grep -c '^\- \[[ x~]\] ' "$REQUIREMENTS_FILE" 2>/dev/null || echo 0)
    completed=$(grep -c '^\- \[x\] ' "$REQUIREMENTS_FILE" 2>/dev/null || echo 0)
    skipped=$(grep -c '^\- \[~\] ' "$REQUIREMENTS_FILE" 2>/dev/null || echo 0)
    remaining=$((total - completed - skipped))

    if [[ $total -gt 0 ]]; then
        pct=$(( (completed + skipped) * 100 / total ))

        # ETA estimate
        if [[ $completed -gt 0 && -n "$loop_start_time" && "$loop_start_time" -gt 0 ]] 2>/dev/null; then
            local_now=$(date +%s)
            elapsed=$((local_now - loop_start_time))
            avg_per_task=$((elapsed / completed))
            eta=$((avg_per_task * remaining))
            eta_str="~$(format_duration $eta) remaining"
        else
            eta_str=""
        fi

        # Progress bar
        bar_width=40
        filled=$((pct * bar_width / 100))
        empty=$((bar_width - filled))
        bar="${GREEN}"
        for ((i = 0; i < filled; i++)); do bar+="█"; done
        bar+="${DIM}"
        for ((i = 0; i < empty; i++)); do bar+="░"; done
        bar+="${NC}"

        echo -e "  ${bar} ${pct}%"
        echo -ne "  ${GREEN}$completed done${NC}"
        [[ $skipped -gt 0 ]] && echo -ne " / ${BLUE}$skipped skipped${NC}"
        echo -e " / ${YELLOW}$remaining remaining${NC} / $total total"
        [[ -n "$eta_str" ]] && echo -e "  ${DIM}$eta_str${NC}"
    else
        echo -e "  ${DIM}No tasks found${NC}"
    fi

    echo ""

    # Task list
    echo -e "${BOLD}Tasks${NC}"
    shown_current=""
    while IFS= read -r line; do
        if [[ "$line" =~ ^\-\ \[x\] ]]; then
            desc="${line#- [x] }"
            echo -e "  ${GREEN}✅ $desc${NC}"
        elif [[ "$line" =~ ^\-\ \[~\] ]]; then
            desc="${line#- [~] }"
            echo -e "  ${BLUE}⏭  $desc${NC}  ${DIM}(skipped)${NC}"
        elif [[ "$line" =~ ^\-\ \[\ \] ]]; then
            desc="${line#- [ ] }"
            if [[ -z "$shown_current" ]]; then
                echo -e "  ${YELLOW}🔄 $desc${NC}  ${DIM}← current${NC}"
                shown_current=1
            else
                echo -e "  ${DIM}⬚  $desc${NC}"
            fi
        fi
    done < "$REQUIREMENTS_FILE"
else
    echo -e "  ${RED}No requirements file found${NC}"
fi

echo ""

# --- Recent log ---
echo -e "${BOLD}Recent Log${NC}"
latest_log="${LOG_DIR}/latest.log"
if [[ ! -f "$latest_log" ]]; then
    latest_log=$(ls -t "${LOG_DIR}"/loop-*.log 2>/dev/null | head -1 || true)
fi

if [[ -n "$latest_log" && -f "$latest_log" ]]; then
    # Resolve symlink to get actual file
    if [[ -L "$latest_log" ]]; then
        latest_log="${LOG_DIR}/$(readlink "$latest_log")"
    fi
    tail -10 "$latest_log" 2>/dev/null | while IFS= read -r line; do
        if [[ "$line" == *"✅"* ]]; then
            echo -e "  ${GREEN}$line${NC}"
        elif [[ "$line" == *"❌"* || "$line" == *"ERROR"* ]]; then
            echo -e "  ${RED}$line${NC}"
        elif [[ "$line" == *"WARN"* || "$line" == *"⚠️"* ]]; then
            echo -e "  ${YELLOW}$line${NC}"
        elif [[ "$line" == *"CIRCUIT"* ]]; then
            echo -e "  ${RED}${BOLD}$line${NC}"
        elif [[ "$line" == *"🎉"* ]]; then
            echo -e "  ${GREEN}${BOLD}$line${NC}"
        else
            echo -e "  ${DIM}$line${NC}"
        fi
    done
else
    echo -e "  ${DIM}No logs yet${NC}"
fi

echo ""

# --- Hints ---
if [[ "$running" == "true" ]]; then
    echo -e "${DIM}Skip current task: touch .loop/.skip${NC}"
    echo -e "${DIM}Stop loop: kill $(cat "$LOCK_FILE" 2>/dev/null || echo 'PID')${NC}"
else
    echo -e "${DIM}Start: .loop/run.sh${NC}"
    echo -e "${DIM}Start with monitor: tmux new-session -d -s pi-loop '.loop/run.sh' \\; split-window -h 'watch -n 2 .loop/monitor.sh' \\; attach${NC}"
fi
echo -e "${DIM}Updated: $(date '+%H:%M:%S')  |  Refresh: watch -n 2 .loop/monitor.sh${NC}"
