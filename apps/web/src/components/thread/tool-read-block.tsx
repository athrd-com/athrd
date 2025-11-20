import { FileIcon, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "../ui/hover-card";

type ToolReadBlockProps = {
  filePath: string;
  content?: string;
  extra?: string;
  label?: string;
  icon?: LucideIcon;
};

export default function ToolReadBlock({
  filePath,
  content,
  extra,
  label = "Read",
  icon: Icon = FileIcon,
}: ToolReadBlockProps) {
  const shortName = filePath.split("/").pop() || filePath;

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
          {content ? (
            <HoverCard>
              <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
              <HoverCardContent className="w-[500px] max-h-[400px] overflow-y-auto p-0">
                <div className="p-4 bg-muted/50">
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {content}
                  </pre>
                </div>
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
