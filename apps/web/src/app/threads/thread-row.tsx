"use client";

import { ClaudeAiIcon } from "@/components/ui/svgs/claudeAiIcon";
import { CursorDark } from "@/components/ui/svgs/cursorDark";
import { Gemini } from "@/components/ui/svgs/gemini";
import { OpenaiDark } from "@/components/ui/svgs/openaiDark";
import { Pi } from "@/components/ui/svgs/pi";
import { Vscode } from "@/components/ui/svgs/vscode";
import { ArrowRight, Code2 } from "lucide-react";
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
  const ideIcon = getIdeIcon(thread.ide);

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(href)}
    >
      <TableCell className="max-w-[28rem] py-2">
        <div className="flex min-w-0 items-center gap-2 font-medium">
          {ideIcon ? (
            <span
              className="flex size-4 shrink-0 items-center justify-center"
              title={getIdeName(thread.ide)}
            >
              {ideIcon}
            </span>
          ) : null}
          <span className="truncate">{thread.title || "Untitled Thread"}</span>
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

function getIdeIcon(ide?: string) {
  const iconClassName = "size-4";

  switch (ide) {
    case "claude":
      return <ClaudeAiIcon className={iconClassName} />;
    case "codex":
      return <OpenaiDark className={iconClassName} />;
    case "cursor":
      return (
        <CursorDark
          className={`${iconClassName} text-white`}
          fill="currentColor"
        />
      );
    case "gemini":
      return <Gemini className={iconClassName} />;
    case "pi":
      return <Pi className={`${iconClassName} text-white`} />;
    case "vscode":
      return <Vscode className={iconClassName} />;
    default:
      return ide ? (
        <Code2 className={`${iconClassName} text-muted-foreground`} />
      ) : null;
  }
}

function getIdeName(ide?: string): string {
  switch (ide) {
    case "claude":
      return "Claude";
    case "codex":
      return "Codex";
    case "cursor":
      return "Cursor";
    case "gemini":
      return "Gemini";
    case "opencode":
      return "OpenCode";
    case "pi":
      return "Pi";
    case "vscode":
      return "VS Code";
    default:
      return ide || "Unknown IDE";
  }
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
