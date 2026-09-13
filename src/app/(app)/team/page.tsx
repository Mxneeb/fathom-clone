// Deliberately fake, per the build plan: "Team analytics / CRM sync /
// coaching metrics — stub as a locked marketing screen, exactly like
// Fathom does." Fathom's own Team Calls / Deals tabs are themselves just
// paywall screens with a mocked-up product screenshot on a personal-tier
// account — there's no real functionality to reverse-engineer here even
// in the actual product, so building a convincing locked screen costs a
// fraction of what real coaching analytics would.
export default function TeamCallsPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
        Fathom Clone Team Edition
      </div>
      <h1 className="mb-3 text-2xl font-semibold">
        Bring this to your entire team
      </h1>
      <p className="mx-auto mb-8 max-w-md text-sm text-neutral-400">
        Talk-time %, monologue &amp; question coaching metrics, a shared
        searchable call library, and CRM sync — this is a locked marketing
        screen, not a real feature. Building it for real wasn&apos;t worth
        the 24 hours; see{" "}
        <span className="text-neutral-300">research/fathom-teardown.md</span>{" "}
        (&ldquo;What I&apos;d build first&rdquo;, item 10) for why.
      </p>

      <div className="mx-auto mb-8 max-w-md rounded-lg border border-neutral-800 bg-neutral-900/50 p-6 text-left text-xs text-neutral-500">
        <div className="mb-3 font-medium text-neutral-400">Recent Calls</div>
        <div className="mb-1.5 h-3 w-3/4 rounded bg-neutral-800" />
        <div className="mb-1.5 h-3 w-2/3 rounded bg-neutral-800" />
        <div className="mb-4 h-3 w-4/5 rounded bg-neutral-800" />
        <div className="flex justify-between border-t border-neutral-800 pt-3">
          <span>Talk Time</span>
          <span className="h-3 w-10 rounded bg-neutral-800" />
        </div>
        <div className="mt-2 flex justify-between">
          <span>Monologues &amp; Questions</span>
          <span className="h-3 w-10 rounded bg-neutral-800" />
        </div>
      </div>

      <button
        disabled
        className="cursor-not-allowed rounded bg-neutral-800 px-4 py-2 text-sm text-neutral-500"
      >
        Start 14-Day Trial (disabled — this is a mock)
      </button>
    </div>
  );
}
