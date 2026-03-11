"use client";

import { deleteOwnedThread } from "@/server/actions/threads";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";

interface ThreadOptionsMenuProps {
  id: string;
}

export default function ThreadOptionsMenu({ id }: ThreadOptionsMenuProps) {
  const router = useRouter();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, startDeleteTransition] = useTransition();

  const handleDelete = () => {
    const confirmed = window.confirm("Delete this thread permanently?");
    if (!confirmed) {
      return;
    }

    setDeleteError(null);

    startDeleteTransition(async () => {
      const result = await deleteOwnedThread(id);

      if (!result.ok) {
        setDeleteError(result.error);
        return;
      }

      router.push(result.redirectTo);
      router.refresh();
    });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className="rounded-md bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors h-8 text-xs"
          disabled={isDeleting}
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Options</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-red-300 focus:bg-red-500/10 focus:text-red-200"
          disabled={isDeleting}
          onSelect={(event) => {
            event.preventDefault();
            handleDelete();
          }}
        >
          <Trash2 className="h-4 w-4" />
          {isDeleting ? "Deleting thread..." : "Delete permanently"}
        </DropdownMenuItem>
        {deleteError ? (
          <div className="px-2.5 pb-2 text-xs text-red-300">{deleteError}</div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
