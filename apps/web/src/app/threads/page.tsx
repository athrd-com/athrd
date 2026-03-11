import { getUserThreads } from "@/server/actions/threads";
import { headers } from "next/headers";
import Link from "next/link";
import { LoginButton } from "~/components/auth/login-button";
import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { getUserOrganizations } from "~/server/actions/gists";
import { auth } from "~/server/better-auth/config";
import { OrgComingSoon } from "./org-coming-soon";
import { OrgSwitcher } from "./org-switcher";
import { ThreadRow } from "./thread-row";

interface ThreadsPageProps {
  searchParams?: Promise<{
    orgId?: string;
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

  const { orgId, cursor, stack } =
    (await searchParams) ?? {
      orgId: undefined,
      cursor: undefined,
      stack: undefined,
    };
  const previousCursors = decodeCursorStack(stack);
  const currentCursor = sanitizeCursor(cursor);
  const [threadPage, organizations] = await Promise.all([
    getUserThreads(orgId, currentCursor),
    getUserOrganizations(),
  ]);
  const threads = threadPage.items;
  const selectedOrganization = organizations.find(
    (organization) => String(organization.id) === orgId,
  );
  const nextHref = threadPage.nextCursor
    ? buildThreadsHref({
        orgId,
        cursor: threadPage.nextCursor,
        stack: encodeCursorStack([...previousCursors, currentCursor || ""]),
      })
    : null;
  const previousHref =
    currentCursor !== undefined
      ? buildPreviousHref({ orgId, previousCursors })
      : null;

  return (
    <div className="container mx-auto py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Your Threads</h1>
        <OrgSwitcher
          organizations={organizations.map((organization) => ({
            id: String(organization.id),
            login: organization.login,
            avatarUrl: organization.avatar_url,
          }))}
          selectedOrgId={orgId}
        />
      </div>

      {orgId ? (
        <OrgComingSoon organizationName={selectedOrganization?.login} />
      ) : threads.length === 0 ? (
        <div className="text-center text-muted-foreground">
          <p>No threads yet.</p>
          <p className="mt-2">
            Create your first thread to start sharing AI session context.
          </p>
          <Button asChild className="mt-4">
            <Link href="/">Create your first thread</Link>
          </Button>
        </div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Description</TableHead>
                <TableHead>Created At</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {threads.map((thread) => (
                <ThreadRow key={thread.id} thread={thread} />
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm text-muted-foreground">
              {currentCursor ? "Showing another page of threads" : "Showing newest threads"}
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
                {nextHref ? <Link href={nextHref}>Next</Link> : <span>Next</span>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildThreadsHref(input: {
  orgId?: string;
  cursor?: string;
  stack?: string;
}) {
  const params = new URLSearchParams();

  if (input.orgId) {
    params.set("orgId", input.orgId);
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
  previousCursors: string[];
}) {
  const stack = [...input.previousCursors];
  const cursor = stack.pop();

  return buildThreadsHref({
    orgId: input.orgId,
    cursor: cursor || undefined,
    stack: stack.length > 0 ? encodeCursorStack(stack) : undefined,
  });
}

function sanitizeCursor(value?: string) {
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
