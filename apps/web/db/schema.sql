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
  CONSTRAINT "organizations_storageProvider_check"
    CHECK ("storageProvider" IN ('gist', 's3'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "organizations_login_lower_idx"
  ON "organizations" (LOWER(login));

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
