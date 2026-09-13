-- Drop DB-stored media columns: uploaded recordings now go straight to
-- Vercel Blob storage (see src/app/api/blob/upload-url/route.ts) instead
-- of being buffered through our own Serverless Function and stored as
-- Postgres bytea, which was capped by Vercel's ~4.5MB request body limit.
ALTER TABLE "Meeting" DROP COLUMN "mediaData";
ALTER TABLE "Meeting" DROP COLUMN "mediaMimeType";
