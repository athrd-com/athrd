"use client";

import { cn } from "@/lib/utils";
import { ChevronsDownUp, ChevronsUpDown, TerminalIcon } from "lucide-react";
import { useState } from "react";

interface ShellBlockProps {
  command: string;
  explanation?: string;
  result?: string;
}

export default function ShellBlock({
  command,
  explanation,
  result,
}: ShellBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <div className="my-4" title={explanation}>
      <div
        className={cn(
          "group rounded-lg p-3 flex items-center justify-between hover:bg-[#111] hover:border-white/20 transition-colors",
          !isCollapsed && "bg-[#111] border border-white/10"
        )}
      >
        <div className="w-full">
          <div
            className={`flex justify-between w-full ${
              result ? "cursor-pointer" : ""
            }`}
            onClick={() => result && setIsCollapsed(!isCollapsed)}
          >
            <div
              className={cn(
                "flex items-center font-mono text-xs min-w-0",
                !isCollapsed && "gap-2"
              )}
            >
              <TerminalIcon
                size={14}
                className={cn(
                  "text-gray-400 stroke-3 shrink-0 transition-all -translate-x-2",
                  !isCollapsed && "translate-x-0"
                )}
              />
              <span
                className={`text-gray-300 font-medium ${
                  isCollapsed ? "truncate" : ""
                }`}
              >
                {command}
              </span>
            </div>
            {result && (
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
            )}
          </div>
          {result && !isCollapsed && (
            <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all text-gray-500 font-medium border-t border-white/5 pt-2 overflow-x-auto">
              {result}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
