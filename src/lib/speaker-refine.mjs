// Cleans up raw diarization output. On real recordings clustering does two
// wrong things: it splits one person into several sizeable clusters (their
// voices come out ~0.9 similar), and it turns short utterances ("yeah",
// crosstalk) into "speakers" of their own, because a second or two is too
// little audio to recognise a voice. Measured on a real three-person call:
// ten clusters, where different people were 0.03-0.13 similar and the
// same person split in two was 0.89-0.90.
//
// So: merge clusters whose voices are more similar than MERGE_SIMILARITY,
// then fold every cluster with less than MIN_SPEECH_SEC of speech into the
// speaker it sounds most like. Shared by the worker and the evaluation script.

// Sits above the closest pair of *different* people in the samples (0.73,
// pitch-shifted copies of one synthetic voice) and well below real splits.
export const MERGE_SIMILARITY = 0.75;
export const MIN_SPEECH_SEC = 5;
const EMBED_AUDIO_SEC = 60;

function normalize(v) {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

// Up to EMBED_AUDIO_SEC of a cluster's audio, longest segments first.
function clusterAudio(samples, segs, sampleRate) {
  const parts = [];
  let total = 0;
  for (const s of [...segs].sort((a, b) => b.end - b.start - (a.end - a.start))) {
    if (total >= EMBED_AUDIO_SEC * sampleRate) break;
    const part = samples.subarray(Math.floor(s.start * sampleRate), Math.floor(s.end * sampleRate));
    parts.push(part);
    total += part.length;
  }
  const out = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

function embed(extractor, audio, sampleRate) {
  if (audio.length < sampleRate * 0.3) return null;
  const stream = extractor.createStream();
  stream.acceptWaveform({ sampleRate, samples: audio });
  stream.inputFinished();
  if (!extractor.isReady(stream)) return null;
  return normalize(Float32Array.from(extractor.compute(stream)));
}

/**
 * Returns the cleaned segments, and each resulting speaker's voice (indexed
 * by speaker id) for linkPieces.
 * @param {Float32Array} samples 16kHz mono audio
 * @param {{start:number,end:number,speaker:number}[]} segments diarization output
 * @param {{createStream:Function,isReady:Function,compute:Function}} extractor sherpa-onnx SpeakerEmbeddingExtractor
 * @returns {{segments:{start:number,end:number,speaker:number}[], voices:{emb:number[],dur:number}[]}}
 */
export function refineSpeakers(samples, segments, extractor, sampleRate = 16000) {
  const clusters = new Map();
  for (const s of segments) {
    const c = clusters.get(s.speaker) ?? { id: s.speaker, segs: [], dur: 0 };
    c.segs.push(s);
    c.dur += s.end - s.start;
    clusters.set(s.speaker, c);
  }
  for (const c of clusters.values()) c.emb = embed(extractor, clusterAudio(samples, c.segs, sampleRate), sampleRate);

  // 1. Merge sizeable clusters that sound like the same person, most
  //    similar pair first, until no pair clears the bar.
  let groups = [...clusters.values()]
    .filter((c) => c.dur >= MIN_SPEECH_SEC && c.emb)
    .map((c) => ({ ids: [c.id], dur: c.dur, emb: c.emb }));
  if (groups.length === 0) return { segments, voices: [] };
  for (;;) {
    let best = null;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const sim = cosine(groups[i].emb, groups[j].emb);
        if (!best || sim > best.sim) best = { i, j, sim };
      }
    }
    if (!best || best.sim < MERGE_SIMILARITY) break;
    const a = groups[best.i];
    const b = groups[best.j];
    const merged = {
      ids: [...a.ids, ...b.ids],
      dur: a.dur + b.dur,
      emb: normalize(a.emb.map((x, k) => x * a.dur + b.emb[k] * b.dur)),
    };
    groups = groups.filter((_, k) => k !== best.i && k !== best.j).concat(merged);
  }

  const groupOf = new Map();
  groups.forEach((g, gi) => g.ids.forEach((id) => groupOf.set(id, gi)));

  // 2. Fold each small cluster into the speaker it sounds most like; with no
  //    usable voice sample, into whoever spoke nearest in time.
  const kept = segments.filter((s) => groupOf.has(s.speaker));
  for (const c of clusters.values()) {
    if (groupOf.has(c.id)) continue;
    if (c.emb) {
      let best = 0;
      groups.forEach((g, gi) => {
        if (cosine(c.emb, g.emb) > cosine(c.emb, groups[best].emb)) best = gi;
      });
      groupOf.set(c.id, best);
    }
  }
  const nearestGroup = (s) => {
    const distance = (k) => Math.max(k.start - s.end, s.start - k.end, 0);
    return groupOf.get(kept.reduce((a, b) => (distance(b) < distance(a) ? b : a)).speaker);
  };

  // Group ids become the new speaker ids, biggest speaker first.
  const order = groups.map((g, gi) => gi).sort((x, y) => groups[y].dur - groups[x].dur);
  const rank = new Map(order.map((gi, r) => [gi, r]));
  return {
    segments: segments.map((s) => ({ ...s, speaker: rank.get(groupOf.get(s.speaker) ?? nearestGroup(s)) })),
    voices: order.map((gi) => ({ emb: Array.from(groups[gi].emb), dur: groups[gi].dur })),
  };
}

// A long recording is separated in pieces (one function run each, to fit
// the time limit), so every piece numbers its speakers on its own. This
// joins them by voice: the most similar pair of speakers from different
// pieces is merged first, until no pair clears the bar. Two speakers from
// the same piece are never merged: that piece already heard them apart.
export const LINK_SIMILARITY = 0.6;

/**
 * @param {{offset:number, segments:{start:number,end:number,speaker:number}[], voices:{emb:number[],dur:number}[]}[]} pieces
 *   each piece's refineSpeakers output, with its start in the recording (seconds)
 * @returns {{start:number,end:number,speaker:number}[]} segments on the recording's clock
 */
export function linkPieces(pieces, threshold = LINK_SIMILARITY) {
  let groups = [];
  pieces.forEach((p, pi) =>
    p.voices.forEach((v, speaker) => groups.push({ members: [`${pi}:${speaker}`], pieces: new Set([pi]), dur: v.dur, emb: v.emb }))
  );
  for (;;) {
    let best = null;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        if ([...groups[i].pieces].some((pi) => groups[j].pieces.has(pi))) continue;
        const sim = cosine(groups[i].emb, groups[j].emb);
        if (!best || sim > best.sim) best = { i, j, sim };
      }
    }
    if (!best || best.sim < threshold) break;
    const a = groups[best.i];
    const b = groups[best.j];
    const merged = {
      members: [...a.members, ...b.members],
      pieces: new Set([...a.pieces, ...b.pieces]),
      dur: a.dur + b.dur,
      emb: normalize(a.emb.map((x, k) => x * a.dur + b.emb[k] * b.dur)),
    };
    groups = groups.filter((_, k) => k !== best.i && k !== best.j).concat(merged);
  }

  const groupOf = new Map();
  groups.forEach((g, gi) => g.members.forEach((m) => groupOf.set(m, gi)));
  const all = pieces.flatMap((p, pi) =>
    p.segments.map((s) => ({ start: s.start + p.offset, end: s.end + p.offset, speaker: groupOf.get(`${pi}:${s.speaker}`) ?? -1 }))
  );
  // A piece with too little speech to take a voice sample from: its speech
  // goes to whoever spoke nearest in time.
  const linked = all.filter((s) => s.speaker >= 0);
  if (linked.length === 0) return all.map((s) => ({ ...s, speaker: 0 }));
  return all.map((s) => {
    if (s.speaker >= 0) return s;
    const distance = (k) => Math.max(k.start - s.end, s.start - k.end, 0);
    return { ...s, speaker: linked.reduce((a, b) => (distance(b) < distance(a) ? b : a)).speaker };
  });
}
