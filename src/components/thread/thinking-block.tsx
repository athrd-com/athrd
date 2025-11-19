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

  return (
    <div
      className={cn(
        "group rounded-lg p-3 flex items-center justify-between hover:bg-[#111] hover:border-white/20 transition-colors",
        !isCollapsed && "bg-[#111] border border-white/10"
      )}
    >
      <div className="w-full">
        <div
          className="flex justify-between w-full cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className="flex items-center gap-3 font-mono text-xs">
            <BrainIcon size={14} className="text-orange-400 stroke-3" />
            <span className="text-gray-300 font-medium">{"Thinking"}</span>
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
          <pre className="markdown-content mt-2 text-xs font-mono whitespace-pre-wrap wrap-break-word text-gray-300 font-medium">
            <Markdown>{thinking}</Markdown>
          </pre>
        )}
      </div>
    </div>
  );
}
