import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const meetings = await prisma.meeting.findMany({
  include: {
    _count: {
      select: { transcriptLines: true, actionItems: true, highlights: true, summaries: true, participants: true },
    },
  },
});
for (const m of meetings) {
  console.log(m.title, m.durationSec + "s", JSON.stringify(m._count));
}
await prisma.$disconnect();
