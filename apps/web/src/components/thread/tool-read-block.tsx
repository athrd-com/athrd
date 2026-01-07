import type { BaseToolResponse } from "@/types/athrd";
import { FileIcon, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";

type ToolReadBlockProps = {
  filePath: string;
  extra?: string;
  label?: string;
  icon?: LucideIcon;
  results: Array<BaseToolResponse>;
};

export default function ToolReadBlock({
  filePath,
  extra,
  label = "Read",
  icon: Icon = FileIcon,
  results,
}: ToolReadBlockProps) {
  const shortName = filePath.startsWith("http")
    ? filePath
    : filePath.split("/").pop() || filePath;

  const badge = (
    <Badge
      variant={"outline"}
      className="text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 transition-colors px-2 py-0.5 rounded-md mx-1 align-middle font-mono text-xs cursor-pointer"
    >
      {shortName}
    </Badge>
  );

  return (
    <div className="">
      <div className="flex items-center text-sm my-4">
        <Icon className="h-4 w-4 text-gray-400 mr-2" />
        <>
          {label}{" "}
          {results.length ? (
            <HoverCard>
              <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
              <HoverCardContent className="w-125 max-h-100 overflow-y-auto p-0">
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
              </HoverCardContent>
            </HoverCard>
          ) : (
            badge
          )}
          <span className="text-xs text-gray-500">{extra}</span>
        </>
      </div>
    </div>
  );
}
