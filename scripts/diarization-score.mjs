// Scores speaker separation against known per-line timing. Shared by the
// evaluation scripts.

// Frame-level scoring at 100ms. Each predicted speaker is mapped to the true
// speaker it overlaps most; accuracy is the share of true speech frames whose
// mapped prediction is the right person.
export function score(segments, lines) {
  const step = 0.1;
  const end = Math.max(...lines.map((l) => l.endMs / 1000));
  const frames = Math.ceil(end / step);
  const truth = new Array(frames).fill(null);
  for (const l of lines) for (let f = Math.floor(l.startMs / 100); f < Math.ceil(l.endMs / 100) && f < frames; f++) truth[f] = l.speaker;
  const pred = new Array(frames).fill(null);
  for (const s of segments) for (let f = Math.floor(s.start / step); f < Math.ceil(s.end / step) && f < frames; f++) pred[f] = s.speaker;

  const overlap = new Map();
  truth.forEach((t, f) => {
    if (t == null || pred[f] == null) return;
    const key = `${pred[f]}|${t}`;
    overlap.set(key, (overlap.get(key) ?? 0) + 1);
  });
  const mapping = new Map();
  for (const [key, n] of overlap) {
    const [p, t] = key.split("|");
    if (!mapping.has(p) || n > mapping.get(p).n) mapping.set(p, { t, n });
  }
  let speech = 0;
  let correct = 0;
  truth.forEach((t, f) => {
    if (t == null) return;
    speech++;
    if (pred[f] != null && mapping.get(String(pred[f]))?.t === t) correct++;
  });

  // What the app actually shows: each transcript line goes to the speaker
  // with the most overlap (nearest segment if none), weighted by duration.
  let lineTotal = 0;
  let lineCorrect = 0;
  for (const l of lines) {
    const s = l.startMs / 1000;
    const e = l.endMs / 1000;
    const byPred = new Map();
    for (const seg of segments) {
      const o = Math.min(e, seg.end) - Math.max(s, seg.start);
      if (o > 0) byPred.set(seg.speaker, (byPred.get(seg.speaker) ?? 0) + o);
    }
    let best = [...byPred.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (best == null && segments.length) {
      best = segments.reduce((a, b) => (Math.abs(b.start - s) < Math.abs(a.start - s) ? b : a)).speaker;
    }
    lineTotal += e - s;
    if (best != null && mapping.get(String(best))?.t === l.speaker) lineCorrect += e - s;
  }
  return { accuracy: correct / speech, lineAccuracy: lineCorrect / lineTotal, found: new Set(segments.map((s) => s.speaker)).size };
}
