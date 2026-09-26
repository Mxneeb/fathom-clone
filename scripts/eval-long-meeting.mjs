// Measures speaker separation on a long meeting, the way production handles
// one: cut into pieces, each separated on its own (as its own function run
// would), then joined by voice with linkPieces. Compared with separating the
// whole recording in one go.
//
// The test meeting is the samples back to back, about 25 minutes (see
// scripts/long-meeting.mjs). "Perfect joining" gives every piece's speaker
// its true voice: the best any joining could do with those pieces, so the
// gap to it is what joining by voice loses.
//
// Usage: node scripts/eval-long-meeting.mjs [--piece=180,300,600]
//          [--opus=32,48] [--link=0.5,0.6,0.75]
//   --opus also sends each piece through Opus at these bitrates (kbps), the
//   encoding production uses to hand pieces between function runs.
import { join } from "node:path";
import sherpa from "sherpa-onnx-node";
import { LINK_SIMILARITY, linkPieces, refineSpeakers } from "../src/lib/speaker-refine.mjs";
import { score } from "./diarization-score.mjs";
import { buildLongMeeting, RATE, runFfmpeg, toFloats } from "./long-meeting.mjs";

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const pieceSizes = (flags.piece ?? "180,300,600").split(",").map(Number);
const links = (flags.link ?? String(LINK_SIMILARITY)).split(",").map(Number);
const models = join(import.meta.dirname, "..", "models", "diarization");

// Production's settings (src/lib/speaker-separation.ts).
const config = {
  segmentation: { pyannote: { model: join(models, "pyannote-segmentation-3.0.int8.onnx"), windowShiftRatio: 0.5 }, numThreads: 4 },
  embedding: { model: join(models, "3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx"), numThreads: 4 },
  clustering: { numClusters: -1, threshold: 0.7 },
  minDurationOn: 0.2,
  minDurationOff: 0.5,
};
const sd = new sherpa.OfflineSpeakerDiarization(config);
const extractor = new sherpa.SpeakerEmbeddingExtractor(config.embedding);

function throughOpus(samples, kbps) {
  const pcm = Buffer.from(samples.buffer, samples.byteOffset, samples.byteLength);
  const ogg = runFfmpeg(["-f", "f32le", "-ar", String(RATE), "-ac", "1", "-i", "-", "-c:a", "libopus", "-b:a", `${kbps}k`, "-vbr", "constrained", "-f", "ogg", "-"], pcm);
  return toFloats(runFfmpeg(["-i", "-", "-ac", "1", "-ar", String(RATE), "-f", "f32le", "-"], ogg));
}

const { audio, lines, voices } = buildLongMeeting();
console.log(`Test meeting: ${(audio.length / RATE / 60).toFixed(1)} min, ${voices} distinct voices, ${lines.length} lines\n`);

const report = (label, segments, sec) => {
  const { accuracy, lineAccuracy, found } = score(segments, lines);
  console.log(
    `  ${label.padEnd(34)} speakers ${String(found).padStart(2)} / ${voices}   right person ${(accuracy * 100).toFixed(1).padStart(5)}% of time, ${(lineAccuracy * 100).toFixed(1).padStart(5)}% of lines${sec ? `   ${sec.toFixed(0)}s` : ""}`
  );
};

// The true voice of a piece's speaker: whoever it overlaps most.
function trueVoice(piece, speaker) {
  const overlap = new Map();
  for (const s of piece.segments.filter((x) => x.speaker === speaker)) {
    for (const l of lines) {
      const o = Math.min(s.end + piece.offset, l.endMs / 1000) - Math.max(s.start + piece.offset, l.startMs / 1000);
      if (o > 0) overlap.set(l.speaker, (overlap.get(l.speaker) ?? 0) + o);
    }
  }
  return [...overlap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
const cosine = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);

{
  const t0 = performance.now();
  const { segments } = refineSpeakers(audio, sd.process(audio), extractor);
  report("whole recording, one run", segments, (performance.now() - t0) / 1000);
}

const bitrates = flags.opus ? flags.opus.split(",").map(Number) : [];
for (const opus of [0, ...bitrates]) {
  for (const pieceSec of pieceSizes) {
    // Equal pieces, as production cuts them.
    const count = Math.ceil(audio.length / RATE / pieceSec);
    const len = Math.ceil(audio.length / count);
    const t0 = performance.now();
    const pieces = [];
    for (let i = 0; i < count; i++) {
      let samples = audio.subarray(i * len, Math.min((i + 1) * len, audio.length));
      if (opus) samples = throughOpus(samples, opus);
      pieces.push({ offset: (i * len) / RATE, ...refineSpeakers(samples, sd.process(samples), extractor) });
    }
    const sec = (performance.now() - t0) / 1000;

    // How far apart "same voice, different piece" and "different voices" sit.
    let sameMin = 1;
    let diffMax = -1;
    const all = pieces.flatMap((p, pi) => p.voices.map((v, s) => ({ pi, emb: v.emb, voice: trueVoice(p, s) })));
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) {
        if (all[i].pi === all[j].pi) continue;
        const sim = cosine(all[i].emb, all[j].emb);
        if (all[i].voice === all[j].voice) sameMin = Math.min(sameMin, sim);
        else diffMax = Math.max(diffMax, sim);
      }
    }
    console.log(
      `\n${count} pieces of ${(len / RATE / 60).toFixed(1)} min${opus ? ` via Opus ${opus}kbps` : ""}: same voice across pieces >= ${sameMin.toFixed(2)}, different voices <= ${diffMax.toFixed(2)}`
    );
    const perfect = pieces.flatMap((p) =>
      p.segments.map((s) => ({ start: s.start + p.offset, end: s.end + p.offset, speaker: trueVoice(p, s.speaker) ?? "?" }))
    );
    report("perfect joining", perfect, sec);
    for (const link of links) report(`joined at ${link}`, linkPieces(pieces, link));
  }
}
