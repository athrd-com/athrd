"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "~/components/ui/table";
import type { ThreadListEntry } from "~/lib/thread-list";

interface ThreadRowProps {
  relativeTo?: number;
  thread: ThreadListEntry;
  updatedDisplay?: "absolute" | "relative";
}

type RelativeTimeUnit = Intl.RelativeTimeFormatUnit;

export function ThreadRow({
  relativeTo,
  thread,
  updatedDisplay = "absolute",
}: ThreadRowProps) {
  const router = useRouter();
  const updatedAt = thread.updatedAt || thread.createdAt;
  const href = `/threads/${thread.id}`;
  const repositoryLabel = getRepositoryLabel(thread);
  const updatedLabel = updatedAt
    ? formatUpdatedAt(updatedAt, updatedDisplay, relativeTo)
    : "Unknown";

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(href)}
    >
      <TableCell className="max-w-[28rem] py-2">
        <div className="truncate font-medium">
          {thread.title || "Untitled Thread"}
        </div>
      </TableCell>
      <TableCell className="hidden max-w-64 py-2 md:table-cell">
        <span className="block truncate">{repositoryLabel}</span>
      </TableCell>
      <TableCell className="py-2 whitespace-nowrap">
        {updatedLabel}
      </TableCell>
      <TableCell className="py-2 text-right">
        <ArrowRight className="ml-auto h-4 w-4" />
      </TableCell>
    </TableRow>
  );
}

function getRepositoryLabel(thread: ThreadListEntry): string {
  if (thread.repositoryFullName?.includes("/")) {
    return thread.repositoryFullName;
  }

  const owner = thread.repositoryOwner || thread.organizationLogin;
  const name = thread.repositoryName || thread.repositoryFullName;

  if (owner && name) {
    return `${owner}/${name}`;
  }

  return thread.repositoryFullName || thread.repositoryName || "No repository";
}

function formatUpdatedAt(
  value: string | number | Date,
  updatedDisplay: "absolute" | "relative",
  relativeTo?: number,
): string {
  if (updatedDisplay === "relative") {
    return formatRelativeTime(value, relativeTo);
  }

  return formatDate(value);
}

function formatDate(value: string | number | Date): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatRelativeTime(
  value: string | number | Date,
  relativeTo = Date.now(),
): string {
  const date = new Date(value);
  const timestamp = date.getTime();

  if (Number.isNaN(timestamp)) {
    return "Unknown";
  }

  const seconds = Math.round((timestamp - relativeTo) / 1000);
  const absoluteSeconds = Math.abs(seconds);

  if (absoluteSeconds < 45) {
    return "just now";
  }

  const intervals: Array<{ unit: RelativeTimeUnit; seconds: number }> = [
    { unit: "year", seconds: 60 * 60 * 24 * 365 },
    { unit: "month", seconds: 60 * 60 * 24 * 30 },
    { unit: "week", seconds: 60 * 60 * 24 * 7 },
    { unit: "day", seconds: 60 * 60 * 24 },
    { unit: "hour", seconds: 60 * 60 },
    { unit: "minute", seconds: 60 },
  ];
  const interval =
    intervals.find((item) => absoluteSeconds >= item.seconds) ||
    intervals[intervals.length - 1];

  if (!interval) {
    return "just now";
  }

  const amount = Math.round(seconds / interval.seconds);

  return new Intl.RelativeTimeFormat(undefined, {
    numeric: "auto",
  }).format(amount, interval.unit);
}
