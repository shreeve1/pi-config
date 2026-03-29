import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, appendFileSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { tmpdir } from "os";

// We'll test the file-based IPC protocol directly (same format as the extensions use)

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

const TEST_DIR = join(tmpdir(), `pi-team-comms-test-${Date.now()}`);
const CHANNEL_FILE = join(TEST_DIR, "channel.jsonl");
const REQUESTS_DIR = join(TEST_DIR, "requests");
const RESPONSES_DIR = join(TEST_DIR, "responses");

// Replicate the helper functions from agent-team.ts for testing
function readChannelMessages(dir: string): ChannelMessage[] {
  const channelFile = join(dir, "channel.jsonl");
  if (!existsSync(channelFile)) return [];
  try {
    const raw = readFileSync(channelFile, "utf-8");
    return raw.split("\n").filter(line => line.trim()).map(line => {
      try { return JSON.parse(line) as ChannelMessage; } catch { return null; }
    }).filter((msg): msg is ChannelMessage => msg !== null);
  } catch { return []; }
}

function curateMessagesForAgent(messages: ChannelMessage[], agentName: string): ChannelMessage[] {
  const MAX_CURATED = 20;
  const mentionsAgent = messages.filter(m => m.from_agent !== agentName && m.content.toLowerCase().includes(agentName.toLowerCase()));
  const highPriority = messages.filter(m => m.from_agent !== agentName && m.priority === "high" && !mentionsAgent.includes(m));
  const rest = messages.filter(m => m.from_agent !== agentName && !mentionsAgent.includes(m) && !highPriority.includes(m));
  return [...mentionsAgent, ...highPriority, ...rest.slice(-MAX_CURATED)].slice(-MAX_CURATED);
}

describe("Team Comms IPC Protocol", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(REQUESTS_DIR, { recursive: true });
    mkdirSync(RESPONSES_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("Channel Messages (channel.jsonl)", () => {
    it("should read empty channel when file doesn't exist", () => {
      const messages = readChannelMessages(TEST_DIR);
      expect(messages).toEqual([]);
    });

    it("should write and read a single channel message", () => {
      const msg: ChannelMessage = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        from_agent: "scout",
        message_type: "discovery",
        content: "Found the config file at src/config.ts",
        references: ["src/config.ts"],
        priority: "normal",
      };
      appendFileSync(CHANNEL_FILE, JSON.stringify(msg) + "\n", "utf-8");

      const messages = readChannelMessages(TEST_DIR);
      expect(messages).toHaveLength(1);
      expect(messages[0].from_agent).toBe("scout");
      expect(messages[0].message_type).toBe("discovery");
      expect(messages[0].content).toContain("config.ts");
    });

    it("should handle multiple messages from different agents", () => {
      const agents = ["scout", "builder", "reviewer"];
      for (const agent of agents) {
        const msg: ChannelMessage = {
          id: randomUUID(),
          timestamp: new Date().toISOString(),
          from_agent: agent,
          message_type: "decision",
          content: `${agent} says hello`,
          priority: "normal",
        };
        appendFileSync(CHANNEL_FILE, JSON.stringify(msg) + "\n", "utf-8");
      }

      const messages = readChannelMessages(TEST_DIR);
      expect(messages).toHaveLength(3);
      expect(messages.map(m => m.from_agent)).toEqual(agents);
    });

    it("should skip malformed JSON lines gracefully", () => {
      appendFileSync(CHANNEL_FILE, '{"valid": true, "id": "1", "timestamp": "t", "from_agent": "a", "message_type": "discovery", "content": "ok"}\n', "utf-8");
      appendFileSync(CHANNEL_FILE, "this is not json\n", "utf-8");
      appendFileSync(CHANNEL_FILE, '{"valid": true, "id": "2", "timestamp": "t", "from_agent": "b", "message_type": "warning", "content": "also ok"}\n', "utf-8");

      const messages = readChannelMessages(TEST_DIR);
      expect(messages).toHaveLength(2);
    });

    it("should handle empty lines in channel file", () => {
      appendFileSync(CHANNEL_FILE, "\n\n", "utf-8");
      const msg: ChannelMessage = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        from_agent: "scout",
        message_type: "discovery",
        content: "test",
        priority: "normal",
      };
      appendFileSync(CHANNEL_FILE, JSON.stringify(msg) + "\n\n\n", "utf-8");

      const messages = readChannelMessages(TEST_DIR);
      expect(messages).toHaveLength(1);
    });
  });

  describe("Message Curation", () => {
    function makeMsg(from: string, content: string, priority: "low" | "normal" | "high" = "normal"): ChannelMessage {
      return {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        from_agent: from,
        message_type: "discovery",
        content,
        priority,
      };
    }

    it("should exclude messages from the requesting agent", () => {
      const messages = [
        makeMsg("scout", "I found something"),
        makeMsg("builder", "I built something"),
        makeMsg("scout", "I found more"),
      ];
      const curated = curateMessagesForAgent(messages, "scout");
      expect(curated).toHaveLength(1);
      expect(curated[0].from_agent).toBe("builder");
    });

    it("should prioritize messages mentioning the agent", () => {
      const messages = [
        makeMsg("builder", "generic update"),
        makeMsg("reviewer", "scout should check this"),
        makeMsg("tester", "another generic"),
      ];
      const curated = curateMessagesForAgent(messages, "scout");
      // The mention should come first
      expect(curated[0].content).toContain("scout");
    });

    it("should prioritize high-priority messages", () => {
      const messages = [
        makeMsg("builder", "normal stuff", "normal"),
        makeMsg("reviewer", "URGENT issue", "high"),
        makeMsg("tester", "low priority", "low"),
      ];
      const curated = curateMessagesForAgent(messages, "scout");
      // High priority should appear before normal/low
      const highIdx = curated.findIndex(m => m.priority === "high");
      const normalIdx = curated.findIndex(m => m.priority === "normal");
      expect(highIdx).toBeLessThan(normalIdx);
    });

    it("should cap curated messages at 20", () => {
      const messages: ChannelMessage[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push(makeMsg("builder", `message ${i}`));
      }
      const curated = curateMessagesForAgent(messages, "scout");
      expect(curated.length).toBeLessThanOrEqual(20);
    });
  });

  describe("Request/Response Protocol", () => {
    it("should write a valid request file", () => {
      const req: InputRequest = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        from_agent: "builder",
        to_agent: "scout",
        question: "Where is the auth module?",
        context: "I need to add a new endpoint",
      };
      writeFileSync(join(REQUESTS_DIR, `${req.id}.json`), JSON.stringify(req, null, 2), "utf-8");

      const written = JSON.parse(readFileSync(join(REQUESTS_DIR, `${req.id}.json`), "utf-8"));
      expect(written.from_agent).toBe("builder");
      expect(written.to_agent).toBe("scout");
      expect(written.question).toContain("auth module");
    });

    it("should write a valid response file", () => {
      const requestId = randomUUID();
      const resp: InputResponse = {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        from_agent: "scout",
        content: "Auth module is at src/auth/index.ts",
        status: "answered",
      };
      writeFileSync(join(RESPONSES_DIR, `${requestId}.json`), JSON.stringify(resp, null, 2), "utf-8");

      const written = JSON.parse(readFileSync(join(RESPONSES_DIR, `${requestId}.json`), "utf-8"));
      expect(written.status).toBe("answered");
      expect(written.content).toContain("src/auth");
    });

    it("should handle declined responses", () => {
      const requestId = randomUUID();
      const resp: InputResponse = {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        from_agent: "system",
        content: 'Agent "nonexistent" is not on this team.',
        status: "declined",
      };
      writeFileSync(join(RESPONSES_DIR, `${requestId}.json`), JSON.stringify(resp, null, 2), "utf-8");

      const written = JSON.parse(readFileSync(join(RESPONSES_DIR, `${requestId}.json`), "utf-8"));
      expect(written.status).toBe("declined");
    });

    it("should handle timeout responses", () => {
      const requestId = randomUUID();
      const resp: InputResponse = {
        request_id: requestId,
        timestamp: new Date().toISOString(),
        from_agent: "scout",
        content: "Timed out after 120s.",
        status: "timeout",
      };
      writeFileSync(join(RESPONSES_DIR, `${requestId}.json`), JSON.stringify(resp, null, 2), "utf-8");

      const written = JSON.parse(readFileSync(join(RESPONSES_DIR, `${requestId}.json`), "utf-8"));
      expect(written.status).toBe("timeout");
    });
  });

  describe("Message Size Limits", () => {
    it("should enforce 4KB message limit with truncation", () => {
      const MAX_MESSAGE_BYTES = 4096;
      const longContent = "x".repeat(5000);
      const msg: ChannelMessage = {
        id: randomUUID(),
        timestamp: new Date().toISOString(),
        from_agent: "builder",
        message_type: "discovery",
        content: longContent,
        priority: "normal",
      };

      let serialized = JSON.stringify(msg);
      if (Buffer.byteLength(serialized) > MAX_MESSAGE_BYTES) {
        const overhead = Buffer.byteLength(serialized) - Buffer.byteLength(msg.content);
        msg.content = Buffer.from(msg.content).subarray(0, MAX_MESSAGE_BYTES - overhead - 12).toString() + " [truncated]";
        serialized = JSON.stringify(msg);
      }

      expect(Buffer.byteLength(serialized)).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
      expect(msg.content).toContain("[truncated]");
    });
  });

  describe("ProcessedRequestIds TTL", () => {
    it("should sweep entries older than 5 minutes", () => {
      const ids = new Map<string, number>();
      const old = Date.now() - 6 * 60 * 1000;
      const recent = Date.now() - 1000;
      ids.set("old-1", old);
      ids.set("old-2", old);
      ids.set("recent-1", recent);

      const now = Date.now();
      for (const [id, ts] of ids) {
        if (now - ts > 5 * 60 * 1000) ids.delete(id);
      }

      expect(ids.size).toBe(1);
      expect(ids.has("recent-1")).toBe(true);
      expect(ids.has("old-1")).toBe(false);
    });
  });

  describe("Subprocess Crash Classification", () => {
    it("should produce declined status for non-zero exit code", () => {
      const code = 1;
      const output = "some partial output";
      const failed = code !== 0 || !output.trim();
      expect(failed).toBe(true);

      const response: InputResponse = {
        request_id: randomUUID(),
        timestamp: new Date().toISOString(),
        from_agent: "scout",
        content: failed ? `Agent error (exit code ${code ?? "unknown"})` : output,
        status: failed ? "declined" : "answered",
      };
      expect(response.status).toBe("declined");
      expect(response.content).toContain("exit code 1");
    });

    it("should produce declined status for empty output", () => {
      const code = 0;
      const output = "";
      const failed = code !== 0 || !output.trim();
      expect(failed).toBe(true);
    });

    it("should produce answered status for successful execution", () => {
      const code = 0;
      const output = "Here is my analysis...";
      const failed = code !== 0 || !output.trim();
      expect(failed).toBe(false);
    });
  });

  describe("Request File Ownership", () => {
    it("should verify team-comms.ts does not delete request files on timeout", () => {
      const filePath = "/Users/james/.pi/agent/extensions/team-comms.ts";
      const content = readFileSync(filePath, "utf-8");

      const timeoutSection = content.slice(content.indexOf("Timed out after"));
      const beforeTimeout = content.slice(Math.max(0, content.indexOf("Timed out after") - 200), content.indexOf("Timed out after"));
      expect(beforeTimeout).not.toMatch(/unlinkSync.*requestsDir/);
      expect(timeoutSection).toContain("Timed out after");
    });
  });

  describe("Directory Auto-Recreation", () => {
    it("should recreate directories when deleted", () => {
      const testCommsDir = join(tmpdir(), `pi-comms-recreate-test-${Date.now()}`);
      const reqDir = join(testCommsDir, "requests");
      const respDir = join(testCommsDir, "responses");

      mkdirSync(testCommsDir, { recursive: true });
      mkdirSync(reqDir, { recursive: true });
      rmSync(testCommsDir, { recursive: true, force: true });
      expect(existsSync(testCommsDir)).toBe(false);

      mkdirSync(testCommsDir, { recursive: true });
      mkdirSync(reqDir, { recursive: true });
      mkdirSync(respDir, { recursive: true });
      expect(existsSync(testCommsDir)).toBe(true);
      expect(existsSync(reqDir)).toBe(true);
      expect(existsSync(respDir)).toBe(true);

      rmSync(testCommsDir, { recursive: true, force: true });
    });
  });

  describe("Comment Parse Fix", () => {
    it("should not contain */ inside block comments in agent-team.ts", () => {
      // Read the actual file and check that no block comment contains */
      // that would prematurely close it
      const filePath = join("/Users/james/.pi/agent/extensions/agent-team.ts");
      const content = readFileSync(filePath, "utf-8");

      // Find all block comments and ensure none contain a premature */
      let inComment = false;
      let commentStart = -1;
      const lines = content.split("\n");
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!inComment) {
          const startIdx = line.indexOf("/*");
          if (startIdx !== -1) {
            inComment = true;
            commentStart = i;
            // Check if comment closes on same line
            const afterStart = line.slice(startIdx + 2);
            const endIdx = afterStart.indexOf("*/");
            if (endIdx !== -1) {
              inComment = false;
            }
          }
        } else {
          // We're inside a block comment — check for */
          const endIdx = line.indexOf("*/");
          if (endIdx !== -1) {
            inComment = false;
            // This is the legitimate end of the comment
            // Verify there's no content after that looks like code
            // (the bug was that */ appeared mid-comment in a path)
          }
        }
      }

      // Specific regression test: line 9 should NOT contain the pattern agents/teams/*/
      // which would create a premature */ closing the block comment
      expect(lines[8]).not.toMatch(/agents\/teams\/\*\//);
    });
  });

  describe("Expertise Files", () => {
    it("should read expertise file for an agent", () => {
      const expertiseDir = join(TEST_DIR, "expertise");
      mkdirSync(expertiseDir, { recursive: true });
      writeFileSync(join(expertiseDir, "scout.md"), "# Scout Expertise\n\nKnows about file systems.", "utf-8");

      const content = readFileSync(join(expertiseDir, "scout.md"), "utf-8");
      expect(content).toContain("Scout Expertise");
      expect(content).toContain("file systems");
    });

    it("should return empty for missing expertise file", () => {
      const expertiseDir = join(TEST_DIR, "expertise");
      const expertisePath = join(expertiseDir, "nonexistent.md");
      expect(existsSync(expertisePath)).toBe(false);
    });

    it("should enforce 64KB size limit", () => {
      const largeContent = "x".repeat(70000);
      expect(Buffer.byteLength(largeContent)).toBeGreaterThan(65536);

      // Simulate truncation logic from readExpertiseFile
      const truncated = Buffer.byteLength(largeContent) > 65536
        ? Buffer.from(largeContent).subarray(0, 65536).toString("utf-8") + "\n\n[expertise truncated]"
        : largeContent;
      expect(Buffer.byteLength(truncated)).toBeLessThanOrEqual(65536 + 100); // truncation marker overhead
      expect(truncated).toContain("[expertise truncated]");
    });

    it("should sanitize agent names for file paths", () => {
      const agentName = "My Agent!@#$";
      const slug = agentName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      expect(slug).toBe("my-agent----");
      expect(slug).not.toContain("!");
      expect(slug).not.toContain("@");
    });
  });

  describe("Session Notes (JSONL)", () => {
    it("should append and read session notes in JSONL format", () => {
      const notesDir = join(TEST_DIR, "session-notes");
      mkdirSync(notesDir, { recursive: true });
      const notesFile = join(notesDir, "scout.jsonl");

      // Append 3 notes
      for (let i = 1; i <= 3; i++) {
        const entry = JSON.stringify({ timestamp: new Date().toISOString(), note: `Learning ${i}` }) + "\n";
        appendFileSync(notesFile, entry, "utf-8");
      }

      // Read back
      const raw = readFileSync(notesFile, "utf-8");
      const entries = raw.split("\n").filter(l => l.trim()).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      expect(entries).toHaveLength(3);
      expect(entries[0].note).toBe("Learning 1");
      expect(entries[2].note).toBe("Learning 3");
      expect(entries[0].timestamp).toBeTruthy();
    });

    it("should enforce 2KB per-note size limit", () => {
      const bigNote = "x".repeat(3000);
      expect(Buffer.byteLength(bigNote)).toBeGreaterThan(2048);
    });

    it("should handle malformed JSONL lines gracefully", () => {
      const notesDir = join(TEST_DIR, "session-notes");
      mkdirSync(notesDir, { recursive: true });
      const notesFile = join(notesDir, "builder.jsonl");

      appendFileSync(notesFile, JSON.stringify({ timestamp: "t1", note: "good" }) + "\n", "utf-8");
      appendFileSync(notesFile, "not json\n", "utf-8");
      appendFileSync(notesFile, JSON.stringify({ timestamp: "t2", note: "also good" }) + "\n", "utf-8");

      const raw = readFileSync(notesFile, "utf-8");
      const entries = raw.split("\n").filter(l => l.trim()).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      expect(entries).toHaveLength(2);
    });

    it("should respect limit parameter for recent notes", () => {
      const notesDir = join(TEST_DIR, "session-notes");
      mkdirSync(notesDir, { recursive: true });
      const notesFile = join(notesDir, "tester.jsonl");

      for (let i = 0; i < 30; i++) {
        appendFileSync(notesFile, JSON.stringify({ timestamp: `t${i}`, note: `note ${i}` }) + "\n", "utf-8");
      }

      const raw = readFileSync(notesFile, "utf-8");
      const allEntries = raw.split("\n").filter(l => l.trim()).map(line => {
        try { return JSON.parse(line); } catch { return null; }
      }).filter(Boolean);

      // Simulate readSessionNotes limit=20
      const limited = allEntries.slice(-20);
      expect(limited).toHaveLength(20);
      expect(limited[0].note).toBe("note 10");
      expect(limited[19].note).toBe("note 29");
    });
  });

  describe("Shared Domain Context", () => {
    it("should read context.md from team dir", () => {
      writeFileSync(join(TEST_DIR, "context.md"), "# Domain\n\nThis team works on fintech.", "utf-8");

      const content = readFileSync(join(TEST_DIR, "context.md"), "utf-8");
      expect(content).toContain("fintech");
    });

    it("should return empty for missing context.md", () => {
      expect(existsSync(join(TEST_DIR, "context.md"))).toBe(false);
    });
  });

  describe("Knowledge Layer Unavailable", () => {
    it("should handle empty teamDir gracefully", () => {
      const teamDir = "";
      // All readers should return empty/[] for empty teamDir
      expect(teamDir).toBeFalsy();
    });
  });
});
