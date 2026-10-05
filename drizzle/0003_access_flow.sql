-- Access flow: 16-digit code welcome gate with manual admin approval.
CREATE TABLE IF NOT EXISTS "access_request" (
  "id" text PRIMARY KEY,
  "code" text NOT NULL,
  "status" text NOT NULL DEFAULT 'pending',
  "deviceHint" text,
  "ipHash" text,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "decidedAt" timestamp,
  "sessionToken" text
);
CREATE INDEX IF NOT EXISTS "idx_access_request_status" ON "access_request" ("status");
CREATE INDEX IF NOT EXISTS "idx_access_request_createdAt" ON "access_request" ("createdAt");

CREATE TABLE IF NOT EXISTS "access_session" (
  "id" text PRIMARY KEY,
  "sessionToken" text NOT NULL UNIQUE,
  "requestId" text NOT NULL REFERENCES "access_request"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'active',
  "transactionUsed" boolean NOT NULL DEFAULT false,
  "pdfGenerated" boolean NOT NULL DEFAULT false,
  "createdAt" timestamp NOT NULL DEFAULT now(),
  "logoutAt" timestamp,
  "endedAt" timestamp,
  "expiresAt" timestamp NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_access_session_sessionToken" ON "access_session" ("sessionToken");
CREATE INDEX IF NOT EXISTS "idx_access_session_requestId" ON "access_session" ("requestId");
