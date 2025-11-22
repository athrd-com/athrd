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
import { getUserGists } from "~/server/actions/gists";
import { auth } from "~/server/better-auth/config";
import { ThreadRow } from "./thread-row";

export default async function ThreadsPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <h1 className="text-2xl font-bold">Sign in to view your threads</h1>
        <p className="text-muted-foreground">
          Connect your GitHub account to access your threads.
        </p>
        <LoginButton />
      </div>
    );
  }

  const gists = await getUserGists();

  return (
    <div className="container mx-auto py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold">Your Threads</h1>
      </div>

      {gists.length === 0 ? (
        <div className="text-center text-muted-foreground">
          <p>No threads found.</p>
          <p className="mt-2">Create a new thread to get started.</p>
          <Button asChild className="mt-4">
            <Link href="/">Create Thread</Link>
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
