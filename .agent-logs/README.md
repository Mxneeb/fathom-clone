# Agent logs

Raw, unedited per-turn prompt/response records, captured automatically via Claude Code hooks
defined in `.claude/settings.json`:

- `UserPromptSubmit` → `.claude/hooks/log-prompt.mjs` appends the user's raw prompt text.
- `Stop` → `.claude/hooks/log-response.mjs` appends the assistant's raw response text.

Each session writes to `session-<session_id>.jsonl` (one JSON object per line, in the order
captured). Both hooks always exit `0` — a logging failure never blocks or alters the session,
it only gets recorded to `hook-errors.log` if something goes wrong.

These files are committed incrementally alongside the corresponding code changes, not batched
at the end.
