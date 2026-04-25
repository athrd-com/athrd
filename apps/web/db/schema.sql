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

-- Derived metadata projection for thread list/search surfaces.
-- S3 and GitHub Gist remain the canonical stores for full thread content.
CREATE TABLE IF NOT EXISTS github_organizations (
  id TEXT PRIMARY KEY,
  login TEXT NOT NULL,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS thread_index (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('gist', 's3')),
  source_id TEXT NOT NULL,
  owner_github_id TEXT NOT NULL,
  owner_github_login TEXT,
  title TEXT,
  ide TEXT,
  model TEXT,
  model_provider TEXT,
  repo_name TEXT,
  commit_hash TEXT,
  gh_repo_id TEXT,
  org_id TEXT REFERENCES github_organizations(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  content_sha256 TEXT NOT NULL,
  deleted_at TIMESTAMPTZ,
  UNIQUE (source, source_id)
);

CREATE INDEX IF NOT EXISTS thread_index_owner_updated_idx
  ON thread_index (owner_github_id, (COALESCE(updated_at, created_at)) DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS thread_index_org_owner_updated_idx
  ON thread_index (org_id, owner_github_id, (COALESCE(updated_at, created_at)) DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS thread_index_repo_name_idx
  ON thread_index (repo_name)
  WHERE deleted_at IS NULL AND repo_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS thread_index_model_idx
  ON thread_index (model)
  WHERE deleted_at IS NULL AND model IS NOT NULL;
