"use client";

import { cn } from "@/lib/utils";
import { ChevronsDownUp, ChevronsUpDown, PencilRulerIcon } from "lucide-react";
import { useMemo, useState } from "react";

interface ToolEditBlockProps {
  patch: string;
}

type DiffLine = {
  type: "add" | "del" | "ctx";
  content: string;
};

/**
 * ToolPatchBlock: Displays file changes with header showing path and stats
 * Parses a custom patch format
 */
export default function ToolPatchBlock({ patch }: ToolEditBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const { filePath, lines, additions, deletions } = useMemo(() => {
    const rawLines = patch.split("\n");
    let filePath = "";
    const diffLines: DiffLine[] = [];
    let additions = 0;
    let deletions = 0;
    let isBody = false;

    for (const line of rawLines) {
      if (line.startsWith("*** Update File: ")) {
        filePath = line.replace("*** Update File: ", "").trim();
        continue;
      }
      if (line.trim() === "@@") {
        isBody = true;
        continue;
      }
      if (line.trim() === "*** End Patch") {
        isBody = false;
        continue;
      }

      if (isBody) {
        if (line.startsWith("+")) {
          additions++;
          diffLines.push({ type: "add", content: line.substring(1) });
        } else if (line.startsWith("-")) {
          deletions++;
          diffLines.push({ type: "del", content: line.substring(1) });
        } else if (line.startsWith(" ")) {
          diffLines.push({ type: "ctx", content: line.substring(1) });
        } else {
          // Fallback for lines that might not have the space prefix but are context
          // or empty lines
          diffLines.push({ type: "ctx", content: line });
        }
      }
    }

    return { filePath, lines: diffLines, additions, deletions };
  }, [patch]);

  const displayedLines = isCollapsed ? lines.slice(0, 5) : lines;
  const hasMoreLines = lines.length > 5;

  return (
    <div className="my-6 rounded-lg border border-white/10 overflow-hidden bg-[#111] shadow-sm">
      {/* File Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between bg-white/5 border-b border-white/10 px-3 py-2 cursor-pointer hover:bg-white/10 transition-colors"
      >
        <div className="flex items-center gap-2 text-xs font-mono text-gray-400 truncate">
          <PencilRulerIcon size={14} className="text-gray-500 shrink-0" />
          <span className="truncate text-gray-400 hover:text-gray-200 transition-colors hover:underline decoration-gray-700 underline-offset-2">
            {filePath || "Unknown File"}
          </span>
        </div>
        <div className="flex items-center">
          <div className="flex gap-2 text-[10px] font-mono font-bold bg-black/30 px-2 py-0.5 rounded-full mr-2">
            <span className="text-green-500">+{additions}</span>
            <span className="text-red-500">-{deletions}</span>
          </div>
          <button
            className="cursor-pointer text-gray-500 hover:text-gray-300"
            aria-label={isCollapsed ? "Expand" : "Collapse"}
          >
            {isCollapsed ? (
              <ChevronsDownUp size={14} />
            ) : (
              <ChevronsUpDown size={14} />
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
            onClick={(e) => {
              e.stopPropagation();
              setIsCollapsed(false);
            }}
            className="w-full px-3 py-2 text-center text-gray-500 text-xs cursor-pointer hover:bg-white/5 hover:text-gray-300"
          >
            ... {lines.length - 5} more lines ...
          </button>
        )}
      </div>
    </div>
  );
}
