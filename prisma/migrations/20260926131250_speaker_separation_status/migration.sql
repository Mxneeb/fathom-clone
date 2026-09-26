-- CreateEnum
CREATE TYPE "SpeakerStatus" AS ENUM ('NONE', 'PENDING', 'PROCESSING', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "Meeting" ADD COLUMN     "speakerError" TEXT,
ADD COLUMN     "speakerStartedAt" TIMESTAMP(3),
ADD COLUMN     "speakerStatus" "SpeakerStatus" NOT NULL DEFAULT 'NONE';
