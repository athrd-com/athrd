"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Card } from "~/components/ui/card";

interface CodeBlockProps {
  language?: string;
  code: string;
  showDiff?: boolean;
  showLineNumbers?: boolean;
  copyable?: boolean;
}

/**
 * CodeBlock: Enhanced code display component
 * Features:
 * - Copy to clipboard with visual feedback
 * - Optional line numbers
 * - Diff highlighting support
 * - Language-aware styling
 * - Better accessibility and UX
 */
export default function CodeBlock({
  language = "plaintext",
  code,
  showDiff = false,
  showLineNumbers = true,
  copyable = true,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const lines = code.split("\n");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code:", err);
    }
  };

  return (
    <Card className="overflow-hidden bg-card border-border">
      <div className="flex items-center justify-between bg-muted px-4 py-2 border-b border-border">
        <span className="text-xs text-muted-foreground font-mono">
          {language}
        </span>
        {copyable && (
          <button
            onClick={handleCopy}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors p-1 rounded hover:bg-muted-foreground/10"
            title="Copy to clipboard"
            aria-label="Copy code to clipboard"
          >
            {copied ? (
              <Check className="h-4 w-4 text-green-500" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
        )}
      </div>
      <div className="p-4 overflow-x-auto">
        <pre className="text-xs font-mono leading-relaxed">
          {lines.map((line, i) => {
            const isAddition = showDiff && line.startsWith("+");
            const isDeletion = showDiff && line.startsWith("-");
            const isComment = line.trim().startsWith("//");

            return (
              <div
                key={i}
                className={`flex ${
                  isAddition
                    ? "bg-emerald-500/10 text-emerald-400"
                    : isDeletion
                    ? "bg-red-500/10 text-red-400"
                    : isComment
                    ? "text-muted-foreground"
                    : "text-foreground"
                }`}
              >
                {showLineNumbers && (
                  <span className="inline-block w-8 select-none text-right pr-3 text-muted-foreground">
                    {i + 1}
                  </span>
                )}
                <span className="flex-1 wrap-break-word">
                  {line || "\u00A0"}
                </span>
              </div>
            );
          })}
        </pre>
      </div>
    </Card>
  );
}
