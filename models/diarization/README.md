# Speaker separation models

Used by `src/lib/speaker-separation.ts` (via sherpa-onnx) to tell voices apart in uploaded
recordings. Both run on CPU; no external service.

- `pyannote-segmentation-3.0.int8.onnx`: pyannote speaker segmentation 3.0, int8 ONNX export
  from sherpa-onnx's `speaker-segmentation-models` release. MIT (see the LICENSE file here).
- `3dspeaker_speech_eres2net_sv_en_voxceleb_16k.onnx`: 3D-Speaker ERes2Net speaker embedding
  model (English, VoxCeleb), from sherpa-onnx's `speaker-recongition-models` release. Apache-2.0.

Chosen with `scripts/eval-diarization.mjs` against the sample meetings, whose true speaker timing
is known: ERes2Net at clustering threshold 0.7 put 86% of transcript lines on the right speaker,
ahead of the WeSpeaker ResNet34 and CAM++ models tried alongside it.
