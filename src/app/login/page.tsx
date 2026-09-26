import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";
import { Wordmark } from "@/components/brand";
import { SPEAKER_COLORS } from "@/lib/speakers";
import { HIGHLIGHT_LABELS } from "@/lib/highlights";

export const metadata = { title: { absolute: "Cue — every meeting, mapped to the moment" } };

async function googleSignIn() {
  "use server";
  await signIn("google", { redirectTo: "/calls" });
}

export default async function LandingPage() {
  const session = await auth();
  if (session?.user) redirect("/calls");

  return (
    <main className="flex flex-1 flex-col">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6">
        <Wordmark />
      </header>

      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-16">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent">Meeting notes, mapped</p>
          <h1 className="mt-4 font-serif text-5xl font-semibold leading-[1.02] tracking-tight text-ink sm:text-6xl">
            Every meeting, mapped to the moment.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-2">
            Cue turns a recording into a map of who said what, and when. The summary, the action items and your
            highlights are pinned to the second they happened: one click and you&apos;re hearing it.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <form action="/api/demo" method="post">
              <button
                type="submit"
                className="rounded-lg bg-ink px-5 py-3 text-sm font-medium text-paper shadow-sm hover:bg-ink-2"
              >
                Try the demo
              </button>
            </form>
            <form action={googleSignIn}>
              <button
                type="submit"
                className="inline-flex items-center gap-2.5 rounded-lg border border-rule bg-card px-5 py-3 text-sm font-medium text-ink hover:border-ink-3"
              >
                <GoogleIcon />
                Continue with Google
              </button>
            </form>
          </div>
          <p className="mt-3 max-w-md text-sm text-ink-3">
            The demo needs no account: you get your own copy of the sample meetings, including an eight-person planning
            call, to click through, highlight and share.
          </p>
        </div>

        <HeroPreview />
      </section>
    </main>
  );
}

// A static picture of the product, drawn with the same parts as the real
// timeline — not a screenshot, so it stays crisp and on-palette.
const HERO_SPEAKERS: { name: string; share: number; segs: [number, number][] }[] = [
  { name: "Priya Nair", share: 24, segs: [[1, 7], [19, 23], [41, 47], [63, 66], [84, 90]] },
  { name: "Alex Rivera", share: 21, segs: [[8, 12], [27, 31], [48, 51], [70, 76], [92, 96]] },
  { name: "Sam Okafor", share: 14, segs: [[13, 16], [34, 37], [56, 60], [80, 83]] },
  { name: "Maria Lopez", share: 17, segs: [[24, 26], [38, 40], [52, 55], [67, 69], [77, 79]] },
  { name: "Chris Doyle", share: 13, segs: [[17, 18], [32, 33], [61, 62], [86, 88], [97, 99]] },
  { name: "Jordan Blake", share: 11, segs: [[5, 6], [45, 46], [72, 73], [90, 91]] },
];

function HeroPreview() {
  const playhead = 42;
  return (
    <div className="relative" aria-hidden>
      <div className="rounded-2xl border border-rule bg-card p-5 pb-14 shadow-[0_24px_60px_-30px_rgba(29,27,22,0.35)]">
        <div className="mb-4 flex items-baseline justify-between">
          <div>
            <p className="font-serif text-lg font-semibold text-ink">Q4 Planning — Search &amp; Mobile</p>
            <p className="text-xs text-ink-3">8 speakers · 14 min</p>
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Who spoke when</span>
        </div>
        <div className="flex gap-3">
          <div className="w-28 shrink-0 sm:w-36">
            <div className="h-6" />
            {HERO_SPEAKERS.map((s, i) => (
              <div key={s.name} className="flex h-6 items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: SPEAKER_COLORS[i] }} />
                <span className="min-w-0 flex-1 truncate text-xs text-ink">{s.name}</span>
                <span className="font-mono text-[10px] text-ink-3">{s.share}%</span>
              </div>
            ))}
          </div>
          <div className="relative min-w-0 flex-1">
            <div className="relative h-6">
              {[
                { at: 22, color: HIGHLIGHT_LABELS.POSITIVE_REACTION.color },
                { at: 49, color: HIGHLIGHT_LABELS.HIGHLIGHT.color },
                { at: 78, color: HIGHLIGHT_LABELS.NEEDS_REVIEW.color },
              ].map((p) => (
                <span
                  key={p.at}
                  className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] ring-2 ring-card"
                  style={{ left: `${p.at}%`, background: p.color }}
                />
              ))}
              {[30, 58, 91].map((at) => (
                <span
                  key={at}
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-2 bg-card"
                  style={{ left: `${at}%` }}
                />
              ))}
            </div>
            {HERO_SPEAKERS.map((s, i) => (
              <div key={s.name} className="relative h-6 border-t border-rule/60">
                {s.segs.map(([a, b]) => (
                  <span
                    key={a}
                    className="absolute bottom-1 top-1 rounded-[3px]"
                    style={{ left: `${a}%`, width: `${b - a}%`, background: SPEAKER_COLORS[i], opacity: 0.8 }}
                  />
                ))}
              </div>
            ))}
            <div className="absolute bottom-0 top-0 w-0.5 -translate-x-1/2 bg-accent" style={{ left: `${playhead}%` }}>
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-accent" />
            </div>
          </div>
        </div>
      </div>

      <div className="relative -mt-8 ml-auto mr-4 w-[85%] max-w-sm rounded-2xl border border-rule bg-card p-4 shadow-[0_24px_60px_-30px_rgba(29,27,22,0.4)] sm:mr-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">Action items</p>
        {[
          { text: "Send Sam the ranking spec", who: "Priya Nair", at: "4:07" },
          { text: "Chase design on notification settings", who: "Alex Rivera", at: "8:12" },
        ].map((a) => (
          <div key={a.text} className="mt-2.5 flex items-start gap-3">
            <span className="mt-0.5 h-4 w-4 shrink-0 rounded-[5px] border-[1.5px] border-rule-2" />
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-ink">{a.text}</p>
              <p className="text-xs text-ink-3">{a.who}</p>
            </div>
            <span className="rounded-md border border-rule bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink-2">{a.at}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.85-.08-1.67-.22-2.46H12v4.66h6.47c-.28 1.5-1.13 2.77-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.94-2.91l-3.88-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.73-4.95H1.27v3.1C3.25 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29A7.2 7.2 0 0 1 4.9 12c0-.8.14-1.57.37-2.29v-3.1H1.27A11.98 11.98 0 0 0 0 12c0 1.94.46 3.77 1.27 5.39l4-3.1z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.94 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.27 6.61l4 3.1C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}
