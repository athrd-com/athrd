import type { ToolCallContent } from "@/types/claude";
import Markdown from "markdown-to-jsx";
import ThinkingBlock from "../thread/thinking-block";
import ClaudeToolUse from "./claude-tool-use";

type ClaudeBlockProps = {
  block: any; // using any for now as the union type is complex, but ideally should be specific
  result?: string;
};

export default function ClaudeBlock({ block, result }: ClaudeBlockProps) {
  if (block.type === "thinking") {
    return <ThinkingBlock thinking={block.thinking} />;
  }

  if (block.type === "text") {
    return (
      <div className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed markdown-content">
        <Markdown>{block.text}</Markdown>
      </div>
    );
  }

  if (block.type === "tool_use") {
    return <ClaudeToolUse block={block as ToolCallContent} result={result} />;
  }

  return null;
}
