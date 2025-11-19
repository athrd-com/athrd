"use client";

import { cn } from "@/lib/utils";
import { diffLines, type Change } from "diff";
import { ChevronsDownUp, ChevronsUpDown, FileCode } from "lucide-react";
import { useState } from "react";

interface ToolEditBlockProps {
  filePath: string;
  oldString: string;
  newString: string;
}

interface DiffLine {
  type: "add" | "del" | "ctx";
  content: string;
}

/**
 * FileDiff: Displays file changes with header showing path and stats
 * Uses the diff library to calculate line-by-line differences
 */
export default function ToolEditBlock({
  filePath,
  oldString,
  newString,
}: ToolEditBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const body = { filePath, oldString, newString };
  // Calculate diff using the diff library
  const changes: Change[] = diffLines(body.oldString, body.newString);

  // Convert diff changes to our line format
  const lines: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  changes.forEach((change) => {
    const content = change.value.replace(/\n$/, ""); // Remove trailing newline
    const lineCount = content.split("\n").length;

    if (change.added) {
      additions += lineCount;
      content.split("\n").forEach((line) => {
        lines.push({ type: "add", content: line });
      });
    } else if (change.removed) {
      deletions += lineCount;
      content.split("\n").forEach((line) => {
        lines.push({ type: "del", content: line });
      });
    } else {
      content.split("\n").forEach((line) => {
        lines.push({ type: "ctx", content: line });
      });
    }
  });

  const displayedLines = isCollapsed ? lines.slice(0, 5) : lines;
  const hasMoreLines = lines.length > 5;

  return (
    <div className="my-6 rounded-lg border border-white/10 overflow-hidden bg-[#111] shadow-sm">
      {/* File Header */}
      <div className="flex items-center justify-between bg-white/5 border-b border-white/10 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-mono text-gray-400 truncate">
          <FileCode size={14} className="text-gray-500 shrink-0" />
          <span className="truncate text-gray-400 hover:text-gray-200 transition-colors cursor-pointer hover:underline decoration-gray-700 underline-offset-2">
            {body.filePath}
          </span>
        </div>
        <div className="flex">
          <div className="flex gap-2 text-[10px] font-mono font-bold bg-black/30 px-2 py-0.5 rounded-full">
            <span className="text-green-500">+{additions}</span>
            <span className="text-red-500">-{deletions}</span>
          </div>
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="ml-2 cursor-pointer"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <ChevronsDownUp size={14} className="text-gray-500 shrink-0" />
            ) : (
              <ChevronsUpDown size={14} className="text-gray-500 shrink-0" />
            )}
          </button>
        </div>
      </div>

      {/* Code Area */}
      <div className="text-[13px] font-mono leading-5 overflow-x-auto">
        {displayedLines.map((line, idx) => (
          <div
            key={idx}
            className={cn(
              "flex px-3 border-l-2 group",
              line.type === "add" &&
                "bg-[#1a3d28]/30 text-green-200 border-green-500/50",
              line.type === "del" &&
                "bg-[#42181c]/30 text-red-200 border-red-500/50",
              line.type === "ctx" &&
                "text-gray-500 border-transparent hover:bg-white/5"
            )}
          >
            <span className="w-4 shrink-0 select-none opacity-40 text-right mr-3">
              {line.type === "add" ? "+" : line.type === "del" ? "-" : ""}
            </span>
            <pre className="whitespace-pre-wrap break-all font-medium flex-1 min-w-0">
              {line.content}
            </pre>
          </div>
        ))}
        {isCollapsed && hasMoreLines && (
          <button
            onClick={() => setIsCollapsed(false)}
            className="px-3 py-2 text-center text-gray-500 text-xs cursor-pointer hover:bg-white/5 hover:text-gray-300"
          >
            ... {lines.length - 5} more lines ...
          </button>
        )}
      </div>
    </div>
  );
}
