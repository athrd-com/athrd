"use client";

import { ChevronRight, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
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
      <div className="group bg-[#111] border border-white/10 rounded-lg p-3 flex items-center justify-between shadow-sm hover:border-white/20 transition-colors">
        <div className="w-full">
          <div
            className={`flex justify-between w-full ${
              result ? "cursor-pointer" : ""
            }`}
            onClick={() => result && setIsCollapsed(!isCollapsed)}
          >
            <div className="flex items-center gap-3 font-mono text-xs min-w-0">
              <ChevronRight
                size={14}
                className="text-blue-500 stroke-3 shrink-0"
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
            <pre className="mt-2 text-xs font-mono whitespace-pre-wrap wrap-break-word text-gray-500 font-medium border-t border-white/5 pt-2">
              {result}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
