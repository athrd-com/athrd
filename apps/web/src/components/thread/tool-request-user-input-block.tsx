"use client";

import { cn } from "@/lib/utils";
import type { RequestUserInputQuestion } from "@/types/athrd";
import {
  CheckCircle2,
  ChevronsDownUp,
  ChevronsUpDown,
  Circle,
  MessageCircleQuestion,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "../ui/badge";

type ToolRequestUserInputBlockProps = {
  questions?: RequestUserInputQuestion[];
};

export default function ToolRequestUserInputBlock({
  questions = [],
}: ToolRequestUserInputBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const title = questions[0]?.question || "User input";

  return (
    <div
      className={cn(
        "group rounded-lg p-3 flex items-center justify-between hover:bg-[#111] hover:border-white/20 transition-colors",
        !isCollapsed && "bg-[#111] border border-white/10",
      )}
    >
      <div className="w-full">
        <div
          className="flex justify-between w-full cursor-pointer"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          <div className={cn("flex items-center font-mono text-xs gap-2")}>
            <MessageCircleQuestion size={14} className="text-gray-400" />
            {isCollapsed && (
              <span className="text-gray-300 font-medium">{title}</span>
            )}
          </div>
          <div
            className={cn(
              "ml-2 hidden group-hover:flex cursor-pointer",
              !isCollapsed && "flex",
            )}
          >
            {isCollapsed ? (
              <ChevronsDownUp size={14} className="text-gray-500 shrink-0" />
            ) : (
              <ChevronsUpDown size={14} className="text-gray-500 shrink-0" />
            )}
          </div>
        </div>

        {!isCollapsed && (
          <div className="mt-3 space-y-3">
            {questions.map((question, index) => (
              <div
                key={`${question.id}-${index}`}
                className="space-y-2 p-2 rounded-md bg-muted/20 border border-border/40"
              >
                <p className="text-sm text-gray-200">{question.question}</p>
                <div className="space-y-2">
                  {question.options.map((option, optionIndex) => {
                    const isSelected =
                      option.type === "selected" || option.type === "other";
                    return (
                      <div
                        key={`${question.id}-option-${optionIndex}`}
                        className="flex items-start gap-3 p-2 rounded-md bg-muted/30 border border-border/50 hover:bg-muted/50 transition-colors"
                      >
                        <div className="mt-0.5">
                          {isSelected ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Circle className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-200">
                            {option.label}
                          </p>
                          {option.description && (
                            <p className="text-xs text-gray-400 mt-0.5">
                              {option.description}
                            </p>
                          )}
                        </div>
                        <div className="shrink-0">
                          {isSelected ? (
                            <Badge
                              variant="outline"
                              className="text-green-400 bg-green-500/10 border-green-500/20 text-xs"
                            >
                              {option.type === "other" ? "Other" : "Selected"}
                            </Badge>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
