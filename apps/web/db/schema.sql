-- Better Auth Schema for PostgreSQL
-- This file documents the schema used by better-auth
-- Run this manually or use `npx @better-auth/cli migrate` to create tables

CREATE TABLE IF NOT EXISTS "user" (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  "emailVerified" BOOLEAN DEFAULT FALSE,
  image TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "session" (
  id TEXT PRIMARY KEY,
  "expiresAt" TIMESTAMP NOT NULL,
  token TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "ipAddress" TEXT,
  "userAgent" TEXT,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS "account" (
  id TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  "accessToken" TEXT,
  "refreshToken" TEXT,
  "idToken" TEXT,
  "accessTokenExpiresAt" TIMESTAMP,
  "refreshTokenExpiresAt" TIMESTAMP,
  scope TEXT,
  password TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS "verification" (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- athrd application schema
--
-- Organization S3 columns are nullable overrides. When an organization is set
-- to S3 storage, unset S3 fields fall back to the app-level
-- ATHRD_THREADS_S3_* environment variables.
CREATE TABLE IF NOT EXISTS "organizations" (
  "githubOrgId" TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  name TEXT,
  "avatarUrl" TEXT,
  "githubMemberCount" INTEGER,
  "githubAppInstallationId" TEXT,
  "storageProvider" TEXT NOT NULL DEFAULT 'gist',
  "s3EndpointUrl" TEXT,
  "s3Bucket" TEXT,
  "s3Region" TEXT,
  "s3AccessKeyId" TEXT,
  "s3SecretAccessKey" TEXT,
  "s3VirtualHostedStyle" BOOLEAN,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "lastSeenAt" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT "organizations_githubMemberCount_check"
    CHECK ("githubMemberCount" IS NULL OR "githubMemberCount" >= 0),
  CONSTRAINT "organizations_storageProvider_check"
    CHECK ("storageProvider" IN ('gist', 's3'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_login_lower_idx"
  ON "organizations" (LOWER(login));

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_githubAppInstallationId_idx"
  ON "organizations" ("githubAppInstallationId")
  WHERE "githubAppInstallationId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "organization_billing" (
  "githubOrgId" TEXT PRIMARY KEY REFERENCES "organizations"("githubOrgId") ON DELETE CASCADE,
  "stripeCustomerId" TEXT NOT NULL UNIQUE,
  "stripeSubscriptionId" TEXT UNIQUE,
  "stripeSubscriptionItemId" TEXT UNIQUE,
  "stripePriceId" TEXT,
  "subscriptionStatus" TEXT NOT NULL DEFAULT 'incomplete',
  "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT FALSE,
  "currentPeriodEnd" TIMESTAMP,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT "organization_billing_subscriptionStatus_check"
    CHECK (
      "subscriptionStatus" IN (
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
        'paused'
      )
    )
);

CREATE TABLE IF NOT EXISTS "repositories" (
  "githubRepoId" TEXT PRIMARY KEY,
  "githubOrgId" TEXT REFERENCES "organizations"("githubOrgId") ON DELETE SET NULL,
  owner TEXT NOT NULL,
  name TEXT NOT NULL,
  "fullName" TEXT NOT NULL UNIQUE,
  "htmlUrl" TEXT,
  "defaultBranch" TEXT,
  private BOOLEAN,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW(),
  "lastSeenAt" TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "repositories_githubOrgId_idx"
  ON "repositories" ("githubOrgId");

CREATE UNIQUE INDEX IF NOT EXISTS "repositories_owner_name_lower_idx"
  ON "repositories" (LOWER(owner), LOWER(name));

CREATE TABLE IF NOT EXISTS "threads" (
  id TEXT PRIMARY KEY,
  "threadId" TEXT NOT NULL,
  "providerSessionId" TEXT NOT NULL,
  source TEXT NOT NULL,
  title TEXT,
  "messageCount" INTEGER,
  "ownerGithubUserId" TEXT NOT NULL,
  "ownerGithubUsername" TEXT NOT NULL,
  "organizationGithubOrgId" TEXT REFERENCES "organizations"("githubOrgId") ON DELETE SET NULL,
  "repositoryGithubRepoId" TEXT REFERENCES "repositories"("githubRepoId") ON DELETE SET NULL,
  "publicId" TEXT NOT NULL UNIQUE,
  "storageProvider" TEXT NOT NULL,
  "storageSourceId" TEXT NOT NULL,
  "artifactFileName" TEXT NOT NULL,
  "artifactFormat" TEXT NOT NULL,
  "startedAt" TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL,
  "uploadedAt" TIMESTAMP DEFAULT NOW(),
  "commitSha" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "lastSeenAt" TIMESTAMP DEFAULT NOW(),
  CONSTRAINT "threads_storageProvider_check"
    CHECK ("storageProvider" IN ('gist', 's3')),
  CONSTRAINT "threads_artifactFormat_check"
    CHECK ("artifactFormat" IN ('json', 'jsonl'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "threads_owner_source_thread_idx"
  ON "threads" ("ownerGithubUserId", source, "threadId");

CREATE INDEX IF NOT EXISTS "threads_owner_updatedAt_idx"
  ON "threads" ("ownerGithubUserId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "threads_organization_updatedAt_idx"
  ON "threads" ("organizationGithubOrgId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "threads_repository_updatedAt_idx"
  ON "threads" ("repositoryGithubRepoId", "updatedAt" DESC);
