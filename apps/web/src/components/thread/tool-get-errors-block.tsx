import { FileIcon, type LucideIcon } from "lucide-react";
import { Badge } from "../ui/badge";
import {
    HoverCard,
    HoverCardContent,
    HoverCardTrigger,
} from "../ui/hover-card";

type ToolGetErrorsBlockProps = {
    filePaths: string[];
    content?: string;
    extra?: string;
    label?: string;
    icon?: LucideIcon;
};

export default function ToolGetErrorsBlock({
    filePaths,
    content,
    extra,
    label = "Check errors",
    icon: Icon = FileIcon,
}: ToolGetErrorsBlockProps) {
    const badges = filePaths.map((filePath, index) => {
        const shortName = filePath.startsWith("http")
            ? filePath
            : filePath.split("/").pop() || filePath;

        return (
            <Badge
                key={index}
                variant={"outline"}
                className="text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 transition-colors px-2 py-0.5 rounded-md mx-1 align-middle font-mono text-xs cursor-pointer"
            >
                {shortName}
            </Badge>
        );
    });

    return (
        <div className="">
            <div className="flex items-center text-sm my-4 flex-wrap gap-y-2">
                <div className="flex items-center">
                    <Icon className="h-4 w-4 text-gray-400 mr-2" />
                    <span>{label}</span>
                </div>
                <div className="flex flex-wrap items-center">
                    {content ? (
                        <HoverCard>
                            <HoverCardTrigger asChild>
                                <div className="inline-flex flex-wrap">{badges}</div>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-[500px] max-h-[400px] overflow-y-auto p-0">
                                <div className="p-4 bg-muted/50">
                                    <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                                        {content}
                                    </pre>
                                </div>
                            </HoverCardContent>
                        </HoverCard>
                    ) : (
                        <div className="inline-flex flex-wrap">{badges}</div>
                    )}
                    {extra && <span className="text-xs text-gray-500 ml-2">{extra}</span>}
                </div>
            </div>
        </div>
    );
}
