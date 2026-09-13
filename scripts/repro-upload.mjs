// Reproduces the exact client-side upload path (src/app/(app)/calls/new/page.tsx):
// direct browser-to-Vercel-Blob upload via @vercel/blob/client, then a JSON
// call to /api/meetings with the resulting blob URL.
import { readFileSync } from "node:fs";
import { upload } from "@vercel/blob/client";

const BASE = process.argv[2] || "http://localhost:3000";
const filePath = process.argv[3] || "scripts/test-small.wav";

// --- get a session cookie via the dev-login route ---
const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
const csrfCookies = csrfRes.headers.getSetCookie?.() ?? [];

const loginRes = await fetch(`${BASE}/api/dev-login`, {
  redirect: "manual",
  headers: { Cookie: csrfCookies.map((c) => c.split(";")[0]).join("; ") },
});
const loginCookies = loginRes.headers.getSetCookie?.() ?? [];
const allCookies = [...csrfCookies, ...loginCookies].map((c) => c.split(";")[0]).join("; ");
console.log("cookies obtained:", allCookies.length > 0);

// --- build the file exactly like the browser would from <input type=file> ---
const bytes = readFileSync(filePath);
const ext = filePath.split(".").pop().toLowerCase();
const mimeByExt = { mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg" };
const fileName = filePath.split(/[\\/]/).pop();
const file = new File([bytes], fileName, { type: mimeByExt[ext] || "application/octet-stream" });
console.log("File object size:", file.size, "type:", file.type, "name:", file.name);

console.log("--- uploading directly to Vercel Blob ---");
const blob = await upload(file.name, file, {
  access: "public",
  handleUploadUrl: `${BASE}/api/blob/upload-url`,
  headers: { Cookie: allCookies },
});
console.log("blob url:", blob.url);

console.log("--- calling /api/meetings with blob url ---");
const res = await fetch(`${BASE}/api/meetings`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: allCookies },
  body: JSON.stringify({ blobUrl: blob.url, title: "Repro Upload Test", mediaType: "AUDIO" }),
});

console.log("response status:", res.status);
const text = await res.text();
console.log("response body:", text);
