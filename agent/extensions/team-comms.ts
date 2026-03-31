import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, unlinkSync, renameSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

const REQUEST_POLL_INTERVAL_MS = 500;
const REQUEST_TIMEOUT_MS = 120000;
const MAX_MESSAGE_BYTES = 4096;

interface ChannelMessage {
  id: string;
  timestamp: string;
  from_agent: string;
  message_type: "discovery" | "decision" | "warning" | "question" | "disagreement";
  content: string;
  references?: string[];
  priority?: "low" | "normal" | "high";
}

interface InputRequest {
  id: string;
  timestamp: string;
  from_agent: string;
  to_agent: string;
  question: string;
  context?: string;
}

interface InputResponse {
  request_id: string;
  timestamp: string;
  from_agent: string;
  content: string;
  status: "answered" | "declined" | "timeout";
}

export default function teamComms(pi: any) {
  const agentName = process.env.PI_AGENT_NAME;
  const commsDir = process.env.PI_TEAM_COMMS_DIR;
  if (!agentName || !commsDir) return;
  const teamDir = process.env.PI_TEAM_DIR || "";
  const channelFile = join(commsDir, "channel.jsonl");
  const requestsDir = join(commsDir, "requests");
  const responsesDir = join(commsDir, "responses");
  pi.on("session_start", async () => {
    mkdirSync(commsDir, { recursive: true });
    mkdirSync(requestsDir, { recursive: true });
    mkdirSync(responsesDir, { recursive: true });
  });
  pi.registerTool({
    name: "post_to_channel",
    description: "Post a message to the shared team channel.",
    parameters: { type: "object", properties: { message_type: { type: "string", enum: ["discovery","decision","warning","question","disagreement"] }, content: { type: "string" }, references: { type: "array", items: { type: "string" } }, priority: { type: "string", enum: ["low","normal","high"] } }, required: ["message_type","content"] },
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      mkdirSync(commsDir, { recursive: true });
      const msg: ChannelMessage = { id: randomUUID(), timestamp: new Date().toISOString(), from_agent: agentName, message_type: params.message_type as any, content: params.content as string, references: params.references as any, priority: (params.priority as any) || "normal" };
      let s = JSON.stringify(msg);
      if (Buffer.byteLength(s) > MAX_MESSAGE_BYTES) { const o = Buffer.byteLength(s) - Buffer.byteLength(msg.content); msg.content = Buffer.from(msg.content).subarray(0, MAX_MESSAGE_BYTES - o - 12).toString() + " [truncated]"; s = JSON.stringify(msg); }
      appendFileSync(channelFile, s + "\n", "utf-8");
      return { content: [{ type: "text" as const, text: "Posted: " + msg.id }] };
    },
  });
  pi.registerTool({
    name: "request_input",
    description: "Request input from a teammate. Pauses until response (2 min max).",
    parameters: { type: "object", properties: { to_agent: { type: "string" }, question: { type: "string" }, context: { type: "string" } }, required: ["to_agent","question"] },
    async execute(_toolCallId: string, params: Record<string, unknown>, signal?: AbortSignal) {
      if (parseInt(process.env.PI_COMMS_DEPTH || "0") >= 1) return { content: [{ type: "text" as const, text: "Cannot nest request_input." }] };
      mkdirSync(requestsDir, { recursive: true });
      mkdirSync(responsesDir, { recursive: true });
      const req: InputRequest = { id: randomUUID(), timestamp: new Date().toISOString(), from_agent: agentName, to_agent: params.to_agent as string, question: params.question as string, context: params.context as string | undefined };
      writeFileSync(join(requestsDir, req.id + ".json"), JSON.stringify(req, null, 2), "utf-8");
      const respFile = join(responsesDir, req.id + ".json");
      const deadline = Date.now() + REQUEST_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled." }] };
        if (existsSync(respFile)) { try { const r: InputResponse = JSON.parse(readFileSync(respFile, "utf-8")); unlinkSync(respFile); return { content: [{ type: "text" as const, text: (r.status === "declined" ? "Declined: " : "From " + r.from_agent + ": ") + r.content }] }; } catch {} }
        await new Promise(r => setTimeout(r, REQUEST_POLL_INTERVAL_MS));
      }
      return { content: [{ type: "text" as const, text: "Timed out after " + (REQUEST_TIMEOUT_MS/1000) + "s." }] };
    },
  });

  pi.registerTool({
    name: "read_expertise",
    description: "Read your expertise file or a teammate's. Returns the mental model / domain knowledge.",
    parameters: { type: "object", properties: { agent_name: { type: "string", description: "Agent name to read (defaults to yourself)" } }, required: [] },
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      if (!teamDir) return { content: [{ type: "text" as const, text: "Knowledge layer unavailable — this team has no folder-based configuration." }] };
      const target = params.agent_name ? String(params.agent_name).toLowerCase().replace(/[^a-z0-9-]/g, "-") : agentName;
      const expertisePath = join(teamDir, "expertise", `${target}.md`);
      if (!existsSync(expertisePath)) return { content: [{ type: "text" as const, text: `No expertise file found for ${target}.` }] };
      try {
        const content = readFileSync(expertisePath, "utf-8");
        return { content: [{ type: "text" as const, text: content }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error reading expertise: ${err}` }] };
      }
    },
  });
  pi.registerTool({
    name: "update_expertise",
    description: "Update your expertise file. Replaces the entire file. Use to refine your mental model after learning something new.",
    parameters: { type: "object", properties: { content: { type: "string", description: "New expertise file content (Markdown)" } }, required: ["content"] },
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      if (!teamDir) return { content: [{ type: "text" as const, text: "Knowledge layer unavailable — this team has no folder-based configuration." }] };
      const content = String(params.content);
      if (Buffer.byteLength(content) > 65536) return { content: [{ type: "text" as const, text: "Expertise file too large (max 64KB)." }] };
      const expertiseDir = join(teamDir, "expertise");
      mkdirSync(expertiseDir, { recursive: true });
      writeFileSync(join(expertiseDir, `${agentName}.md`), content, "utf-8");
      return { content: [{ type: "text" as const, text: `Expertise updated (${Buffer.byteLength(content)} bytes).` }] };
    },
  });
  pi.registerTool({
    name: "add_session_note",
    description: "Record a learning or observation from this session. Appended to your persistent session notes.",
    parameters: { type: "object", properties: { note: { type: "string", description: "What you learned or observed" } }, required: ["note"] },
    async execute(_toolCallId: string, params: Record<string, unknown>) {
      if (!teamDir) return { content: [{ type: "text" as const, text: "Knowledge layer unavailable — this team has no folder-based configuration." }] };
      const note = String(params.note);
      if (Buffer.byteLength(note) > 2048) return { content: [{ type: "text" as const, text: "Note too large (max 2KB)." }] };
      const notesDir = join(teamDir, "session-notes");
      mkdirSync(notesDir, { recursive: true });
      const entry = JSON.stringify({ timestamp: new Date().toISOString(), note }) + "\n";
      appendFileSync(join(notesDir, `${agentName}.jsonl`), entry, "utf-8");
      return { content: [{ type: "text" as const, text: "Session note recorded." }] };
    },
  });
  pi.registerTool({
    name: "read_context",
    description: "Read the shared domain context for this team. Contains baseline knowledge all team members share.",
    parameters: { type: "object", properties: {}, required: [] },
    async execute(_toolCallId: string, _params: Record<string, unknown>) {
      if (!teamDir) return { content: [{ type: "text" as const, text: "Knowledge layer unavailable — this team has no folder-based configuration." }] };
      const contextPath = join(teamDir, "context.md");
      if (!existsSync(contextPath)) return { content: [{ type: "text" as const, text: "No shared context file found for this team." }] };
      try {
        const content = readFileSync(contextPath, "utf-8");
        return { content: [{ type: "text" as const, text: content }] };
      } catch (err) {
        return { content: [{ type: "text" as const, text: `Error reading context: ${err}` }] };
      }
    },
  });

		pi.registerTool({
		name: "compact_session_notes",
		description: "Compact old session notes by replacing the oldest N notes with a summary. Creates a backup first. Use when your session notes are getting long (15+ entries).",
		parameters: {
			type: "object",
			properties: {
				summary: { type: "string", description: "Your written summary of the oldest notes being compacted (max 2KB)" },
				compact_count: { type: "number", description: "Number of oldest notes to replace with the summary" }
			},
			required: ["summary", "compact_count"]
		},
		async execute(_toolCallId: string, params: Record<string, unknown>) {
			const summary = params.summary as string;
			const compact_count = params.compact_count as number;
			if (!teamDir) return "No team directory configured.";
			if (!summary || typeof summary !== "string") return "Summary is required.";
			if (Buffer.byteLength(summary) > 2048) return "Summary too large (max 2KB).";
			if (!compact_count || compact_count < 1) return "compact_count must be at least 1.";

			const notesDir = join(teamDir, "session-notes");
			const notesPath = join(notesDir, `${agentName}.jsonl`);

			if (!existsSync(notesPath)) return "No session notes file found.";

			const raw = readFileSync(notesPath, "utf-8");
			const lines = raw.split("\n").filter(l => l.trim());
			const totalNotes = lines.length;

			if (totalNotes <= 5) return `Only ${totalNotes} notes — no compaction needed (minimum 5 to keep).`;
			const maxCompact = Math.max(0, totalNotes - 5);
			if (compact_count > maxCompact) return `Cannot compact ${compact_count} notes — must keep at least 5 recent. Max compactable: ${maxCompact}.`;

			// Create backup
			const backupPath = notesPath + ".bak";
			writeFileSync(backupPath, raw, "utf-8");

			// Parse date range from compacted notes
			const oldNotes = lines.slice(0, compact_count);
			let fromDate = "", toDate = "";
			try {
				const first = JSON.parse(oldNotes[0]);
				const last = JSON.parse(oldNotes[oldNotes.length - 1]);
				fromDate = first.timestamp || "";
				toDate = last.timestamp || "";
			} catch {}

			// Build summary entry
			const summaryEntry = JSON.stringify({
				timestamp: new Date().toISOString(),
				note: summary,
				summary: true,
				compacted_count: compact_count,
				from: fromDate,
				to: toDate
			});

			// Atomic write: tmp file then rename
			const remaining = lines.slice(compact_count);
			const tmpPath = notesPath + ".tmp";
			writeFileSync(tmpPath, summaryEntry + "\n" + remaining.join("\n") + "\n", "utf-8");
			renameSync(tmpPath, notesPath);

			return `Compacted ${compact_count} notes into 1 summary. ${remaining.length + 1} entries remain. Backup at ${backupPath}`;
		}
	});

}
