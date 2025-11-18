import type { GistOwner } from "@/lib/github";
import type {
  InlineReferenceResponse,
  ResponseItem,
  TextResponse,
  ToolInvocationSerialized,
  VariableFile,
  VSCodeThread,
} from "@/types/vscode";
import Markdown from "markdown-to-jsx";
import ShellBlock from "../thread/sheel-block";
import ToolCall from "../thread/tool-call";
import UserPrompt from "../thread/user-prompt";
import { Avatar, AvatarFallback } from "../ui/avatar";
import { Badge } from "../ui/badge";

type VSCodeThreadProps = {
  owner: GistOwner;
  thread: any;
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
  return "kind" in response && response.kind === "toolInvocationSerialized";
}

function isSheelToolCall(
  response: ResponseItem
): response is ToolInvocationSerialized {
  return (
    "kind" in response &&
    response.kind === "toolInvocationSerialized" &&
    response.toolId == "run_in_terminal"
  );
}

function isTextEditGroup(
  response: ResponseItem
): response is ToolInvocationSerialized {
  return (
    "kind" in response && response.kind === "toolInvocationSerialized"
    // response.presentation !== "hidden"
  );
}

export default function VSCodeThread({ owner, thread }: VSCodeThreadProps) {
  const vscodeThread = thread as VSCodeThread;

  return (
    <div className="athrd-thread max-w-4xl mx-auto px-6 py-8">
      <div className="space-y-6">
        {vscodeThread.requests.map((request) => {
          // Track tool call index for mapping to tool call rounds
          let toolCallIndex = 0;
          const renderedItems: React.ReactNode[] = [];
          let currentText = "";
          let currentRefs: InlineReferenceResponse[] = [];

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
            if (
              isToolCall(response) ||
              isSheelToolCall(response) ||
              isTextEditGroup(response)
            ) {
              toolCallRound =
                request.result?.metadata.toolCallRounds?.[toolCallIndex];
              toolCallIndex++;
            }

            if (isSheelToolCall(response)) {
              renderedItems.push(
                <ShellBlock
                  key={response.toolCallId}
                  command={
                    response.toolSpecificData?.commandLine.toolEdited ??
                    response.toolSpecificData?.commandLine.original ??
                    ""
                  }
                />
              );
            } else if (isToolCall(response)) {
              renderedItems.push(
                <ToolCall
                  key={response.toolCallId}
                  tool={response}
                  text={response?.pastTenseMessage?.value ?? ""}
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
                    .filter((file) => file.kind === "file")
                    .map((file) => {
                      return {
                        id: file.id,
                        name: file.name,
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
                <div className="flex-1 space-y-2">{renderedItems}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
