import type { MessageUsage } from "@/types/claude";

type ClaudeUsageProps = {
  modelName: string;
  usage: MessageUsage;
};

export default function ClaudeUsage({ modelName, usage }: ClaudeUsageProps) {
  const totalInputTokens = usage.input_tokens + usage.cache_read_input_tokens;
  const totalCacheTokens = usage.cache_creation_input_tokens;

  return (
    <div className="flex items-center gap-3 text-[10px] text-gray-400 dark:text-gray-600 font-mono mt-2">
      <span className="opacity-60">{modelName}</span>
      <span className="opacity-40">•</span>
      <div className="flex items-center gap-2 opacity-60">
        <span title="Input tokens">↑ {totalInputTokens.toLocaleString()}</span>
        {totalCacheTokens > 0 && (
          <span title="Cache tokens" className="text-blue-400/60">
            ⚡ {totalCacheTokens.toLocaleString()}
          </span>
        )}
        <span title="Output tokens">
          ↓ {usage.output_tokens.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
