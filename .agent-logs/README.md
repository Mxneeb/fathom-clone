# Agent logs

Prompt/response records captured automatically by Claude Code hooks defined in
`.claude/settings.json`. Nothing here is written by hand.

| Event | Script | What it records |
| --- | --- | --- |
| `UserPromptSubmit` | `.claude/hooks/log-prompt.mjs` | the prompt, verbatim |
| `Stop` | `.claude/hooks/log-response.mjs` | the final response of the turn (`last_assistant_message`) |
| `PostToolUse` (matcher `AskUserQuestion`) | `.claude/hooks/log-question.mjs` | a question the agent asked mid-turn, and the user's answer |

All hooks exit `0` no matter what: a logging failure is written to `hook-errors.log` and never
blocks the session.

## Files

- `YYYY-MM-DD_HH-MM-SS_<session-id>.md` — one per session, in the assignment's format: YAML
  front-matter, then `[LOG_ENTRY type=PROMPT|RESPONSE]` blocks with timestamp and model. Prompt and
  final response only: no thinking, tool calls, file reads or intermediate steps.
- `session-<session-id>.jsonl` — the fuller raw record: every hook payload as received, one JSON
  object per line. Also keeps messages the markdown leaves out (see below).
- `.session-index.json` — per-session state (file name, exchange count, last model, open turn) so the
  independently firing hooks agree on where and how to append.

## Entries with a `status:` line

Anything that isn't a plain typed prompt or end-of-turn response is labelled:

- `interrupted` — the user stopped the turn, so `Stop` never fired. On the next prompt, the hook
  recovers everything that turn had said from the session transcript.
- `question to the user` / `answer via AskUserQuestion` — a multiple-choice question and its
  answer. These arrive as tool results, which neither `UserPromptSubmit` nor `Stop` sees.
- `system-injected` — a message Claude Code itself sent (background-task notification, subagent
  report, the auto-continuation after a usage limit resets) that started a turn on its own. Mid-turn
  ones aren't exchanges and go to the JSONL only. Recognised by the `<task-notification>` /
  `<agent-message>` wrapper, or by a non-human `origin` on the prompt's transcript entry.

## Raw, not redacted

Since 2026-09-26 the live hooks log fully raw, by the user's explicit choice. Earlier entries
(2026-09-13 to 2026-09-26) were masked at capture time by `.claude/hooks/redact.mjs`, which replaced
credential-shaped strings with `***REDACTED***` and changed nothing else. That masking was added after
a pasted API key was captured and pushed; see `CAPTURE-TEST.md`.

## Backfilled history

`2026-09-13_07-36-18_c06162be-….md` was rebuilt afterwards from Claude Code's own session transcript
by `scripts/backfill-session-log.mjs`, not captured live. It covers the parts of the original
session that predate the live hooks (research phase, early build). It keeps masking because that
history contains an API key that is still live.

## Known bugs, left in place

The log isn't edited after the fact, so earlier capture bugs are still visible:

- `2026-09-14_11-44-20_c06162be-….md`, prompts 6–9: subagent reports and task notifications logged
  as user prompts, with the gaps between them mislabelled as interrupted turns (fixed in `6f00947`).
- Same file, response 10: that turn was cut off by the usage limit, but its open-turn pointer still
  aimed at an injected message from the buggy period above, so none of its text was recovered.
  Prompt 11, Claude Code's own "usage limit has reset" auto-continuation, is logged as typed (fixed
  in the commit after `83f3b45`).
- `…_c85fa07a-….md` and `…_ae593d63-….md`: headless canary prompts mislabelled `system-injected`
  (fixed in `990b9b4` and `c383f49`).
- `…_1c266c56-….md`: model logged as `unknown` (fixed in `6402c00`).
- `…_c8b69a00-….md`: canary prompt with no response. That session hit the account's usage limit.

Logs are committed alongside the code they produced, not batched at the end.
