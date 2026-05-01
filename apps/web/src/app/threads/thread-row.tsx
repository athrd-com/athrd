"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "~/components/ui/badge";
import { TableCell, TableRow } from "~/components/ui/table";
import type { ThreadListEntry } from "~/lib/thread-list";

interface ThreadRowProps {
  thread: ThreadListEntry;
}

export function ThreadRow({ thread }: ThreadRowProps) {
  const router = useRouter();
  const updatedAt = thread.updatedAt || thread.createdAt;
  const href = `/threads/${thread.id}`;
  const repositoryLabel =
    thread.repositoryFullName ||
    [thread.repositoryOwner, thread.repositoryName].filter(Boolean).join("/") ||
    "No repository";

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(href)}
    >
      <TableCell className="max-w-[28rem] py-2">
        <div className="truncate font-medium">
          {thread.title || "Untitled Thread"}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {thread.ide ? (
            <Badge variant="outline" className="font-normal capitalize">
              {thread.ide}
            </Badge>
          ) : null}
          {thread.source ? (
            <Badge variant="secondary" className="font-normal uppercase">
              {thread.source}
            </Badge>
          ) : null}
          {typeof thread.messageCount === "number" ? (
            <span className="text-xs text-muted-foreground">
              {thread.messageCount === 1
                ? "1 message"
                : `${thread.messageCount} messages`}
            </span>
          ) : null}
        </div>
      </TableCell>
      <TableCell className="hidden max-w-64 py-2 md:table-cell">
        <span className="block truncate">{repositoryLabel}</span>
      </TableCell>
      <TableCell className="hidden py-2 lg:table-cell">
        {thread.organizationLogin || "Personal"}
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap">
        {updatedAt ? formatDate(updatedAt) : "Unknown"}
      </TableCell>
      <TableCell className="py-2 text-right">
        <ArrowRight className="ml-auto h-4 w-4" />
      </TableCell>
    </TableRow>
  );
}

function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
