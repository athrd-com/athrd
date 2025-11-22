"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "~/components/ui/table";
import type { GistData } from "~/lib/github";

interface ThreadRowProps {
  gist: GistData;
}

export function ThreadRow({ gist }: ThreadRowProps) {
  const router = useRouter();

  return (
    <TableRow
      className="cursor-pointer"
      onClick={() => router.push(`/threads/${gist.id}`)}
    >
      <TableCell className="py-2 font-medium">
        {gist.description || "Untitled Thread"}
      </TableCell>
      <TableCell className="py-2">
        {new Date(gist.created_at).toLocaleDateString()}
      </TableCell>
      <TableCell className="py-2 text-right">
        <ArrowRight className="ml-auto h-4 w-4" />
      </TableCell>
    </TableRow>
  );
}
