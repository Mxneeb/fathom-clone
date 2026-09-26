// Runs speaker separation in its own process (spawned by
// src/lib/speaker-separation.ts): the native diarization call blocks for a
// minute or more, which would stall the web server's event loop, and a crash
// in native code should only take down this process.
//
// argv: <path to raw 16kHz mono f32le audio> <config JSON>
// stdout: JSON array of { start, end, speaker } segments (seconds).
import { readFileSync } from "node:fs";
import sherpa from "sherpa-onnx-node";

const [pcmPath, configJson] = process.argv.slice(2);
const raw = readFileSync(pcmPath);
const samples =
  raw.byteOffset % 4 === 0
    ? new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4))
    : new Float32Array(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength));

const diarization = new sherpa.OfflineSpeakerDiarization(JSON.parse(configJson));
process.stdout.write(JSON.stringify(diarization.process(samples)));
