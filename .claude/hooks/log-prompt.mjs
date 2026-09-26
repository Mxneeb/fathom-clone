#!/usr/bin/env node
// Claude Code UserPromptSubmit hook: appends the raw user prompt to .agent-logs/.
// Logged fully raw — no redaction (the user's call; see CAPTURE-TEST.md).
// Deliberately fails open (always exits 0) so a logging problem never blocks the session.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  appendLogEntry,
  extractLatestModel,
  getSessionMeta,
  isUserTypedPrompt,
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
  const promptId = input.prompt_id ?? null;
  const typed = await isUserTypedPrompt(input.transcript_path, promptId);
  const entry = {
    timestamp: new Date().toISOString(),
    role: "user",
    origin: typed ? "human" : "injected",
    session_id: sessionId,
    prompt_id: promptId,
    content: input.prompt ?? null,
    raw: input,
  };

  mkdirSync(logsDir, { recursive: true });
  appendFileSync(join(logsDir, `session-${sessionId}.jsonl`), JSON.stringify(entry) + "\n", "utf8");

  const openTurn = getSessionMeta(sessionId)?.pending_prompt_id;
  if (typed) {
    // The previous prompt never got a RESPONSE: its turn was interrupted
    // (Stop doesn't fire then). Log whatever it produced before moving on.
    if (openTurn) {
      const recovered = recoverTurnText(input.transcript_path, openTurn);
      appendLogEntry({
        sessionId,
        type: "RESPONSE",
        text: recovered.text ?? "(no response text was produced before the interruption)",
        model: recovered.model,
        status: "interrupted (Stop hook did not fire; text recovered from session transcript)",
      });
    }
    appendLogEntry({
      sessionId,
      type: "PROMPT",
      text: entry.content,
      model: extractLatestModel(input.transcript_path),
      promptId,
    });
  } else if (!openTurn) {
    // An injected message that starts a turn on its own (agent was idle):
    // keep it, clearly labelled, so the turn's response has something to
    // pair with. Mid-turn deliveries don't open a new exchange — they stay
    // in the JSONL only.
    appendLogEntry({
      sessionId,
      type: "PROMPT",
      text: entry.content,
      model: extractLatestModel(input.transcript_path),
      promptId,
      status: "system-injected (not typed by the user — e.g. a background task or subagent report)",
    });
  }
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
