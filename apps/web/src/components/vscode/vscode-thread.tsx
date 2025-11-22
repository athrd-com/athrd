import type { GistOwner } from "@/lib/github";
import type {
  InlineReferenceResponse,
  MCPResultDetails,
  ResponseItem,
  TerminalToolData,
  TextResponse,
  ThinkingToolResponse,
  TodoListToolData,
  ToolCallRound,
  ToolInvocationSerialized,
  VariableFile,
  VSCodeThread,
} from "@/types/vscode";
import Markdown from "markdown-to-jsx";
import ShellBlock from "../thread/sheel-block";
import ThinkingBlock from "../thread/thinking-block";
import ToolEditBlock from "../thread/tool-edit-block";
import ToolMCPBlock from "../thread/tool-mcp-block";
import ToolPatchBlock from "../thread/tool-patch-block";
import ToolTodosBlock from "../thread/tool-todos-block";
import UserPrompt from "../thread/user-prompt";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";
import VSCodeToolCall from "./vscode-tool-call";
import VSCodeReadFileCall from "./vscode-tool-read-file";

type VSCodeThreadProps = {
  owner: GistOwner;
  thread: unknown;
};

function isTextResponse(response: ResponseItem): response is TextResponse {
  return (
    "value" in response &&
    typeof response.value === "string" &&
    response.value !== "\n```\n"
  );
}

function isFileInlineReference(
  response: ResponseItem
): response is InlineReferenceResponse {
  return (
    typeof response === "object" &&
    response !== null &&
    "kind" in response &&
    response.kind === "inlineReference" &&
    typeof (response as any).inlineReference === "object" &&
    (response as any).inlineReference?.location?.uri?.scheme === "file"
  );
}

function isToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  return (
    "kind" in response &&
    "toolId" in response &&
    response.kind === "toolInvocationSerialized"
  );
}

function isShellToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized & {
  toolSpecificData: TerminalToolData;
} {
  if (!isToolCall(response)) return false;
  return response.toolId == "run_in_terminal";
}

function isPatchToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return response.toolId === "copilot_applyPatch";
}

function isReplaceStringToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return response.toolId === "copilot_replaceString";
}

function isTodoList(
  response: ResponseItem
): response is ToolInvocationSerialized & {
  toolSpecificData: TodoListToolData;
} {
  if (!isToolCall(response)) return false;
  return (
    response.toolId === "manage_todo_list" &&
    response.toolSpecificData?.kind === "todoList"
  );
}

function isMCPToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return (
    "source" in response &&
    "type" in response.source &&
    response.source.type === "mcp"
  );
}

function isThinkingResponse(
  response: ResponseItem
): response is ThinkingToolResponse {
  return "kind" in response && response.kind === "thinking";
}

function isGlobSearchToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return response.toolId === "copilot_findFiles";
}

function isFindTextToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return response.toolId === "copilot_findTextInFiles";
}

function isInsertEditToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return response.toolId === "copilot_insertEdit";
}

function isEditFileToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return response.toolId === "vscode_editFile_internal";
}

function isReadFileToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  if (!isToolCall(response)) return false;
  return response.toolId === "copilot_readFile";
}

export default function VSCodeThread({ owner, thread }: VSCodeThreadProps) {
  const vscodeThread = thread as VSCodeThread;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 overflow-x-hidden">
      <div className="space-y-6">
        {vscodeThread.requests.map((request) => {
          // Track tool call index for mapping to tool call rounds
          let toolCallIndex = 0;
          const renderedItems: React.ReactNode[] = [];
          let currentText = "";
          let currentRefs: InlineReferenceResponse[] = [];
          const toolCallsMap = new Map<string, ToolCallRound | undefined>();

          (request.response ?? [])
            .map((r) => r as ToolInvocationSerialized)
            .filter((r) => (r.kind = "toolInvocationSerialized"))
            .filter((r) => !!r.toolId)
            .forEach((r, index) => {
              const calls = request.result?.metadata.toolCallRounds?.[index];
              if (calls?.toolCalls) {
                calls?.toolCalls.forEach((call) => {
                  call.result =
                    request.result?.metadata?.toolCallResults?.[call.id];
                });
              }

              toolCallsMap.set(`${r.kind}-${index}`, calls);
            });

          const flushText = () => {
            if (!currentText) return;

            const refs = [...currentRefs];
            const text = currentText;

            renderedItems.push(
              <div
                key={`text-${renderedItems.length}`}
                className="text-sm text-gray-400 leading-relaxed markdown-content"
              >
                <Markdown
                  options={{
                    overrides: {
                      span: {
                        component: ({
                          children,
                          ...props
                        }: React.HTMLAttributes<HTMLSpanElement> & {
                          "data-ref-index"?: string;
                        }) => {
                          const indexStr = props["data-ref-index"];
                          if (indexStr !== undefined) {
                            const i = parseInt(indexStr, 10);
                            const ref = refs[i];
                            if (!ref) return null;
                            return (
                              <Badge
                                variant={"outline"}
                                className="text-blue-400 bg-blue-500/10 border-blue-500/20 hover:bg-blue-500/20 transition-colors rounded-md cursor-pointer mx-1 align-middle inline-flex"
                              >
                                {ref.inlineReference.name}
                              </Badge>
                            );
                          }
                          return <span {...props}>{children}</span>;
                        },
                      },
                    },
                  }}
                >
                  {text}
                </Markdown>
              </div>
            );

            currentText = "";
            currentRefs = [];
          };

          request.response?.forEach((response) => {
            if (isThinkingResponse(response)) {
              if (response.value.trim() === "") return;

              renderedItems.push(
                <ThinkingBlock key={response.id} thinking={response.value} />
              );
              return;
            }

            if (isTextResponse(response)) {
              currentText += response.value;
              return;
            }

            if (isFileInlineReference(response)) {
              currentRefs.push(response);
              // Use a span with a data attribute to ensure it's treated as inline
              currentText += `<span data-ref-index="${
                currentRefs.length - 1
              }"></span>`;
              return;
            }

            // For any other type, flush text first
            flushText();

            let toolCallRound;
            if (isToolCall(response)) {
              toolCallRound = toolCallsMap.get(
                `${response.kind}-${toolCallIndex}`
              );

              toolCallIndex += 1;
            }

            if (isShellToolCall(response)) {
              if (toolCallRound?.thinking) {
                renderedItems.push(
                  <ThinkingBlock
                    key={toolCallRound.thinking.id}
                    thinking={toolCallRound.thinking.text}
                  />
                );
              }

              (toolCallRound?.toolCalls ?? []).forEach((call, callIndex) => {
                const { command } = JSON.parse(call.arguments || "{}");
                renderedItems.push(
                  <ShellBlock
                    key={response.toolCallId + Date.now() + callIndex}
                    command={command ?? "Unknown command executed in terminal"}
                    result={
                      call.result?.content.map((c) => c.value).join("\n") ?? ""
                    }
                  />
                );
              });
            } else if (isPatchToolCall(response)) {
              // TODO: Improve and add try catch
              const patch = JSON.parse(
                toolCallRound?.toolCalls[0]?.arguments || "{}"
              );

              renderedItems.push(<ToolPatchBlock patch={patch.input} />);
            } else if (isReplaceStringToolCall(response)) {
              (toolCallRound?.toolCalls ?? []).forEach((call, callIndex) => {
                const { filePath, newString, oldString } = JSON.parse(
                  call.arguments || "{}"
                );

                renderedItems.push(
                  <ToolEditBlock
                    key={response.toolCallId + callIndex}
                    filePath={filePath}
                    oldString={oldString || ""}
                    newString={newString || ""}
                  />
                );
              });
            } else if (isEditFileToolCall(response)) {
              // TODO
            } else if (isInsertEditToolCall(response)) {
              if (toolCallRound?.thinking) {
                renderedItems.push(
                  <ThinkingBlock
                    key={toolCallRound.thinking.id}
                    thinking={toolCallRound.thinking.text}
                  />
                );
              }

              (toolCallRound?.toolCalls ?? []).forEach((call, callIndex) => {
                const { code, filePath } = JSON.parse(call.arguments || "{}");
                renderedItems.push(
                  <ToolEditBlock
                    key={response.toolCallId + callIndex}
                    filePath={filePath}
                    newString={code}
                    oldString={""}
                  />
                );
              });
            } else if (isFindTextToolCall(response)) {
              renderedItems.push(
                <ShellBlock
                  key={response.toolCallId}
                  command={response.pastTenseMessage?.value || ""}
                  result={
                    (response.resultDetails ?? [])
                      // @ts-ignore
                      .map(({ uri }) => uri.path)
                      .join("\n") || ""
                  }
                />
              );
            } else if (isTodoList(response)) {
              renderedItems.push(
                <ToolTodosBlock
                  key={response.toolCallId}
                  todos={response.toolSpecificData.todoList.map((t) => ({
                    content: t.title,
                    status:
                      t.status === "in-progress"
                        ? "in_progress"
                        : t.status === "completed"
                        ? "completed"
                        : "pending",
                  }))}
                />
              );
            } else if (isGlobSearchToolCall(response)) {
              renderedItems.push(
                <ShellBlock
                  command={response.pastTenseMessage?.value || "glob search"}
                />
              );
            } else if (isReadFileToolCall(response)) {
              renderedItems.push(
                <VSCodeReadFileCall
                  key={response.toolCallId}
                  toolCallRound={toolCallRound}
                />
              );
            } else if (isMCPToolCall(response)) {
              renderedItems.push(
                <ToolMCPBlock
                  key={response.toolCallId}
                  serverName={response.source.label}
                  toolName={response.pastTenseMessage?.value || response.toolId}
                  input={
                    (response?.resultDetails as MCPResultDetails)?.input ?? ""
                  }
                  result={(
                    (response?.resultDetails as MCPResultDetails)?.output ?? []
                  )
                    .map((output) => output.value)
                    .join("\n")}
                />
              );
            } else if (isToolCall(response)) {
              renderedItems.push(
                <VSCodeToolCall
                  key={response.toolCallId}
                  tool={response}
                  toolCallRound={toolCallRound}
                />
              );
            }
          });

          // Final flush
          flushText();

          return (
            <div key={request.requestId} className="space-y-6">
              {request.message.text && (
                <UserPrompt
                  owner={owner}
                  prompt={request.message.text}
                  files={(
                    (request.variableData.variables ?? []) as VariableFile[]
                  )
                    .filter(
                      (file) => file.kind === "file" || file.kind === "image"
                    )
                    .map((file) => {
                      return {
                        id: file.id,
                        name: file.name,
                        kind: file.kind,
                      };
                    })}
                />
              )}
              <div className="flex gap-4">
                <Avatar className="h-8 w-8 mt-1 border border-white/10">
                  <AvatarFallback className="bg-linear-to-tr from-blue-600 to-purple-600 text-white text-[10px] font-bold">
                    AI
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 space-y-2 w-full overflow-auto">
                  {renderedItems}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
