import {
  getThreadFilterOptions,
  getUserThreadGroups,
} from "@/server/actions/threads";
import { headers } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { LoginButton } from "~/components/auth/login-button";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { ThreadListEntry } from "~/lib/thread-list";
import { auth } from "~/server/better-auth/config";
import { ThreadFilters } from "./thread-filters";
import { ThreadRow } from "./thread-row";

interface ThreadsPageProps {
  searchParams?: Promise<{
    orgId?: string;
    repoId?: string;
    cursor?: string;
    stack?: string;
  }>;
}

export default async function ThreadsPage({ searchParams }: ThreadsPageProps) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">
          Sign in to view your shared threads
        </h1>
        <LoginButton />
      </div>
    );
  }

  const { orgId, repoId, cursor, stack } =
    (await searchParams) ?? {
      orgId: undefined,
      repoId: undefined,
      cursor: undefined,
      stack: undefined,
    };
  const requestedOrgId = sanitizeParam(orgId);
  const selectedRepoId = sanitizeParam(repoId);
  const previousCursors = decodeCursorStack(stack);
  const currentCursor = sanitizeParam(cursor);
  let filterOptions = await getThreadFilterOptions(requestedOrgId);
  const selectedOrgId =
    requestedOrgId &&
    filterOptions.organizations.some(
      (organization) => organization.id === requestedOrgId,
    )
      ? requestedOrgId
      : undefined;

  if (requestedOrgId && !selectedOrgId) {
    filterOptions = await getThreadFilterOptions();
  }

  const effectiveRepoId =
    selectedRepoId &&
    filterOptions.repositories.some((repository) => repository.id === selectedRepoId)
      ? selectedRepoId
      : undefined;
  const threadGroups = await getUserThreadGroups({
    orgId: selectedOrgId,
    repoId: effectiveRepoId,
    cursor: currentCursor,
  });
  const totalThreads =
    threadGroups.today.length +
    threadGroups.yesterday.length +
    threadGroups.older.items.length;
  const relativeTo = Date.now();
  const nextHref = threadGroups.older.nextCursor
    ? buildThreadsHref({
        orgId: selectedOrgId,
        repoId: effectiveRepoId,
        cursor: threadGroups.older.nextCursor,
        stack: encodeCursorStack([...previousCursors, currentCursor || ""]),
      })
    : null;
  const previousHref =
    currentCursor !== undefined
      ? buildPreviousHref({
          orgId: selectedOrgId,
          repoId: effectiveRepoId,
          previousCursors,
        })
      : null;

  return (
    <div className="container mx-auto py-10">
      <div className="mb-8">
        <div>
          <h1 className="text-3xl font-bold">Your Threads</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {totalThreads === 1
              ? "1 indexed session"
              : `${totalThreads} indexed sessions`}
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)] lg:items-start">
        <aside className="lg:sticky lg:top-6">
          <ThreadFilters
            organizations={filterOptions.organizations}
            repositories={filterOptions.repositories}
            selectedOrgId={selectedOrgId}
            selectedRepoId={effectiveRepoId}
          />
        </aside>

        <div className="min-w-0 space-y-8">
          <ThreadSection
            title="Today"
            emptyLabel="No sessions today"
            relativeTo={relativeTo}
            threads={threadGroups.today}
            updatedDisplay="relative"
          />
          <ThreadSection
            title="Yesterday"
            emptyLabel="No sessions yesterday"
            threads={threadGroups.yesterday}
          />
          <ThreadSection
            title="Older"
            emptyLabel="No older sessions"
            footer={
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-sm text-muted-foreground">
                  {currentCursor
                    ? "Showing another page of older sessions"
                    : "Showing older sessions"}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    asChild={Boolean(previousHref)}
                    disabled={!previousHref}
                    variant="outline"
                  >
                    {previousHref ? (
                      <Link href={previousHref}>Previous</Link>
                    ) : (
                      <span>Previous</span>
                    )}
                  </Button>
                  <Button
                    asChild={Boolean(nextHref)}
                    disabled={!nextHref}
                    variant="outline"
                  >
                    {nextHref ? (
                      <Link href={nextHref}>Next</Link>
                    ) : (
                      <span>Next</span>
                    )}
                  </Button>
                </div>
              </div>
            }
            threads={threadGroups.older.items}
          />
        </div>
      </div>
    </div>
  );
}

function ThreadSection({
  title,
  emptyLabel,
  footer,
  relativeTo,
  threads,
  updatedDisplay = "absolute",
}: {
  title: string;
  emptyLabel: string;
  footer?: ReactNode;
  relativeTo?: number;
  threads: ThreadListEntry[];
  updatedDisplay?: "absolute" | "relative";
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">
          {threads.length === 1 ? "1 session" : `${threads.length} sessions`}
        </span>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Session</TableHead>
              <TableHead className="hidden md:table-cell">Repository</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="w-10 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {threads.length > 0 ? (
              threads.map((thread) => (
                <ThreadRow
                  key={thread.id}
                  relativeTo={relativeTo}
                  thread={thread}
                  updatedDisplay={updatedDisplay}
                />
              ))
            ) : (
              <TableRow>
                <TableCell
                  className="px-4 py-8 text-center text-sm text-muted-foreground"
                  colSpan={4}
                >
                  {emptyLabel}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        {footer}
      </div>
    </section>
  );
}

function buildThreadsHref(input: {
  orgId?: string;
  repoId?: string;
  cursor?: string;
  stack?: string;
}) {
  const params = new URLSearchParams();

  if (input.orgId) {
    params.set("orgId", input.orgId);
  }

  if (input.repoId) {
    params.set("repoId", input.repoId);
  }

  if (input.cursor) {
    params.set("cursor", input.cursor);
  }

  if (input.stack) {
    params.set("stack", input.stack);
  }

  const query = params.toString();
  return query ? `/threads?${query}` : "/threads";
}

function buildPreviousHref(input: {
  orgId?: string;
  repoId?: string;
  previousCursors: string[];
}) {
  const stack = [...input.previousCursors];
  const cursor = stack.pop();

  return buildThreadsHref({
    orgId: input.orgId,
    repoId: input.repoId,
    cursor: cursor || undefined,
    stack: stack.length > 0 ? encodeCursorStack(stack) : undefined,
  });
}

function sanitizeParam(value?: string) {
  return value?.trim() ? value : undefined;
}

function decodeCursorStack(value?: string): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsedValue = JSON.parse(
      Buffer.from(value, "base64url").toString("utf-8"),
    ) as unknown;

    return Array.isArray(parsedValue)
      ? parsedValue.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function encodeCursorStack(value: string[]) {
  return Buffer.from(JSON.stringify(value), "utf-8").toString("base64url");
}
