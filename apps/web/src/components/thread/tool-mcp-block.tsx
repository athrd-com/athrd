"use client";

import { cn } from "@/lib/utils";
import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import { useState } from "react";

interface ToolMCPBlockProps {
  serverName: string;
  toolName: string;
  input?: any;
  result?: any;
}

export default function ToolMCPBlock({
  serverName,
  toolName,
  input,
  result,
}: ToolMCPBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const inputStr = typeof input === "string" ? input : JSON.stringify(input, null, 2);
  const resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2);

  return (
    <div className="my-4">
      <div className="group bg-[#111] border border-white/10 rounded-lg p-3 shadow-sm hover:border-white/20 transition-colors">
        <div className="w-full">
          <div
            className="flex justify-between w-full cursor-pointer"
            onClick={() => setIsCollapsed(!isCollapsed)}
          >
            <div className="flex items-center gap-2 min-w-0">
              <div className="flex items-center gap-2">
                <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px] font-medium border border-blue-500/20 uppercase tracking-wider">
                  {serverName}
                </span>
                <ChevronRight
                  size={14}
                  className={cn(
                    "text-gray-500 transition-transform duration-200",
                    !isCollapsed && "rotate-90"
                  )}
                />
              </div>
              <span className="text-gray-300 font-mono text-xs font-medium truncate">
                {toolName}
              </span>
            </div>
            <div className="ml-2">
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

          {!isCollapsed && (
            <div className="mt-3 space-y-3 border-t border-white/5 pt-3">
              {input && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Input</div>
                  <pre className="text-xs font-mono text-gray-400 bg-black/20 p-2 rounded overflow-x-auto">
                    {inputStr}
                  </pre>
                </div>
              )}
              {result && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">Output</div>
                  <pre className="text-xs font-mono text-gray-400 bg-black/20 p-2 rounded overflow-x-auto">
                    {resultStr}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
