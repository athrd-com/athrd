"use client";

import { Building2, GitBranch } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "~/lib/utils";
import type {
  ThreadOrganizationFilterOption,
  ThreadRepositoryFilterOption,
} from "~/lib/thread-list";

interface ThreadFiltersProps {
  organizations: ThreadOrganizationFilterOption[];
  repositories: ThreadRepositoryFilterOption[];
  selectedOrgId?: string;
  selectedRepoId?: string;
}

const ALL_ORGS_VALUE = "__all_orgs__";
const ALL_REPOS_VALUE = "__all_repos__";

export function ThreadFilters({
  organizations,
  repositories,
  selectedOrgId,
  selectedRepoId,
}: ThreadFiltersProps) {
  const searchParams = useSearchParams();

  function buildFilterHref(next: { orgId?: string; repoId?: string }) {
    const params = new URLSearchParams(searchParams.toString());

    params.delete("cursor");
    params.delete("stack");

    if (next.orgId !== undefined) {
      if (next.orgId) {
        params.set("orgId", next.orgId);
      } else {
        params.delete("orgId");
      }

      params.delete("repoId");
    }

    if (next.repoId !== undefined) {
      if (next.repoId) {
        params.set("repoId", next.repoId);
      } else {
        params.delete("repoId");
      }
    }

    const query = params.toString();
    return query ? `/threads?${query}` : "/threads";
  }

  return (
    <nav
      aria-label="Thread filters"
      className="space-y-5 border-b pb-6 lg:border-r lg:border-b-0 lg:pr-6 lg:pb-0"
    >
      <div>
        <h2 className="text-sm font-semibold">Filters</h2>
      </div>

      <div className="space-y-4">
        <FilterList
          icon={<Building2 className="size-4" />}
          items={[
            {
              href: buildFilterHref({ orgId: "" }),
              isActive: !selectedOrgId,
              label: "All organizations",
              value: ALL_ORGS_VALUE,
            },
            ...organizations.map((organization) => ({
              href: buildFilterHref({ orgId: organization.id }),
              isActive: selectedOrgId === organization.id,
              label: organization.login,
              value: organization.id,
            })),
          ]}
          title="Organization"
        />

        <FilterList
          icon={<GitBranch className="size-4" />}
          items={[
            {
              href: buildFilterHref({ repoId: "" }),
              isActive: !selectedRepoId,
              label: "All repositories",
              value: ALL_REPOS_VALUE,
            },
            ...repositories.map((repository) => ({
              href: buildFilterHref({ repoId: repository.id }),
              isActive: selectedRepoId === repository.id,
              label: repository.fullName,
              value: repository.id,
            })),
          ]}
          title="Repository"
        />
      </div>
    </nav>
  );
}

function FilterList({
  icon,
  items,
  title,
}: {
  icon: React.ReactNode;
  items: Array<{
    href: string;
    isActive: boolean;
    label: string;
    value: string;
  }>;
  title: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h3>
      <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
        {items.map((item) => (
          <li key={item.value}>
            <Link
              aria-current={item.isActive ? "page" : undefined}
              className={cn(
                "block truncate rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted hover:text-foreground",
                item.isActive
                  ? "bg-muted font-medium text-foreground"
                  : "text-muted-foreground",
              )}
              href={item.href}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
