import { prisma } from "@/lib/prisma";

// Seed meetings (see prisma/seed.ts) are created under this fixed placeholder
// user id so the database is never empty. The first real person to sign in
// via Google takes ownership of them, so the app doesn't open to an empty
// "no call recordings" state — see build-plan §"seed the database with
// realistic sample data".
export const SEED_OWNER_ID = "seed-owner";

export async function claimSeedMeetingsForUser(newUserId: string) {
  const seedOwnerExists = await prisma.user.findUnique({
    where: { id: SEED_OWNER_ID },
  });
  if (!seedOwnerExists) return;

  await prisma.meeting.updateMany({
    where: { ownerId: SEED_OWNER_ID },
    data: { ownerId: newUserId },
  });
}
