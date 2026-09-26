# Cue

**Every meeting, mapped to the moment.** Cue turns a meeting recording into a map of who said what and
when. The summary, the action items and your highlights are pinned to the second they happened, so
one click takes you to the moment.

**Live:** https://fathom-clone-wheat.vercel.app. Click **Try the demo**: no account needed. You get your
own private copy of four sample meetings, including an eight-person, nine-minute planning call.

This started as a scoped rebuild of [Fathom](https://fathom.video) (the research and the original build
plan are in [`research/fathom-teardown.md`](research/fathom-teardown.md)). The interface has since been
redesigned from scratch around an idea of its own. The backend is the same real one: Postgres,
Whisper transcription and LLM summaries.

## The idea

Fathom treats a meeting as a video with a transcript beside it. That works for a two-person call and
falls apart for the case that matters: eight people for an hour. There you need to know *who* drove
the conversation, *where* the decision happened, and *which* commitments came out of it, without
watching the whole thing.

So every meeting in Cue opens on a **timeline map**:

- **Topics across the top**: the AI splits the meeting into chapters ("The Acme deal", "Capacity
  trade-off"), drawn as bands over the lanes. On an hour-long call that's the fastest way to find
  your spot; click one to jump to where it starts.
- **One lane per speaker**, with every line they spoke drawn in their colour and their share of the
  talking beside their name. You can see at a glance who dominated, who went quiet, and where the
  heated stretch was. Click a name to show only what that person said in the transcript (pick
  several to follow a back-and-forth).
- **Moments pinned in time**: highlights (◆) and action items (●) sit above the lanes where they
  happened. Hover to read one, click to hear it.
- **A playhead across everything**. Click anywhere on the map to jump there.

Everything else hangs off that same clock:

- **Brief**: an AI summary (General, or a Sales/BANT read) where every point carries the timestamps
  it came from, action items with their owner, due date and a timestamp that jumps to where each was
  committed, and highlights with notes.
- **Ask the meeting**: type a question ("what did we decide about notifications?") and get an answer
  from the transcript alone, citing the moments it came from. Click a citation to hear it.
- **Transcript**: grouped into speaker turns, synced to playback, following along until you scroll
  away (then "Back to now"), with find-in-transcript for long calls.
- **Player bar**: ±15s, scrubber, 1×–2× speed, and keyboard control (space, ←/→, **H** to
  highlight the current moment).
- **Search** returns every matching *moment* across all meetings, grouped by meeting, each opening at
  that exact second.
- **Sharing**: one link, view-only, no sign-in needed to open it.

Visually it's "warm paper": a light, warm ground, ink-dark type, Newsreader for headings and summary
prose, Geist for the interface, and a single burnt-orange accent used for the playhead and anything
that means "now". It's deliberately calm, and deliberately unlike the dark video-tool look.

## What's real and what isn't

- **Real:** accounts (Google OAuth, or a throwaway demo guest), Postgres storage, upload of real
  recordings, **Whisper transcription** (via Groq), **LLM summaries and action-item extraction**
  (Groq, `openai/gpt-oss-120b`, with the model saying which transcript line each commitment came
  from), highlights, full-text search and share links.
- **Stubbed, on purpose:** there is no bot that joins live Zoom, Meet or Teams calls. That's
  real-time audio infrastructure and out of scope, so you upload a recording instead, as Fathom's own
  onboarding test call does. The upload page says so.
- **Speakers in uploads, without a paid service:** Whisper doesn't tell voices apart, so after
  transcription Cue separates speakers by voice in the background with open-source models
  (sherpa-onnx: pyannote segmentation + 3D-Speaker ERes2Net embeddings, on CPU, on our own server).
  The meeting opens immediately, shows "working out who's speaking", and updates itself in place
  when done. The model then names speakers where the conversation gives them away (introductions,
  hand-offs, answering to a name). Anyone can be renamed from the timeline, and renaming one speaker
  to another's name merges them.
  - Measured against the sample meetings' known timing (`scripts/eval-diarization.mjs`,
    `scripts/e2e-speakers.mjs`): 86% of transcript lines on the right speaker on average, 91% on the
    eight-person call. Naming recovered 6 of the 8 people on that call; the other two are never named
    aloud. It suggested no wrong name on any sample.
  - Limits: on Vercel it runs at about 8× real time, so recordings up to roughly half an hour fit
    the 5-minute function limit; longer ones keep a single speaker. Two people with very similar voices
    can merge into one.
- **Left out:** team analytics, CRM sync, coaching, calendar integration and live in-meeting notes.
  The time went into making one meeting as navigable as possible instead.

## Sample data

Four sample meetings live under a placeholder account as templates. Every new account, whether a
Google sign-up or a demo guest, gets its own copy, so nobody starts on an empty list and nobody's
edits reach anyone else. Demo guests are removed, with everything they own, after three days.

The audio is real synthesized speech (Windows SAPI voices, pitch- and rate-varied so eight speakers
stay distinguishable) with transcript timing measured from the synthesis itself, not guessed. See
`scripts/synthesize-seed-audio.ps1`, `scripts/seed-scripts/` and `scripts/encode-seed-audio.mjs`.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind CSS 4 · Prisma 7 + Postgres (Prisma Postgres) ·
Auth.js · Groq (Whisper + chat) · sherpa-onnx (open-source speaker diarization) · Vercel Blob for
uploads · deployed on Vercel.

## Running it locally

```bash
npm install
cp .env.example .env   # fill in real values
npx prisma migrate deploy --config prisma7.config.ts
npm run seed
npm run dev
```

## How it was built

Built with Claude Code. `.agent-logs/` holds the prompt-and-response record, captured automatically
by hooks in `.claude/settings.json` and committed alongside the code. `CAPTURE-TEST.md` documents how
that capture works and how it was verified, including what didn't work first.
