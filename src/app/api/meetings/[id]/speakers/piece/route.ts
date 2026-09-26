import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { isPieceToken, separateFile } from "@/lib/speaker-separation";

// One piece of a long recording, sent by its separation job
// (src/lib/speaker-separation.ts) so the pieces are separated in parallel
// runs. Takes the piece's audio as the body; returns who speaks when in it,
// and what each speaker sounds like, for joining the pieces up.
export const maxDuration = 300;

const MAX_PIECE_BYTES = 4.5 * 1024 * 1024;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isPieceToken(id, req.headers.get("x-cue-piece"))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const audio = Buffer.from(await req.arrayBuffer());
  if (audio.length === 0 || audio.length > MAX_PIECE_BYTES) {
    return NextResponse.json({ error: "piece must be 1 byte to 4.5MB" }, { status: 400 });
  }

  const dir = await mkdtemp(join(tmpdir(), "cue-piece-"));
  try {
    const path = join(dir, "piece.ogg");
    await writeFile(path, audio);
    return NextResponse.json(await separateFile(path));
  } catch (err) {
    console.error("speaker piece failed", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "failed" }, { status: 500 });
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
