import { describe, expect, test } from "bun:test";
import type { Octokit } from "@octokit/rest";
import { resolveGitHubRepositoryContext } from "./github-context.js";
import type { GitHubUserInfo } from "./github.js";

const octokit = {} as Octokit;
const userInfo: GitHubUserInfo = {
  id: "245300",
  username: "gregorym",
  avatarImage: "https://avatars.githubusercontent.com/u/245300?v=4",
};

describe("resolveGitHubRepositoryContext", () => {
  test("resolves a private personal repository without organization metadata", async () => {
    const orgLookups: string[] = [];

    const context = await resolveGitHubRepositoryContext({
      octokit,
      githubRepo: "gregorym/mlxmac",
      userInfo,
      lookups: {
        getRepoInfo: async () => ({
          repoId: 123,
          owner: "gregorym",
          ownerType: "User",
          name: "mlxmac",
          fullName: "gregorym/mlxmac",
          htmlUrl: "https://github.com/gregorym/mlxmac",
          defaultBranch: "main",
          private: true,
        }),
        getOrgInfo: async (_octokit, orgName) => {
          orgLookups.push(orgName);
          return null;
        },
      },
    });

    expect(orgLookups).toEqual([]);
    expect(context.organization).toBeUndefined();
    expect(context.repository).toEqual({ githubRepoId: "123" });
    expect(context.github.repository).toMatchObject({
      githubRepoId: "123",
      owner: "gregorym",
      name: "mlxmac",
      fullName: "gregorym/mlxmac",
      private: true,
    });
    expect(context.repositoryLookupFailed).toBe(false);
  });

  test("keeps organization metadata for organization-owned repositories", async () => {
    const context = await resolveGitHubRepositoryContext({
      octokit,
      githubRepo: "athrd-com/athrd",
      userInfo,
      lookups: {
        getRepoInfo: async () => ({
          repoId: 789,
          owner: "athrd-com",
          ownerType: "Organization",
          name: "athrd",
          fullName: "athrd-com/athrd",
          private: false,
        }),
        getOrgInfo: async () => ({
          orgId: 456,
          orgName: "athrd-com",
          orgIcon: "https://example.com/avatar.png",
        }),
      },
    });

    expect(context.organization).toEqual({ githubOrgId: "456" });
    expect(context.repository).toEqual({ githubRepoId: "789" });
    expect(context.github.organization).toMatchObject({
      githubOrgId: "456",
      login: "athrd-com",
    });
    expect(context.github.repository).toMatchObject({
      githubRepoId: "789",
      fullName: "athrd-com/athrd",
    });
  });

  test("reports a lookup failure without creating a fake personal organization", async () => {
    const orgLookups: string[] = [];

    const context = await resolveGitHubRepositoryContext({
      octokit,
      githubRepo: "gregorym/mlxmac",
      userInfo,
      lookups: {
        getRepoInfo: async () => null,
        getOrgInfo: async (_octokit, orgName) => {
          orgLookups.push(orgName);
          return null;
        },
      },
    });

    expect(orgLookups).toEqual([]);
    expect(context.github).toEqual({});
    expect(context.organization).toBeUndefined();
    expect(context.repository).toBeUndefined();
    expect(context.repositoryLookupFailed).toBe(true);
    expect(context.repositoryFullName).toBe("gregorym/mlxmac");
  });
});
