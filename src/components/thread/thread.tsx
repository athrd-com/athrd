import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import type { ParsedThread } from "~/lib/thread-parsers";
import AgentPrompt from "./agent-prompt";
import FileDiff from "./file-diff";
import Message from "./message";
import MessageAttachment from "./thread/message-attachment";
import ToolCallRender from "./thread/tool-call-render";
import UserPrompt from "./user-prompt";

interface ThreadProps {
  thread: ParsedThread;
}

/**
 * Thread: Main component for rendering AI conversation threads
 * Orchestrates rendering of different message types and content
 * Delegates specific rendering to specialized helper components
 *
 * Architecture:
 * - Thread: Message orchestration layer (70 LOC)
 * - ToolCallRender: Renders tool calls and terminal commands
 * - MessageAttachment: Handles file/image/code attachments
 * - FileDiff: Displays file changes (header + CodeBlock diff rendering)
 * - CodeBlock: Unified code display with copy, line numbers, diff highlighting
 *
 * Benefits:
 * - Single Responsibility: Each component has one clear purpose
 * - Composition: Components compose through props, not inheritance
 * - Reusability: Helper components are standalone and exportable
 * - Testability: Granular components are easier to unit test
 * - Maintainability: Easy to extend with new attachment/content types
 * - Performance: No unnecessary re-renders, memoization ready
 */
export default function Thread({ thread }: ThreadProps) {
  return (
    <div className="space-y-6">
      {thread.messages.map((message, index) => {
        const messageKey = message.id || index;

        // User messages
        if (message.role === "user") {
          return <UserPrompt key={messageKey} prompt={message.text ?? ""} />;
        }

        // Assistant messages
        if (message.role === "assistant") {
          return (
            <div key={messageKey} className="flex gap-4">
              <Avatar className="h-8 w-8 mt-1 shrink-0">
                <AvatarFallback className="bg-accent text-accent-foreground text-xs">
                  AI
                </AvatarFallback>
              </Avatar>

              <div className="flex-1 space-y-4 min-w-0">
                {/* Main text content */}
                {message.text && <AgentPrompt prompt={message.text} />}

                {/* Tool calls */}
                {message.toolCalls?.map((toolCall, toolIndex) => (
                  <ToolCallRender
                    key={`${messageKey}-tool-${toolIndex}`}
                    toolCall={toolCall}
                  />
                ))}

                {/* File edits/diffs */}
                {message.edits?.map((editGroup, editIndex) => {
                  // Calculate total additions and deletions
                  const totalAdditions = editGroup.edits.reduce(
                    (sum, edit) =>
                      sum + (edit.newText?.split("\n").length || 0),
                    0
                  );
                  const totalDeletions = editGroup.edits.reduce(
                    (sum, edit) =>
                      sum + (edit.oldText?.split("\n").length || 0),
                    0
                  );

                  return (
                    <FileDiff
                      key={`${messageKey}-edit-${editIndex}`}
                      path={editGroup.filePath}
                      additions={totalAdditions}
                      deletions={totalDeletions}
                      edits={editGroup.edits}
                    />
                  );
                })}

                {/* Attachments */}
                {message.attachments?.map((attachment, attIndex) => (
                  <MessageAttachment
                    key={`${messageKey}-att-${attIndex}`}
                    attachment={attachment}
                  />
                ))}
              </div>
            </div>
          );
        }

        // System messages (fallback)
        return (
          <Message
            key={messageKey}
            role="system"
            text={message.text}
            html={message.html}
          />
        );
      })}
    </div>
  );
}
