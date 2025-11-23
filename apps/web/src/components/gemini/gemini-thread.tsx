"use client";

import type { GistOwner } from "@/lib/github";
import type { GeminiThread } from "@/types/gemini";
import ThinkingBlock from "../thread/thinking-block";
import ToolEditBlock from "../thread/tool-edit-block";
import UserPrompt from "../thread/user-prompt";
import { Avatar, AvatarFallback } from "../ui/avatar";

type GeminiThreadProps = {
  owner: GistOwner;
  thread: any;
};

export default function GeminiThread({ owner, thread }: GeminiThreadProps) {
  const geminiThread = thread as GeminiThread;

  return (
    <div className="athrd-thread max-w-4xl mx-auto px-6 py-8 overflow-x-hidden">
      <div className="space-y-2">
        {geminiThread.messages.map((message) => {
          if (message.type === "user") {
            return (
              <UserPrompt
                key={message.id}
                prompt={message.content}
                owner={owner}
              />
            );
          }

          if (message.type === "gemini") {
            const renderedItems: React.ReactNode[] = [];

            if (message.thoughts) {
              message.thoughts.forEach((thought, index) => {
                renderedItems.push(
                  <ThinkingBlock
                    key={thought.timestamp}
                    thinking={thought.description}
                    subject={thought.subject}
                  />
                );
              });
            }

            if (message.toolCalls) {
              message.toolCalls.forEach((toolCall) => {
                if (toolCall.name === "write_file") {
                  renderedItems.push(
                    <ToolEditBlock
                      key={toolCall.id}
                      filePath={toolCall.args.file_path}
                      newString={toolCall.args.content}
                      oldString={""}
                    />
                  );
                }
              });
            }

            return (
              <div className="flex gap-4">
                <Avatar className="h-8 w-8 mt-1 border border-white/10 shrink-0">
                  <AvatarFallback className="bg-[#D97757] text-white text-[10px] font-bold">
                    GM
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2 w-full overflow-auto">
                  {renderedItems}
                </div>
              </div>
            );
          }
        })}
      </div>
    </div>
  );
}
