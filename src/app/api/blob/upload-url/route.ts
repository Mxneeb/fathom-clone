import { auth } from "@/lib/auth";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";

// Issues short-lived client tokens for direct browser -> Vercel Blob
// uploads. This exists because Vercel's Node.js Serverless Functions cap
// incoming request bodies at ~4.5MB — real meeting-length recordings
// routinely exceed that, so the audio bytes must go straight from the
// browser to Blob storage, never through our own function. See
// src/app/(app)/calls/new/page.tsx for the client side of this.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ["audio/*", "video/*"],
        addRandomSuffix: true,
        maximumSizeInBytes: 500 * 1024 * 1024, // 500MB — generous for a real meeting recording
      }),
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "upload token generation failed" },
      { status: 400 }
    );
  }
}
