// Shared helper for writing the per-session markdown capture log required by
// the assignment's ".agent-logs/" spec: one YYYY-MM-DD_HH-MM-SS_<session-id>.md
// file per session, YAML front-matter, and [LOG_ENTRY type=PROMPT|RESPONSE]
// blocks containing only the prompt and the final response text (no
// thinking, no tool calls, no intermediate steps) — matching that spec's
// format exactly. This sits alongside the existing raw JSONL capture
// (session-<id>.jsonl), which stays as the fuller audit trail.
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "node:fs";
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

// type: "PROMPT" | "RESPONSE"
export function appendLogEntry({ sessionId, type, text, model }) {
  ensureSession(sessionId);
  const idx = loadIndex();
  const current = idx[sessionId];

  const now = new Date().toISOString();
  if (type === "PROMPT") current.total_exchanges += 1;
  current.last_prompt_time = now;
  if (model) current.last_model = model;
  saveIndex(idx);

  const shortId = sessionId.slice(0, 8);
  const num = current.total_exchanges;
  const modelTag = model || current.last_model || "unknown";
  const body = text && text.length > 0 ? text : "(empty)";
  const block = `\n[LOG_ENTRY type=${type} num=${num} session=${shortId}]\ntimestamp: ${now}\nmodel: ${modelTag}\n\n${body}\n\n`;
  appendFileSync(join(logsDir, current.filename), block, "utf8");
  rewriteFrontMatter(current.filename, current);
  return { filename: current.filename, num };
}

// Best-effort: read the session transcript (path Claude Code hands the Stop
// hook) and pull the most recent assistant message's model name, so a
// mid-build model switch is visible per the spec's requirement.
export function extractLatestModel(transcriptPath) {
  if (!transcriptPath || !existsSync(transcriptPath)) return null;
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    let model = null;
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry.type === "assistant" && entry.message?.model) {
        model = entry.message.model;
      }
    }
    return model;
  } catch {
    return null;
  }
}
