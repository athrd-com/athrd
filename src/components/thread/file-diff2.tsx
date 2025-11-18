import { FileCode } from "lucide-react";
import CodeBlock from "~/components/code-block";
import { Card } from "~/components/ui/card";
import type { EditGroup } from "~/lib/thread-parsers";

interface FileDiffProps {
  path: string;
  additions?: number;
  deletions?: number;
  highlighted?: boolean;
  edits?: EditGroup["edits"];
  isCompact?: boolean;
  language?: string;
}

/**
 * FileDiff: Displays file changes with header and diff content
 * - Header shows path and change statistics
 * - Uses CodeBlock for rendering diff with syntax highlighting support
 * - Supports both compact (header only) and full diff rendering
 * - Language detection/specification for syntax highlighting
 */
export default function FileDiff2({
  path,
  additions,
  deletions,
  highlighted,
  edits,
  isCompact = false,
  language,
}: FileDiffProps) {
  // Convert edits to a diff string format for CodeBlock
  const diffContent = edits
    ? edits
        .flatMap((edit) => {
          const lines: string[] = [];
          if (edit.oldText) {
            lines.push(...edit.oldText.split("\n").map((line) => `- ${line}`));
          }
          if (edit.newText) {
            lines.push(...edit.newText.split("\n").map((line) => `+ ${line}`));
          }
          return lines;
        })
        .join("\n")
    : "";

  return (
    <div className="space-y-2">
      <Card
        className={`p-3 ${
          highlighted ? "border-accent bg-accent/5" : "bg-muted/30"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <FileCode className="h-4 w-4 text-muted-foreground shrink-0" />
            <code className="text-xs text-foreground font-mono truncate">
              {path}
            </code>
          </div>
          {(additions !== undefined || deletions !== undefined) && (
            <div className="flex items-center gap-3 text-xs font-mono ml-2 shrink-0">
              {additions !== undefined && (
                <span className="text-emerald-500">+{additions}</span>
              )}
              {deletions !== undefined && (
                <span className="text-red-500">-{deletions}</span>
              )}
            </div>
          )}
        </div>
      </Card>

      {!isCompact && diffContent && (
        <CodeBlock
          language={language || "diff"}
          code={diffContent}
          showDiff={true}
          copyable={true}
        />
      )}
    </div>
  );
}
