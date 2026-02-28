"use client";

import type { GistOwner } from "@/lib/github";
import { cn } from "@/lib/utils";
import type {
  AThrd,
  AthrdAssistantMessage,
  AthrdToolCall,
  AthrdUserMessage,
  ListDirectoryToolCall,
  MCPToolCall,
  ReadFileToolCall,
  ReplaceToolCall,
  RequestUserInputToolCall,
  RunShellCommandToolCall,
  SkillToolCall,
  UnknownToolCall,
  UpdatePlanToolCall,
  WebSearchToolCall,
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
  BrainCogIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileIcon,
  FilePlusIcon,
  FolderTreeIcon,
  SearchIcon,
  TerminalIcon,
  WandSparklesIcon,
  WrenchIcon,
} from "lucide-react";
import Markdown from "markdown-to-jsx";
import { useState } from "react";
import ToolEditBlock from "./tool-edit-block";
import ToolGenericBlock from "./tool-generic-block";
import ToolMCPBlock from "./tool-mcp-block";
import ToolRequestUserInputBlock from "./tool-request-user-input-block";
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
          return group.messages.map((message, index) => (
            <UserMessage
              key={`${message.id}-${groupIdx}-${index}`}
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
  const [showLeadingDetails, setShowLeadingDetails] = useState(false);

  type CollapsibleItem =
    | {
        kind: "thought";
        key: string;
        subject: string;
        description: string;
      }
    | {
        kind: "tool";
        key: string;
        toolCall: AthrdToolCall;
      };

  type AssistantRenderBlock =
    | {
        type: "thought";
        key: string;
        subject: string;
        description: string;
      }
    | {
        type: "tool";
        key: string;
        toolCall: AthrdToolCall;
      }
    | {
        type: "content";
        key: string;
        content: string;
      };

  const renderBlocks: AssistantRenderBlock[] = [];
  const leadingItems: CollapsibleItem[] = [];
  let leadingThoughtCount = 0;
  let leadingToolCallCount = 0;
  let seenContent = false;
  const leadingSummaryParts: string[] = [];

  messages.forEach((message, messageIndex) => {
    message.thoughts?.forEach((thought, thoughtIndex) => {
      const key = `thought-${message.id}-${thoughtIndex}`;
      if (!seenContent) {
        leadingItems.push({
          kind: "thought",
          key,
          subject: thought.subject,
          description: thought.description,
        });
        leadingThoughtCount += 1;
      } else {
        renderBlocks.push({
          type: "thought",
          key,
          subject: thought.subject,
          description: thought.description,
        });
      }
    });

    message.toolCalls?.forEach((toolCall, toolIndex) => {
      const key = `tool-${message.id}-${toolCall.id}-${toolIndex}`;
      if (!seenContent) {
        leadingItems.push({
          kind: "tool",
          key,
          toolCall,
        });
        leadingToolCallCount += 1;
      } else {
        renderBlocks.push({
          type: "tool",
          key,
          toolCall,
        });
      }
    });

    if (message.content) {
      seenContent = true;
      renderBlocks.push({
        type: "content",
        key: `assistant-content-${message.id}-${messageIndex}`,
        content: message.content,
      });
    }
  });

  if (leadingThoughtCount > 0) {
    leadingSummaryParts.push(`Thinking (x${leadingThoughtCount})`);
  }
  if (leadingToolCallCount > 0) {
    leadingSummaryParts.push(`Tool calls (x${leadingToolCallCount})`);
  }

  return (
    <div className="flex gap-4">
      <Avatar className="h-8 w-8 mt-1 border border-white/10">
        <AvatarFallback className="bg-purple-900/30 text-purple-200 text-xs">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2 min-w-0 max-w-full flex-1">
        {leadingItems.length > 0 && (
          <div className="py-1">
            <button
              type="button"
              onClick={() => setShowLeadingDetails((prev) => !prev)}
              className="group flex w-full items-center gap-3 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              aria-expanded={showLeadingDetails}
              aria-label={
                showLeadingDetails
                  ? "Collapse thinking and tool calls"
                  : "Expand thinking and tool calls"
              }
            >
              {showLeadingDetails ? (
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="h-px flex-1 bg-white/20 transition-colors group-hover:bg-white/40" />
              <span>{leadingSummaryParts.join(" · ")}</span>
              <span className="h-px flex-1 bg-white/20 transition-colors group-hover:bg-white/40" />
            </button>

            <div className={cn("space-y-2 mt-2", !showLeadingDetails && "hidden")}>
              {leadingItems.map((item) => {
                if (item.kind === "thought") {
                  return (
                    <ToolGenericBlock
                      key={item.key}
                      results={[
                        {
                          id: item.key,
                          name: "Thought",
                          output: {
                            type: "text",
                            text: item.description,
                          },
                        },
                      ]}
                      title={item.subject}
                      icon={BrainCogIcon}
                    />
                  );
                }
                return <ToolCallBlock key={item.key} toolCall={item.toolCall} />;
              })}

              <div className="flex items-center gap-4 text-xs text-gray-500 select-none pt-1">
                <span className="h-px flex-1 bg-white/15" />
                <span>End</span>
                <span className="h-px flex-1 bg-white/15" />
              </div>
            </div>
          </div>
        )}

        {renderBlocks.map((block) => {
          if (block.type === "content") {
            return (
              <div key={block.key} className="markdown-content text-sm text-gray-300 py-2">
                <Markdown>{block.content}</Markdown>
              </div>
            );
          }

          if (block.type === "thought") {
            return (
              <ToolGenericBlock
                key={block.key}
                results={[
                  {
                    id: block.key,
                    name: "Thought",
                    output: {
                      type: "text",
                      text: block.description,
                    },
                  },
                ]}
                title={block.subject}
                icon={BrainCogIcon}
              />
            );
          }

          return <ToolCallBlock key={block.key} toolCall={block.toolCall} />;
        })}
      </div>
    </div>
  );
}

/**
 * Render a tool call based on its type
 */
function ToolCallBlock({ toolCall }: { toolCall: AthrdToolCall }) {
  switch (toolCall.name) {
    case "skill": {
      const tc = toolCall as SkillToolCall;
      return (
        <ToolGenericBlock
          label="Launching skill"
          title={tc.args.skill_name}
          results={tc.result}
          icon={WandSparklesIcon}
        />
      );
    }
    case "web_search": {
      const tc = toolCall as WebSearchToolCall;
      return (
        <ToolGenericBlock
          icon={SearchIcon}
          label="Web Search"
          title={tc.args.query}
          results={tc.result}
        />
      );
    }
    case "read_file": {
      const tc = toolCall as ReadFileToolCall;
      const extra =
        tc.args.from && tc.args.to
          ? `(lines ${tc.args.from}-${tc.args.to})`
          : undefined;
      return (
        <ToolGenericBlock
          title={tc.args.file_path}
          results={tc.result ?? []}
          extra={extra}
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
              : "Tasks"
          }
          todos={(toolCall as UpdatePlanToolCall).args.plan}
        />
      );
    }
    case "request_user_input": {
      return (
        <ToolRequestUserInputBlock
          questions={(toolCall as RequestUserInputToolCall).args.questions}
        />
      );
    }
    case "write_file": {
      const tc = toolCall as WriteFileToolCall;
      return (
        <ToolGenericBlock
          title={tc.args.file_path}
          results={tc.result ?? []}
          icon={FilePlusIcon}
        />
      );
    }

    case "ls": {
      const tc = toolCall as ListDirectoryToolCall;
      return (
        <ToolGenericBlock
          title={tc.args.dir_path}
          results={tc.result ?? []}
          icon={FolderTreeIcon}
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
        <ToolGenericBlock
          icon={TerminalIcon}
          title={tc.args.command}
          results={tc.result}
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
    <div className="">
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
