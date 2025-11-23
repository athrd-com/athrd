"use client";

import type { GistOwner } from "@/lib/github";
import type { GeminiThread } from "@/types/gemini";
import Markdown from "markdown-to-jsx";
import ShellBlock from "../thread/sheel-block";
import ThinkingBlock from "../thread/thinking-block";
import ToolEditBlock from "../thread/tool-edit-block";
import ToolReadBlock from "../thread/tool-read-block";
import ToolTodosBlock from "../thread/tool-todos-block";
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

            if (message.content) {
              renderedItems.push(
                <div>
                  <Markdown>{message.content}</Markdown>
                </div>
              );
            }

            if (message.toolCalls) {
              message.toolCalls.forEach((toolCall) => {
                if (toolCall.name === "write_file") {
                  const args = toolCall.args as Record<string, unknown>;
                  renderedItems.push(
                    <ToolEditBlock
                      key={toolCall.id}
                      filePath={args.file_path as string}
                      newString={args.content as string}
                      oldString={""}
                    />
                  );
                } else if (toolCall.name === "list_directory") {
                  const args = toolCall.args as Record<string, unknown>;
                  renderedItems.push(
                    <ShellBlock
                      key={toolCall.id}
                      command={`List ${args.dir_path as string}`}
                      result={toolCall.result
                        .map((r) => r.functionResponse.response.output)
                        .join("\n")}
                    />
                  );
                } else if (toolCall.name === "read_file") {
                  const args = toolCall.args as Record<string, unknown>;
                  renderedItems.push(
                    <ToolReadBlock
                      key={toolCall.id}
                      filePath={args.file_path as string}
                      content={
                        toolCall.result
                          .map((r) => r.functionResponse.response.output)
                          .join("\n") || ""
                      }
                    />
                  );
                } else if (toolCall.name === "write_todos") {
                  const args = toolCall.args as Record<string, unknown>;
                  renderedItems.push(
                    <ToolTodosBlock
                      key={toolCall.id}
                      todos={(args.todos as Array<{ description: string; status: string }>).map((todo) => ({
                        content: todo.description,
                        status: todo.status as any,
                      }))}
                    />
                  );
                } else if (toolCall.name === "replace") {
                  const args = toolCall.args as Record<string, unknown>;
                  renderedItems.push(
                    <ToolEditBlock
                      key={toolCall.id}
                      filePath={args.file_path as string}
                      newString={args.new_string as string}
                      oldString={args.old_string as string}
                    />
                  );
                } else if (toolCall.name === "run_shell_command") {
                  const args = toolCall.args as Record<string, unknown>;
                  renderedItems.push(
                    <ShellBlock
                      key={toolCall.id}
                      command={args.command as string}
                      explanation={args.description as string}
                      result={toolCall.result
                        .map(
                          (r) =>
                            r.functionResponse.response.output ||
                            r.functionResponse.response.error
                        )
                        .join("\n")}
                    />
                  );
                } else {
                  renderedItems.push(
                    <div
                      key={toolCall.id}
                      className="my-4 p-4 bg-white/5 border border-white/10 rounded-md"
                    >
                      <div className="font-medium mb-2">
                        Tool Call: {toolCall.displayName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {toolCall.description}
                      </div>
                      <div className="mt-2 text-sm">
                        <strong>Status:</strong> {toolCall.status}
                      </div>
                    </div>
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
