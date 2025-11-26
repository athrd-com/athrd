"use client";

import type { GistOwner } from "@/lib/github";
import type { CodexThread } from "@/types/codex";
import Markdown from "markdown-to-jsx";
import { useMemo, type ReactNode } from "react";
import ShellBlock from "../thread/sheel-block";
import ThinkingBlock from "../thread/thinking-block";
import UserPrompt from "../thread/user-prompt";
import { Avatar, AvatarFallback } from "../ui/avatar";

type CodexThreadProps = {
  owner: GistOwner;
  thread: CodexThread;
};

type PlanItem = {
  status: string;
  step: string;
};

export default function CodexThread({ owner, thread }: CodexThreadProps) {
  const codexThread = thread;

  const functionOutputs = useMemo(() => {
    const outputs = new Map<string, string>();
    codexThread.messages.forEach((message) => {
      if (
        message.type === "response_item" &&
        message.payload.type === "function_call_output"
      ) {
        outputs.set(message.payload.call_id, message.payload.output);
      }
    });
    return outputs;
  }, [codexThread.messages]);

  const renderedMessages = useMemo(() => {
    const nodes: ReactNode[] = [];
    let assistantBlocks: ReactNode[] = [];

    const flushAssistant = () => {
      if (assistantBlocks.length === 0) return;
      nodes.push(
        <AssistantBubble key={`assistant-group-${nodes.length}`}>
          {assistantBlocks}
        </AssistantBubble>
      );
      assistantBlocks = [];
    };

    codexThread.messages.forEach((message, index) => {
      if (message.type !== "response_item") {
        return;
      }

      const payload = message.payload;

      if (payload.type === "message") {
        const text = (payload.content ?? [])
          .map((block) => block.text)
          .filter(Boolean)
          .join("\n\n")
          .trim();

        if (!text) return;

        if (payload.role === "user") {
          if (!text.startsWith("<environment_context>")) {
            flushAssistant();
            nodes.push(
              <UserPrompt
                key={`${message.timestamp}-user-${index}`}
                prompt={text}
                owner={owner}
              />
            );
          }
          return;
        }

        assistantBlocks.push(
          <div
            key={`${message.timestamp}-assistant-${index}`}
            className="prose prose-invert text-gray-200 max-w-none"
          >
            <Markdown>{text}</Markdown>
          </div>
        );
        return;
      }

      if (payload.type === "reasoning") {
        const thoughts = payload.summary
          ?.map((item) => item.text)
          .filter(Boolean);

        if (!thoughts || thoughts.length === 0) return;

        thoughts.forEach((thought, idx) => {
          assistantBlocks.push(
            <ThinkingBlock
              key={`${message.timestamp}-thought-${idx}`}
              thinking={thought}
            />
          );
        });
        return;
      }

      if (payload.type === "function_call") {
        if (!payload.call_id) return;
        const args = parseArguments(payload.arguments);
        const output = functionOutputs.get(payload.call_id);

        if (payload.name === "shell_command") {
          const command =
            typeof args.command === "string" ? args.command : "shell_command";
          const explanation =
            typeof args.description === "string"
              ? args.description
              : typeof args.workdir === "string"
                ? `cwd: ${args.workdir}`
                : undefined;

          assistantBlocks.push(
            <ShellBlock
              key={`shell-${payload.call_id}`}
              command={command}
              explanation={explanation}
              result={output}
            />
          );
          return;
        }

        if (payload.name === "update_plan") {
          const planItems = extractPlanItems(args.plan);
          if (planItems.length === 0) {
            return;
          }

          assistantBlocks.push(
            <PlanBlock
              key={`plan-${payload.call_id}`}
              planItems={planItems}
              output={output}
            />
          );
          return;
        }

        assistantBlocks.push(
          <GenericFunctionBlock
            key={`function-${payload.call_id}`}
            name={payload.name}
            args={args}
            output={output}
          />
        );
        return;
      }

      if (payload.type === "ghost_snapshot") {
        assistantBlocks.push(
          <GhostSnapshotBlock
            key={`ghost-${message.timestamp}-${index}`}
            commit={payload.ghost_commit}
          />
        );
      }
    });

    flushAssistant();
    return nodes;
  }, [codexThread.messages, functionOutputs, owner]);

  return (
    <div className="athrd-thread max-w-4xl mx-auto px-6 py-8 overflow-x-hidden">
      <div className="space-y-4">{renderedMessages}</div>
    </div>
  );
}

function parseArguments(args?: string): Record<string, unknown> {
  if (!args) return {};
  try {
    return JSON.parse(args) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function extractPlanItems(value: unknown): PlanItem[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const status = typeof (item as { status?: string }).status === "string"
        ? (item as { status?: string }).status
        : "pending";
      const step = typeof (item as { step?: string }).step === "string"
        ? (item as { step?: string }).step
        : "";

      if (!step) return null;
      return { status, step };
    })
    .filter((item): item is PlanItem => !!item);
}

type AssistantBubbleProps = {
  children: ReactNode;
};

function AssistantBubble({ children }: AssistantBubbleProps) {
  return (
    <div className="flex gap-4">
      <Avatar className="h-8 w-8 mt-1 border border-white/10 shrink-0">
        <AvatarFallback className="bg-[#2563EB]/20 text-white text-[10px] font-bold">
          CX
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 space-y-2 w-full overflow-auto">{children}</div>
    </div>
  );
}

type PlanBlockProps = {
  planItems: PlanItem[];
  output?: string;
};

function PlanBlock({ planItems, output }: PlanBlockProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#101010] p-4 space-y-3">
      <div className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
        Plan Update
      </div>
      <ul className="space-y-2 text-sm text-gray-300">
        {planItems.map((item, index) => (
          <li key={`${item.step}-${index}`} className="flex gap-3">
            <span className="font-mono text-[11px] text-gray-400 uppercase tracking-wide">
              {item.status}
            </span>
            <span className="text-gray-200">{item.step}</span>
          </li>
        ))}
      </ul>
      {output && (
        <div className="text-xs font-mono text-gray-500 border-t border-white/5 pt-2">
          {output}
        </div>
      )}
    </div>
  );
}

type GhostSnapshotBlockProps = {
  commit: {
    id: string;
    parent?: string;
    preexisting_untracked_files?: string[];
    preexisting_untracked_dirs?: string[];
  };
};

function GhostSnapshotBlock({ commit }: GhostSnapshotBlockProps) {
  const files = commit.preexisting_untracked_files ?? [];
  const dirs = commit.preexisting_untracked_dirs ?? [];

  return (
    <div className="rounded-lg border border-white/10 bg-[#0d0d0d] p-4 space-y-2 text-sm text-gray-300">
      <div className="font-semibold text-gray-100">Ghost Snapshot</div>
      <div className="text-xs font-mono text-gray-400">
        Commit {commit.id}
      </div>
      {commit.parent && (
        <div className="text-xs font-mono text-gray-500">
          Parent {commit.parent}
        </div>
      )}
      {files.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Untracked files ({files.length})
          </div>
          <ul className="mt-1 space-y-0.5 text-xs font-mono text-gray-400">
            {files.slice(0, 5).map((file) => (
              <li key={file}>{file}</li>
            ))}
            {files.length > 5 && <li>…</li>}
          </ul>
        </div>
      )}
      {dirs.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wide text-gray-500">
            Untracked directories ({dirs.length})
          </div>
          <ul className="mt-1 space-y-0.5 text-xs font-mono text-gray-400">
            {dirs.slice(0, 5).map((dir) => (
              <li key={dir}>{dir}</li>
            ))}
            {dirs.length > 5 && <li>…</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

type GenericFunctionBlockProps = {
  name: string;
  args: Record<string, unknown>;
  output?: string;
};

function GenericFunctionBlock({
  name,
  args,
  output,
}: GenericFunctionBlockProps) {
  return (
    <div className="rounded-lg border border-white/10 bg-[#0f0f0f] p-4 space-y-2 text-sm text-gray-300">
      <div className="font-semibold text-gray-100">
        Function call: {name}
      </div>
      <div className="text-xs font-mono text-gray-400 whitespace-pre-wrap break-all">
        {JSON.stringify(args, null, 2)}
      </div>
      {output && (
        <div className="text-xs font-mono text-gray-500 border-t border-white/5 pt-2 whitespace-pre-wrap break-all">
          {output}
        </div>
      )}
    </div>
  );
}
