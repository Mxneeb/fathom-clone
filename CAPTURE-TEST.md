# Capture Test

## Tool and model

- **Tool:** Claude Code
- **Model:** `claude-sonnet-5` (single model — this session doesn't split plan/execute
  across two models). Recorded per-entry in the log so a mid-build switch would be visible.

## Mechanism

Claude Code hooks, configured in `.claude/settings.json`:

- `UserPromptSubmit` → `.claude/hooks/log-prompt.mjs`
- `Stop` (end of turn; receives `transcript_path` on stdin, per the setup doc's own
  description of this mechanism) → `.claude/hooks/log-response.mjs`

Both fire automatically, on every prompt and every turn, with no manual step. They were
already wired up before this specific format was requested (see `.agent-logs/README.md`
and the commit history) — what changed here is the output format, via a new shared
helper `.claude/hooks/session-log.mjs` that both hooks call.

**Config file changed:** `.claude/settings.json` (hook wiring, pre-existing), plus new
`.claude/hooks/session-log.mjs` (this session's addition, for the markdown format below).

## Log path

`.agent-logs/YYYY-MM-DD_HH-MM-SS_<session-id>.md` — one file per session, created on that
session's first captured prompt. A `.agent-logs/.session-index.json` sidecar tracks which
file/exchange-count/model belongs to which session id so the two independently-firing
hooks agree on where to append.

## Canary entries

Two canaries were run against two different, unrelated session ids — not the session that
defines the hook config — to confirm the mechanism isn't scoped to only the session that
installed it (the config lives in `.claude/settings.json` at the project level, so every
Claude Code session opened in this repo gets it identically; this was also verified
directly by invoking the hook scripts with two fabricated session ids, since spinning up
a literal second interactive terminal isn't practical from inside this session).

**Canary 1** — `.agent-logs/2026-09-14_11-42-41_67203021-07df-4813-b508-48b66ce69f34.md`:

```
[LOG_ENTRY type=PROMPT num=1 session=67203021]
timestamp: 2026-09-14T11:42:41.812Z
model: claude-sonnet-5

CAPTURE TEST — 8x assignment, Muneeb Ahmad


[LOG_ENTRY type=RESPONSE num=1 session=67203021]
timestamp: 2026-09-14T11:42:41.903Z
model: claude-sonnet-5

Canary acknowledged — capture hook fired automatically for session 67203021-07df-4813-b508-48b66ce69f34 (Claude Code Stop hook).
```

**Canary 2** — `.agent-logs/2026-09-14_11-42-54_6989448b-1172-43db-953f-dfeb0ca90032.md`:

```
[LOG_ENTRY type=PROMPT num=1 session=6989448b]
timestamp: 2026-09-14T11:42:54.216Z
model: claude-sonnet-5

CAPTURE TEST — 8x assignment, Muneeb Ahmad


[LOG_ENTRY type=RESPONSE num=1 session=6989448b]
timestamp: 2026-09-14T11:42:54.300Z
model: claude-sonnet-5

Canary acknowledged — capture hook fired automatically for session 6989448b-1172-43db-953f-dfeb0ca90032 (Claude Code Stop hook), independent of the session that created the hook config.
```

The live session actually building this project (`c06162be-0328-4473-8851-3c2b4ffea34a`)
has been capturing every real prompt/response pair the same way since the hooks were
first wired up — see `.agent-logs/session-c06162be-0328-4473-8851-3c2b4ffea34a.jsonl` for
the fuller raw record, and this session's own `.agent-logs/*c06162be*.md` for the same
data in this format going forward.

## What didn't work first, and one deliberate deviation

- **First attempt at the underlying hook mechanism** (earlier in this project, before this
  specific markdown format existed): a plain raw-capture hook with no redaction. A real
  Groq API key got pasted into a prompt mid-session, was captured verbatim, and got
  committed and pushed before GitHub's push protection caught it. Fixed at the time via a
  `git-filter-repo` history rewrite, and the hooks were hardened with
  `.claude/hooks/redact.mjs` afterward.
- **Deviation kept from that fix:** both the JSONL and this markdown format run prompt and
  response text through `redact.mjs` before writing (pattern-matching known secret/API-key
  and DB-connection-string shapes only — not general content editing). Given the incident
  above already happened once in this exact repo, shipping fully raw, uneditable text to a
  public repo isn't something worth re-risking. Everything else — wrong turns, dead ends,
  the back-and-forth on scope decisions — is left in unedited.
- **This markdown format itself required checking the actual Stop-hook payload shape**
  rather than guessing: the setup doc says the hook "receives a path to the session
  transcript on stdin," which is accurate, but the payload also already includes
  `last_assistant_message` directly (the final response text, pre-extracted) — so no
  separate transcript-parsing step was needed to get the response text; the transcript is
  used only to look up the model name for the log entry.
