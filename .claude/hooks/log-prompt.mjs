#!/usr/bin/env node
// Claude Code UserPromptSubmit hook: appends the raw user prompt to .agent-logs/.
// Deliberately fails open (always exits 0) so a logging problem never blocks the session.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { redactDeep } from "./redact.mjs";
import {
  appendLogEntry,
  extractLatestModel,
  getSessionMeta,
  recoverTurnText,
} from "./session-log.mjs";

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
    role: "user",
    session_id: sessionId,
    prompt_id: input.prompt_id ?? null,
    // Known field per current Claude Code docs; kept even if undefined so the
    // shape is consistent, plus the full raw hook payload as a fallback so we
    // never silently lose the record if the field name is wrong.
    content: redactDeep(input.user_input ?? input.prompt ?? null),
    raw: redactDeep(input),
  };

  mkdirSync(logsDir, { recursive: true });
  const logFile = join(logsDir, `session-${sessionId}.jsonl`);
  appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf8");

  // If the previous prompt never got a RESPONSE, its turn was interrupted
  // (Stop doesn't fire then) — log whatever it produced before moving on.
  const pending = getSessionMeta(sessionId)?.pending_prompt_id;
  if (pending) {
    const recovered = recoverTurnText(input.transcript_path, pending);
    appendLogEntry({
      sessionId,
      type: "RESPONSE",
      text: redactDeep(recovered.text) ?? "(no response text was produced before the interruption)",
      model: recovered.model,
      status: "interrupted (Stop hook did not fire; text recovered from session transcript)",
    });
  }

  // Also write the prompt+final-response-only markdown log the assignment
  // spec asks for (per-session file, YAML front-matter, LOG_ENTRY blocks).
  // Model isn't known yet at prompt time, so fall back to the last model
  // seen in this session's transcript so far.
  appendLogEntry({
    sessionId,
    type: "PROMPT",
    text: entry.content,
    model: extractLatestModel(input.transcript_path),
    promptId: input.prompt_id ?? null,
  });
} catch (err) {
  try {
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(
      join(logsDir, "hook-errors.log"),
      `${new Date().toISOString()} log-prompt error: ${err?.stack || err}\n`,
      "utf8"
    );
  } catch {
    // last resort: swallow — never let logging break the session
  }
}

process.exit(0);
