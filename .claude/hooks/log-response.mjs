#!/usr/bin/env node
// Claude Code Stop hook: appends the raw assistant response to .agent-logs/.
// Deliberately fails open (always exits 0) so a logging problem never blocks the session.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const logsDir = join(projectDir, ".agent-logs");

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => (data += chunk));
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", () => resolve(data));
  });
}

try {
  const raw = await readStdin();
  let input = {};
  try {
    input = JSON.parse(raw);
  } catch {
    input = { unparsed_raw_stdin: raw };
  }

  const sessionId = input.session_id || "unknown-session";
  const entry = {
    timestamp: new Date().toISOString(),
    role: "assistant",
    session_id: sessionId,
    prompt_id: input.prompt_id ?? null,
    content: input.last_assistant_message ?? input.message ?? null,
    stop_reason: input.stop_reason ?? null,
    raw: input,
  };

  mkdirSync(logsDir, { recursive: true });
  const logFile = join(logsDir, `session-${sessionId}.jsonl`);
  appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf8");
} catch (err) {
  try {
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(
      join(logsDir, "hook-errors.log"),
      `${new Date().toISOString()} log-response error: ${err?.stack || err}\n`,
      "utf8"
    );
  } catch {
    // last resort: swallow — never let logging break the session
  }
}

process.exit(0);
