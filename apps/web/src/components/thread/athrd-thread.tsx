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
import type { ComponentProps } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  extractKnownFilePaths,
  rewriteFilePathHrefToGithub,
} from "@/components/thread/markdown-link-utils";
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
import type { Options } from "markdown-to-jsx";
import { useState } from "react";
import ToolEditBlock from "./tool-edit-block";
import ToolGenericBlock from "./tool-generic-block";
import ToolMCPBlock from "./tool-mcp-block";
import ToolRequestUserInputBlock from "./tool-request-user-input-block";
import ToolTodosBlock from "./tool-todos-block";

interface AThrdThreadProps {
  owner: GistOwner;
  thread: AThrd;
  repoName?: string;
}

function mergeRel(
  rel: string | undefined,
  requiredValues: string[],
): string | undefined {
  const currentValues = new Set((rel || "").split(/\s+/).filter(Boolean));
  requiredValues.forEach((value) => currentValues.add(value));
  if (currentValues.size === 0) {
    return undefined;
  }
  return Array.from(currentValues).join(" ");
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
export default function AThrdThread({ owner, thread, repoName }: AThrdThreadProps) {
  const messageGroups = groupMessages(thread.messages);
  const knownFilePaths = extractKnownFilePaths(thread);

  const markdownOptions: Options = {
    overrides: {
      a: {
        component: ({
          href,
          rel,
          ...props
        }: ComponentProps<"a"> & { href?: string }) => {
          const rewrittenHref = rewriteFilePathHrefToGithub({
            href,
            repoName,
            knownFilePaths,
          });

          return (
            <a
              {...props}
              href={rewrittenHref || href}
              rel={mergeRel(rel, ["nofollow", "noreferrer"])}
            />
          );
        },
      },
    },
  };

  return (
    <div className="px-4 sm:px-8 md:px-16 lg:px-32 py-8 space-y-6">
      {messageGroups.map((group, groupIdx) => {
        if (group.type === "user") {
          return group.messages.map((message, index) => (
            <UserMessage
              key={`${message.id}-${groupIdx}-${index}`}
              owner={owner}
              message={message as AthrdUserMessage}
              markdownOptions={markdownOptions}
            />
          ));
        }
        return (
          <AssistantMessageGroup
            key={`assistant-group-${groupIdx}`}
            messages={group.messages as AthrdAssistantMessage[]}
            markdownOptions={markdownOptions}
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
  markdownOptions,
}: {
  owner: GistOwner;
  message: AthrdUserMessage;
  markdownOptions: Options;
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
          <Markdown options={markdownOptions}>{message.content}</Markdown>
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
  markdownOptions,
}: {
  messages: AthrdAssistantMessage[];
  markdownOptions: Options;
}) {
  const [showPreviousDetails, setShowPreviousDetails] = useState(false);

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

  messages.forEach((message, messageIndex) => {
    message.thoughts?.forEach((thought, thoughtIndex) => {
      renderBlocks.push({
        type: "thought",
        key: `thought-${message.id}-${thoughtIndex}`,
        subject: thought.subject,
        description: thought.description,
      });
    });

    message.toolCalls?.forEach((toolCall, toolIndex) => {
      renderBlocks.push({
        type: "tool",
        key: `tool-${message.id}-${toolCall.id}-${toolIndex}`,
        toolCall,
      });
    });

    if (message.content) {
      renderBlocks.push({
        type: "content",
        key: `assistant-content-${message.id}-${messageIndex}`,
        content: message.content,
      });
    }
  });

  const lastBlockIndex = renderBlocks.length - 1;
  const hiddenBlocks = renderBlocks.slice(0, lastBlockIndex);
  const hiddenThoughtCount = hiddenBlocks.filter(
    (block) => block.type === "thought",
  ).length;
  const hiddenToolCallCount = hiddenBlocks.filter(
    (block) => block.type === "tool",
  ).length;
  const hiddenCount = hiddenBlocks.length;
  const hiddenSummaryParts: string[] = [];

  if (hiddenThoughtCount > 0) {
    hiddenSummaryParts.push(`Thinking (x${hiddenThoughtCount})`);
  }
  if (hiddenToolCallCount > 0) {
    hiddenSummaryParts.push(`Tool calls (x${hiddenToolCallCount})`);
  }
  if (hiddenSummaryParts.length === 0 && hiddenCount > 0) {
    hiddenSummaryParts.push(`Previous messages (x${hiddenCount})`);
  }

  return (
    <div className="flex gap-4">
      <Avatar className="h-8 w-8 mt-1 border border-white/10">
        <AvatarFallback className="bg-purple-900/30 text-purple-200 text-xs">
          <Bot className="h-4 w-4" />
        </AvatarFallback>
      </Avatar>
      <div className="space-y-2 min-w-0 max-w-full flex-1">
        {hiddenCount > 0 && (
          <div className="py-1">
            <button
              type="button"
              onClick={() => setShowPreviousDetails((prev) => !prev)}
              className="group flex w-full items-center gap-3 text-xs text-gray-400 hover:text-gray-200 transition-colors"
              aria-expanded={showPreviousDetails}
              aria-label={
                showPreviousDetails
                  ? "Collapse previous assistant messages"
                  : "Expand previous assistant messages"
              }
            >
              {showPreviousDetails ? (
                <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0" />
              )}
              <span className="h-px flex-1 bg-white/20 transition-colors group-hover:bg-white/40" />
              <span>{hiddenSummaryParts.join(" · ")}</span>
              <span className="h-px flex-1 bg-white/20 transition-colors group-hover:bg-white/40" />
            </button>
          </div>
        )}

        {renderBlocks.map((block, blockIndex) => {
          const shouldHide =
            !showPreviousDetails && blockIndex < lastBlockIndex;

          if (block.type === "content") {
            return (
              <div
                key={block.key}
                className={cn(
                  "markdown-content text-sm text-white py-2",
                  shouldHide && "hidden",
                )}
              >
                <Markdown options={markdownOptions}>{block.content}</Markdown>
              </div>
            );
          }

          if (block.type === "thought") {
            return (
              <div key={block.key} className={cn(shouldHide && "hidden")}>
                <ToolGenericBlock
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
              </div>
            );
          }

          return (
            <div key={block.key} className={cn(shouldHide && "hidden")}>
              <ToolCallBlock toolCall={block.toolCall} />
            </div>
          );
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
