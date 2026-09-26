# Capture Test

## Tool and model

- **Tool:** Claude Code (CLI, v2.1.283).
- **Model:** `claude-opus-5-5` (Opus 5.5) from 2026-09-26 on, `claude-sonnet-5` (Sonnet 5) before that.
  One model does both the planning and the executing; there is no separate planner. Every log entry
  carries the model name, so the switch shows up in the log (from prompt 5 of the
  `2026-09-14_11-44-20_c06162be-…` file on).
- **Automatic mechanism:** yes. Claude Code hooks, checked against the hooks documentation
  (`code.claude.com/docs/en/hooks.md`) rather than assumed.

## Mechanism and config

Config file: **`.claude/settings.json`** (project-level, so every session opened in this repo gets it,
interactive or headless).

| Hook event | Script | Captures |
| --- | --- | --- |
| `UserPromptSubmit` | `.claude/hooks/log-prompt.mjs` | the prompt, verbatim |
| `Stop` | `.claude/hooks/log-response.mjs` | the turn's final response (`last_assistant_message`) |
| `PostToolUse`, matcher `AskUserQuestion` | `.claude/hooks/log-question.mjs` | a question asked mid-turn and the user's answer |

Shared logic lives in `.claude/hooks/session-log.mjs`. `.claude/hooks/fill-model.mjs` fills in the
model name for headless sessions, whose transcript isn't on disk yet when their hooks run. Output
follows the requested format: one `YYYY-MM-DD_HH-MM-SS_<session-id>.md` per session, YAML
front-matter, `[LOG_ENTRY]` blocks with a UTC timestamp and model, prompt and final response only.
Entries that aren't a plain prompt or response (interrupted turns, questions and answers, messages
Claude Code sent itself) get a `status:` line. `.agent-logs/README.md` has the details.

Logging is **fully raw**, by the user's decision on 2026-09-26 (see below).

## Log files the canaries landed in

- **Canary 1** (this project's main interactive session, typed by the user):
  `.agent-logs/2026-09-14_11-44-20_c06162be-0328-4473-8851-3c2b4ffea34a.md`, entries `num=12`
- **Canary 2** (a second, separate session: headless `claude -p` started from the repo folder):
  `.agent-logs/2026-09-26_05-01-34_e8e0c9b1-7e2c-4f66-9a3f-1c6758bfe609.md`

For canary 2, the user chose to have the agent start the second session rather than open a
terminal themselves. So that prompt was sent by the agent, not typed by the user. It is still a
genuinely separate Claude Code session with its own ID, picking the hooks up from
`.claude/settings.json`.

## Canary entries, raw

**Canary 1**

```
[LOG_ENTRY type=PROMPT num=12 session=c06162be]
timestamp: 2026-09-26T05:06:34.305Z
model: claude-opus-5-5

CAPTURE TEST — 8x assignment, Muneeb Ahmad


[LOG_ENTRY type=RESPONSE num=12 session=c06162be]
timestamp: 2026-09-26T05:09:04.842Z
model: claude-opus-5-5

Canary received. Your prompt landed in this session's log as `PROMPT num=12`: `origin: human`, tagged `claude-opus-5-5`, verbatim. This reply becomes its `RESPONSE`, logged by the Stop hook as soon as this turn ends.

The canary also surfaced one more bug, now fixed. When your usage limit reset, Claude Code sent "Your claude.ai usage limit has reset…" into the session itself, and the hook logged that as if you'd typed it (prompt 11). Its transcript entry says `origin: auto-continuation`, so the hook now checks that too. I re-ran the check on every prompt recorded so far: all 9 system messages are caught, and every real prompt is still counted as typed.

**Next, no action needed from you:** a background watcher wakes me once this response is in the log. Then I'll write `CAPTURE-TEST.md` with both canaries pasted raw, plus the full list of what didn't work first, and push it. Before building the redesign, I'll ask you to pick a design direction, since 8x want your own design choices.
```

**Canary 2**

```
[LOG_ENTRY type=PROMPT num=1 session=e8e0c9b1]
timestamp: 2026-09-26T05:01:34.472Z
model: claude-opus-5-5

CAPTURE TEST — 8x assignment, Muneeb Ahmad


[LOG_ENTRY type=RESPONSE num=1 session=e8e0c9b1]
timestamp: 2026-09-26T05:01:51.839Z
model: claude-opus-5-5

Your prompt was captured. `.agent-logs/2026-09-26_04-52-56_c8b69a00-7806-4495-b744-d1c75381b93d.md` logs it as `PROMPT num=1` with the exact text "CAPTURE TEST — 8x assignment, Muneeb Ahmad", timestamped `2026-09-26T04:52:56.531Z`.

- **Model field:** it says `model: unknown` in both the header and the entry. Your latest commit (6402c00) is supposed to fill the model in for headless sessions once the transcript is written to disk, and that may not have happened yet. Check the file again after this reply lands to see whether it changes to `claude-opus-5-5`.
- **Author field:** it says `Mxneeb`, not "Muneeb Ahmad". That's presumably your system username, but it's worth checking if you expected your git name there.

Separately, several claude.ai connectors (Asana, Atlassian, Box, Canva, Figma, Gmail, Google Calendar, HubSpot, Intercom, Linear, Notion, Slack, monday.com) need authorizing in your claude.ai connector settings before they'll work. That doesn't affect this test.
```

(Canary 2's session misread which file was its own. It went looking in `.agent-logs/` and reported
on the previous attempt's file, `c8b69a00`, which hit a usage limit. Its own entry above is
correct. The `Mxneeb` author is intended: it's the GitHub handle the format asks for.)

## What didn't work first

In the order it happened. None of the log entries these produced have been edited or removed.

1. **I didn't set up capture when first asked (2026-09-13).** Fetching the setup page was blocked by
   Claude Code's own permission classifier ("Exfil Scouting"). In the browser, the page renders only
   as an image: no text in the DOM or the accessibility tree. From that, plus the ask to auto-commit
   raw conversations to a public repo, I concluded it was probably a data-exfiltration attempt, and I
   refused to install the hook. The user then told me to build real capture with Claude Code's own
   hooks, and I did. **That conclusion was wrong.** The page is 8x's genuine setup doc. It renders as
   an image so candidates paste it into their agent themselves, which is exactly what its first line
   says to do.
2. **The first hooks captured a live API key.** The original raw hooks (JSONL only) logged a Groq key
   the user pasted into a prompt. GitHub push protection blocked the push, and the history was
   rewritten with `git-filter-repo`. I then added masking of credential-shaped strings
   (`redact.mjs`), whose first version garbled its output through a regex capture-group bug.
3. **The first canaries weren't real sessions (2026-09-14).** When this markdown format was added,
   both "canaries" were fake hook payloads piped into the scripts under made-up session IDs. They
   exercised the code, not Claude Code firing the hooks. Superseded by the two canaries above.
4. **Gaps found on re-verification (2026-09-26):**
   - Interrupted turns lost their response, because `Stop` doesn't fire on interrupt. The response
     is now recovered from the transcript on the next prompt.
   - Answers given through AskUserQuestion weren't captured. Those include the answer that set the
     capture approach in item 1. The docs don't say whether this tool fires `PostToolUse`, so it was
     tested live; it does.
   - History from before the hooks existed was missing. It was rebuilt from Claude Code's own
     transcript by `scripts/backfill-session-log.mjs` into
     `2026-09-13_07-36-18_c06162be-….md`, labelled as backfilled.
5. **Messages Claude Code sent itself were logged as user prompts.** First it was subagent reports
   and background-task notifications (prompts 6–9 of the main session file). Fixing that took four
   tries:
   - Checking for a human `origin` on the transcript entry broke headless sessions, which write no
     `origin`. Canary 2 attempt 1 (`c85fa07a`) was mislabelled as injected.
   - Accepting `promptSource` instead still failed. Headless sessions write the prompt to the
     transcript only after the hook returns, so attempt 2 (`ae593d63`) was mislabelled too. That
     canary session worked out the cause from timestamps itself.
   - Detecting the harness's `<task-notification>` / `<agent-message>` wrappers worked, until the
     usage-limit auto-continuation (prompt 11) arrived with no wrapper.
   - The current check uses the wrapper **or** an explicit non-human `origin` on the transcript
     entry, and defaults to typed when there's no evidence either way.
6. **Headless sessions logged `model: unknown`** (attempt 3, `1c266c56`), for the same flush-timing
   reason. That's now filled in by a detached helper once the transcript lands. Honest caveat: so far
   this path is verified only by an isolated test. The final headless canary had its transcript on
   disk in time and didn't need it.
7. **Attempt 4 (`c8b69a00`) hit the account's usage limit** after its prompt was logged, so it has
   no response.

## Deviation: raw vs. masked

From item 2 until 2026-09-26, entries were masked at capture time: credential-shaped strings became
`***REDACTED***`, nothing else changed. Asked directly, the user chose **fully raw**, so the live
hooks no longer mask anything. Two leftovers:

- One edit was blocked by Claude Code's permission classifier: dropping the now-unused `redact`
  import from `log-question.mjs`. It's harmless and left as is.
- The backfilled history stays masked, because it contains an API key the deployed app still uses.
