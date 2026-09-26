// One-off: rebuilds a session's prompt/final-response log, in the same
// markdown format the live hooks write, from Claude Code's own session
// transcript (~/.claude/projects/<project>/<session-id>.jsonl). Used for the
// part of the original build session that happened before the live hooks
// existed. Output is clearly labelled as backfilled, not live-captured.
//
// Usage: node scripts/backfill-session-log.mjs <transcript.jsonl> [--until <ISO time>]
import { readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { redactSecrets } from "../.claude/hooks/redact.mjs";
import {
  formatAnswers,
  formatQuestions,
  isHumanPrompt,
  isQuestionAnswer,
} from "../.claude/hooks/session-log.mjs";

const AUTHOR = "Mxneeb";
const PROJECT = "fathom-clone";

const args = process.argv.slice(2);
const transcriptPath = args[0];
const untilIdx = args.indexOf("--until");
const until = untilIdx !== -1 ? args[untilIdx + 1] : null;
if (!transcriptPath) {
  console.error("usage: node scripts/backfill-session-log.mjs <transcript.jsonl> [--until <ISO time>]");
  process.exit(1);
}

const entries = readFileSync(transcriptPath, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((l) => {
    try {
      return JSON.parse(l);
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const isToolResult = (e) =>
  Array.isArray(e.message?.content) && e.message.content.some((c) => c.type === "tool_result");
const textOf = (content) =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.filter((c) => c.type === "text").map((c) => c.text).join("\n")
      : "";
const INTERRUPTED = "interrupted (user stopped the turn; all text produced before it)";
const INJECTED = "system-injected (not typed by the user — e.g. a background task or subagent report)";

// Walk the transcript as a stream of exchanges. A "segment" is the stretch
// of assistant output after a prompt (typed, or an AskUserQuestion answer).
const events = [];
let seg = null;
let lastModel = null;
let lastStopReason = null;

function closeSegment() {
  if (!seg) return;
  const last = seg.texts.at(-1);
  // A completed segment's response is its last assistant message — the same
  // thing the live Stop hook receives as last_assistant_message. An
  // interrupted one has no final message, so keep everything it said.
  const blocks = !last ? [] : seg.interrupted ? seg.texts : seg.texts.filter((t) => t.messageId === last.messageId);
  events.push({
    type: "RESPONSE",
    time: last?.time ?? seg.start,
    text: blocks.map((b) => b.text).join("\n\n") || null,
    model: last?.model ?? lastModel,
    status: seg.interrupted ? INTERRUPTED : null,
  });
  seg = null;
}

for (const e of entries) {
  if (isHumanPrompt(e)) {
    if (until && e.timestamp >= until) break;
    closeSegment();
    events.push({ type: "PROMPT", time: e.timestamp, text: textOf(e.message.content), model: lastModel });
    seg = { texts: [], interrupted: false, start: e.timestamp };
    continue;
  }
  // Harness-injected messages (background task / subagent reports) are
  // stored as queued_command attachments. Mid-turn they don't open a new
  // exchange; one arriving after the turn ended starts a turn of its own.
  if (e.type === "attachment" && e.attachment?.type === "queued_command") {
    if (until && e.timestamp >= until) break;
    if (lastStopReason === "end_turn") {
      closeSegment();
      events.push({ type: "PROMPT", time: e.timestamp, text: String(e.attachment.prompt ?? ""), model: lastModel, status: INJECTED });
      seg = { texts: [], interrupted: false, start: e.timestamp };
    }
    continue;
  }
  if (!seg) continue;
  if (isQuestionAnswer(e)) {
    const { questions, answers } = e.toolUseResult;
    const lead = seg.texts.filter((t) => t.messageId === seg.questionMessageId).map((t) => t.text);
    events.push({
      type: "RESPONSE",
      time: seg.questionTime ?? e.timestamp,
      text: [...lead, formatQuestions(questions)].join("\n\n"),
      model: lastModel,
      status: "question to the user (AskUserQuestion)",
    });
    events.push({ type: "PROMPT", time: e.timestamp, text: formatAnswers(answers), model: lastModel, status: "answer via AskUserQuestion" });
    seg = { texts: [], interrupted: false, start: e.timestamp };
    continue;
  }
  if (e.type === "user" && !isToolResult(e)) {
    if (textOf(e.message?.content).trim().startsWith("[Request interrupted by user")) seg.interrupted = true;
    continue;
  }
  if (e.type === "assistant" && Array.isArray(e.message?.content)) {
    if (e.message.model) lastModel = e.message.model;
    lastStopReason = e.message.stop_reason ?? lastStopReason;
    for (const b of e.message.content) {
      if (b.type === "text" && b.text?.trim()) {
        seg.texts.push({ messageId: e.message.id, text: b.text, time: e.timestamp, model: e.message.model });
      }
      if (b.type === "tool_use" && b.name === "AskUserQuestion") {
        seg.questionMessageId = e.message.id;
        seg.questionTime = e.timestamp;
      }
    }
  }
}
closeSegment();

const prompts = events.filter((ev) => ev.type === "PROMPT");
const sessionId = entries.find((e) => e.sessionId)?.sessionId ?? basename(transcriptPath, ".jsonl");
const shortId = sessionId.slice(0, 8);
const pad = (n) => String(n).padStart(2, "0");
const first = new Date(prompts[0].time);
const stamp = `${first.getUTCFullYear()}-${pad(first.getUTCMonth() + 1)}-${pad(first.getUTCDate())}_${pad(
  first.getUTCHours()
)}-${pad(first.getUTCMinutes())}-${pad(first.getUTCSeconds())}`;

let out = `---
session_id: ${sessionId}
date: ${prompts[0].time.slice(0, 10)}
author: ${AUTHOR}
model: ${lastModel ?? "unknown"}
tool: claude-code
project: ${PROJECT}
total_exchanges: ${prompts.length}
first_prompt_time: ${prompts[0].time}
last_prompt_time: ${prompts.at(-1).time}
---

# Session Log - ${prompts[0].time.slice(0, 10)}

Session: \`${shortId}\` | Project: \`${PROJECT}\` | Author: \`${AUTHOR}\`

> Backfilled on ${new Date().toISOString().slice(0, 10)} from Claude Code's own session transcript by
> \`scripts/backfill-session-log.mjs\` — not captured live. It covers the whole session, including the
> research phase and early build that happened before the live hooks existed. Live-captured records
> of this same session: \`session-${sessionId}.jsonl\` (from when the hooks were installed) and the
> other \`*_${sessionId}.md\` file (from when this markdown format was added). Answers given through
> the agent's multiple-choice questions (AskUserQuestion) appear as PROMPT entries with a \`status:\`
> line, right after the RESPONSE that asked them. Credential-shaped strings are masked with
> \`.claude/hooks/redact.mjs\` because this history contains an API key that is still live — the live
> hooks themselves log fully raw. Nothing else is changed.

---
`;

let num = 0;
for (const ev of events) {
  if (ev.type === "PROMPT") num += 1;
  const status = ev.status ? `status: ${ev.status}\n` : "";
  const empty = ev.type === "PROMPT" ? "(empty)" : "(no response text)";
  out += `\n[LOG_ENTRY type=${ev.type} num=${num} session=${shortId}]\ntimestamp: ${ev.time}\nmodel: ${
    ev.model ?? "unknown"
  }\n${status}\n${redactSecrets(ev.text) || empty}\n\n`;
}

const outPath = join(".agent-logs", `${stamp}_${sessionId}.md`);
writeFileSync(outPath, out, "utf8");
const count = (s) => events.filter((ev) => ev.status?.startsWith(s)).length;
console.log(
  `wrote ${outPath}: ${prompts.length} prompts (${count("answer")} AskUserQuestion answers), ${count("interrupted")} interrupted turns`
);
