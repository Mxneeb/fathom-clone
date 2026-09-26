#!/usr/bin/env node
// Detached helper started by the Stop hook when the model isn't in the
// transcript yet: headless `claude -p` sessions flush the transcript only
// after their hooks return. Waits for the flush, then replaces the
// "model: unknown" lines of that exchange (and the front-matter) with the
// model the transcript recorded. Metadata only — entry text is untouched.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { extractLatestModel, getSessionMeta, logsDir } from "./session-log.mjs";

const [sessionId, transcriptPath, num] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  let model = null;
  for (let i = 0; i < 30 && !model; i++) {
    await sleep(500);
    model = extractLatestModel(transcriptPath);
  }
  const meta = getSessionMeta(sessionId);
  if (model && meta) {
    const p = join(logsDir, meta.filename);
    const shortId = sessionId.slice(0, 8);
    let content = readFileSync(p, "utf8");
    for (const type of ["PROMPT", "RESPONSE"]) {
      const header = `[LOG_ENTRY type=${type} num=${num} session=${shortId}]\n`;
      const at = content.lastIndexOf(header);
      if (at === -1) continue;
      const line = content.indexOf("\nmodel: unknown\n", at);
      const next = content.indexOf("[LOG_ENTRY", at + header.length);
      if (line === -1 || (next !== -1 && line > next)) continue;
      content = content.slice(0, line) + `\nmodel: ${model}\n` + content.slice(line + "\nmodel: unknown\n".length);
    }
    content = content.replace(/^model: unknown$/m, `model: ${model}`);
    writeFileSync(p, content, "utf8");
  }
} catch {
  // best effort — the entry simply keeps "model: unknown"
}
