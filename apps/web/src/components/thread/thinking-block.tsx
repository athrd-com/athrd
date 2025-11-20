"use client";

import { cn } from "@/lib/utils";
import { BrainIcon, ChevronsDownUp, ChevronsUpDown } from "lucide-react";
import Markdown from "markdown-to-jsx";
import { useState } from "react";

interface ThinkingBlockProps {
  thinking: string;
}

export default function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  if (thinking === "") {
    return null;
  }

  let title = "Thinking";
  if (thinking.startsWith("**")) {
    const endIndex = thinking.indexOf("**", 2);
    if (endIndex !== -1) {
      title = thinking.substring(2, endIndex);
    }
  } else {
    title = thinking;
  }

  return (
    <div
      className={cn(
        "group rounded-lg p-3 hover:bg-[#111] hover:border-white/20 transition-colors overflow-hidden",
        !isCollapsed && "bg-[#111] border border-white/10"
      )}
    >
      <div className="w-full">
        <div
          className="flex justify-between w-full cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-3 font-mono text-xs overflow-hidden min-w-0">
            <BrainIcon
              size={14}
              className="text-orange-400 stroke-3 shrink-0"
            />
            <span className="text-gray-300 font-medium truncate">{title}</span>
          </div>
          <div className="ml-2 hidden group-hover:flex cursor-pointer">
            {isCollapsed ? (
              <ChevronsDownUp size={14} className="text-gray-500 shrink-0" />
            ) : (
              <ChevronsUpDown size={14} className="text-gray-500 shrink-0" />
            )}
          </div>
        </div>
        {!isCollapsed && (
          <pre className="markdown-content mt-2 text-xs font-mono whitespace-pre-wrap break-all text-gray-300 font-medium overflow-x-auto">
            <Markdown>{thinking}</Markdown>
          </pre>
        )}
      </div>
    </div>
  );
}
