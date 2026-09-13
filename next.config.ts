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
  serverExternalPackages: ["ffmpeg-static", "fluent-ffmpeg"],
};

export default nextConfig;
