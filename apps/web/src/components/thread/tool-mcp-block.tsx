"use client";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

import type { MCPResultDetails } from "@/types/vscode";
import { ChevronsDownUp, ChevronsUpDown, ServerCogIcon } from "lucide-react";
import Markdown from "markdown-to-jsx";
import { useState } from "react";

interface ToolMCPBlockProps {
  serverName: string;
  toolName: string;
  input?: string;
  textResult?: string;
  imageResult?: string;
}

export default function ToolMCPBlock({
  serverName,
  toolName,
  input,
  textResult,
  imageResult,
}: ToolMCPBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const inputStr =
    typeof input === "string" ? input : JSON.stringify(input, null, 2);
  const resultStr =
    typeof textResult === "string" ? textResult : JSON.stringify(textResult, null, 2);

  return (
    <div className="my-4">
      <div className="group bg-[#111] border border-white/10 rounded-lg p-3 shadow-sm hover:border-white/20 transition-colors">
        <div className="w-full">
          <HoverCard openDelay={200} closeDelay={100}>
            <HoverCardTrigger asChild>
              <div
                className="flex justify-between w-full cursor-pointer"
                onClick={() => setIsCollapsed(!isCollapsed)}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ServerCogIcon size={14} className=" text-gray-400 shrink-0" />
                  <div className="flex items-center gap-2">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-medium border border-blue-500/20 uppercase tracking-wider">
                      {serverName}
                    </span>
                  </div>
                  <span className="text-gray-300 font-mono text-xs font-medium truncate">
                    {toolName}
                  </span>
                </div>
                <div className="ml-2">
                  {isCollapsed ? (
                    <ChevronsDownUp size={14} className="text-gray-500 shrink-0" />
                  ) : (
                    <ChevronsUpDown size={14} className="text-gray-500 shrink-0" />
                  )}
                </div>
              </div>
            </HoverCardTrigger>
            {isCollapsed && (textResult || imageResult) && (
              <HoverCardContent
                className="w-80 p-3 bg-[#111] border-white/10 text-gray-300"
                align="start"
              >
                <div className="space-y-3">
                  {textResult && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                        Output
                      </div>
                      <pre className="text-xs font-mono text-gray-400 bg-black/20 p-2 rounded overflow-x-auto max-h-60">
                        <Markdown>{resultStr}</Markdown>
                      </pre>
                    </div>
                  )}
                  {imageResult && (
                    <div>
                      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                        Output
                      </div>
                      <div className="bg-black/20 p-2 rounded overflow-hidden flex justify-center items-center">
                        <img
                          src={`data:image/png;base64,${imageResult}`}
                          alt="Tool output"
                          className="max-w-full h-auto object-contain"
                        />
                      </div>
                    </div>
                  )}
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
              {textResult && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Output
                  </div>
                  <pre className="text-xs font-mono text-gray-400 bg-black/20 p-2 rounded overflow-x-auto">
                    <Markdown>{resultStr}</Markdown>
                  </pre>
                </div>
              )}
              {imageResult && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Output
                  </div>
                  <div className="bg-black/20 p-2 rounded overflow-hidden flex justify-center items-center">
                    <img
                      src={`data:image/png;base64,${imageResult}`}
                      alt="Tool output"
                      className="max-w-full h-auto object-contain"
                    />
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
