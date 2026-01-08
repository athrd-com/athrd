"use client";

import { cn } from "@/lib/utils";
import type { BaseToolResponse } from "@/types/athrd";
import { ChevronsDownUp, ChevronsUpDown, type LucideIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "../ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";

type ToolGenericBlockProps = {
  title: string;
  icon?: LucideIcon;
  label?: string;
  extra?: string;
  results: Array<BaseToolResponse>;
};

export default function ToolGenericBlock({
  title,
  label,
  icon: Icon,
  extra,
  results,
}: ToolGenericBlockProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const variant =
    title.startsWith("/") || title.split(" ").length === 1 ? "badge" : "block";

  const resultText = results
    .map((r) => (r.output?.type === "text" ? r.output.text : ""))
    .filter(Boolean)
    .join("\n");

  const hasResults = results.length > 0;

  const renderResults = () => (
    <>
      {results.map((res) => {
        if (res.output?.type === "text") {
          return (
            <div key={`text-${res.id}`} className="p-4 bg-muted/50">
              <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                {res.output?.text}
              </pre>
            </div>
          );
        }

        if (res.output?.type === "image") {
          return (
            <div key={`image-${res.id}`} className="p-4 bg-muted/50">
              <img
                src={`data:${res.output.mimeType};base64,${res.output.data}`}
                alt="Tool output"
              />
            </div>
          );
        }

        return null;
      })}
    </>
  );

  if (variant === "badge") {
    const shortName = title.startsWith("http")
      ? title
      : title.split("/").pop() || title;

    const badge = (
      <Badge
        variant={"outline"}
        className="text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 transition-colors px-2 py-0.5 rounded-md mx-1 align-middle font-mono text-xs cursor-pointer"
      >
        {shortName}
      </Badge>
    );

    return (
      <div className="flex items-center text-sm my-4 min-w-0">
        {Icon && <Icon className="h-4 w-4 text-gray-400 mr-2 shrink-0" />}
        <span className="truncate">{label}</span>{" "}
        {hasResults ? (
          <HoverCard>
            <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
            <HoverCardContent className="w-125 max-h-100 overflow-y-auto p-0">
              {renderResults()}
            </HoverCardContent>
          </HoverCard>
        ) : (
          badge
        )}
        {extra && (
          <span className="text-xs text-gray-500 ml-1 shrink-0">{extra}</span>
        )}
      </div>
    );
  }

  return (
    <div className="my-4" title={label}>
      <div
        className={cn(
          "group rounded-lg p-3 hover:bg-[#111] hover:border-white/20 transition-colors",
          !isCollapsed && hasResults && "bg-[#111] border border-white/10"
        )}
      >
        <div className="w-full">
          <div
            className={cn(
              "flex justify-between w-full",
              hasResults && "cursor-pointer"
            )}
            onClick={() => hasResults && setIsCollapsed(!isCollapsed)}
          >
            <div
              className={cn(
                "flex items-center font-mono text-xs min-w-0",
                !isCollapsed && "gap-2"
              )}
            >
              {Icon && (
                <Icon
                  size={14}
                  className={cn(
                    "text-gray-400 stroke-3 shrink-0 transition-all -translate-x-2",
                    !isCollapsed && "translate-x-0"
                  )}
                />
              )}
              <span className={cn("text-gray-300 font-medium truncate")}>
                {label}
                {title}
              </span>
            </div>
            {hasResults && (
              <div
                className={cn(
                  "ml-2 hidden group-hover:flex items-center",
                  !isCollapsed && "flex"
                )}
              >
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
          {hasResults && !isCollapsed && (
            <pre className="mt-2 text-xs font-mono whitespace-pre-wrap break-all text-gray-500 font-medium border-t border-white/5 pt-2 overflow-x-auto">
              {resultText}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
