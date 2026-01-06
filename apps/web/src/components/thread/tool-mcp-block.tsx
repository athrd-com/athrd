"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { BaseToolResponse } from "@/types/athrd";

import { ChevronsDownUp, ChevronsUpDown, ServerCogIcon } from "lucide-react";
import Markdown from "markdown-to-jsx";
import { useEffect, useState } from "react";

interface ToolMCPBlockProps {
  serverName: string;
  toolName: string;
  input?: string;
  results: Array<BaseToolResponse>;
}

export default function ToolMCPBlock({
  serverName,
  toolName,
  input,
  results,
}: ToolMCPBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  useEffect(() => {
    if (results.some((r) => r?.output?.type === "image")) setIsCollapsed(false);
  }, [results]);

  const hasOutput = results.some((r) => r.output || r.error);
  const inputStr =
    typeof input === "string" ? input : JSON.stringify(input, null, 2);

  const renderResult = (result: BaseToolResponse, index: number) => {
    if (result.error) {
      return (
        <pre
          key={index}
          className="text-xs font-mono text-red-400 bg-black/20 p-2 rounded overflow-x-auto"
        >
          {result.error}
        </pre>
      );
    }

    if (result.output?.type === "text") {
      return (
        <pre
          key={index}
          className="text-xs font-mono text-gray-400 bg-black/20 p-2 rounded overflow-x-auto"
        >
          <Markdown>{result.output.text}</Markdown>
        </pre>
      );
    }

    if (result.output?.type === "image") {
      return (
        <div
          key={index}
          className="bg-black/20 p-2 rounded overflow-hidden flex justify-center items-center"
        >
          <img
            src={`data:${result.output.mimeType};base64,${result.output.data}`}
            alt="Tool output"
            className="max-w-full h-auto object-contain"
          />
        </div>
      );
    }

    return null;
  };

  return (
    <div className="my-4">
      <div
        className={cn(
          "group rounded-lg p-3 flex items-center justify-between hover:bg-[#111] hover:border-white/20 transition-colors",
          !isCollapsed && "bg-[#111] border border-white/10"
        )}
      >
        <div className="w-full">
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                className="flex justify-between w-full cursor-pointer"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ServerCogIcon
                    size={14}
                    className=" text-gray-400 shrink-0"
                  />
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-medium border border-blue-500/20 uppercase tracking-wider">
                      {serverName}
                    </span>
                  </div>
                  <span className="text-gray-300 font-mono text-xs font-medium truncate">
                    {toolName}
                  </span>
                </div>
                <div
                  className={cn(
                    "ml-2 hidden group-hover:flex items-center",
                    !isCollapsed && "flex"
                  )}
                >
                  {isCollapsed ? (
                    <ChevronsDownUp
                      size={14}
                      className="text-gray-500 shrink-0"
                    />
                  ) : (
                    <ChevronsUpDown
                      size={14}
                      className="text-gray-500 shrink-0"
                    />
                  )}
                </div>
              </div>
            </HoverCardTrigger>
            {isCollapsed && hasOutput && (
              <HoverCardContent
                className="w-80 p-3 bg-[#111] border-white/10 text-gray-300"
                align="start"
              >
                <div className="space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Output
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                    {results.map((result, i) => renderResult(result, i))}
                  </div>
                </div>
              </HoverCardContent>
            )}
          </HoverCard>

          {!isCollapsed && (
            <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
              {input && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Input
                  </div>
                  <pre className="text-xs font-mono text-gray-400 bg-black/20 p-2 rounded overflow-x-auto">
                    <Markdown>{inputStr}</Markdown>
                  </pre>
                </div>
              )}
              {hasOutput && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Output
                  </div>
                  <div className="space-y-2">
                    {results.map((result, i) => renderResult(result, i))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
