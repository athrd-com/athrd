"use client";

import { cn } from "@/lib/utils";
import { WandSparklesIcon } from "lucide-react";

interface ToolSkillProps {
  name: string;
}

export default function ToolSkillBlock({ name }: ToolSkillProps) {
  return (
    <div
      className={cn(
        "group rounded-lg p-3 hover:bg-[#111] hover:border-white/20 transition-colors overflow-hidden"
      )}
    >
      <div className="w-full">
        <div className="flex justify-between w-full cursor-pointer">
          <div className={cn("flex items-center font-mono text-xs min-w-0")}>
            <WandSparklesIcon
              size={14}
              className={cn(
                "text-gray-400 stroke-3 shrink-0 transition-all -translate-x-3"
              )}
            />
            <span className="text-gray-300 font-medium truncate">
              Launching <i>{name}</i> skill
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
