"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "~/components/ui/table";
import type { ThreadListEntry } from "~/lib/thread-list";

interface ThreadRowProps {
  thread: ThreadListEntry;
}

export function ThreadRow({ thread }: ThreadRowProps) {
  const router = useRouter();
  const createdAt = thread.createdAt || thread.updatedAt;

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(`/threads/${thread.id}`)}
    >
      <TableCell className="py-2 font-medium">
        {thread.title || "Untitled Thread"}
      </TableCell>
      <TableCell className="py-2">
        {createdAt ? new Date(createdAt).toLocaleDateString() : "Unknown"}
      </TableCell>
      <TableCell className="py-2 text-right">
        <ArrowRight className="ml-auto h-4 w-4" />
      </TableCell>
    </TableRow>
  );
}
