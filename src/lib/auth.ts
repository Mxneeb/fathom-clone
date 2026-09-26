import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/prisma";
import { copySampleMeetingsTo, createGuestUser } from "@/lib/samples";

// "Try the demo": no credentials at all — every call creates a fresh guest
// account with its own copy of the sample meetings. Triggered only by a POST
// to /api/demo, never a GET, so link prefetching can't mint accounts.
const demoProvider = Credentials({
  id: "demo",
  name: "Demo",
  credentials: {},
  async authorize() {
    return createGuestUser();
  },
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(prisma),
  providers: [Google, demoProvider],
  trustHost: true,
  // JWT sessions: a Credentials provider never gets a database session row,
  // so sessions live in the cookie. The Prisma adapter still stores users and
  // Google account links.
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
      // Fires for Google sign-ups only (the adapter creates those users);
      // guests get their samples in createGuestUser.
      if (user.id) await copySampleMeetingsTo(user.id);
    },
  },
});
