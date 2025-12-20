"use client";

import type { GistOwner } from "@/lib/github";
import type { CursorThread as CursorThreadType } from "@/types/cursor";
import Markdown from "markdown-to-jsx";
import ShellBlock from "../thread/sheel-block";
import ToolEditBlock from "../thread/tool-edit-block";
import ToolReadBlock from "../thread/tool-read-block";
import UserPrompt from "../thread/user-prompt";
import { Avatar, AvatarFallback } from "../ui/avatar";

type CursorThreadProps = {
  owner: GistOwner;
  thread: unknown;
};

export default function CursorThread({ owner, thread }: CursorThreadProps) {
  const cursorThread = thread as CursorThreadType;
  console.log(cursorThread);

  return (
    <div className="athrd-thread max-w-4xl mx-auto px-6 py-8 overflow-x-hidden">
      <div className="space-y-2">
        {cursorThread.messages.map((message, index) => {
          // User Message
          if (message.type === 1) {
            return (
              <UserPrompt
                key={message.bubbleId || index}
                prompt={message.text}
                owner={owner}
              />
            );
          }

          // Model Message
          if (message.type === 2) {
            const renderedItems: React.ReactNode[] = [];

            if (!message.text && !message.toolCall) {
              return null;
            }

            // Text Content
            if (message.text) {
              renderedItems.push(
                <div key="text">
                  <Markdown>{message.text}</Markdown>
                </div>
              );
            }

            // Tool Call
            if (message.toolCall) {
              const { tool, params, result } = message.toolCall;
              const toolId = message.toolCall.toolId || index;

              if (tool === "read_file" && params) {
                renderedItems.push(
                  <ToolReadBlock
                    key={`tool-${toolId}`}
                    filePath={params.targetFile as string}
                    content={(result?.content as string) || ""}
                  />
                );
              } else if (
                (tool === "edit_file" || tool === "write_file") &&
                params
              ) {
                // Assuming params structure for edit/write
                // Note: The exact param names might need adjustment based on actual data
                // For now using common patterns or what was seen in Gemini
                renderedItems.push(
                  <ToolEditBlock
                    key={`tool-${toolId}`}
                    filePath={params.relative_workspace_path as string}
                    newString={
                      (params.edit_content as string) ||
                      (params.content as string)
                    }
                    oldString={""} // Cursor might not provide old string easily in this structure
                  />
                );
              } else if (tool === "run_terminal_command" && params) {
                renderedItems.push(
                  <ShellBlock
                    key={`tool-${toolId}`}
                    command={params.command as string}
                    result={result?.output as string}
                  />
                );
              } else {
                // Fallback for unknown tools
                renderedItems.push(
                  <div
                    key={`tool-${toolId}`}
                    className="my-4 p-4 bg-white/5 border border-white/10 rounded-md"
                  >
                    <div className="font-medium mb-2">Tool Call: {tool}</div>
                    <div className="text-sm text-muted-foreground">
                      <pre className="whitespace-pre-wrap overflow-auto max-h-40">
                        {JSON.stringify(params, null, 2)}
                      </pre>
                    </div>
                  </div>
                );
              }
            }

            return (
              <div key={message.bubbleId || index} className="flex gap-4">
                <Avatar className="h-8 w-8 mt-1 border border-white/10 shrink-0">
                  <AvatarFallback className="bg-blue-600 text-white text-[10px] font-bold">
                    AI
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2 w-full overflow-auto">
                  {renderedItems}
                </div>
              </div>
            );
          }

          return null;
        })}
      </div>
    </div>
  );
}
