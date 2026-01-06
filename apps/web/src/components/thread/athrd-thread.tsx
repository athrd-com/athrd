"use client";

import type { GistOwner } from "@/lib/github";
import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdToolCall,
  AthrdUserMessage,
  ListDirectoryToolCall,
  MCPToolCall,
  ReadFileToolCall,
  ReplaceToolCall,
  RunShellCommandToolCall,
  UnknownToolCall,
  UpdatePlanToolCall,
  WriteFileToolCall,
} from "@/types/athrd";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Bot,
  FileIcon,
  FolderIcon,
  PencilIcon,
  WrenchIcon,
} from "lucide-react";
import Markdown from "markdown-to-jsx";
import ShellBlock from "./sheel-block";
import ThinkingBlock from "./thinking-block";
import ToolEditBlock from "./tool-edit-block";
import ToolMCPBlock from "./tool-mcp-block";
import ToolReadBlock from "./tool-read-block";
import ToolTodosBlock from "./tool-todos-block";

interface AThrdThreadProps {
  owner: GistOwner;
  thread: AThrd;
}

/**
 * Group consecutive messages by type
 */
function groupMessages(messages: (AthrdUserMessage | AthrdAssistantMessage)[]) {
  const groups: Array<{
    type: "user" | "assistant";
    messages: (AthrdUserMessage | AthrdAssistantMessage)[];
  }> = [];

  for (const message of messages) {
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.type === message.type) {
      // Add to existing group
      lastGroup.messages.push(message);
    } else {
      // Create new group
      groups.push({
        type: message.type,
        messages: [message],
      });
    }
  }

  return groups;
}

/**
 * Unified thread renderer for the AThrd format.
 * Renders messages from any CLI tool that has been parsed into AThrd.
 */
export default function AThrdThread({ owner, thread }: AThrdThreadProps) {
  const messageGroups = groupMessages(thread.messages);

  return (
    <div className="px-4 sm:px-8 md:px-16 lg:px-32 py-8 space-y-6">
      {messageGroups.map((group, groupIdx) => {
        if (group.type === "user") {
          return group.messages.map((message) => (
            <UserMessage
              key={message.id}
              owner={owner}
              message={message as AthrdUserMessage}
            />
          ));
        }
        return (
          <AssistantMessageGroup
            key={`assistant-group-${groupIdx}`}
            messages={group.messages as AthrdAssistantMessage[]}
          />
        );
      })}
    </div>
  );
}

/**
 * Render a user message
 */
function UserMessage({
  owner,
  message,
}: {
  owner: GistOwner;
  message: AthrdUserMessage;
}) {
  return (
    <div className="flex gap-4 group">
      <Avatar className="h-8 w-8 mt-1 border border-white/10">
        <AvatarImage src={owner.avatar_url} alt={owner.login} />
        <AvatarFallback className="bg-blue-900/30 text-blue-200 text-xs">
          {owner.login.substring(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <Card className="p-4 gap-2 bg-[#111] border-white/10 shadow-none text-gray-300 min-w-0 max-w-full flex-1">
        <div className="markdown-content text-sm">
          <Markdown>{message.content}</Markdown>
        </div>
      </Card>
    </div>
  );
}

/**
 * Render a group of consecutive assistant messages with a single avatar
 */
function AssistantMessageGroup({
  messages,
}: {
  messages: AthrdAssistantMessage[];
}) {
  return (
    <div className="flex gap-4">
      <Avatar className="h-8 w-8 mt-1 border border-white/10">
        <AvatarFallback className="bg-purple-900/30 text-purple-200 text-xs">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2 min-w-0 max-w-full flex-1">
        {messages.map((message) => (
          <AssistantMessageContent key={message.id} message={message} />
        ))}
      </div>
    </div>
  );
}

/**
 * Render an assistant message content (without avatar)
 */
function AssistantMessageContent({
  message,
}: {
  message: AthrdAssistantMessage;
}) {
  return (
    <>
      {/* Thinking blocks */}
      {message.thoughts?.map((thought, idx) => (
        <ThinkingBlock
          key={`thought-${idx}`}
          thinking={thought.description}
          subject={thought.subject}
        />
      ))}

      {/* Tool calls */}
      {message.toolCalls?.map((toolCall) => (
        <ToolCallBlock key={toolCall.id} toolCall={toolCall} />
      ))}

      {/* Text content */}
      {message.content && (
        <div className="markdown-content text-sm text-gray-300 py-2">
          <Markdown>{message.content}</Markdown>
        </div>
      )}
    </>
  );
}

/**
 * Render a tool call based on its type
 */
function ToolCallBlock({ toolCall }: { toolCall: AthrdToolCall }) {
  const resultOutput = toolCall.result?.[0]?.output;
  const resultError = toolCall.result?.[0]?.error;

  switch (toolCall.name) {
    case "read_file": {
      const tc = toolCall as ReadFileToolCall;
      const extra =
        tc.args.from && tc.args.to
          ? `(lines ${tc.args.from}-${tc.args.to})`
          : undefined;
      return (
        <ToolReadBlock
          filePath={tc.args.file_path}
          content={resultOutput?.type === "text" ? resultOutput.text : ""}
          extra={extra}
          label="Read"
          icon={FileIcon}
        />
      );
    }
    case "todos": {
      return (
        <ToolTodosBlock
          title={
            toolCall.result[0]?.output?.type === "text"
              ? toolCall.result[0]?.output.text
              : ""
          }
          todos={(toolCall as UpdatePlanToolCall).args.plan}
        />
      );
    }
    case "write_file": {
      const tc = toolCall as WriteFileToolCall;
      return (
        <ToolReadBlock
          filePath={tc.args.file_path}
          content={tc.args.content}
          label="Write"
          icon={PencilIcon}
        />
      );
    }

    case "ls": {
      const tc = toolCall as ListDirectoryToolCall;
      return (
        <ToolReadBlock
          filePath={tc.args.dir_path}
          content={resultOutput?.type === "text" ? resultOutput.text : ""}
          label="List"
          icon={FolderIcon}
        />
      );
    }

    case "replace": {
      const tc = toolCall as ReplaceToolCall;
      return (
        <ToolEditBlock
          filePath={tc.args.file_path}
          oldString={tc.args.old_string}
          newString={tc.args.new_string}
        />
      );
    }

    case "terminal_command": {
      const tc = toolCall as RunShellCommandToolCall;
      return (
        <ShellBlock
          command={tc.args.command}
          result={
            resultError ||
            (toolCall.result[0]?.output?.type === "text"
              ? toolCall.result[0]?.output.text
              : "")
          }
        />
      );
    }

    case "mcp_tool_call": {
      const tc = toolCall as MCPToolCall;
      return (
        <ToolMCPBlock
          serverName={tc.args.server_name}
          toolName={tc.args.tool_name}
          input={tc.args.input}
          results={tc.result ?? []}
        />
      );
    }

    default: {
      // Unknown tool - render a generic block
      const tc = toolCall as UnknownToolCall;
      return <UnknownToolBlock toolCall={tc} />;
    }
  }
}

/**
 * Generic block for unknown/unrecognized tools
 */
function UnknownToolBlock({ toolCall }: { toolCall: UnknownToolCall }) {
  const argsStr = JSON.stringify(toolCall.args, null, 2);

  const badge = (
    <Badge
      variant="outline"
      className="text-gray-400 bg-gray-500/10 border-gray-500/20 hover:bg-gray-500/20 transition-colors px-2 py-0.5 rounded-md mx-1 align-middle font-mono text-xs cursor-pointer"
    >
      {toolCall.name}
    </Badge>
  );

  return (
    <div className="my-4">
      <div className="flex items-center text-sm">
        <WrenchIcon className="h-4 w-4 text-gray-400 mr-2" />
        <span className="text-gray-400">Tool:</span>
        {toolCall.result ? (
          <HoverCard>
            <HoverCardTrigger asChild>{badge}</HoverCardTrigger>
            <HoverCardContent className="w-125 max-h-100 overflow-y-auto p-0">
              <div className="p-4 bg-muted/50 space-y-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Arguments
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {argsStr}
                  </pre>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1 font-semibold">
                    Output
                  </div>
                  <pre className="text-xs font-mono whitespace-pre-wrap break-all">
                    {JSON.stringify(toolCall.result, null, 2)}
                  </pre>
                </div>
              </div>
            </HoverCardContent>
          </HoverCard>
        ) : (
          badge
        )}
      </div>
    </div>
  );
}
