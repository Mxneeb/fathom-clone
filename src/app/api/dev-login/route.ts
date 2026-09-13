import { signIn } from "@/lib/auth";
import { NextResponse } from "next/server";

// Dev-only local sign-in as a plain Route Handler (not a Server Action and
// not hand-rolled CSRF/cookie plumbing) — see src/lib/auth.ts for why the
// Credentials provider needs this instead of the Google OAuth flow.
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return signIn("dev-bypass", { redirectTo: "/calls" });
}
