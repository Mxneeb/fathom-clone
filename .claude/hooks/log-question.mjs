#!/usr/bin/env node
// Claude Code PostToolUse hook (matcher: AskUserQuestion): a question the
// agent asks mid-turn and the user's answer are a real exchange that neither
// UserPromptSubmit nor Stop sees, so log them as RESPONSE + PROMPT.
// Deliberately fails open (always exits 0) so a logging problem never blocks the session.
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { redactDeep } from "./redact.mjs";
import {
  appendLogEntry,
  extractLatestModel,
  formatAnswers,
  formatQuestions,
  textBeforeQuestion,
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
  const input = JSON.parse(await readStdin());
  if (input.tool_name === "AskUserQuestion") {
    const sessionId = input.session_id || "unknown-session";
    const questions = input.tool_response?.questions ?? input.tool_input?.questions ?? [];
    const answers = input.tool_response?.answers;
    const model = extractLatestModel(input.transcript_path);

    mkdirSync(logsDir, { recursive: true });
    appendFileSync(
      join(logsDir, `session-${sessionId}.jsonl`),
      JSON.stringify({
        timestamp: new Date().toISOString(),
        role: "ask_user_question",
        session_id: sessionId,
        prompt_id: input.prompt_id ?? null,
        raw: input,
      }) + "\n",
      "utf8"
    );

    const lead = textBeforeQuestion(input.transcript_path, input.tool_use_id);
    appendLogEntry({
      sessionId,
      type: "RESPONSE",
      text: [lead, formatQuestions(questions)].filter(Boolean).join("\n\n"),
      model,
      status: "question to the user (AskUserQuestion)",
      keepPending: true,
    });
    appendLogEntry({
      sessionId,
      type: "PROMPT",
      // Fall back to the raw tool_response if its shape isn't the expected one.
      text: answers ? formatAnswers(answers) : JSON.stringify(input.tool_response ?? null),
      model,
      status: "answer via AskUserQuestion",
    });
  }
} catch (err) {
  try {
    mkdirSync(logsDir, { recursive: true });
    appendFileSync(
      join(logsDir, "hook-errors.log"),
      `${new Date().toISOString()} log-question error: ${err?.stack || err}\n`,
      "utf8"
    );
  } catch {
    // last resort: swallow — never let logging break the session
  }
}

process.exit(0);
