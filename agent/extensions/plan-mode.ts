/**
 * Plan Mode Extension for pi
 *
 * This extension adds a "plan mode" workflow:
 * 1. Detects complex requests via auto-detection or "/planmode" command.
 * 2. Triggers a "planning" phase where the agent writes a plan with structured tasks.
 * 3. After planning, automatically enters an "execution" phase.
 * 4. During execution, builds a dependency graph and resolves ready tasks.
 * 5. Parallel-ready tasks are dispatched to subagents concurrently.
 * 6. Tasks are tracked and checked off in the plan file as they complete.
 *
 * Commands:
 *   /planmode <desc>  - Start planning for a task
 *   /execute          - Skip to execution phase
 *   /planexecute      - Auto-execute entire plan with dependency-aware scheduling
 *   /planstatus       - Show progress + dependency graph status
 *   /planlist         - List all tasks with dependency + completion info
 *   /plandeps         - Visualize the dependency graph
 *   /plancomplete     - Mark the plan as complete
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@mariozechner/pi-tui";
import { Type } from "@sinclair/typebox";

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

interface PlanState {
  phase: "idle" | "planning" | "executing" | "auto-executing";
  planFile: string;
  cwd: string;
  currentTaskIndex: number;
}

interface Phase {
  name: string;
  number: number;
  tasks: TaskGroup[];
  isParallel: boolean;
}

interface TaskGroup {
  number: string;       // e.g., "2.1", "2.2"
  title: string;
  description: string;
  dependencies: string[];
  isParallel: boolean;
  phase?: number;
}

interface TaskInfo {
  index: number;
  id: string;
  text: string;
  completed: boolean;
  dependencies: string[];
  phase?: number;
  isParallel: boolean;
}

type TaskStatus = "completed" | "ready" | "blocked" | "running";

interface DependencyNode {
  id: string;
  title: string;
  dependencies: string[];
  dependents: string[];
  status: TaskStatus;
  phase?: number;
}

interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  executionOrder: string[][];  // batches of tasks that can run concurrently
}

// ──────────────────────────────────────────────────────────────
// State
// ──────────────────────────────────────────────────────────────

let planState: PlanState = { phase: "idle", planFile: "plan.md", cwd: "", currentTaskIndex: 0 };
const runningTasks = new Set<string>();  // task IDs currently being executed by subagents
let piApi: ExtensionAPI | null = null;  // Reference to ExtensionAPI for event emission

// Event types for plan-todo sync
interface PlanTasksSyncEvent {
  type: "plan_tasks_sync";
  sessionName?: string;
  tasks: Array<{
    id: string;
    content: string;
    completed: boolean;
    status: "pending" | "in_progress" | "completed";
  }>;
  listTitle: string;
}

// ──────────────────────────────────────────────────────────────
// Utility: Plan filename generation
// ──────────────────────────────────────────────────────────────

function generatePlanFilename(description: string): string {
  const stopWords = new Set([
    "a","an","the","is","are","was","were","be","been","have","has","had",
    "do","does","did","will","would","could","should","may","might","can",
    "for","in","on","at","to","of","and","or","but","with","by","from",
    "up","about","into","i","me","my","we","our","you","your","it","its",
    "this","that","what","which","who","how","please","just",
  ]);

  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w))
    .slice(0, 3);

  const slug = words.length > 0 ? words.join("-") : `plan-${Date.now()}`;
  return `artifacts/plans/${slug}.md`;
}

// ──────────────────────────────────────────────────────────────
// Plan Parsing
// ──────────────────────────────────────────────────────────────

function extractTasks(content: string): { index: number; id: string; text: string }[] {
  const tasks: { index: number; id: string; text: string }[] = [];
  const lines = content.split("\n");
  let taskSection = false;
  let taskIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.toLowerCase() === "## step by step tasks" || line.toLowerCase() === "## implementation phases") {
      taskSection = true;
      continue;
    }
    if (taskSection && line.startsWith("## ") && !line.toLowerCase().includes("phase")) {
      break;
    }
    if (taskSection && /^\- \[[ xX]\] \[.*?\]\s+/.test(line)) {
      const match = line.match(/^\- \[[ xX]\] \[(.*?)\]\s+(.*)$/);
      if (match) {
        const [, id, text] = match;
        tasks.push({ index: taskIndex++, id, text });
      }
    }
  }
  return tasks;
}

function parsePhases(content: string): Phase[] {
  const lines = content.split("\n");
  const phases: Phase[] = [];
  let currentPhase: Phase | null = null;
  let inPhasesSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (line.toLowerCase() === "## implementation phases") {
      inPhasesSection = true;
      continue;
    }

    if (inPhasesSection && line.startsWith("## ") && !line.toLowerCase().includes("phase")) {
      break;
    }

    if (!inPhasesSection) continue;

    // Phase header: "### Phase N: Name (Parallel)" or "### Phase N: Name (Sequential)"
    const phaseMatch = line.match(/^###\s+Phase\s+(\d+):\s+(.+?)\s*\((\w+)\)/i);
    if (phaseMatch) {
      const [, phaseNum, phaseName, parallelType] = phaseMatch;
      currentPhase = {
        name: phaseName,
        number: parseInt(phaseNum),
        tasks: [],
        isParallel: parallelType.toLowerCase() === "parallel"
      };
      phases.push(currentPhase);
      continue;
    }

    // Task header: "**[N.M] Task Name**"
    const taskMatch = line.match(/^\*\*\[(\d+\.\d+)\]\s+(.+?)\*\*/);
    if (taskMatch && currentPhase) {
      const [, taskNum, taskTitle] = taskMatch;

      // Look ahead for dependencies and description
      let dependencies: string[] = [];
      let description = "";
      const lookAhead = lines.slice(i + 1, i + 15);
      for (const la of lookAhead) {
        const trimLa = la.trim();
        // Match "**Dependencies:** [1.1], [1.2], ..." or "**Dependencies:** None"
        const depsMatch = trimLa.match(/\*\*Dependencies:\*\*\s+(.+)/);
        if (depsMatch) {
          const raw = depsMatch[1].trim();
          if (raw.toLowerCase() !== "none" && raw !== "") {
            // Extract all [X.Y] patterns
            const depMatches = raw.match(/\[(\d+\.\d+)\]/g);
            if (depMatches) {
              dependencies = depMatches.map(d => d.slice(1, -1)); // Remove [ and ]
            }
          }
        } else if (trimLa && !trimLa.startsWith("**") && !trimLa.startsWith("###") && !trimLa.startsWith("##")) {
          if (!description) description = trimLa;
        }
      }

      currentPhase.tasks.push({
        number: taskNum,
        title: taskTitle,
        description,
        dependencies,
        isParallel: currentPhase.isParallel,
        phase: currentPhase.number
      });
    }
  }

  return phases;
}

// ──────────────────────────────────────────────────────────────
// Task completion helpers
// ──────────────────────────────────────────────────────────────

function isTaskCompleted(content: string, taskIndex: number): boolean {
  const lines = content.split("\n");
  let taskSection = false;
  let currentIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.toLowerCase() === "## step by step tasks" || trimmed.toLowerCase() === "## implementation phases") {
      taskSection = true;
      continue;
    }
    if (taskSection && trimmed.startsWith("## ") && !trimmed.toLowerCase().includes("phase")) break;
    if (taskSection && /^\- \[[ xX]\] \[.*?\]\s+/.test(trimmed)) {
      if (currentIndex === taskIndex) {
        const match = trimmed.match(/^\- \[([ xX])\]/);
        return match ? match[1] === "x" || match[1] === "X" : false;
      }
      currentIndex++;
    }
  }
  return false;
}

function isTaskCompletedById(content: string, taskId: string): boolean {
  const tasks = extractTasks(content);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return false;
  return isTaskCompleted(content, task.index);
}

function updatePlanWithTaskDone(content: string, taskIndex: number): string {
  const lines = content.split("\n");
  let taskSection = false;
  let currentIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.toLowerCase() === "## step by step tasks" || trimmed.toLowerCase() === "## implementation phases") {
      taskSection = true;
      continue;
    }
    if (taskSection && trimmed.startsWith("## ") && !trimmed.toLowerCase().includes("phase")) break;

    if (taskSection && /^\- \[[ xX]\] \[.*?\]\s+/.test(trimmed)) {
      if (currentIndex === taskIndex) {
        lines[i] = lines[i].replace(/\- \[[ xX]\] /, "- [x] ");
        return updateProgressSection(lines.join("\n"));
      }
      currentIndex++;
    }
  }

  return content;
}

function updatePlanWithTaskDoneById(content: string, taskId: string): string {
  const tasks = extractTasks(content);
  const task = tasks.find(t => t.id === taskId);
  if (!task) return content;
  return updatePlanWithTaskDone(content, task.index);
}

function updateProgressSection(content: string): string {
  const lines = content.split("\n");
  let progressSectionStart = -1;
  let progressSectionEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().toLowerCase() === "## progress") {
      progressSectionStart = i;
      continue;
    }
    if (progressSectionStart !== -1 && lines[i].trim().startsWith("## ")) {
      progressSectionEnd = i;
      break;
    }
  }

  if (progressSectionStart === -1) return content;

  const tasks = extractTasks(content);
  const completed = tasks.filter((_, idx) => isTaskCompleted(content, idx)).length;
  const total = tasks.length;
  const date = new Date().toLocaleString();

  const updatedProgress = [
    "## Progress",
    "**Phase Status:**",
    "- Build: `" + (total === completed ? "complete" : "in_progress") + "`",
    "- Test: `pending`",
    "",
    "**Task Counts:**",
    "- Implementation: `" + completed + "/" + total + "` tasks complete",
    "- Tests: `0/0` tests passing",
    "",
    "**Last Updated:** `" + date + "`",
  ].join("\n");

  const before = lines.slice(0, progressSectionStart);
  const after = progressSectionEnd !== -1 ? lines.slice(progressSectionEnd) : [];
  return before.concat(updatedProgress, after).join("\n");
}

function getProgressFromContent(content: string): { completed: number; total: number } {
  const tasks = extractTasks(content);
  const completed = tasks.filter((_, idx) => isTaskCompleted(content, idx)).length;
  return { completed, total: tasks.length };
}

// ──────────────────────────────────────────────────────────────
// Todo List Sync
// ──────────────────────────────────────────────────────────────

/**
 * Sync plan tasks to the todo list via event bus.
 * This allows the todo extension to update its widget when plan tasks change.
 */
function syncTasksToTodoList(content: string, sessionName?: string) {
  if (!piApi) return;

  const tasks = extractTasks(content);
  const graph = buildDependencyGraph(content);

  const todoTasks = tasks.map(t => {
    const node = graph.nodes.get(t.id);
    const isComplete = isTaskCompleted(content, t.index);
    const isRunning = runningTasks.has(t.id);
    const isBlocked = node?.status === "blocked";

    let status: "pending" | "in_progress" | "completed" = "pending";
    if (isComplete) status = "completed";
    else if (isRunning) status = "in_progress";
    else if (isBlocked) status = "pending";
    else if (node?.status === "ready") status = "pending";  // Ready = pending, waiting to be picked up

    return {
      id: t.id,
      content: `[${t.id}] ${t.text}`,
      completed: isComplete,
      status,
    };
  });

  const event: PlanTasksSyncEvent = {
    type: "plan_tasks_sync",
    sessionName,
    tasks: todoTasks,
    listTitle: "Plan Tasks",
  };

  piApi.events.emit("plan_tasks_sync", event);
}

// ──────────────────────────────────────────────────────────────
// Dependency Graph
// ──────────────────────────────────────────────────────────────

function buildDependencyGraph(content: string): DependencyGraph {
  const phases = parsePhases(content);
  const tasks = extractTasks(content);
  const nodes = new Map<string, DependencyNode>();

  // Build a lookup: task ID -> TaskGroup (for dependencies & phase info)
  const taskGroupMap = new Map<string, TaskGroup>();
  for (const phase of phases) {
    for (const tg of phase.tasks) {
      taskGroupMap.set(tg.number, tg);
    }
  }

  // Create nodes for each task in the checklist
  for (const task of tasks) {
    const tg = taskGroupMap.get(task.id);
    const completed = isTaskCompleted(content, task.index);
    const isRunning = runningTasks.has(task.id);

    nodes.set(task.id, {
      id: task.id,
      title: task.text,
      dependencies: tg?.dependencies ?? [],
      dependents: [],
      status: completed ? "completed" : isRunning ? "running" : "blocked",
      phase: tg?.phase,
    });
  }

  // Build reverse dependency links (dependents)
  for (const [id, node] of nodes) {
    for (const depId of node.dependencies) {
      const depNode = nodes.get(depId);
      if (depNode) {
        depNode.dependents.push(id);
      }
    }
  }

  // Determine which blocked tasks are actually ready
  for (const [, node] of nodes) {
    if (node.status === "blocked") {
      const allDepsComplete = node.dependencies.every(depId => {
        const dep = nodes.get(depId);
        return dep?.status === "completed";
      });
      if (allDepsComplete) {
        node.status = "ready";
      }
    }
  }

  // Compute execution order (batches via topological layers)
  const executionOrder = computeExecutionBatches(nodes);

  return { nodes, executionOrder };
}

function computeExecutionBatches(nodes: Map<string, DependencyNode>): string[][] {
  const batches: string[][] = [];
  const completed = new Set<string>();

  // Pre-fill completed tasks
  for (const [id, node] of nodes) {
    if (node.status === "completed") {
      completed.add(id);
    }
  }

  const remaining = new Set(
    [...nodes.keys()].filter(id => !completed.has(id))
  );

  let iterations = 0;
  const maxIterations = remaining.size + 1; // prevent infinite loops on cycles

  while (remaining.size > 0 && iterations < maxIterations) {
    iterations++;
    const batch: string[] = [];

    for (const id of remaining) {
      const node = nodes.get(id)!;
      const allDepsComplete = node.dependencies.every(depId => completed.has(depId));
      if (allDepsComplete) {
        batch.push(id);
      }
    }

    if (batch.length === 0) {
      // Circular dependency detected — add remaining as a final batch with warning
      batches.push([...remaining]);
      break;
    }

    batches.push(batch);
    for (const id of batch) {
      completed.add(id);
      remaining.delete(id);
    }
  }

  return batches;
}

function getReadyTasks(graph: DependencyGraph): DependencyNode[] {
  return [...graph.nodes.values()].filter(n => n.status === "ready");
}

function getBlockedTasks(graph: DependencyGraph): DependencyNode[] {
  return [...graph.nodes.values()].filter(n => n.status === "blocked");
}

function getCompletedTasks(graph: DependencyGraph): DependencyNode[] {
  return [...graph.nodes.values()].filter(n => n.status === "completed");
}

function getRunningTasks(graph: DependencyGraph): DependencyNode[] {
  return [...graph.nodes.values()].filter(n => n.status === "running");
}

// ──────────────────────────────────────────────────────────────
// Dependency graph visualization
// ──────────────────────────────────────────────────────────────

function visualizeDependencyGraph(graph: DependencyGraph): string {
  const statusIcon = (s: TaskStatus) => {
    switch (s) {
      case "completed": return "✅";
      case "ready":     return "🟢";
      case "running":   return "🔄";
      case "blocked":   return "🔴";
    }
  };

  let output = "## Dependency Graph\n\n";
  output += "Legend: ✅ completed | 🟢 ready | 🔄 running | 🔴 blocked\n\n";

  // Group by phase
  const byPhase = new Map<number, DependencyNode[]>();
  for (const node of graph.nodes.values()) {
    const phase = node.phase ?? 0;
    if (!byPhase.has(phase)) byPhase.set(phase, []);
    byPhase.get(phase)!.push(node);
  }

  for (const [phase, nodes] of [...byPhase.entries()].sort((a, b) => a[0] - b[0])) {
    output += `### Phase ${phase}\n`;
    for (const node of nodes) {
      output += `${statusIcon(node.status)} [${node.id}] ${node.title}`;
      if (node.dependencies.length > 0) {
        output += ` ← depends on: ${node.dependencies.join(", ")}`;
      }
      if (node.dependents.length > 0) {
        output += ` → blocks: ${node.dependents.join(", ")}`;
      }
      output += "\n";
    }
    output += "\n";
  }

  // Execution order
  output += "### Execution Batches\n";
  for (let i = 0; i < graph.executionOrder.length; i++) {
    const batch = graph.executionOrder[i];
    const batchType = batch.length > 1 ? "⚡ parallel" : "▶ sequential";
    output += `Batch ${i + 1} (${batchType}): ${batch.join(", ")}\n`;
  }

  return output;
}

// ──────────────────────────────────────────────────────────────
// Plan analysis (enhanced with dependency info)
// ──────────────────────────────────────────────────────────────

function analyzePlanStructure(content: string): {
  hasPhases: boolean;
  phases: Phase[];
  parallelPhases: Phase[];
  graph: DependencyGraph;
  suggestion: string;
} {
  const phases = parsePhases(content);
  const hasPhases = phases.length > 0;
  const parallelPhases = phases.filter(p => p.isParallel);
  const graph = buildDependencyGraph(content);

  const ready = getReadyTasks(graph);
  const blocked = getBlockedTasks(graph);
  const completed = getCompletedTasks(graph);
  const running = getRunningTasks(graph);

  let suggestion = "";
  if (parallelPhases.length > 0) {
    const phaseNames = parallelPhases.map(p => `Phase ${p.number} (${p.tasks.length} tasks)`).join(", ");
    suggestion = `Parallelizable phases: ${phaseNames}.`;
  }
  if (ready.length > 1) {
    suggestion += ` ${ready.length} tasks are ready for concurrent execution: ${ready.map(t => `[${t.id}]`).join(", ")}.`;
  } else if (ready.length === 1) {
    suggestion += ` Next task ready: [${ready[0].id}] ${ready[0].title}.`;
  }
  if (running.length > 0) {
    suggestion += ` ${running.length} task(s) currently running.`;
  }
  if (blocked.length > 0) {
    suggestion += ` ${blocked.length} task(s) blocked on dependencies.`;
  }
  suggestion += ` ${completed.length}/${graph.nodes.size} complete.`;

  return { hasPhases, phases, parallelPhases, graph, suggestion };
}

function generateExecutionStrategy(content: string): string {
  const graph = buildDependencyGraph(content);
  let plan = "## Execution Strategy\n\n";

  for (let i = 0; i < graph.executionOrder.length; i++) {
    const batch = graph.executionOrder[i];
    const isParallel = batch.length > 1;
    plan += `### Batch ${i + 1} ${isParallel ? "(⚡ Parallel)" : "(▶ Sequential)"}\n`;

    for (const taskId of batch) {
      const node = graph.nodes.get(taskId)!;
      plan += `- [${taskId}] ${node.title}`;
      if (node.dependencies.length > 0) {
        plan += ` (depends on: ${node.dependencies.join(", ")})`;
      }
      plan += "\n";
    }
    plan += "\n";
  }

  return plan;
}

// ──────────────────────────────────────────────────────────────
// Enriched task info (for tools)
// ──────────────────────────────────────────────────────────────

function getEnrichedTasks(content: string): TaskInfo[] {
  const tasks = extractTasks(content);
  const phases = parsePhases(content);
  const taskGroupMap = new Map<string, TaskGroup>();
  for (const phase of phases) {
    for (const tg of phase.tasks) {
      taskGroupMap.set(tg.number, tg);
    }
  }

  return tasks.map(t => {
    const tg = taskGroupMap.get(t.id);
    return {
      index: t.index,
      id: t.id,
      text: t.text,
      completed: isTaskCompleted(content, t.index),
      dependencies: tg?.dependencies ?? [],
      phase: tg?.phase,
      isParallel: tg?.isParallel ?? false,
    };
  });
}

// ──────────────────────────────────────────────────────────────
// Status widget
// ──────────────────────────────────────────────────────────────

function updateStatusWidget(ctx: ExtensionContext, content: string) {
  if (!ctx.hasUI) return;

  const graph = buildDependencyGraph(content);
  const ready = getReadyTasks(graph);
  const completed = getCompletedTasks(graph);
  const running = getRunningTasks(graph);
  const blocked = getBlockedTasks(graph);
  const total = graph.nodes.size;

  const statusParts: string[] = [];
  statusParts.push(`📋 ${completed.length}/${total}`);
  if (running.length > 0) statusParts.push(`🔄 ${running.length}`);
  if (ready.length > 0) statusParts.push(`🟢 ${ready.length}`);

  ctx.ui.setStatus("plan-mode", statusParts.join(" "));

  if (total === 0) {
    ctx.ui.setWidget("plan-tasks", []);
    return;
  }

  // Widget with task list - matches todo.ts styling
  ctx.ui.setWidget("plan-tasks", (_tui, theme) => {
    return {
      invalidate() {},
      render(width: number): string[] {
        const t = "Plan Tasks";
        const d = completed.length;
        const r = running.length;
        const p = ready.length;
        const b = blocked.length;
        const tot = total;

        // Line 1: title + progress (left), counts (right)
        const l1Left =
          theme.fg("accent", ` ${t} `) +
          theme.fg("warning", "[") +
          theme.fg("success", `${d}`) +
          theme.fg("dim", "/") +
          theme.fg("muted", `${tot}`) +
          theme.fg("warning", "]");

        const l1Right =
          theme.fg("success", `✓ ${d}`) +
          theme.fg("dim", "  ") +
          theme.fg("warning", `▶ ${r}`) +
          theme.fg("dim", "  ") +
          theme.fg("accent", `● ${p}`) +
          theme.fg("dim", "  ") +
          theme.fg("muted", `○ ${b} `);

        const pad = " ".repeat(Math.max(1, width - visibleWidth(l1Left) - visibleWidth(l1Right)));
        const line1 = truncateToWidth(l1Left + pad + l1Right, width, "");

        // Lines 2+: running first, then ready, then blocked (skip completed)
        const visible = [...running, ...ready, ...blocked].slice(0, 5);
        const overflow = (running.length + ready.length + blocked.length) - visible.length;

        const rows = visible.map((node) => {
          let icon: string;
          let text: string;
          if (node.status === "completed") {
            icon = theme.fg("success", "✓");
            text = theme.fg("dim", `[${node.id}] ${node.title}`);
          } else if (node.status === "running") {
            icon = theme.fg("warning", "▶");
            text = theme.fg("success", `[${node.id}] ${node.title}`);
          } else if (node.status === "ready") {
            icon = theme.fg("accent", "●");
            text = theme.fg("muted", `[${node.id}] ${node.title}`);
          } else {
            icon = theme.fg("muted", "○");
            text = theme.fg("muted", `[${node.id}] ${node.title}`);
          }
          return truncateToWidth(` ${icon} ${text}`, width, "");
        });

        if (overflow > 0) {
          rows.push(truncateToWidth(theme.fg("dim", `   +${overflow} more`), width, ""));
        }

        return [line1, ...rows];
      },
    };
  });
}

function clearStatusWidget(ctx: ExtensionContext) {
  if (!ctx.hasUI) return;
  ctx.ui.setStatus("plan-mode", undefined);
  ctx.ui.setWidget("plan-tasks", undefined);
}

/**
 * Update both the plan-mode widget and sync to the todo list.
 * Call this whenever the plan content changes.
 */
function updatePlanUI(ctx: ExtensionContext, content: string) {
  updateStatusWidget(ctx, content);
  syncTasksToTodoList(content, ctx.sessionManager.getSessionName());
}

// ──────────────────────────────────────────────────────────────
// Subagent execution helpers
// ──────────────────────────────────────────────────────────────

function buildSubagentTaskDescription(taskId: string, taskTitle: string, taskDescription: string, planFile: string): string {
  return `Execute task [${taskId}] from the plan in \`${planFile}\`:

**Task:** ${taskTitle}
${taskDescription ? `**Details:** ${taskDescription}` : ""}

Instructions:
1. Read the plan file \`${planFile}\` for full context.
2. Implement task [${taskId}] completely.
3. After completing the task, call update_progress to mark it done.
4. Be thorough — the task must be fully working before you finish.`;
}

// Agent for task execution (can be overridden via PLAN_MODE_EXECUTION_AGENT env var)
// Planning uses "planner", execution uses "worker"
const TASK_EXECUTION_AGENT = process.env.PLAN_MODE_EXECUTION_AGENT || "worker";

interface SubagentTaskPayload {
  agent: string;
  task: string;
}

function buildSubagentTaskPayloads(readyTasks: DependencyNode[], phases: Phase[], planFile: string): SubagentTaskPayload[] {
  // Find task descriptions from phases
  const taskGroupMap = new Map<string, TaskGroup>();
  for (const phase of phases) {
    for (const tg of phase.tasks) {
      taskGroupMap.set(tg.number, tg);
    }
  }

  return readyTasks.map(task => {
    const tg = taskGroupMap.get(task.id);
    const description = tg?.description ?? "";
    return {
      agent: TASK_EXECUTION_AGENT,
      task: buildSubagentTaskDescription(task.id, task.title, description, planFile),
    };
  });
}

// ──────────────────────────────────────────────────────────────
// Extension entry point
// ──────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  piApi = pi;  // Store reference for helper functions

  // ──────────────────────────────────────────────────────────
  // Input handler
  // ──────────────────────────────────────────────────────────

  pi.on("input", async (event, ctx) => {
    if (!ctx.hasUI) return { action: "continue" };

    const text = event.text.trim();

    // === /planmode ===
    if (text.startsWith("/planmode")) {
      const args = text.slice(9).trim();
      ctx.ui.notify("Entering plan mode...", "info");

      const planFile = generatePlanFilename(args || "new plan");
      const { mkdir } = await import("node:fs/promises");
      const { join } = await import("node:path");
      await mkdir(join(ctx.cwd, "artifacts", "plans"), { recursive: true });

      planState = { phase: "planning", planFile, cwd: ctx.cwd, currentTaskIndex: 0 };

      const prompt = args
        ? `Act as a senior architect. Create a detailed plan for: "${args}"
Write the complete plan to \`${planState.planFile}\` in markdown format. Follow this format exactly:

# Plan: <task name>

## Task Description
<describe the task in detail>

## Objective
<clearly state what will be accomplished>

## Problem Statement
<clearly define the problem or opportunity>

## Solution Approach
<describe the proposed solution approach>

## Relevant Files
Use these files to complete the task:

- ...existing files...
- New files to be created:
  - ...

## Implementation Phases

IMPORTANT: Structure your plan into phases to enable parallel execution where possible.
Mark each task's dependencies explicitly so the dependency engine can schedule them correctly.
Tasks with no unresolved dependencies will be executed in parallel automatically.

### Phase 1: Foundation (Sequential)
Foundation work that must complete before other work can begin.

**[1.1] First Core Task**
Description of task.
**Dependencies:** None

**[1.2] Second Core Task**
Description of task.
**Dependencies:** [1.1]

### Phase 2: Parallel Work (Parallel)
Independent tasks that can be executed concurrently via subagents.

**[2.1] Independent Task A**
Description of task.
**Dependencies:** [1.2]

**[2.2] Independent Task B**
Description of task.
**Dependencies:** [1.2]

**[2.3] Independent Task C**
Description of task.
**Dependencies:** [1.2]

### Phase 3: Integration (Sequential)
Work that depends on Phase 2 completion.

**[3.1] Integration Task**
Description of task.
**Dependencies:** [2.1], [2.2], [2.3]

## Step by Step Tasks
IMPORTANT: This is the canonical task list. Execute every checkbox in order by phase.

- [ ] [1.1] <specific action>
- [ ] [1.2] <another action>
- [ ] [2.1] <parallel task A>
- [ ] [2.2] <parallel task B>
- [ ] [2.3] <parallel task C>
- [ ] [3.1] <integration task>

Note: Use [N.M] ID prefixes for stable tracking. Dependencies are critical for the execution engine.

## Progress
**Phase Status:**
- Build: \`pending\`
- Test: \`pending\`

**Task Counts:**
- Implementation: \`0/0\` tasks complete
- Tests: \`0/0\` tests passing

**Last Updated:** \`---\`

## Acceptance Criteria
<list specific, measurable criteria>

## Testing Promise
<single statement of what testing must accomplish>

## Validation Commands
- \`<command>\` - description

## Traceability Map
| Requirement | Tasks |
|-------------|-------|
| #req-<id> | [1.1], [1.2] |

## Notes
<optional additional context>

Do NOT execute the plan yet. Just write the complete plan in the exact format above to \`${planState.planFile}\`.`
        : `Act as a senior architect. You are now in plan mode.

Create a detailed plan for the current task.
Write the complete plan to \`${planState.planFile}\` in markdown format using the structured format with phases, [N.M] task IDs, and explicit dependency declarations.

Structure the plan into phases where possible:
- Phase 1: Foundation (sequential prerequisites)
- Phase 2+: Parallel work where tasks are independent
- Final Phase: Integration (depends on parallel work)

Mark every task's dependencies explicitly (even "None") so the execution engine can schedule correctly.

Do NOT execute the plan yet. Just write the complete plan in the exact format to \`${planState.planFile}\`.`;

      return { action: "transform", text: prompt };
    }

    // === /execute ===
    if (text.startsWith("/execute")) {
      if (planState.phase === "planning" || planState.phase === "idle") {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        try {
          const cwd = planState.cwd || ctx.cwd;
          const planPath = path.join(cwd, planState.planFile);
          const content = await fs.readFile(planPath, "utf-8");
          const analysis = analyzePlanStructure(content);

          planState = { phase: "executing", planFile: planState.planFile, cwd: cwd, currentTaskIndex: 0 };
          ctx.ui.notify("Switching to execution phase...", "info");
          updatePlanUI(ctx, content);

          let executionMessage = `Plan loaded from \`${planState.planFile}\`.`;
          executionMessage += `\n\n${analysis.suggestion}`;
          executionMessage += `\n\n${generateExecutionStrategy(content)}`;

          const ready = getReadyTasks(analysis.graph);
          if (ready.length > 1) {
            executionMessage += `\n\n**${ready.length} tasks ready for parallel execution.**`;
            executionMessage += `\n\nCall the \`dispatch_ready_tasks\` tool to execute them concurrently as subagents.`;
          } else if (ready.length === 1) {
            executionMessage += `\n\nNext task: [${ready[0].id}] ${ready[0].title}. Execute it now, then call update_progress.`;
          } else {
            executionMessage += `\n\nAll tasks complete or no tasks found.`;
          }

          pi.sendUserMessage(executionMessage, { deliverAs: "steer" });
          return { action: "handled" };
        } catch (err) {
          ctx.ui.notify(`Error reading plan: ${(err as Error).message}`, "error");
          return { action: "handled" };
        }
      }
    }

    // === /planexecute — fully automatic dependency-aware execution ===
    if (text.startsWith("/planexecute")) {
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      try {
        const cwd = planState.cwd || ctx.cwd;
        const planPath = path.join(cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const analysis = analyzePlanStructure(content);

        planState = { phase: "auto-executing", planFile: planState.planFile, cwd: cwd, currentTaskIndex: 0 };
        ctx.ui.notify("Starting auto-execution with dependency scheduling...", "info");
        updatePlanUI(ctx, content);

        let msg = `Auto-executing plan from \`${planState.planFile}\` with dependency-aware scheduling.\n\n`;
        msg += visualizeDependencyGraph(analysis.graph);
        msg += `\n\n${generateExecutionStrategy(content)}`;

        const ready = getReadyTasks(analysis.graph);
        if (ready.length > 1) {
          msg += `\n\n**${ready.length} tasks ready for parallel execution.**`;
          msg += `\n\nCall the \`dispatch_ready_tasks\` tool to execute them concurrently as subagents.`;
          msg += `\n\nAfter these complete, call \`get_progress\` or \`read_plan\` to find the next batch of ready tasks and dispatch them. Repeat until all tasks are complete.`;
        } else if (ready.length === 1) {
          msg += `\n\nExecute task [${ready[0].id}] ${ready[0].title} now. After completing it and calling update_progress, check for newly unblocked tasks and continue.`;
        } else {
          msg += `\n\nNo tasks are ready. All tasks may already be complete.`;
        }

        pi.sendUserMessage(msg, { deliverAs: "steer" });
        return { action: "handled" };
      } catch (err) {
        ctx.ui.notify(`Error: ${(err as Error).message}`, "error");
        return { action: "handled" };
      }
    }

    // === /planstatus ===
    if (text.startsWith("/planstatus")) {
      if (planState.phase === "idle") {
        ctx.ui.notify("No plan in progress.", "warning");
        return { action: "handled" };
      }
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      try {
        const planPath = path.join(planState.cwd || ctx.cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const analysis = analyzePlanStructure(content);
        const graph = analysis.graph;
        const ready = getReadyTasks(graph);
        const blocked = getBlockedTasks(graph);
        const completed = getCompletedTasks(graph);
        const running = getRunningTasks(graph);

        let statusMsg = `📋 Plan Progress: ${completed.length}/${graph.nodes.size} tasks complete`;
        if (running.length > 0) statusMsg += `\n🔄 Running: ${running.map(t => `[${t.id}]`).join(", ")}`;
        if (ready.length > 0) statusMsg += `\n🟢 Ready: ${ready.map(t => `[${t.id}]`).join(", ")}`;
        if (blocked.length > 0) statusMsg += `\n🔴 Blocked: ${blocked.map(t => `[${t.id}]`).join(", ")}`;
        if (analysis.hasPhases) {
          statusMsg += `\n\nPhases: ${analysis.phases.length} total, ${analysis.parallelPhases.length} parallelizable`;
        }
        statusMsg += `\n\nExecution batches: ${graph.executionOrder.length}`;

        updatePlanUI(ctx, content);
        ctx.ui.notify(statusMsg, "info");
        return { action: "handled" };
      } catch {
        ctx.ui.notify("Failed to read plan.", "error");
        return { action: "handled" };
      }
    }

    // === /planlist ===
    if (text.startsWith("/planlist")) {
      if (planState.phase === "idle") {
        ctx.ui.notify("No plan in progress.", "warning");
        return { action: "handled" };
      }
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      try {
        const planPath = path.join(planState.cwd || ctx.cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const enrichedTasks = getEnrichedTasks(content);

        const list = enrichedTasks.map(t => {
          const icon = t.completed ? "✅" : runningTasks.has(t.id) ? "🔄" : "⬜";
          const deps = t.dependencies.length > 0 ? ` ← [${t.dependencies.join(", ")}]` : "";
          const phase = t.phase ? ` (P${t.phase})` : "";
          return `${icon} [${t.id}]${phase} ${t.text}${deps}`;
        }).join("\n");

        ctx.ui.notify(`Tasks:\n${list}`, "info");
        return { action: "handled" };
      } catch {
        ctx.ui.notify("Failed to read plan.", "error");
        return { action: "handled" };
      }
    }

    // === /plandeps ===
    if (text.startsWith("/plandeps")) {
      if (planState.phase === "idle") {
        ctx.ui.notify("No plan in progress.", "warning");
        return { action: "handled" };
      }
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      try {
        const planPath = path.join(planState.cwd || ctx.cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const graph = buildDependencyGraph(content);
        ctx.ui.notify(visualizeDependencyGraph(graph), "info");
        return { action: "handled" };
      } catch {
        ctx.ui.notify("Failed to read plan.", "error");
        return { action: "handled" };
      }
    }

    // === /plancomplete ===
    if (text.startsWith("/plancomplete")) {
      if (planState.phase !== "executing" && planState.phase !== "auto-executing") {
        ctx.ui.notify("Plan not in execution phase.", "warning");
        return { action: "handled" };
      }
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      try {
        const planPath = path.join(planState.cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const progress = getProgressFromContent(content);
        if (progress.completed === progress.total) {
          clearStatusWidget(ctx);
          runningTasks.clear();
          planState = { phase: "idle", planFile: "plan.md", cwd: "", currentTaskIndex: 0 };
          ctx.ui.notify("🎉 Plan marked complete!", "info");
          return { action: "handled" };
        } else {
          ctx.ui.notify(`Plan not complete: ${progress.completed}/${progress.total} tasks done.`, "warning");
          return { action: "handled" };
        }
      } catch {
        ctx.ui.notify("Failed to read plan.", "error");
        return { action: "handled" };
      }
    }

    return { action: "continue" };
  });

  // ──────────────────────────────────────────────────────────
  // Post-turn: auto-detect plan writing → start execution
  // ──────────────────────────────────────────────────────────

  pi.on("turn_end", async (_event, ctx) => {
    if (planState.phase !== "planning") return;

    const entries = ctx.sessionManager.getBranch();
    const lastWriteCall = [...entries].reverse().find((entry: any) => {
      return entry?.type === "message" && entry?.message?.role === "toolCall" && entry?.message?.name === "write";
    }) as any;
    if (!lastWriteCall?.message?.arguments?.path) return;

    const fs = await import("node:fs/promises");
    const path = await import("node:path");

    const planPath = path.join(planState.cwd, planState.planFile);
    const writtenPath = path.resolve(planState.cwd, lastWriteCall.message.arguments.path);
    if (writtenPath === path.resolve(planPath)) {
      try {
        const content = await fs.readFile(planPath, "utf-8");
        const analysis = analyzePlanStructure(content);

        planState = { phase: "executing", planFile: planState.planFile, cwd: planState.cwd, currentTaskIndex: 0 };
        ctx.ui.notify("Planning complete. Analyzing dependencies...", "info");
        updatePlanUI(ctx, content);

        let executionMessage = `Plan written to \`${planState.planFile}\`.\n\n`;
        executionMessage += `${analysis.suggestion}\n\n`;
        executionMessage += visualizeDependencyGraph(analysis.graph);
        executionMessage += `\n${generateExecutionStrategy(content)}`;

        const ready = getReadyTasks(analysis.graph);
        if (ready.length > 1) {
          executionMessage += `\n**${ready.length} tasks ready.** Call \`dispatch_ready_tasks\` to execute them in parallel.`;
        } else if (ready.length === 1) {
          executionMessage += `\nNext task: [${ready[0].id}] ${ready[0].title}. Execute it, then call update_progress.`;
        }

        pi.sendUserMessage(executionMessage, { deliverAs: "steer" });
      } catch {
        // Ignore; agent will handle
      }
    }
  });

  // ──────────────────────────────────────────────────────────
  // Post-agent-end: check for auto-execution continuation
  // ──────────────────────────────────────────────────────────

  pi.on("agent_end", async (_event, ctx) => {
    if (planState.phase === "auto-executing") {
      // In auto-execute mode, check if there are more tasks to dispatch
      const fs = await import("node:fs/promises");
      const path = await import("node:path");

      try {
        const planPath = path.join(planState.cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const progress = getProgressFromContent(content);
        updatePlanUI(ctx, content);

        if (progress.completed === progress.total) {
          clearStatusWidget(ctx);
          runningTasks.clear();
          planState = { phase: "idle", planFile: "plan.md", cwd: "", currentTaskIndex: 0 };
          ctx.ui.notify("🎉 All plan tasks complete!", "info");
          return;
        }

        // More tasks to do — find next batch and dispatch
        const analysis = analyzePlanStructure(content);
        const ready = getReadyTasks(analysis.graph);

        if (ready.length > 0) {
          let msg = `Batch complete. ${progress.completed}/${progress.total} done.\n\n`;
          msg += `${ready.length} new task(s) unblocked and ready:\n`;
          for (const t of ready) {
            msg += `- [${t.id}] ${t.title}\n`;
          }

          if (ready.length > 1) {
            msg += `\nCall \`dispatch_ready_tasks\` to execute these in parallel.`;
          } else {
            msg += `\nExecute [${ready[0].id}] now, then call update_progress.`;
          }

          pi.sendUserMessage(msg, { deliverAs: "followUp" });
        } else {
          // Tasks remain but none are ready — possible issue
          const blocked = getBlockedTasks(analysis.graph);
          let msg = `⚠️ ${progress.completed}/${progress.total} tasks done but ${blocked.length} task(s) are blocked.\n`;
          msg += `Blocked tasks:\n`;
          for (const t of blocked) {
            const unmetDeps = t.dependencies.filter(d => !isTaskCompletedById(content, d));
            msg += `- [${t.id}] ${t.title} — waiting on: ${unmetDeps.join(", ")}\n`;
          }
          msg += `\nCheck if blocked dependencies failed or need manual resolution.`;

          pi.sendUserMessage(msg, { deliverAs: "followUp" });
        }
      } catch {
        planState = { phase: "idle", planFile: "plan.md", cwd: "", currentTaskIndex: 0 };
        clearStatusWidget(ctx);
        ctx.ui.notify("Auto-execution ended (error reading plan).", "error");
      }

      return;
    }

    if (planState.phase === "executing") {
      // For manual execution mode, just update the widget
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const planPath = path.join(planState.cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const progress = getProgressFromContent(content);
        updatePlanUI(ctx, content);

        if (progress.completed === progress.total) {
          clearStatusWidget(ctx);
          runningTasks.clear();
          planState = { phase: "idle", planFile: "plan.md", cwd: "", currentTaskIndex: 0 };
          ctx.ui.notify("🎉 All plan tasks complete!", "info");
        }
      } catch {
        // Ignore
      }
    }
  });

  // ──────────────────────────────────────────────────────────
  // Commands
  // ──────────────────────────────────────────────────────────

  pi.registerCommand("planmode", {
    description: "Start plan mode (planning phase) - e.g., /planmode build a todo app",
    handler: async (args, ctx) => {
      if (ctx.isIdle()) {
        pi.sendUserMessage(`/planmode ${args}`, { deliverAs: "steer" });
      } else {
        ctx.ui.notify("Cannot start plan while agent is busy", "warning");
      }
    },
  });

  pi.registerCommand("execute", {
    description: "Start executing the current plan with dependency-aware scheduling",
    handler: async (_args, ctx) => {
      if (ctx.isIdle()) {
        pi.sendUserMessage("/execute", { deliverAs: "steer" });
      } else {
        ctx.ui.notify("Cannot execute while agent is busy", "warning");
      }
    },
  });

  pi.registerCommand("planexecute", {
    description: "Auto-execute the entire plan — dispatches tasks in dependency order with parallel subagents",
    handler: async (_args, ctx) => {
      if (ctx.isIdle()) {
        pi.sendUserMessage("/planexecute", { deliverAs: "steer" });
      } else {
        ctx.ui.notify("Cannot execute while agent is busy", "warning");
      }
    },
  });

  pi.registerCommand("planstatus", {
    description: "Show plan progress with dependency graph status",
    handler: async (_args, ctx) => {
      if (ctx.isIdle()) {
        pi.sendUserMessage("/planstatus", { deliverAs: "steer" });
      } else {
        ctx.ui.notify("Cannot check status while agent is busy", "warning");
      }
    },
  });

  pi.registerCommand("planlist", {
    description: "List all tasks with dependency and completion info",
    handler: async (_args, ctx) => {
      if (ctx.isIdle()) {
        pi.sendUserMessage("/planlist", { deliverAs: "steer" });
      } else {
        ctx.ui.notify("Cannot list tasks while agent is busy", "warning");
      }
    },
  });

  pi.registerCommand("plandeps", {
    description: "Visualize the dependency graph and execution batches",
    handler: async (_args, ctx) => {
      if (ctx.isIdle()) {
        pi.sendUserMessage("/plandeps", { deliverAs: "steer" });
      } else {
        ctx.ui.notify("Cannot show deps while agent is busy", "warning");
      }
    },
  });

  pi.registerCommand("plancomplete", {
    description: "Mark the plan as complete (only after all tasks are done)",
    handler: async (_args, ctx) => {
      if (ctx.isIdle()) {
        pi.sendUserMessage("/plancomplete", { deliverAs: "steer" });
      } else {
        ctx.ui.notify("Cannot mark plan complete while agent is busy", "warning");
      }
    },
  });

  // ──────────────────────────────────────────────────────────
  // Tools
  // ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "read_plan",
    label: "Read Plan",
    description: "Read the plan file to understand the current implementation plan, dependency graph, and what tasks are ready. Use before starting any task to know what to do next.",
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: Record<string, never>, _signal: AbortSignal | undefined, _onUpdate: any, ctx: any): Promise<any> {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const cwd = planState.cwd || ctx?.cwd || process.cwd();
        const planPath = path.join(cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");

        const analysis = analyzePlanStructure(content);
        const graph = analysis.graph;
        const ready = getReadyTasks(graph);

        let resultText = `Plan content:\n\n${content}`;
        resultText += `\n\n---\n\n${analysis.suggestion}`;
        resultText += `\n\n${visualizeDependencyGraph(graph)}`;
        resultText += `\n${generateExecutionStrategy(content)}`;

        if (ready.length > 1) {
          resultText += `\n**Call \`dispatch_ready_tasks\` to execute these ${ready.length} tasks in parallel.**`;
        } else if (ready.length === 1) {
          resultText += `\n**Next task:** [${ready[0].id}] ${ready[0].title}`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          details: {
            path: planPath,
            totalTasks: graph.nodes.size,
            completedTasks: getCompletedTasks(graph).length,
            readyTasks: ready.map(t => t.id),
            blockedTasks: getBlockedTasks(graph).map(t => t.id),
            executionBatches: graph.executionOrder.length,
            hasParallelPhases: analysis.parallelPhases.length > 0,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error reading plan: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "update_progress",
    label: "Update Plan Progress",
    description: "Update the plan file after completing a task by checking off the corresponding task. Call this AFTER completing a task. Returns the updated dependency status showing newly unblocked tasks.",
    parameters: Type.Object({
      taskIndex: Type.Number({
        description: "The 0-based index of the task completed (e.g., the first task has index 0).",
        examples: [0, 1, 2],
      }),
    }),
    async execute(_toolCallId: string, params: { taskIndex: number }, _signal: AbortSignal | undefined, _onUpdate: any, ctx: any): Promise<any> {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const { taskIndex } = params;

        const cwd = planState.cwd || ctx?.cwd || process.cwd();
        const planPath = path.join(cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");

        // Find the task ID for the given index
        const tasks = extractTasks(content);
        const task = tasks.find(t => t.index === taskIndex);
        if (task) {
          runningTasks.delete(task.id);
        }

        const updatedContent = updatePlanWithTaskDone(content, taskIndex);
        await fs.writeFile(planPath, updatedContent, "utf-8");

        planState.currentTaskIndex = taskIndex + 1;

        // Sync to todo list and update widget
        updateStatusWidget(ctx, updatedContent);
        syncTasksToTodoList(updatedContent, ctx.sessionManager.getSessionName());

        // Analyze the updated dependency graph
        const graph = buildDependencyGraph(updatedContent);
        const ready = getReadyTasks(graph);
        const completed = getCompletedTasks(graph);
        const blocked = getBlockedTasks(graph);

        let resultText = `✅ Task #${taskIndex + 1}${task ? ` [${task.id}]` : ""} marked complete.`;
        resultText += `\n\nProgress: ${completed.length}/${graph.nodes.size} tasks done.`;

        if (ready.length > 0) {
          resultText += `\n\n🟢 Newly unblocked tasks ready for execution:`;
          for (const t of ready) {
            resultText += `\n  - [${t.id}] ${t.title}`;
          }
          if (ready.length > 1) {
            resultText += `\n\nCall \`dispatch_ready_tasks\` to execute these ${ready.length} tasks in parallel as subagents.`;
          }
        }

        if (blocked.length > 0) {
          resultText += `\n\n🔴 ${blocked.length} task(s) still blocked on dependencies.`;
        }

        if (completed.length === graph.nodes.size) {
          resultText += `\n\n🎉 All tasks complete!`;
        }

        return {
          content: [{ type: "text", text: resultText }],
          details: {
            path: planPath,
            completedTaskId: task?.id,
            totalTasks: graph.nodes.size,
            completedTasks: completed.length,
            readyTasks: ready.map(t => t.id),
            blockedTasks: blocked.map(t => t.id),
            allComplete: completed.length === graph.nodes.size,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error updating plan: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  });

  pi.registerTool({
    name: "get_progress",
    label: "Get Plan Progress",
    description: "Get the current progress of the plan, including dependency graph status, ready/blocked tasks, and execution batches.",
    parameters: Type.Object({}),
    async execute(_toolCallId: string, _params: Record<string, never>, _signal: AbortSignal | undefined, _onUpdate: any, ctx: any): Promise<any> {
      try {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");

        const cwd = planState.cwd || ctx?.cwd || process.cwd();
        const planPath = path.join(cwd, planState.planFile);
        const content = await fs.readFile(planPath, "utf-8");
        const analysis = analyzePlanStructure(content);
        const graph = analysis.graph;

        const ready = getReadyTasks(graph);
        const blocked = getBlockedTasks(graph);
        const completed = getCompletedTasks(graph);
        const running = getRunningTasks(graph);

        let resultText = `Progress: ${completed.length}/${graph.nodes.size} tasks complete.\n`;

        if (running.length > 0) {
          resultText += `\n🔄 Running: ${running.map(t => `[${t.id}]`).join(", ")}`;
        }
        if (ready.length > 0) {
          resultText += `\n🟢 Ready: ${ready.map(t => `[${t.id}] ${t.title}`).join(", ")}`;
          if (ready.length > 1) {
            resultText += `\n   → Call \`dispatch_ready_tasks\` to execute these in parallel.`;
          }
        }
        if (blocked.length > 0) {
          resultText += `\n🔴 Blocked: ${blocked.map(t => {
            const unmet = t.dependencies.filter(d => {
              const dep = graph.nodes.get(d);
              return dep && dep.status !== "completed";
            });
            return `[${t.id}] (waiting on: ${unmet.join(", ")})`;
          }).join(", ")}`;
        }

        if (analysis.hasPhases) {
          resultText += `\n\nPhases: ${analysis.phases.length} total, ${analysis.parallelPhases.length} parallelizable`;
        }
        resultText += `\nExecution batches remaining: ${graph.executionOrder.length}`;

        return {
          content: [{ type: "text", text: resultText }],
          details: {
            path: planPath,
            totalTasks: graph.nodes.size,
            completedTasks: completed.length,
            readyTasks: ready.map(t => t.id),
            runningTasks: running.map(t => t.id),
            blockedTasks: blocked.map(t => t.id),
            executionBatches: graph.executionOrder.length,
            hasParallelPhases: analysis.parallelPhases.length > 0,
            allComplete: completed.length === graph.nodes.size,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error getting plan progress: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  });

  // ──────────────────────────────────────────────────────────
  // dispatch_ready_tasks tool - spawns subagents for ready tasks
  // ──────────────────────────────────────────────────────────

  pi.registerTool({
    name: "dispatch_ready_tasks",
    label: "Dispatch Ready Tasks",
    description: "Dispatch all ready (unblocked) tasks as parallel subagents. Each subagent gets an isolated context and works on its assigned task. Call this when multiple tasks are ready for parallel execution.",
    parameters: Type.Object({
      agent: Type.Optional(Type.String({
        description: "Agent name to use for task execution. Default: 'worker'",
        default: "worker",
      })),
      maxConcurrency: Type.Optional(Type.Number({
        description: "Maximum concurrent subagents. Default: 4",
        default: 4,
      })),
    }),
    async execute(_toolCallId: string, params: { agent?: string; maxConcurrency?: number }, signal: AbortSignal | undefined, onUpdate: any, ctx: any): Promise<any> {
      const { spawn } = await import("node:child_process");
      const fsPromises = await import("node:fs/promises");
      const fsSync = await import("node:fs");
      const path = await import("node:path");
      const os = await import("node:os");

      const maxConcurrent = Math.min(params.maxConcurrency || 4, 8);

      try {
        const cwd = planState.cwd || ctx?.cwd || process.cwd();
        const planPath = path.join(cwd, planState.planFile);
        const content = await fsPromises.readFile(planPath, "utf-8");
        const analysis = analyzePlanStructure(content);
        const ready = getReadyTasks(analysis.graph);

        if (ready.length === 0) {
          return {
            content: [{ type: "text", text: "No tasks are ready for execution. All tasks are either complete or blocked on dependencies." }],
            details: { dispatched: 0, ready: 0 },
          };
        }

        // Mark tasks as running
        for (const task of ready) {
          runningTasks.add(task.id);
        }

        const taskPayloads = buildSubagentTaskPayloads(ready, analysis.phases, planState.planFile);

        // Update status widget
        updatePlanUI(ctx, content);

        // Emit initial update
        onUpdate?.({
          content: [{ type: "text", text: `Dispatching ${ready.length} task(s) as parallel subagents...` }],
          details: { dispatched: 0, total: ready.length, results: [] },
        });

        // Run tasks with concurrency limit
        const results: Array<{ taskId: string; success: boolean; output: string; error?: string }> = [];
        let completed = 0;

        const runTask = async (task: DependencyNode, payload: SubagentTaskPayload) => {
          const taskDir = fsSync.mkdtempSync(path.join(os.tmpdir(), `pi-plan-task-`));
          try {
            const args = [
              "--mode", "json", "-p", "--no-session",
              "--model", "claude-sonnet-4-20250514", // Fast model for subagents
            ];

            // Write system prompt if agent exists
            // For now, we just pass the task directly
            const taskPrompt = payload.task;

            return await new Promise<{ taskId: string; success: boolean; output: string; error?: string }>((resolve) => {
              const proc = spawn("pi", [...args, taskPrompt], {
                cwd,
                shell: false,
                stdio: ["ignore", "pipe", "pipe"],
              });

              let stdout = "";
              let stderr = "";
              let lastOutput = "";

              proc.stdout.on("data", (data) => {
                stdout += data.toString();
                // Parse last message for update
                const lines = stdout.split("\n").filter(Boolean);
                for (const line of lines) {
                  try {
                    const event = JSON.parse(line);
                    if (event.type === "message_end" && event.message?.role === "assistant") {
                      for (const part of event.message.content) {
                        if (part.type === "text") lastOutput = part.text;
                      }
                    }
                  } catch {}
                }

                completed++;
                onUpdate?.({
                  content: [{ type: "text", text: `Progress: ${completed}/${ready.length} tasks complete` }],
                  details: { dispatched: completed, total: ready.length, results: [...results] },
                });
              });

              proc.stderr.on("data", (data) => {
                stderr += data.toString();
              });

              proc.on("close", (code) => {
                const success = code === 0;
                results.push({
                  taskId: task.id,
                  success,
                  output: lastOutput || "(no output)",
                  error: success ? undefined : stderr || `Exit code: ${code}`,
                });
                runningTasks.delete(task.id);
                resolve({ taskId: task.id, success, output: lastOutput || "(no output)", error: success ? undefined : stderr });
              });

              proc.on("error", (err) => {
                results.push({
                  taskId: task.id,
                  success: false,
                  output: "",
                  error: err.message,
                });
                runningTasks.delete(task.id);
                resolve({ taskId: task.id, success: false, output: "", error: err.message });
              });

              if (signal?.aborted) {
                proc.kill("SIGTERM");
              }
            });
          } finally {
            try { fsSync.rmdirSync(taskDir); } catch {}
          }
        };

        // Execute with concurrency limit
        const executeWithLimit = async () => {
          const executing: Promise<void>[] = [];
          for (let i = 0; i < ready.length; i++) {
            const promise = runTask(ready[i], taskPayloads[i]).then(() => {});
            executing.push(promise);
            if (executing.length >= maxConcurrent) {
              await Promise.race(executing);
            }
          }
          await Promise.all(executing);
        };

        await executeWithLimit();

        // Update plan file with completed tasks
        let updatedContent = content;
        for (const result of results) {
          if (result.success) {
            updatedContent = updatePlanWithTaskDoneById(updatedContent, result.taskId);
          }
        }
        await fsPromises.writeFile(planPath, updatedContent, "utf-8");

        // Sync to todo list and update widget
        updateStatusWidget(ctx, updatedContent);
        syncTasksToTodoList(updatedContent, ctx.sessionManager.getSessionName());

        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;

        let resultText = `Dispatched ${ready.length} task(s): ${successCount} succeeded, ${failCount} failed.\n\n`;

        for (const r of results) {
          const icon = r.success ? "✅" : "❌";
          const preview = r.output.slice(0, 150) + (r.output.length > 150 ? "..." : "");
          resultText += `${icon} [${r.taskId}]: ${preview}\n`;
          if (r.error) {
            resultText += `   Error: ${r.error.slice(0, 100)}\n`;
          }
        }

        resultText += `\nRun \`read_plan\` or \`get_progress\` to see next batch of ready tasks.`;

        return {
          content: [{ type: "text", text: resultText }],
          details: {
            dispatched: ready.length,
            succeeded: successCount,
            failed: failCount,
            results,
          },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: `Error dispatching tasks: ${(err as Error).message}` }],
          isError: true,
        };
      }
    },
  });
}
