# Agent logs

Raw, unedited per-turn prompt/response records, captured automatically via Claude Code hooks
defined in `.claude/settings.json`:

- `UserPromptSubmit` → `.claude/hooks/log-prompt.mjs` appends the user's raw prompt text.
- `Stop` → `.claude/hooks/log-response.mjs` appends the assistant's raw response text.

Each session writes to `session-<session_id>.jsonl` (one JSON object per line, in the order
captured). Both hooks always exit `0` — a logging failure never blocks or alters the session,
it only gets recorded to `hook-errors.log` if something goes wrong.

Both hooks also write a second, human-readable log per session via `.claude/hooks/session-log.mjs`:
`YYYY-MM-DD_HH-MM-SS_<session_id>.md`, with YAML front-matter (session id, date, author, model,
tool, project, exchange count, first/last prompt time) followed by `[LOG_ENTRY type=PROMPT|RESPONSE]`
blocks — prompt and final response text only, no thinking, no tool calls, no intermediate steps.
`.session-index.json` tracks per-session filename/exchange-count/model state so both hooks (which
fire independently) agree on where to append. See `CAPTURE-TEST.md` in the repo root for the
canary verification of this mechanism.

One deliberate deviation from a fully raw dump: both formats run prompt/response text through
`.claude/hooks/redact.mjs` before writing, which masks API keys and DB connection-string passwords
(pattern-matched, not content-aware — it doesn't touch anything else). This exists because an
earlier real session in this project pasted a live Groq API key into a prompt, the original
unredacted hook captured it verbatim, and it got committed and pushed before GitHub's push
protection caught it — fixed at the time via `git-filter-repo` history rewrite. Logging raw
secrets into files that ship, uneditable, in a public repo forever is a real risk this project
already hit once; redaction stays on rather than re-opening it.

These files are committed incrementally alongside the corresponding code changes, not batched
at the end.
