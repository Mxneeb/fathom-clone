import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { claimSeedMeetingsForUser } from "@/lib/seed-claim";

// Dev-only local sign-in, used to verify the app end-to-end while a real
// Google OAuth client isn't configured yet. Never included when
// NODE_ENV === "production" — see the login page for where this is surfaced.
const devBypassProvider = Credentials({
  id: "dev-bypass",
  name: "Dev bypass (local only)",
  credentials: {},
  async authorize() {
    const user = await prisma.user.upsert({
      where: { email: "dev@localhost" },
      update: {},
      create: { email: "dev@localhost", name: "Dev User" },
    });
    // Credentials sign-in doesn't go through the adapter's createUser flow,
    // so the events.createUser hook below never fires for it — claim here
    // instead. Idempotent: no-ops once seed meetings are already claimed.
    await claimSeedMeetingsForUser(user.id);
    return user;
  },
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers:
    process.env.NODE_ENV === "production"
      ? [Google]
      : [Google, devBypassProvider],
  trustHost: true,
  // JWT sessions: the Credentials (dev-bypass) provider requires this — a
  // database session strategy silently never persists a session row for
  // Credentials-based sign-in. The Prisma adapter is still used for
  // User/Account storage (Google OAuth linking, etc.), just not sessions.
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) session.user.id = token.id as string;
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      // First real login: hand this brand-new account the seeded sample
      // meetings so the app never opens to an empty state. See
      // src/lib/seed-claim.ts.
      if (user.id) {
        await claimSeedMeetingsForUser(user.id);
      }
    },
  },
});
