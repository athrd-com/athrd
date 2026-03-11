"use client";

import { updateOwnedThreadTitle } from "@/server/actions/threads";
import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "~/components/ui/button";

type ThreadTitleEditorProps = {
  id: string;
  title: string;
  isOwner?: boolean;
};

export default function ThreadTitleEditor({
  id,
  title,
  isOwner = false,
}: ThreadTitleEditorProps) {
  const router = useRouter();
  const [currentTitle, setCurrentTitle] = useState(title);
  const [draftTitle, setDraftTitle] = useState(title);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [isUpdatingTitle, startTitleTransition] = useTransition();

  useEffect(() => {
    setCurrentTitle(title);
    setDraftTitle(title);
  }, [title]);

  const handleStartEditingTitle = () => {
    setDraftTitle(currentTitle);
    setTitleError(null);
    setIsEditingTitle(true);
  };

  const handleCancelEditingTitle = () => {
    setDraftTitle(currentTitle);
    setTitleError(null);
    setIsEditingTitle(false);
  };

  const handleSaveTitle = () => {
    const trimmedTitle = draftTitle.trim();
    if (!trimmedTitle) {
      setTitleError("Thread title cannot be empty.");
      return;
    }

    if (trimmedTitle === currentTitle) {
      setIsEditingTitle(false);
      setTitleError(null);
      return;
    }

    setTitleError(null);

    startTitleTransition(async () => {
      const result = await updateOwnedThreadTitle(id, trimmedTitle);
      if (!result.ok) {
        setTitleError(result.error);
        return;
      }

      setCurrentTitle(result.title);
      setDraftTitle(result.title);
      setIsEditingTitle(false);
      router.refresh();
    });
  };

  if (isEditingTitle) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <input
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                handleSaveTitle();
              }

              if (event.key === "Escape") {
                event.preventDefault();
                handleCancelEditingTitle();
              }
            }}
            className="min-w-0 flex-1 rounded-md border border-white/10 bg-white/5 px-3 py-1 text-lg font-medium tracking-tight text-white outline-none transition focus:border-white/20 focus:bg-white/8"
            disabled={isUpdatingTitle}
            aria-label="Thread title"
          />
          <Button
            variant="outline"
            size="sm"
            className="rounded-md bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
            onClick={handleSaveTitle}
            disabled={isUpdatingTitle}
          >
            <Check className="h-3.5 w-3.5 mr-1.5" />
            {isUpdatingTitle ? "Saving..." : "Save"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="rounded-md bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
            onClick={handleCancelEditingTitle}
            disabled={isUpdatingTitle}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
            Cancel
          </Button>
        </div>
        {titleError ? (
          <p className="text-sm text-red-300">{titleError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="group/title flex items-center gap-2">
      <h1 className="min-w-0 truncate text-2xl font-medium text-white tracking-tight">
        {currentTitle}
      </h1>
      {isOwner ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 rounded-md text-gray-400 opacity-0 transition hover:bg-white/5 hover:text-white group-hover/title:opacity-100 focus-visible:opacity-100"
          onClick={handleStartEditingTitle}
          aria-label="Edit thread title"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : null}
    </div>
  );
}
