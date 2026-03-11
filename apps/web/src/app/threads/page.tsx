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
import { getUserGists, getUserOrganizations } from "~/server/actions/gists";
import { auth } from "~/server/better-auth/config";
import { OrgComingSoon } from "./org-coming-soon";
import { OrgSwitcher } from "./org-switcher";
import { ThreadRow } from "./thread-row";

interface ThreadsPageProps {
  searchParams?: Promise<{
    orgId?: string;
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

  const [{ orgId }, gists, organizations] = await Promise.all([
    searchParams ?? Promise.resolve({ orgId: undefined }),
    getUserGists(),
    getUserOrganizations(),
  ]);
  const selectedOrganization = organizations.find(
    (organization) => String(organization.id) === orgId,
  );

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
      ) : gists.length === 0 ? (
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
              {gists.map((gist) => (
                <ThreadRow key={gist.id} gist={gist} />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
