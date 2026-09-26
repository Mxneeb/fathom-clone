// Shared helper for writing the per-session markdown capture log required by
// the assignment's ".agent-logs/" spec: one YYYY-MM-DD_HH-MM-SS_<session-id>.md
// file per session, YAML front-matter, and [LOG_ENTRY type=PROMPT|RESPONSE]
// blocks containing only the prompt and the final response text (no
// thinking, no tool calls, no intermediate steps) — matching that spec's
// format exactly. This sits alongside the existing raw JSONL capture
// (session-<id>.jsonl), which stays as the fuller audit trail.
import {
  existsSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  mkdirSync,
  openSync,
  readSync,
  closeSync,
  fstatSync,
} from "node:fs";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
export const logsDir = join(projectDir, ".agent-logs");
const indexPath = join(logsDir, ".session-index.json");
const AUTHOR = "Mxneeb";
const PROJECT = "fathom-clone";

function loadIndex() {
  try {
    return JSON.parse(readFileSync(indexPath, "utf8"));
  } catch {
    return {};
  }
}

function saveIndex(idx) {
  writeFileSync(indexPath, JSON.stringify(idx, null, 2), "utf8");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function fmtStamp(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}_${pad(
    d.getUTCHours()
  )}-${pad(d.getUTCMinutes())}-${pad(d.getUTCSeconds())}`;
}

function ensureSession(sessionId) {
  mkdirSync(logsDir, { recursive: true });
  const idx = loadIndex();
  if (!idx[sessionId]) {
    const now = new Date();
    const filename = `${fmtStamp(now)}_${sessionId}.md`;
    idx[sessionId] = {
      filename,
      date: now.toISOString().slice(0, 10),
      first_prompt_time: now.toISOString(),
      last_prompt_time: now.toISOString(),
      total_exchanges: 0,
      last_model: "unknown",
    };
    saveIndex(idx);
    const shortId = sessionId.slice(0, 8);
    const header = `---
session_id: ${sessionId}
date: ${idx[sessionId].date}
author: ${AUTHOR}
model: unknown
tool: claude-code
project: ${PROJECT}
total_exchanges: 0
first_prompt_time: ${idx[sessionId].first_prompt_time}
last_prompt_time: ${idx[sessionId].last_prompt_time}
---

# Session Log - ${idx[sessionId].date}

Session: \`${shortId}\` | Project: \`${PROJECT}\` | Author: \`${AUTHOR}\`

---
`;
    writeFileSync(join(logsDir, filename), header, "utf8");
  }
  return idx[sessionId];
}

function rewriteFrontMatter(filename, meta) {
  const p = join(logsDir, filename);
  let content = readFileSync(p, "utf8");
  content = content
    .replace(/total_exchanges: .*/, `total_exchanges: ${meta.total_exchanges}`)
    .replace(/last_prompt_time: .*/, `last_prompt_time: ${meta.last_prompt_time}`)
    .replace(/^model: .*/m, `model: ${meta.last_model}`);
  writeFileSync(p, content, "utf8");
}

// A question the agent asks via AskUserQuestion, and the user's answer, are
// a real exchange mid-turn — logged as RESPONSE (question) + PROMPT (answer).
export function formatQuestions(questions = []) {
  return questions
    .map((q) => {
      const opts = (q.options ?? [])
        .map((o) => `  - ${o.label}${o.description ? `: ${o.description}` : ""}`)
        .join("\n");
      return `[Asked via AskUserQuestion] ${q.question}${opts ? `\n${opts}` : ""}`;
    })
    .join("\n\n");
}

export function formatAnswers(answers = {}) {
  const pairs = Object.entries(answers);
  if (pairs.length === 1) return String(pairs[0][1]);
  return pairs.map(([q, a]) => `Q: ${q}\nA: ${a}`).join("\n\n");
}

export function getSessionMeta(sessionId) {
  return loadIndex()[sessionId] ?? null;
}

// type: "PROMPT" | "RESPONSE". `status` marks entries that aren't a plain
// typed prompt / end-of-turn response (interrupted turns, AskUserQuestion).
// `pending_prompt_id` tracks the typed prompt whose turn is still open, so an
// interrupted turn can be recovered; a mid-turn Q&A leaves it open.
export function appendLogEntry({ sessionId, type, text, model, promptId, status, keepPending = false }) {
  ensureSession(sessionId);
  const idx = loadIndex();
  const current = idx[sessionId];

  const now = new Date().toISOString();
  if (type === "PROMPT") {
    current.total_exchanges += 1;
    current.last_prompt_time = now;
    if (promptId !== undefined) current.pending_prompt_id = promptId;
  } else if (!keepPending) {
    current.pending_prompt_id = null;
  }
  if (model) current.last_model = model;
  saveIndex(idx);

  const shortId = sessionId.slice(0, 8);
  const num = current.total_exchanges;
  const modelTag = model || current.last_model || "unknown";
  const body = text && text.length > 0 ? text : "(empty)";
  const statusLine = status ? `status: ${status}\n` : "";
  const block = `\n[LOG_ENTRY type=${type} num=${num} session=${shortId}]\ntimestamp: ${now}\nmodel: ${modelTag}\n${statusLine}\n${body}\n\n`;
  appendFileSync(join(logsDir, current.filename), block, "utf8");
  if (type === "RESPONSE" && model) fillUnknownPromptModel(current.filename, num, shortId, model);
  rewriteFrontMatter(current.filename, current);
  return { filename: current.filename, num };
}

// The first prompt of a new session is logged before any model has spoken,
// so its model line reads "unknown"; the matching response knows it.
function fillUnknownPromptModel(filename, num, shortId, model) {
  const p = join(logsDir, filename);
  const content = readFileSync(p, "utf8");
  const header = `[LOG_ENTRY type=PROMPT num=${num} session=${shortId}]\n`;
  const at = content.lastIndexOf(header);
  if (at === -1) return;
  const modelLineAt = content.indexOf("\nmodel: unknown\n", at);
  const nextEntryAt = content.indexOf("[LOG_ENTRY", at + header.length);
  if (modelLineAt === -1 || (nextEntryAt !== -1 && modelLineAt > nextEntryAt)) return;
  writeFileSync(
    p,
    content.slice(0, modelLineAt) + `\nmodel: ${model}\n` + content.slice(modelLineAt + "\nmodel: unknown\n".length),
    "utf8"
  );
}

function parseLines(text) {
  return text
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function readTranscript(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  return parseLines(readFileSync(transcriptPath, "utf8"));
}

// Transcripts grow to tens of MB; hooks that only need recent entries read
// the tail. The first (likely partial) line is dropped by the JSON parse.
function readTranscriptTail(transcriptPath, bytes = 4 * 1024 * 1024) {
  if (!transcriptPath || !existsSync(transcriptPath)) return [];
  const fd = openSync(transcriptPath, "r");
  try {
    const size = fstatSync(fd).size;
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    readSync(fd, buf, 0, buf.length, start);
    return parseLines(buf.toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// UserPromptSubmit also fires for messages the harness injects (subagent
// reports, background-task notifications) with an identical payload. Only a
// prompt the user actually sent is recorded in the transcript as a
// human-origin user entry — written just before the hook runs, so a short
// retry covers the race.
export async function isUserTypedPrompt(transcriptPath, promptId) {
  if (!promptId) return true;
  for (let attempt = 0; attempt < 5; attempt++) {
    if (readTranscriptTail(transcriptPath).some((e) => isHumanPrompt(e) && e.promptId === promptId)) return true;
    await sleep(200);
  }
  return false;
}

function isToolResult(entry) {
  const content = entry.message?.content;
  return Array.isArray(content) && content.some((c) => c.type === "tool_result");
}

export function isHumanPrompt(entry) {
  return entry.type === "user" && entry.origin?.kind === "human" && !isToolResult(entry);
}

export function isQuestionAnswer(entry) {
  return entry.type === "user" && isToolResult(entry) && Boolean(entry.toolUseResult?.answers);
}

// Text of the assistant message that carried this AskUserQuestion call — the
// explanation the user read right before answering. Matched by tool_use_id
// so a transcript that hasn't flushed yet can't yield an older question.
export function textBeforeQuestion(transcriptPath, toolUseId) {
  const entries = readTranscript(transcriptPath);
  const carrier = entries.find(
    (e) =>
      e.type === "assistant" &&
      Array.isArray(e.message?.content) &&
      e.message.content.some((b) => b.type === "tool_use" && b.id === toolUseId)
  );
  const messageId = carrier?.message?.id;
  if (!messageId) return null;
  const texts = entries
    .filter((e) => e.type === "assistant" && e.message?.id === messageId && Array.isArray(e.message.content))
    .flatMap((e) => e.message.content.filter((b) => b.type === "text" && b.text?.trim()).map((b) => b.text));
  return texts.length ? texts.join("\n\n") : null;
}

// The Stop hook never fires for a turn the user interrupts, so that turn's
// response would otherwise be missing from the log entirely. Assistant
// entries in the transcript carry no promptId, so the turn is located
// positionally: everything after the human prompt with this promptId, up to
// the next human prompt. All text produced before the interruption is kept.
export function recoverTurnText(transcriptPath, promptId) {
  const entries = readTranscript(transcriptPath);
  const start = entries.findIndex((e) => isHumanPrompt(e) && e.promptId === promptId);
  if (start === -1) return { text: null, model: null };
  let texts = [];
  let model = null;
  for (let i = start + 1; i < entries.length; i++) {
    const e = entries[i];
    if (isHumanPrompt(e)) break;
    // Text before an answered question was already logged with that Q&A.
    if (isQuestionAnswer(e)) {
      texts = [];
      continue;
    }
    if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
    if (e.message.model) model = e.message.model;
    for (const block of e.message.content) {
      if (block.type === "text" && block.text?.trim()) texts.push(block.text);
    }
  }
  return { text: texts.length ? texts.join("\n\n") : null, model };
}

// Best-effort: read the session transcript (path Claude Code hands the Stop
// hook) and pull the most recent assistant message's model name, so a
// mid-build model switch is visible per the spec's requirement.
export function extractLatestModel(transcriptPath) {
  try {
    return readTranscriptTail(transcriptPath).findLast((e) => e.type === "assistant" && e.message?.model)?.message
      .model ?? null;
  } catch {
    return null;
  }
}
