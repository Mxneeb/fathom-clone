// Measures speaker separation (sherpa-onnx diarization) against the sample
// meetings, whose true per-speaker timing is known exactly.
//
// Usage: node scripts/eval-diarization.mjs <models-dir> [embedding.onnx ...]
//          [--threshold=0.5,0.7] [--shift=0.1] [--int8] [--refine]
//   --refine applies the same clean-up pass as production (src/lib/speaker-refine.mjs).
//   <models-dir> holds sherpa-onnx-pyannote-segmentation-3-0/model.onnx and
//   the embedding models. Prints, per meeting: speakers found vs. true count,
//   the share of speech time attributed to the right person, and run time.
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import sherpa from "sherpa-onnx-node";
import { refineSpeakers } from "../src/lib/speaker-refine.mjs";
import { score } from "./diarization-score.mjs";

const args = process.argv.slice(2);
const modelsDir = args[0];
const flags = Object.fromEntries(args.filter((a) => a.startsWith("--")).map((a) => a.slice(2).split("=")));
const embeddings = args.slice(1).filter((a) => !a.startsWith("--"));
const thresholds = (flags.threshold ?? "0.5").split(",").map(Number);
// Window step as a fraction of pyannote's 10s window: 0.1 is the library
// default (most accurate, slowest); larger steps compute far fewer windows.
const windowShiftRatio = Number(flags.shift ?? "0.1");
const segModel = "int8" in flags ? "model.int8.onnx" : "model.onnx";
const mediaDir = join(import.meta.dirname, "..", "public", "seed-media");

function decode(path) {
  const out = execFileSync(ffmpeg, ["-loglevel", "error", "-i", path, "-ac", "1", "-ar", "16000", "-f", "f32le", "-"], {
    maxBuffer: 2 * 1024 * 1024 * 1024,
  });
  return new Float32Array(out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength));
}

const meetings = readdirSync(mediaDir)
  .filter((f) => f.endsWith(".timing.json"))
  .map((f) => JSON.parse(readFileSync(join(mediaDir, f), "utf8").replace(/^﻿/, "")));
const audio = new Map(meetings.map((m) => [m.slug, decode(join(mediaDir, m.mediaFile))]));

for (const embedding of embeddings) {
  for (const threshold of thresholds) {
    const sd = new sherpa.OfflineSpeakerDiarization({
      segmentation: {
        pyannote: { model: join(modelsDir, "sherpa-onnx-pyannote-segmentation-3-0", segModel), windowShiftRatio },
        numThreads: 2,
      },
      embedding: { model: join(modelsDir, embedding), numThreads: 2 },
      clustering: { numClusters: -1, threshold },
      minDurationOn: 0.2,
      minDurationOff: 0.5,
    });
    let totalAcc = 0;
    let totalLineAcc = 0;
    let totalSec = 0;
    let totalAudio = 0;
    const extractor = "refine" in flags ? new sherpa.SpeakerEmbeddingExtractor({ model: join(modelsDir, embedding), numThreads: 2 }) : null;
    console.log(`\n${embedding}  threshold=${threshold}  shift=${windowShiftRatio}  seg=${segModel}${extractor ? "  +refine" : ""}`);
    for (const m of meetings) {
      const samples = audio.get(m.slug);
      const t0 = performance.now();
      const raw = sd.process(samples);
      const segments = extractor ? refineSpeakers(samples, raw, extractor).segments : raw;
      const sec = (performance.now() - t0) / 1000;
      const { accuracy, lineAccuracy, found } = score(segments, m.lines);
      const trueCount = new Set(m.lines.map((l) => l.speaker)).size;
      const audioSec = samples.length / 16000;
      totalAcc += accuracy;
      totalLineAcc += lineAccuracy;
      totalSec += sec;
      totalAudio += audioSec;
      console.log(
        `  ${m.slug.padEnd(16)} speakers ${String(found).padStart(2)} / ${trueCount}   right person ${(accuracy * 100).toFixed(1).padStart(5)}% of time, ${(lineAccuracy * 100).toFixed(1).padStart(5)}% of lines   ${sec.toFixed(1)}s for ${Math.round(audioSec)}s audio`
      );
    }
    console.log(
      `  mean ${((totalAcc / meetings.length) * 100).toFixed(1)}% of time, ${((totalLineAcc / meetings.length) * 100).toFixed(1)}% of lines   speed ${(totalAudio / totalSec).toFixed(0)}x real time`
    );
  }
}
