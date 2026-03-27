import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync, unlinkSync } from "fs";
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
      const req: InputRequest = { id: randomUUID(), timestamp: new Date().toISOString(), from_agent: agentName, to_agent: params.to_agent as string, question: params.question as string, context: params.context as string | undefined };
      writeFileSync(join(requestsDir, req.id + ".json"), JSON.stringify(req, null, 2), "utf-8");
      const respFile = join(responsesDir, req.id + ".json");
      const deadline = Date.now() + REQUEST_TIMEOUT_MS;
      while (Date.now() < deadline) {
        if (signal?.aborted) return { content: [{ type: "text" as const, text: "Cancelled." }] };
        if (existsSync(respFile)) { try { const r: InputResponse = JSON.parse(readFileSync(respFile, "utf-8")); unlinkSync(respFile); return { content: [{ type: "text" as const, text: (r.status === "declined" ? "Declined: " : "From " + r.from_agent + ": ") + r.content }] }; } catch {} }
        await new Promise(r => setTimeout(r, REQUEST_POLL_INTERVAL_MS));
      }
      try { unlinkSync(join(requestsDir, req.id + ".json")); } catch {}
      return { content: [{ type: "text" as const, text: "Timed out after " + (REQUEST_TIMEOUT_MS/1000) + "s." }] };
    },
  });
}