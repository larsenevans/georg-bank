ALTER TABLE "access_request" ADD COLUMN IF NOT EXISTS "email" text;
ALTER TABLE "access_request" ADD COLUMN IF NOT EXISTS "userId" text;
ALTER TABLE "access_request" ADD COLUMN IF NOT EXISTS "token" text;
ALTER TABLE "access_request" ADD COLUMN IF NOT EXISTS "userAgent" text;
ALTER TABLE "access_request" ALTER COLUMN "code" DROP NOT NULL;
CREATE INDEX IF NOT EXISTS "idx_access_request_email" ON "access_request" ("email");
