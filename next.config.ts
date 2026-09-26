import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // ffmpeg-static resolves its binary path via a dynamic __dirname-relative
  // require() at runtime; bundling it rewrites that into a broken virtual
  // path (observed: "\ROOT\node_modules\ffmpeg-static\ffmpeg.exe" -> ENOENT).
  // Keeping it external forces Node's normal module resolution instead.
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg", "sherpa-onnx-node"],
  // Speaker separation runs a worker script in a child process, which loads
  // native binaries and ONNX models by path. None of that is imported, so
  // the tracer can't find it on its own.
  outputFileTracingIncludes: {
    "/api/meetings/*/speakers": [
      "./src/lib/speaker-separation-worker.mjs",
      "./models/diarization/*.onnx",
      "./node_modules/sherpa-onnx-node/**/*",
      "./node_modules/sherpa-onnx-linux-x64/**/*",
    ],
  },
};

export default nextConfig;
