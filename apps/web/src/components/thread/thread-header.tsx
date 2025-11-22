"use client";

import type { GistOwner } from "@/lib/github";
import { IDE } from "@/types/ide";
import { Check, Github, Link2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { ClaudeAiIcon } from "../ui/svgs/claudeAiIcon";
import { Gemini } from "../ui/svgs/gemini";
import { OpenaiDark } from "../ui/svgs/openaiDark";
import { Vscode } from "../ui/svgs/vscode";

type ThreadHeaderProps = {
  ide?: IDE;
  owner: GistOwner;
  title: string;
  createdAt: string | number;
  repoUrl?: string;
  repoName?: string;
  modelsUsed?: string[];
};

function getIDEIcon(ide?: IDE) {
  switch (ide) {
    case IDE.VSCODE:
      return <Vscode className="h-6 w-6" />;
    case IDE.CLAUDE_CODE:
      return <ClaudeAiIcon className="h-6 w-6" />;
    case IDE.GEMINI:
      return <Gemini className="h-6 w-6" />;
    case IDE.CODEX:
      return <OpenaiDark className="h-6 w-6" />;
    default:
      return null;
  }
}

function getIDEName(ide?: IDE) {
  switch (ide) {
    case IDE.VSCODE:
      return "VS Code";
    case IDE.CLAUDE_CODE:
      return "Claude Code";
    case IDE.GEMINI:
      return "Gemini";
    case IDE.CODEX:
      return "Codex";
    default:
      return null;
  }
}

function getModelIcon(model: string) {
  const m = model.toLowerCase();
  if (m.includes("claude"))
    return <ClaudeAiIcon className="h-3.5 w-3.5 mr-1.5" />;
  if (m.includes("gemini")) return <Gemini className="h-3.5 w-3.5 mr-1.5" />;
  if (m.includes("gpt") || m.includes("o1"))
    return <OpenaiDark className="h-3.5 w-3.5 mr-1.5" />;
  return null;
}

export default function ThreadHeader({
  owner,
  createdAt,
  title,
  ide,
  repoUrl,
  repoName,
  modelsUsed,
}: ThreadHeaderProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy URL:", err);
    }
  };

  return (
    <div className="border-b border-white/5 pt-6 pb-3 mb-8">
      <div className="">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-medium text-white flex items-center gap-3 tracking-tight">
            {ide && (
              <div className="flex items-center gap-3 text-gray-400 font-normal">
                {getIDEIcon(ide)}
                <span className="inline sm:hidden">{getIDEName(ide)}</span>
                <span className="text-gray-700">/</span>
              </div>
            )}
            {title}
          </h1>
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              className="rounded-md bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-colors h-8 text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 mr-1.5" /> Copied
                </>
              ) : (
                <>
                  <Link2 className="h-3.5 w-3.5 mr-1.5" /> Share
                </>
              )}
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-500">
          {repoUrl && repoName && (
            <>
              <Link href={repoUrl} target="_blank" rel="nofollow">
                <Badge
                  variant="outline"
                  className="bg-[#111] text-gray-400 border-white/10 hover:bg-white/5 hover:text-gray-300 hover:border-white/20 transition-all rounded-md px-2 py-0.5 font-mono text-xs flex items-center"
                >
                  <Github className="h-3.5 w-3.5 mr-1.5" />
                  {repoName}
                </Badge>
              </Link>
              <span className="text-gray-700 hidden sm:inline">•</span>
            </>
          )}
          <Link
            href={`https://github.com/${owner.login}`}
            target={"_blank"}
            rel="nofollow"
          >
            <Badge
              variant="outline"
              className="bg-[#111] text-gray-400 border-white/10 hover:bg-white/5 hover:text-gray-300 hover:border-white/20 transition-all rounded-md px-2 py-0.5 font-mono text-xs"
            >
              @{owner.login}
            </Badge>
          </Link>
          {modelsUsed && modelsUsed.length > 0 && (
            <>
              <span className="text-gray-700 hidden sm:inline">•</span>
              <div className="flex flex-wrap items-center gap-2">
                {modelsUsed.map((model) => (
                  <Badge
                    key={model}
                    variant="outline"
                    className="bg-[#111] text-gray-400 border-white/10 hover:bg-white/5 hover:text-gray-300 hover:border-white/20 transition-all rounded-md px-2 py-0.5 font-mono text-xs flex items-center"
                  >
                    {getModelIcon(model)}
                    {model}
                  </Badge>
                ))}
              </div>
            </>
          )}
          <span className="text-gray-700 hidden sm:inline">•</span>
          <span>
            {new Date(createdAt).toLocaleDateString(undefined, {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
