import { signIn } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// POST only: the "Try the demo" form. signIn sets the session cookie; the
// 303 turns the form POST into a plain GET of the meetings page.
export async function POST(req: NextRequest) {
  await signIn("demo", { redirect: false });
  return NextResponse.redirect(new URL("/calls", req.url), 303);
}
