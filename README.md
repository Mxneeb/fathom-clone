# Fathom Clone

A scoped rebuild of the core Fathom.video experience, built against the priority order in
[`research/fathom-teardown.md`](research/fathom-teardown.md) (`## What I'd build first`).

**This is a public repository.** No secrets are committed — copy `.env.example` to `.env` and
fill in real values locally / in your deploy provider's environment settings.

## What's real vs. stubbed

Per the build plan, deliberately faked pieces are called out in the UI itself, not hidden:

- **Recording capture** is stubbed as an upload-a-file (or pick-a-sample) flow — no real
  Zoom/Meet/Teams bot joins a live call. Everything downstream of that (transcript, summary,
  action items, highlights, search, sharing) is real.
- **Live in-meeting state** is skipped entirely for v1.
- **Team analytics / CRM sync / coaching metrics** are a locked marketing screen, not real
  functionality — mirroring Fathom's own Team Calls / Deals tabs on a personal-tier account.
- **Onboarding** is reduced to real Google OAuth login only.

## Stack

Next.js (App Router, TypeScript) · Postgres (Neon) · Prisma · Auth.js (Google) · Tailwind ·
Anthropic API · deployed on Vercel.

## Local setup

```bash
npm install
cp .env.example .env   # fill in real values
npx prisma migrate dev
npx prisma db seed
npm run dev
```

## Agent logs

This project was built with Claude Code. `.agent-logs/` contains a raw, per-turn record of the
prompts and responses used to build it, captured via Claude Code hooks and committed
incrementally alongside the corresponding code changes.
